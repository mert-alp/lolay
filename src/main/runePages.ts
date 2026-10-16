import type { Lane, Lang, RunePage, RunePagesQuery, Source, StaticData, Tier } from '../shared/types.ts'
import { page as opggPage } from './providers/opgg.ts'

export interface RunePagesDeps {
  sd: StaticData
  tier: Tier
  baseSource: Source // the source the user selected: its pages come first
  base: () => Promise<RunePage[]>
  opgg: (championId: number, lane: Lane, tier: Tier, target?: number) => Promise<any>
  lolaVs: (q: { championId: number; lane: Lane; vsChampionId: number; vsLane: Lane; tier: Tier }) => Promise<RunePage[]>
  pro: (championId: number, lane: Lane) => Promise<RunePage[]>
}

const LANE_NAME: Record<Lang, Record<Lane, string>> = {
  tr: { top: 'Üst', jungle: 'Orman', middle: 'Orta', bottom: 'Alt', support: 'Destek' },
  en: { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bottom', support: 'Support' }
}
const BASE_LABEL: Record<Lang, string[]> = { tr: ['En Çok Seçilen', 'En Yüksek Kazanma Oranı'], en: ['Most Picked', 'Highest Win Rate'] }

const MIN_KEYSTONE_PICK = 0.03
const MAX_PAGES = 6
const MAX_VS = 2 // matchup pages in all
const MAX_PRO = 2

// the page that is imported / selected by default: the first one from a sample worth trusting
export const defaultPage = (pages: RunePage[]): RunePage | undefined => pages.find((p) => !p.low)

const keyOf = (p: RunePage) => [...p.perks].sort().join()

// one best observed page per OP.GG keystone/secondary-tree group, most played group first
export function opggVariants(j: any, sd: Pick<StaticData, 'runes' | 'trees'>): RunePage[] {
  const groups = ((j?.data?.rune_pages ?? []) as any[]).filter((g) => g.pick_rate >= MIN_KEYSTONE_PICK && g.builds?.length)
  const tree = (id: number) => sd.trees.find((t) => t.id === id)?.name ?? ''
  const dup = (g: any) => groups.filter((x) => x.id === g.id).length > 1
  return groups
    .sort((a, b) => b.play - a.play)
    .map((g) => {
      const b = g.builds.reduce((x: any, y: any) => (y.play > x.play ? y : x))
      const name = sd.runes[g.id]?.name ?? String(g.id)
      return { ...opggPage(b), label: dup(g) ? `${name} · ${tree(g.secondary_page_id)}` : name, source: 'opgg' as const }
    })
}

// the most played page of an OP.GG answer (restricted to a matchup via target_champion); too few games = nothing
export function opggTopPage(j: any, minGames = 100): RunePage | null {
  const top = ((j?.data?.runes ?? []) as any[]).reduce((a, b) => (b.play > a.play ? b : a), { play: 0 })
  return top.play >= minGames ? { ...opggPage(top), source: 'opgg' } : null
}

const settled = async <T>(p: Promise<T>, fallback: T, bad: { n: number }): Promise<T> => {
  try {
    return await p
  } catch (e) {
    if (!/HTTP 404 /.test((e as Error).message)) bad.n++ // 404 = no data for this matchup, not a failure
    console.error('rune pages source failed', e)
    return fallback
  }
}

// Up to MAX_PAGES, deduped by perks: matchup pages (a small-sample one only after the base pages), most picked / win-focused,
// then keystone variants and pro games. Sources whose pages would not fit are not fetched.
// partial = a source failed, so the caller should look again soon
export async function collectRunePages(q: RunePagesQuery, d: RunePagesDeps, lang: Lang = d.sd.lang): Promise<{ value: RunePage[]; partial: boolean }> {
  const bad = { n: 0 }
  const { sd, tier } = d
  const nameOf = (id: number) => sd.champions[id]?.name ?? String(id)

  const enemies: { id: number; lane: Lane }[] = []
  if (q.vsLaner) enemies.push({ id: q.vsLaner, lane: q.lane })
  if (q.vsJungler && q.lane !== 'jungle' && q.vsJungler !== q.vsLaner) enemies.push({ id: q.vsJungler, lane: 'jungle' })

  const [base, ...vs] = await Promise.all([
    settled(d.base(), [], bad),
    ...enemies.map(async (e) => {
      const [lola, op] = await Promise.all([
        settled(d.lolaVs({ championId: q.championId, lane: q.lane, vsChampionId: e.id, vsLane: e.lane, tier }), [], bad),
        e.lane === q.lane ? settled(d.opgg(q.championId, q.lane, tier, e.id), null, bad) : Promise.resolve(null) // OP.GG only has real same-lane duels
      ])
      const label = `${nameOf(q.championId)} vs ${nameOf(e.id)}${e.lane === q.lane ? '' : ` (${LANE_NAME[lang][e.lane]})`}`
      const top = opggTopPage(op)
      return [...lola.map((p, i) => ({ ...p, vs: e.id, source: 'lolalytics' as const, label: i ? `${label} · WR` : label })), ...(top ? [{ ...top, vs: e.id, label }] : [])]
    })
  ])

  const seen = new Set<string>()
  const take = (pages: RunePage[], n: number) => {
    const out: RunePage[] = []
    for (const p of pages) if (out.length < n && p.perks.length > 0 && !seen.has(keyOf(p)) && !!seen.add(keyOf(p))) out.push(p)
    return out
  }
  // first pages of every enemy before anyone's second page
  const rounds = vs.flatMap((pages, e) => pages.map((p, i) => ({ p, i, e }))).sort((a, b) => a.i - b.i || a.e - b.e).map((x) => x.p)
  const matchups = take(rounds, MAX_VS)
  const stats = take(
    base.map((p, i) => ({ ...p, source: d.baseSource, label: BASE_LABEL[lang][i] ?? p.label })),
    MAX_PAGES - matchups.length
  )
  const room = MAX_PAGES - matchups.length - stats.length

  const [opgg, pro] = room > 0 ? await Promise.all([settled(d.opgg(q.championId, q.lane, tier), null, bad), settled(d.pro(q.championId, q.lane), [], bad)]) : [null, []]
  const variants = take(opgg ? opggVariants(opgg, sd) : [], Math.max(0, room - (pro.length ? 1 : 0)))
  const pros = take(pro, Math.min(MAX_PRO, room - variants.length))
  return { value: [...matchups.filter((p) => !p.low), ...stats, ...matchups.filter((p) => p.low), ...variants, ...pros], partial: bad.n > 0 }
}

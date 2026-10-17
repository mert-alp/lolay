import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Build, ItemStat, Lane, Matchup, RunePage, SetStat, Tier } from '../shared/types.ts'
import { get as httpGet, InsufficientDataError, splitCounters, type Provider } from './providers/http.ts'

const BASE = 'https://lolalytics.com/lol'
const API = 'https://a1.lolalytics.com/mega/'
const CHAMP_PATH_FILE = 'champPath.json'

// ---- champPath (numeric champion key -> lolalytics slug), shared module state ----

let champPath: Record<string, string> | null = null

export function champPathSlug(championId: number): string | undefined {
  return champPath?.[String(championId)]
}

const SLUG_EXCEPTIONS: Record<string, string> = { MonkeyKing: 'wukong' }

export function slugFromDdragonId(id: string): string {
  return SLUG_EXCEPTIONS[id] ?? id.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ---- Qwik SSR parsing ----

export function parseQwik(html: string): { data: any; champPath: Record<string, string> | null } {
  const open = '<script type="qwik/json">'
  const start = html.indexOf(open)
  if (start < 0) return { data: null, champPath: null }
  const from = start + open.length
  const objs: any[] = JSON.parse(html.slice(from, html.indexOf('</script>', from))).objs

  const resolve = (ref: string, depth = 0): any => {
    if (depth > 14) return null
    if (!/^[0-9a-z]+$/.test(ref)) return ref
    const i = parseInt(ref, 36)
    if (!(i < objs.length)) return ref
    const v = objs[i]
    const next = (x: any) => (typeof x === 'string' ? resolve(x, depth + 1) : x)
    if (Array.isArray(v)) return v.map(next)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, next(x)]))
    return v
  }

  let data: any = null
  let cp: Record<string, string> | null = null
  for (let n = 0; n < objs.length; n++) {
    const o = objs[n]
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue
    if (!data && 'skillOrder' in o && 'builtBootSet3' in o) data = resolve(n.toString(36))
    if (!cp && typeof o.champPath === 'string') cp = resolve(o.champPath)
  }
  return { data, champPath: cp }
}

// ---- resolved loader data -> Build ----

const SKILL = ['', 'Q', 'W', 'E', 'R']
const perksOf = (r: any): RunePage => ({ wr: r.wr, n: r.n, perks: [...r.set.pri, ...r.set.sec, ...r.set.mod] })
const samePage = (a: RunePage, b: RunePage) => [...a.perks].sort().join() === [...b.perks].sort().join()
const items = (rows: any[] | undefined): ItemStat[] => (rows ?? []).map((r) => ({ id: r.id, wr: r.wr, n: r.n }))
const sets = (rows: any[][] | undefined): SetStat[] =>
  (rows ?? []).map(([ids, wr, pr, n]) => ({ ids: String(ids).split('_').map(Number), wr, pr, n }))

function counters(d: any, lane: Lane) {
  const min = Math.max(200, d.header.n * 0.01)
  const rows: Matchup[] = ((d.enemy?.[lane] ?? []) as any[])
    .filter((r) => r[5] >= min)
    .map((r) => ({ championId: r[0], wr: r[1], pr: r[4], n: r[5] }))
  return splitCounters(rows)
}

// sidebar.time: games and wins per game length bucket, keyed 1..7 (TIME_BUCKETS)
export function timeWr(t: any): (number | null)[] | undefined {
  if (!t?.time) return undefined
  return [1, 2, 3, 4, 5, 6, 7].map((k) => (t.time[k] > 0 && t.timeWin?.[k] != null ? +((t.timeWin[k] / t.time[k]) * 100).toFixed(2) : null))
}

export function toBuild(d: any, tier: Tier): Build {
  const h = d.header
  const pick = d.summary?.pick
  // few games (e.g. 4 on Ahri support Challenger) or a lane nobody plays: the page has no summary
  if (!pick?.runes?.set) throw new InsufficientDataError(`Lolalytics has too little data (n=${h?.n}) for ${h?.cid} ${h?.lane} ${tier}`)
  const lane: Lane = h.lane
  const runes = [perksOf(pick.runes)]
  if (d.summary.win?.runes?.set) {
    const win = perksOf(d.summary.win.runes)
    if (!samePage(win, runes[0])) runes.push(win)
  }
  const core = pick.items?.core
  return {
    championId: h.cid,
    slug: champPathSlug(h.cid) ?? '',
    lane,
    defaultLane: h.defaultLane,
    tier,
    source: 'lolalytics',
    patch: h.patch,
    wr: h.wr,
    pr: h.pr,
    br: h.br,
    games: h.n,
    tierLabel: h.tier,
    runes,
    runeStatsLevel: 'keystone',
    spells: sets(d.spells),
    startItems: sets(d.startSet),
    core: core ? { ids: core.set, wr: core.wr, n: core.n } : null,
    boots: ((d.boots ?? []) as any[])
      .filter((r) => r[0] !== 9999) // 9999 = no boots
      .map((r) => ({ id: r[0], wr: r[1], pr: r[2], n: r[3] })),
    item4: items(pick.items?.item4),
    item5: items(pick.items?.item5),
    item6: items(pick.items?.item6),
    skillPriority: pick.skillpriority?.id ?? '',
    skillOrder: pick.skillorder?.id ? String(pick.skillorder.id).split('').map((c) => SKILL[Number(c)]).join('') : '',
    counters: counters(d, lane),
    damage: h.damage ? { physical: Number(h.damage.physical) || 0, magic: Number(h.damage.magic) || 0, true: Number(h.damage.true) || 0 } : null,
    timeWr: timeWr(d.sidebar?.time),
    partial: !core || !pick.skillorder?.id,
    fetchedAt: Date.now()
  }
}

// matchup build page (/vs/): most picked and win-focused page against one enemy; too few games = nothing,
// under MIN_MATCHUP_GAMES = flagged `low` (shown, never the default)
const MIN_MATCHUP_GAMES = 100

export function matchupPages(d: any): RunePage[] {
  const pick = d?.summary?.pick?.runes
  if (!pick?.set || pick.n < 30) return []
  const pages = [perksOf(pick)]
  if (d.summary.win?.runes?.set && !samePage(perksOf(d.summary.win.runes), pages[0])) pages.push(perksOf(d.summary.win.runes))
  return (d.header?.n ?? pick.n) < MIN_MATCHUP_GAMES ? pages.map((p) => ({ ...p, low: true as const })) : pages
}

// Light JSON API: runes only
function toPartialBuild(j: any, q: { championId: number; slug: string; lane?: Lane; tier: Tier }): Build {
  const r = j?.summary?.runes
  if (!r?.pick?.set) throw new InsufficientDataError(`Lolalytics has no rune data for ${q.slug} ${q.lane} ${q.tier}`)
  const runes = [perksOf(r.pick)]
  if (r.win && !samePage(perksOf(r.win), runes[0])) runes.push(perksOf(r.win))
  const lane: Lane = j.header.lane ?? q.lane ?? j.header.defaultLane
  return {
    championId: q.championId,
    slug: q.slug,
    lane,
    defaultLane: j.header.defaultLane ?? lane,
    tier: q.tier,
    source: 'lolalytics',
    patch: '',
    wr: null, // r.pick.wr is the keystone's win rate, not the champion's
    pr: null,
    br: null,
    games: j.header.n,
    tierLabel: '',
    runes,
    runeStatsLevel: 'keystone',
    spells: [],
    startItems: [],
    core: null,
    boots: [],
    item4: [],
    item5: [],
    item6: [],
    skillPriority: '',
    skillOrder: '',
    counters: { strong: [], weak: [] },
    partial: true,
    fetchedAt: Date.now()
  }
}

// ---- fetching ----

const get = (url: string) => httpGet(url, { gap: 1000 })

export async function fetchMatchupPages(q: { slug: string; vsSlug: string; lane: Lane; vsLane: Lane; tier: Tier }): Promise<RunePage[]> {
  const html = await (await get(`${BASE}/${q.slug}/vs/${q.vsSlug}/build/?${query({ lane: q.lane, vslane: q.vsLane, tier: q.tier })}`)).text()
  return matchupPages(parseQwik(html).data)
}

// network trouble or a server error; anything else will not get better through the JSON API
const transient = (e: unknown) => {
  const x = e as Error
  return /HTTP 5\d\d /.test(x.message) || x.name === 'TimeoutError' || x.name === 'AbortError' || x.message === 'fetch failed'
}

const query = (o: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString()

export function createLolalytics(opts: { cacheDir: string; slugOf: (championId: number) => string }): Provider {
  let champPathLoaded = false

  async function loadChampPath() {
    if (champPathLoaded) return
    champPathLoaded = true
    try {
      champPath ??= JSON.parse(await readFile(join(opts.cacheDir, CHAMP_PATH_FILE), 'utf8'))
    } catch {}
  }

  return async ({ championId, lane, tier, queue }) => {
    await loadChampPath()
    const slug = champPathSlug(championId) ?? opts.slugOf(championId)
    let build: Build
    try {
      const html = await (await get(queue ? `${BASE}/${slug}/aram/build/?${query({ tier })}` : `${BASE}/${slug}/build/?${query({ lane, tier })}`)).text()
      const { data, champPath: cp } = parseQwik(html)
      if (cp) {
        champPath = cp
        await mkdir(opts.cacheDir, { recursive: true })
        await writeFile(join(opts.cacheDir, CHAMP_PATH_FILE), JSON.stringify(cp)).catch(() => {})
      }
      if (!data) throw new Error('Lolalytics page has no loader data')
      build = toBuild(data, tier)
    } catch (e) {
      if (!transient(e) || queue) throw e // 404, no data, a parse bug: the JSON API would not help (and has no ARAM)
      console.error('Lolalytics page failed, using the JSON API', e)
      const url = `${API}?${query({ ep: 'rune', v: '1', c: slug, lane, tier, queue: 'ranked', region: 'all' })}`
      try {
        build = toPartialBuild(await (await get(url)).json(), { championId, slug, lane, tier })
      } catch (e2) {
        if (e2 instanceof InsufficientDataError) throw e2
        throw new Error(`Lolalytics unreachable: ${(e2 as Error).message}`, { cause: e })
      }
    }
    build.championId = championId
    build.slug = slug
    if (queue) build.queue = queue
    return build
  }
}

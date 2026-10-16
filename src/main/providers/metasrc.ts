import { parse, type HTMLElement, type Node } from 'node-html-parser'
import type { Build, ItemStat, Lane, Matchup, RunePage, SetStat, StaticData } from '../../shared/types.ts'
import { get, InsufficientDataError, pct, splitCounters, type Provider } from './http.ts'

// METAsrc is scraped from its server-rendered pages: all ranks only, wr/pr are whole percents.
const BASE = 'https://www.metasrc.com/lol/champions'
const POS: Record<Lane, string> = { top: 'top', jungle: 'jungle', middle: 'mid', bottom: 'adc', support: 'support' }
const LANE_OF: Record<string, Lane> = { top: 'top', jungle: 'jungle', mid: 'middle', adc: 'bottom', support: 'support' }
const FLASH = 4

type Static = Pick<StaticData, 'champions' | 'items' | 'spells'>

// ---- tokens: the pages are div soup, so read icons and numbers in document order ----

type Tok = { item: number } | { spell: string } | { pct: number } | { num: number }

const count = (s: string) => {
  const m = /^([\d.,]+)\s*([KM])?$/i.exec(s)
  return m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * ({ K: 1e3, M: 1e6 }[m[2]?.toUpperCase() as 'K' | 'M'] ?? 1)) : NaN
}

function tokens(node: Node, out: Tok[] = []): Tok[] {
  const el = node as HTMLElement
  if (el.tagName === 'IMG') {
    const src = el.getAttribute('src') ?? ''
    const item = /\/items\/[^/?]*-(\d+)\.png/.exec(src)
    const spell = /\/spells\/(\w+)\.png/.exec(src)
    if (item) out.push({ item: Number(item[1]) })
    else if (spell) out.push({ spell: spell[1] })
  } else if (node.nodeType === 3) {
    const t = node.text.trim()
    const p = /^(\d+(?:\.\d+)?)%$/.exec(t)
    if (p) out.push({ pct: Number(p[1]) })
    else if (!Number.isNaN(count(t))) out.push({ num: count(t) })
  }
  for (const c of node.childNodes) tokens(c, out)
  return out
}

// "icons, win %, pick %" rows; a bare number right after an icon is its quantity (2x potion)
function rows(el: HTMLElement | null | undefined): { ids: number[]; spells: string[]; wr: number; pr: number }[] {
  const out = []
  let ids: number[] = []
  let spells: string[] = []
  let wr: number | undefined
  for (const t of el ? tokens(el) : []) {
    if ('item' in t) ids.push(t.item)
    else if ('spell' in t) spells.push(t.spell)
    else if ('num' in t) {
      if (wr === undefined && ids.length) for (let i = 1; i < t.num; i++) ids.push(ids[ids.length - 1])
    } else if (wr === undefined) wr = t.pct
    else {
      out.push({ ids, spells, wr, pr: t.pct })
      ids = []
      spells = []
      wr = undefined
    }
  }
  return out
}

const section = (root: HTMLElement, name: RegExp) =>
  root.querySelectorAll('h2').find((h) => name.test(h.text.trim()))?.parentNode?.parentNode as HTMLElement | undefined

// ---- build page ----

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// win % and games ("34.4K") per champion under a "Strong Against" / "Weak Against" heading
function matchups(root: HTMLElement, title: string, st: Static): Matchup[] {
  const ids = new Map<string, number>()
  for (const c of Object.values(st.champions)) for (const k of [c.id, c.name.split(/\s+(?:&|ve)\s+/)[0]]) ids.set(norm(k), c.key)
  ids.set('wukong', 62)
  const box = root.querySelectorAll('h3').find((h) => h.text.trim() === title)?.parentNode
  return (box?.querySelectorAll('a') ?? []).flatMap((a) => {
    const slug = /\/champions\/([a-z0-9-]+)\/\1_icon\.png/.exec(a.querySelector('img')?.getAttribute('src') ?? '')?.[1]
    const [w, n] = a.querySelectorAll('span').map((s) => s.text.trim())
    const championId = slug && ids.get(norm(slug))
    return championId ? [{ championId, wr: parseFloat(w), n: count(n) }] : []
  })
}

// the level grid has one row per ability; a cell with a tooltip marks the level it is taken
function skillOrder(box: HTMLElement | undefined): string {
  const byLevel: string[] = []
  for (const img of box?.querySelectorAll('img') ?? []) {
    const skill = /#skill-([qwer])$/.exec(img.getAttribute('data-tooltip-select') ?? '')?.[1]
    const cells = (img.parentNode?.parentNode as HTMLElement | undefined)?.childNodes.filter((c) => c.nodeType === 1) as HTMLElement[]
    if (skill) cells?.slice(1, 16).forEach((c, i) => c.hasAttribute('data-tooltip-select') && (byLevel[i] = skill.toUpperCase()))
  }
  return byLevel.length === 15 && byLevel.every(Boolean) ? byLevel.join('') : ''
}

export function parseBuild(html: string, q: { championId: number; slug: string }, st: Static): Build {
  const root = parse(html)
  const head = /Tier:\s*(\S+?)\s*Win %:\s*([\d.]+)%\s*Pick %:\s*([\d.]+)%.*?Ban %:\s*([\d.]+)%.*?Games:\s*([\d,]+)/s.exec(
    root.querySelector('#main')?.text ?? ''
  )
  const h1 = root.querySelector('h1')?.text ?? ''
  const patch = /Patch\s+(\d+)\.(\d+)/.exec(h1)
  const lane = LANE_OF[(h1.trim().split(/\s+/).pop() ?? '').toLowerCase()]
  if (!head || !patch || !lane) throw new Error('METAsrc page is not a build page')

  const games = count(head[5])
  const est = (pr: number) => Math.round((games * pr) / 100) // pages only give percents
  const items = (name: RegExp): ItemStat[] => rows(section(root, name)).map((r) => ({ id: r.ids[0], wr: r.wr, pr: r.pr, n: est(r.pr) }))
  const sets = (name: RegExp): SetStat[] => rows(section(root, name)).map((r) => ({ ids: r.ids, wr: r.wr, pr: r.pr, n: est(r.pr) }))

  const spellKey = new Map(Object.values(st.spells).map((s) => [s.id, s.key]))
  const spells: SetStat[] = rows(section(root, /^Summoner Spells$/)).flatMap((r) => {
    const ids = r.spells.map((s) => spellKey.get(s)).filter((k): k is number => !!k)
    // the first row lists both spells, the others only the partner of Flash
    return ids.length ? [{ ids: ids.length === 1 ? [FLASH, ids[0]] : ids, wr: r.wr, pr: r.pr, n: est(r.pr) }] : []
  })

  const coreRow = rows(section(root, /^(?!Starting).+ Items$/))[0]
  const skills = section(root, /Skill Order$/)
  const priority = /prioritize\s+([QWER]),\s*followed by\s+([QWER]),\s*and finally\s+([QWER])/i.exec(skills?.text ?? '')
  const duels = [...matchups(root, 'Strong Against', st), ...matchups(root, 'Weak Against', st)]

  return {
    championId: q.championId,
    slug: q.slug,
    lane,
    defaultLane: lane,
    tier: 'all',
    source: 'metasrc',
    patch: `${Number(patch[1]) - 10}.${patch[2]}`, // METAsrc counts 26.x where Riot says 16.x
    wr: parseFloat(head[2]),
    pr: parseFloat(head[3]),
    br: parseFloat(head[4]),
    games,
    tierLabel: head[1],
    runes: [],
    spells,
    startItems: sets(/^Starting Items$/),
    // the core row has the boots in it; they get their own list
    core: coreRow ? { ids: coreRow.ids.filter((id) => !st.items[id]?.boots), wr: coreRow.wr, pr: coreRow.pr, n: est(coreRow.pr) } : null,
    boots: items(/Boots$/),
    item4: items(/^Slot 4 Item Options$/),
    item5: items(/^Slot 5 Item Options$/),
    item6: items(/^Slot 6 Item Options$/),
    skillPriority: priority ? priority.slice(1).join('').toUpperCase() : '',
    skillOrder: skillOrder(skills),
    counters: splitCounters(duels),
    partial: false,
    fetchedAt: Date.now()
  }
}

// ---- runes page ----

const runeId = (e: HTMLElement) => /^#rune-(\d+)$/.exec(e.getAttribute('data-tooltip-select') ?? '')?.[1]

// The variants table has six runes per row (primary tree, then secondary), no shards: those come from the node grid.
export function parseRunes(html: string): RunePage[] {
  const root = parse(html)

  // grid nodes: a rune tooltip followed by its "wins, picks" spans; shards are the first 9, three per row
  const nodes = root.querySelectorAll('[data-tooltip-select]').flatMap((e) => {
    const picks = e.nextElementSibling?.querySelectorAll('span').map((s) => count(s.text.trim()))
    const id = runeId(e)
    return id && picks?.length === 2 ? [{ id: Number(id), picks: picks[1] }] : []
  })
  const grid = nodes.filter((n) => n.id >= 5000 && n.id < 6000).slice(0, 9)
  const shards = [0, 3, 6].map((i) => grid.slice(i, i + 3).reduce((a, b) => (b.picks > a.picks ? b : a)).id)

  const table = root.querySelectorAll('table').find((t) => t.querySelectorAll('th').some((th) => th.text.trim() === 'Wins'))
  const pages: RunePage[] = (table?.querySelectorAll('tbody tr') ?? []).flatMap((tr) => {
    const perks = tr.querySelectorAll('[data-tooltip-select]').flatMap((e) => runeId(e) ?? []).map(Number)
    const [n, wins] = tr.querySelectorAll('td').slice(1, 3).map((td) => count(td.text.trim()))
    return perks.length === 6 && n > 0 ? [{ wr: pct(wins, n), n, perks: [...perks, ...shards] }] : []
  })
  if (grid.length < 9 || !pages.length) return []

  const main = pages.reduce((a, b) => (b.n > a.n ? b : a))
  const best = pages.filter((p) => p.n >= main.n * 0.05).reduce((a, b) => (b.wr > a.wr ? b : a))
  return best === main ? [main] : [main, best]
}

// ---- fetching ----

// ddragon says "Kog'Maw", "Nunu & Willump", "Dr. Mundo"; METAsrc says kogmaw, nunu, dr-mundo
export function slugOf(name: string): string {
  return name
    .split(/\s+(?:&|ve)\s+/)[0] // "Nunu ve Willump" in Turkish
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function createMetasrc(deps: { getStatic: () => Static }): Provider {
  return async ({ championId, lane }) => {
    const st = deps.getStatic()
    const champ = st.champions[championId]
    if (!champ) throw new Error(`unknown champion ${championId}`)
    const slug = slugOf(champ.name)
    const base = `${BASE}/${slug}${lane ? `/${POS[lane]}` : ''}`

    let html: string
    try {
      html = await (await get(`${base}/build`)).text()
    } catch (e) {
      if (lane && /HTTP 404 /.test((e as Error).message)) throw new InsufficientDataError(`METAsrc has no ${lane} page for ${slug}`)
      throw e
    }
    const build = parseBuild(html, { championId, slug }, st)
    if (lane && build.lane !== lane) throw new InsufficientDataError(`METAsrc has no ${lane} page for ${slug}`) // unknown roles redirect to the default one
    try {
      build.runes = parseRunes(await (await get(`${base}/runes`)).text())
    } catch {}
    build.partial = !build.runes.length || !build.core || !build.skillOrder || !build.item4.length
    return build
  }
}

import { teamDamage } from './damage.ts'
import type { Build, Damage, ItemStat, StaticItem } from './types.ts'

export const ONE_SIDED = 60 // % of one damage type in the enemy team: the team damage hint and MR / armor advice
export const STRONG_HEAL = 15000 // Lolalytics average healing per game: Aatrox ~15k, Soraka / Vladimir ~28-30k, Zed ~4k
export const HIGH_CC = 1.8 // seconds of crowd control per known enemy (Leona 3.3, Ahri 1.8, Jinx 1.5, Zed 0)
export const MID_CC = 1
export const MIN_GAMES = 100 // an item this champion bought fewer times is no advice
export const MIN_VS_GAMES = 50 // smaller sample on a /vs/ page
const PER_ROW = 3

// ponytail: fixed id lists, edit when Riot adds or removes a Grievous Wounds / cleanse item
export const ANTI_HEAL = [3165, 3033, 3123, 3075, 3076, 6609, 3916, 3011]
const CLEANSE = [3140, 3139] // Quicksilver Sash, Mercurial Scimitar: no Tenacity tag
// armor / magic pen and %-health damage: Lord Dominik's, Mortal Reminder, Black Cleaver, Void Staff, Cryptbloom, Liandry's, BotRK, Serylda's, Terminus
const ANTI_TANK = [3036, 3033, 3071, 3135, 3137, 6653, 3153, 6694, 3302]
// survive a burst: Zhonya's, Banshee's, Guardian Angel, Maw, Sterak's, Edge of Night, Shieldbow
const ANTI_BURST = [3157, 3102, 3026, 3156, 3053, 3814, 6673]
// bought around the build, not in it: potions, Dark Seal / Cull, Control Ward, elixirs, trinket swaps
export const EXTRAS = [2003, 2031, 2033, 1082, 1083, 2055, 2138, 2139, 2140, 3364, 3363]
const MIN_EXTRA = 0.05 // bought in fewer than 5% of games: noise
const GROUP = 2 // this many tanks / assassins among the enemies call for items against them

export type AdviceKind = 'mr' | 'armor' | 'tenacity' | 'antiheal' | 'tank' | 'burst'
export interface EnemyComp {
  pct: Damage | null // damage share of the known enemies
  cc: { total: number; avg: number; list: { championId: number; sec: number }[] } | null // seconds of CC, longest first; null = unknown
  healers: number[] // enemies healing STRONG_HEAL or more per game
  tanks: number[] // enemies whose main class is Tank
  assassins: number[]
}
export interface AdviceRow {
  kind: AdviceKind
  items: ItemStat[] // from my champion's own item list, most bought first
}

// draft:itemAdvice: the enemy team as known so far and what to buy against it and against my laner
export interface ItemAdvice {
  enemies: number // enemy champions known so far
  comp: EnemyComp
  rows: AdviceRow[]
  vs: { championId: number; items: ItemStat[] } | null // my laner (as the jungler: their jungler)
}

export function enemyComp(enemies: { championId: number; damage?: Damage | null; heal?: number; role?: string }[], cc: Record<number, number> | null): EnemyComp {
  const list = enemies.filter((e) => cc?.[e.championId] != null).map((e) => ({ championId: e.championId, sec: cc![e.championId] })).sort((a, b) => b.sec - a.sec)
  const total = +list.reduce((s, e) => s + e.sec, 0).toFixed(2)
  return {
    pct: teamDamage(enemies.map((e) => e.damage))?.pct ?? null,
    cc: list.length ? { total, avg: total / list.length, list } : null,
    healers: enemies.filter((e) => (e.heal ?? 0) >= STRONG_HEAL).map((e) => e.championId),
    tanks: enemies.filter((e) => e.role === 'Tank').map((e) => e.championId),
    assassins: enemies.filter((e) => e.role === 'Assassin').map((e) => e.championId)
  }
}

// the popular build in buying order, each item once: the core, then the most bought 4th / 5th / 6th not already in it
export function popularPath(b: Pick<Build, 'core' | 'item4' | 'item5' | 'item6'>): number[] {
  const path = [...(b.core?.ids ?? [])]
  for (const list of [b.item4, b.item5, b.item6]) {
    const next = list.find((i) => !path.includes(i.id))
    if (next) path.push(next.id)
  }
  return path
}

// the item card / item set: the popular path, its most bought boots, and the next most bought 4th-6th items as options
export function buildPath(b: Pick<Build, 'core' | 'boots' | 'item4' | 'item5' | 'item6'>, nOptions = 4) {
  const path = popularPath(b)
  const boots = path.some((id) => b.boots.some((x) => x.id === id)) ? [] : b.boots.slice(0, 1).map((x) => x.id) // Lolalytics' core often has them already
  const options = [...b.item4, ...b.item5, ...b.item6].sort((x, y) => y.n - x.n).map((x) => x.id).filter((id, i, all) => !path.includes(id) && all.indexOf(id) === i).slice(0, nOptions)
  return { path, boots, options }
}

// What to buy against this enemy team, only from items my champion really builds (pool), most bought first.
// Win rate is not the sort key: situational items are bought when a game already goes one way.
export function teamAdvice(pool: ItemStat[], items: Record<number, StaticItem>, comp: EnemyComp): AdviceRow[] {
  const pick = (ok: (id: number, it: StaticItem) => boolean, finishedOnly = true) =>
    pool
      .filter((p) => {
        const it = items[p.id]
        return !!it && p.n >= MIN_GAMES && (!finishedOnly || !!it.final) && ok(p.id, it)
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, PER_ROW)
  const rows: AdviceRow[] = []
  const add = (kind: AdviceKind, list: ItemStat[]) => list.length > 0 && rows.push({ kind, items: list })
  if (comp.pct && comp.pct.magic >= ONE_SIDED) add('mr', pick((_, it) => !!it.def?.includes('SpellBlock')))
  if (comp.pct && comp.pct.physical >= ONE_SIDED) add('armor', pick((_, it) => !!it.def?.includes('Armor')))
  if (comp.cc && comp.cc.avg >= HIGH_CC) add('tenacity', pick((id, it) => !!it.def?.includes('Tenacity') || CLEANSE.includes(id)))
  if (comp.healers.length) add('antiheal', pick((id) => ANTI_HEAL.includes(id), false)) // Bramble / Oblivion Orb / Executioner's are components
  if (comp.tanks.length >= GROUP) add('tank', pick((id) => ANTI_TANK.includes(id)))
  if (comp.assassins.length >= GROUP) add('burst', pick((id) => ANTI_BURST.includes(id)))
  return rows
}

// potions, Dark Seal, wards, elixirs this champion buys: share = purchases per game, most bought first
export function extraItems(pool: ItemStat[], games: number, items: Record<number, StaticItem>): { id: number; share: number; wr: number }[] {
  if (!(games > 0)) return []
  return pool
    .filter((p) => EXTRAS.includes(p.id) && items[p.id] && p.n / games >= MIN_EXTRA)
    .sort((a, b) => b.n - a.n)
    .map((p) => ({ id: p.id, share: p.n / games, wr: p.wr }))
}

export interface AltBuild {
  kind: 'win' | 'core'
  ids: number[] // in buying order
  n: number
  wr?: number // win-focused build only: Lolalytics' first-three-items rows have no win rate we can trust
  perks?: number[] // win-focused build: the rune page Lolalytics shows with it
}
const ALT_CORES = 2

// Other ways to build (Lolalytics only): the win-focused build with its rune page, then the most played first three
// items whose non-boot items differ from every build above. Boots alone or the buying order are no other build.
export function altBuilds(b: Pick<Build, 'core' | 'win' | 'cores'>, items: Record<number, StaticItem>): AltBuild[] {
  const main = (ids: number[]) => ids.filter((id) => !items[id]?.boots).sort().join()
  const seen = new Set([main(b.core?.ids ?? [])])
  const out: AltBuild[] = []
  const add = (a: AltBuild, core: number[]) => {
    if (seen.has(main(core))) return
    seen.add(main(core))
    out.push(a)
  }
  if (b.win) add({ kind: 'win', ids: popularPath(b.win), wr: b.win.core.wr, n: b.win.core.n, perks: b.win.perks }, b.win.core.ids)
  for (const c of b.cores ?? []) {
    if (c.n < MIN_GAMES || out.filter((a) => a.kind === 'core').length >= ALT_CORES) break
    if (new Set(c.ids).size === c.ids.length && c.ids.every((id) => items[id])) add({ kind: 'core', ids: c.ids, n: c.n }, c.ids)
  }
  return out
}

// what changes against one laner: finished items bought against them that the popular path does not have
export function vsItems(vs: ItemStat[], items: Record<number, StaticItem>, path: number[], n = 4): ItemStat[] {
  return vs.filter((p) => p.n >= MIN_VS_GAMES && items[p.id]?.final && !path.includes(p.id)).sort((a, b) => b.n - a.n).slice(0, n)
}

const BLITZ = /blitz/i // ponytail: Blitz sets are told apart by their title; a Blitz rename needs this updated

type ItemSet = { title?: unknown; uid?: unknown; sortrank?: unknown }
const rank = (s: ItemSet | undefined) => Number(s?.sortrank) || 0

// The shop opens on the first item set of the champion: ours goes first and Blitz's go away.
// The client shows sets by sortrank, highest first: ours gets one above every other set. Hand-made sets stay, after ours.
export function arrangeSets<T extends ItemSet>(sets: T[], mine: T, isOurs: (title: string) => boolean): T[] {
  const others = sets.filter((s) => s.uid !== mine.uid && !isOurs(String(s.title)) && !BLITZ.test(String(s.title)))
  return [{ ...mine, sortrank: Math.max(0, ...others.map(rank)) + 1 }, ...others]
}

// someone (Blitz) wrote after us: our set is no longer first or no longer ranked highest, or a Blitz set is back
export function setsDisturbed(sets: ItemSet[], uid: string): boolean {
  const mine = sets.find((s) => s.uid === uid)
  return sets[0]?.uid !== uid || sets.some((s) => BLITZ.test(String(s.title)) || (s !== mine && rank(s) >= rank(mine)))
}

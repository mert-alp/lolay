import { teamDamage } from './damage.ts'
import type { Build, Damage, ItemStat, StaticItem } from './types.ts'

export const ONE_SIDED = 60 // % of one damage type in the enemy team: the team damage hint and MR / armor advice
export const STRONG_HEAL = 15000 // Lolalytics average healing per game: Aatrox ~15k, Soraka / Vladimir ~28-30k, Zed ~4k
export const HIGH_CC = 2.2 // average Meraki control rating (1..3) of the known enemies
export const MIN_GAMES = 100 // an item this champion bought fewer times is no advice
export const MIN_VS_GAMES = 50 // smaller sample on a /vs/ page
const PER_ROW = 3

// ponytail: fixed id lists, edit when Riot adds or removes a Grievous Wounds / cleanse item
export const ANTI_HEAL = [3165, 3033, 3123, 3075, 3076, 6609, 3916, 3011]
const CLEANSE = [3140] // Quicksilver Sash has no Tenacity tag

export type AdviceKind = 'mr' | 'armor' | 'tenacity' | 'antiheal'
export interface EnemyComp {
  pct: Damage | null // damage share of the known enemies
  cc: { avg: number; high: number[] } | null // high = the enemies with the top control rating; null = no ratings
  healers: number[] // enemies healing STRONG_HEAL or more per game
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

export function enemyComp(enemies: { championId: number; damage?: Damage | null; heal?: number }[], control: Record<number, number> | null): EnemyComp {
  const rated = enemies.filter((e) => control?.[e.championId])
  return {
    pct: teamDamage(enemies.map((e) => e.damage))?.pct ?? null,
    cc: rated.length ? { avg: rated.reduce((s, e) => s + control![e.championId], 0) / rated.length, high: rated.filter((e) => control![e.championId] >= 3).map((e) => e.championId) } : null,
    healers: enemies.filter((e) => (e.heal ?? 0) >= STRONG_HEAL).map((e) => e.championId)
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
  return rows
}

// what changes against one laner: finished items bought against them that the popular path does not have
export function vsItems(vs: ItemStat[], items: Record<number, StaticItem>, path: number[], n = 4): ItemStat[] {
  return vs.filter((p) => p.n >= MIN_VS_GAMES && items[p.id]?.final && !path.includes(p.id)).sort((a, b) => b.n - a.n).slice(0, n)
}

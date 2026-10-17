import { join } from 'node:path'
import { app } from 'electron'
import { buildPath, enemyComp, teamAdvice, vsItems, type ItemAdvice } from '../shared/itemRules.ts'
import type { Lane } from '../shared/types.ts'
import { createTraits } from './champTraits.ts'
import { champPathSlug, fetchMatchupItems, slugFromDdragonId } from './lolalytics.ts'
import { findEnemies } from './recommend.ts'
import { ddragon, getBuild, getStatic } from './services.ts'
import { getState } from './state.ts'
import { getTierList } from './tierlist.ts'

const traits = createTraits({ cacheDir: join(app.getPath('userData'), 'cache'), patch: () => ddragon.version() })

// Item advice for my champion against the enemies known right now (champ select on the Rift only).
// Damage and healing come from the enemies' builds, so they need the Lolalytics source; CC seconds from CommunityDragon.
export async function itemAdvice(championId: number, lane: Lane): Promise<ItemAdvice | null> {
  const { champSelect: cs, live, tier } = getState()
  if (!cs || cs.aram || !(championId > 0)) return null
  const theirs = (live?.enemyTeam ?? []).filter((p) => p.championId > 0)
  const st = await getStatic()
  const [mine, cc, foes, list] = await Promise.all([
    getBuild({ championId, lane }),
    traits(theirs.filter((p) => st.champions[p.championId]).map((p) => ({ championId: p.championId, slug: st.champions[p.championId].id.toLowerCase() }))),
    Promise.all(theirs.map((p) => getBuild({ championId: p.championId, lane: p.position ?? undefined }).catch(() => null))),
    getTierList(lane, tier).catch(() => ({}))
  ])
  const comp = enemyComp(theirs.map((p, i) => ({ championId: p.championId, damage: foes[i]?.damage, heal: foes[i]?.heal })), cc)
  // other sources have no full item list: their 4th-6th item options are the pool then
  const pool = mine.items ?? [...mine.boots, ...mine.item4, ...mine.item5, ...mine.item6]
  const { path: popular, boots } = buildPath(mine)
  const path = [...popular, ...boots]

  const jungle = lane === 'jungle' ? null : await getTierList('jungle', tier).catch(() => null)
  const e = findEnemies(theirs.map((p) => ({ championId: p.championId, lane: p.position })), lane, list, jungle)
  const vsId = e.laner // as the jungler this is the enemy jungler
  const slug = (id: number) => champPathSlug(id) ?? slugFromDdragonId(st.champions[id]?.id ?? '')
  const vsList = vsId && st.champions[vsId] ? await fetchMatchupItems({ slug: slug(championId), vsSlug: slug(vsId), lane, vsLane: lane, tier }).catch(() => []) : []
  return { enemies: theirs.length, comp, rows: teamAdvice(pool, st.items, comp), vs: vsId ? { championId: vsId, items: vsItems(vsList, st.items, path) } : null }
}

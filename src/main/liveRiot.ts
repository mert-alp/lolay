import { regionalOf } from './riotApi.ts'
import type { LeagueEntry, Mastery, Match, Platform } from './riotApi.ts'
import { tryRiot } from './riotService.ts'

const RANKED_SOLO = 420
const MATCHES = 10 // ids per player
const DETAILS = 8 // of those, details fetched: keeps a game near GAME_BUDGET (5 enemies x (3 + 8) + lookups)
const BATCH = 4
export const GAME_BUDGET = 60 // Riot API calls per game, development key = 100 per 2 minutes

export interface RiotData {
  puuid: string // Riot API puuid (not the LCU one)
  league: LeagueEntry[]
  matches: Match[]
  masteries: Mastery[]
}

// league + last ranked solo games + champion mastery for an API puuid.
// `put` receives the same growing object after the first details and after each later batch, so the card fills in progressively.
export async function fetchRiotData(platform: Platform, puuid: string, championId: number, spend: (n: number) => boolean, put: (d: RiotData) => void): Promise<RiotData | null> {
  const regional = regionalOf(platform)
  if (!spend(championId ? 3 : 2)) return null
  const [league, ids, mastery] = await Promise.all([
    tryRiot((r) => r.leagueByPuuid(platform, puuid)),
    tryRiot((r) => r.matchIds(regional, puuid, { count: MATCHES, queue: RANKED_SOLO })),
    championId ? tryRiot((r) => r.masteryByChampion(platform, puuid, championId)) : null
  ])
  if (!league && !ids && !mastery) return null
  const data: RiotData = { puuid, league: league ?? [], matches: [], masteries: mastery ? [mastery] : [] }
  const todo = (ids ?? []).slice(0, DETAILS)
  if (!todo.length) return data
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH)
    if (!spend(chunk.length)) break
    const got = await Promise.all(chunk.map((id) => tryRiot((r) => r.match(regional, id))))
    data.matches.push(...got.filter((m) => !!m))
    put(data)
  }
  return data
}

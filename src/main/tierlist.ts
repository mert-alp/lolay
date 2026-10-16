import { BUILD_TTL } from '../shared/types.ts'
import type { Lane, Tier } from '../shared/types.ts'
import { get as httpGet } from './providers/http.ts'

const API = 'https://a1.lolalytics.com/mega/'
const LABELS = ['', 'S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'] // list `tier` number; 0 = not ranked

export interface TierRow {
  championId: number
  tier: string // "S+", "A-"... ; '' = too few games to rank
  rank: number
  lane: Lane
  pctLane: number // share of this champion's games played in the requested lane
  wr: number
  delta: number // win rate minus the average win rate of the lane (Lolalytics avgWrDelta)
  pr: number
  br: number
  games: number
}
export type TierList = Record<number, TierRow>
export type Matchups = Record<number, { wr: number; n: number }> // our champion's win rate against each enemy champion

export function parseTierList(j: any): TierList {
  if (!j?.cid || typeof j.cid !== 'object') throw new Error('Lolalytics tier list has no champions') // the API answers 200 {"status":404}
  const out: TierList = {}
  for (const [id, r] of Object.entries<any>(j.cid)) {
    out[+id] = {
      championId: +id, tier: LABELS[r.tier] ?? '', rank: r.rank, lane: r.lane, pctLane: r.pctLane,
      wr: r.wr, delta: r.avgWrDelta, pr: r.pr, br: r.br, games: r.games
    }
  }
  return out
}

// `vsWr` is the requested champion's win rate against `cid`
export function parseMatchups(j: any): Matchups {
  if (!Array.isArray(j?.counters)) throw new Error('Lolalytics matchups missing')
  return Object.fromEntries(j.counters.map((c: any) => [c.cid, { wr: c.vsWr, n: c.n }]))
}

const query = (o: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString()

// both endpoints sit on a1.lolalytics.com, which `get` already throttles per host
const fetchJson = async (params: Record<string, string | undefined>) =>
  (await httpGet(`${API}?${query({ v: '1', queue: 'ranked', region: 'all', ...params })}`, { gap: 1000 })).json()

// one in-flight/cached promise per key for BUILD_TTL; a failure is not remembered
export function createCache(ttl = BUILD_TTL, now = Date.now) {
  const map = new Map<string, { at: number; p: Promise<unknown> }>()
  return <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = map.get(key)
    if (hit && now() - hit.at < ttl) return hit.p as Promise<T>
    const p = load()
    map.set(key, { at: now(), p })
    p.catch(() => map.get(key)?.p === p && map.delete(key))
    return p
  }
}

const cached = createCache()

export const getTierList = (lane: Lane, tier: Tier): Promise<TierList> =>
  cached(`list:${lane}:${tier}`, async () => parseTierList(await fetchJson({ ep: 'list', lane, tier })))

export const getMatchups = (slug: string, lane: Lane, tier: Tier): Promise<Matchups> =>
  cached(`vs:${slug}:${lane}:${tier}`, async () => parseMatchups(await fetchJson({ ep: 'counter', c: slug, lane, tier })))

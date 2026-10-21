import { BUILD_TTL } from '../shared/types.ts'
import type { Lane, MetaMovers, MetaQuery, MetaResult, MetaRow, Tier } from '../shared/types.ts'
import { get as httpGet } from './providers/http.ts'
import { parseTierList, type TierList } from './tierlist.ts'

const API = 'https://a1.lolalytics.com/mega/'
const MIN_GAMES = 300 // both patches, else a win-rate change is noise
const MIN_PR = 1
const TOP_N = 5
const MIN_MOVE = 0.5 // momentum below this is patch noise, not a trend
const MIN_LANE = 10 // % of the champion's games in this lane: off-role picks (Swain jungle) are no lane trend
const YOUNG = 0.2 // a patch with under 20% of the games of the one before is a day old: its changes are noise

// the API answers 200 {"status":404} for a patch it has no data for
export class PatchMissing extends Error {}

export type ListFetcher = (lane: Lane | 'all', tier: Tier, patch?: string) => Promise<TierList>

// "16.20.1" -> ["16.20", "16.19", "16.18"]: newest first, Lolalytics may lag behind Data Dragon
export function patchCandidates(version: string | null): string[] {
  const m = /^(\d+)\.(\d+)/.exec(version ?? '')
  if (!m) return []
  return [0, 1, 2].filter((i) => +m[2] - i >= 1).map((i) => `${m[1]}.${+m[2] - i}`)
}

// ponytail: no season rollover (16.1 has no known predecessor), the change columns just stay empty
export function previousPatch(patch: string): string | null {
  const m = /^(\d+)\.(\d+)$/.exec(patch)
  return m && +m[2] > 1 ? `${m[1]}.${+m[2] - 1}` : null
}

const eligible = (r: MetaRow) => r.rank > 0 && r.pr >= MIN_PR && r.games >= MIN_GAMES && r.pctLane >= MIN_LANE
const totalGames = (l: TierList) => Object.values(l).reduce((s, r) => s + r.games, 0)

export function mergeChanges(cur: TierList, prev?: TierList): MetaRow[] {
  return Object.values(cur)
    .filter((r) => r.rank > 0) // lanes list every champion; rank 0 = not ranked there
    .map((r): MetaRow => {
      const p = prev?.[r.championId]
      if (!p || r.pr < MIN_PR || r.games < MIN_GAMES || p.pr < MIN_PR || p.games < MIN_GAMES) return r
      return { ...r, dWr: +(r.wr - p.wr).toFixed(2), dPr: +(r.pr - p.pr).toFixed(2) }
    })
}

// biggest risers and fallers: win-rate change vs the previous patch, or (no previous data) win rate vs the lane average
// momentum = win-rate change + half the pick-rate change, so a popular climber outranks a niche +0.3%
export const momentum = (r: MetaRow) => (r.dWr == null ? null : +(r.dWr + (r.dPr ?? 0) / 2).toFixed(2))

export function findMovers(rows: MetaRow[]): MetaMovers {
  const kind = rows.some((r) => r.dWr != null) ? 'patch' : 'avg'
  const v = (r: MetaRow) => (kind === 'patch' ? momentum(r) : r.delta)
  const pool = rows.filter((r) => eligible(r) && v(r) != null).sort((a, b) => v(b)! - v(a)! || b.games - a.games)
  const min = kind === 'patch' ? MIN_MOVE : 0
  const up = pool.filter((r) => v(r)! >= min && v(r)! > 0).slice(0, TOP_N)
  const down = pool.filter((r) => v(r)! <= -min && v(r)! < 0).slice(-TOP_N).reverse()
  return { kind, up: up.map((r) => r.championId), down: down.map((r) => r.championId) }
}

// `fetchList` is injected so the probing logic is testable; `version` is the Data Dragon version
export function createMeta(fetchList: ListFetcher) {
  return async ({ lane, tier, compare = true }: MetaQuery, version: string | null): Promise<MetaResult> => {
    let patch: string | null = null
    let cur: TierList | undefined
    let prev: TierList | undefined
    let previousPatchLabel: string | null = null
    for (const c of patchCandidates(version)) {
      let list: TierList
      try {
        list = await fetchList(lane, tier, c)
      } catch (e) {
        if (!(e instanceof PatchMissing)) throw e
        continue
      }
      const pp = previousPatch(c)
      let before: TierList | undefined
      if (pp) {
        try {
          before = await fetchList(lane, tier, pp)
        } catch {} // the strips fall back to the lane-average delta
      }
      if (before && totalGames(list) < YOUNG * totalGames(before)) continue // too new: show the patch before
      cur = list
      patch = c
      if (before && compare) {
        prev = before
        previousPatchLabel = pp
      }
      break
    }
    cur ??= await fetchList(lane, tier)

    const rows = mergeChanges(cur, prev)
    return { patch, previousPatch: previousPatchLabel, rows, movers: findMovers(rows) }
  }
}

// one in-flight/cached promise per key; a failure is not remembered
const cache = new Map<string, { at: number; p: Promise<TierList> }>()

export const fetchList: ListFetcher = (lane, tier, patch) => {
  const key = `${lane}:${tier}:${patch ?? ''}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < BUILD_TTL) return hit.p
  const params = new URLSearchParams({ ep: 'list', v: '1', queue: 'ranked', region: 'all', lane, tier, ...(patch && { patch }) })
  const p = (async () => {
    const j = await (await httpGet(`${API}?${params}`, { gap: 1000 })).json()
    if (j?.status === 404) throw new PatchMissing(`no Lolalytics list for ${key}`)
    return parseTierList(j)
  })()
  cache.set(key, { at: Date.now(), p })
  p.catch(() => cache.get(key)?.p === p && cache.delete(key))
  return p
}

export const getMeta = createMeta(fetchList)

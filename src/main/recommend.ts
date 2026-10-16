import type { CounterPick, DraftChamp, DraftPick, DraftPool, Lane } from '../shared/types.ts'
import type { CsSession } from './champSelect.ts'
import type { Matchups, TierList, TierRow } from './tierlist.ts'

const MIN_LANE_SHARE = 1 // % of a champion's games in the lane, below that it is an off-role pick
const MIN_MATCHUP_GAMES = 100
const MIN_COUNTER_GAMES = 200
const MIN_LANER_SHARE = 40 // % of the enemy champion's games in the lane for a guess

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// Score 1..99 = 40 base
//   + 6 per win-rate point above the lane average (delta, clamped -3..+5)
//   + 1.5 per pick-rate point (capped at 10%): popular picks are proven, not a coin flip
//   + mastery points / 20k (capped at 15): you play it well
//   + 3 per win-rate point above 50% against the enemy laner (clamped -15..+15), when known
export function scorePick(delta: number, pr: number, points: number, vsWr: number | null): number {
  const s = 40 + 6 * clamp(delta, -3, 5) + 1.5 * Math.min(pr, 10) + Math.min(15, points / 20000) + (vsWr == null ? 0 : clamp((vsWr - 50) * 3, -15, 15))
  return Math.round(clamp(s, 1, 99))
}

export interface RankInput {
  list: TierList
  available: Set<number> // pickable right now: owned, not banned, not taken
  mastery: Map<number, number> // champion id -> mastery points
  vsEnemy?: Matchups | null // enemy laner's win rate against each champion (their entry for ours is 100 - wr)
  limit: number
}

export function rankPicks({ list, available, mastery, vsEnemy, limit }: RankInput): DraftPick[] {
  const out: DraftPick[] = []
  for (const r of Object.values(list)) {
    if (!available.has(r.championId) || r.pctLane < MIN_LANE_SHARE || !r.tier) continue
    const m = vsEnemy?.[r.championId]
    const vs = m && m.n >= MIN_MATCHUP_GAMES ? +(100 - m.wr).toFixed(2) : null
    const points = mastery.get(r.championId) ?? 0
    out.push({ championId: r.championId, score: scorePick(r.delta, r.pr, points, vs), tier: r.tier, wr: r.wr, delta: r.delta, pr: r.pr, vs, points })
  }
  return out.sort((a, b) => b.score - a.score || b.wr - a.wr).slice(0, limit)
}

// most played champions that are really played in this lane; falls back to plain top mastery
export function favorites(list: TierList, mastery: Map<number, number>, available: Set<number>, n: number): number[] {
  const byPoints = [...mastery].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => available.has(id))
  const inLane = byPoints.filter((id) => (list[id]?.pctLane ?? 0) >= MIN_LANE_SHARE)
  return (inLane.length ? inLane : byPoints).slice(0, n)
}

// Enemy lanes are hidden in draft: the enemy champion that is most played in my lane is the likely laner
export function guessLaner(enemyIds: number[], list: TierList): number | null {
  let best: number | null = null
  let share = 0
  for (const id of enemyIds) {
    const p = list[id]?.pctLane ?? 0
    if (p >= MIN_LANER_SHARE && p > share) [best, share] = [id, p]
  }
  return best
}

// the enemy in my lane and (unless I am the jungler) the enemy jungler: the announced position, else the guess
export function findEnemies(theirs: { championId: number; lane: Lane | null }[], lane: Lane, mine: TierList, jungle?: TierList | null) {
  const ids = theirs.map((p) => p.championId).filter((id) => id > 0)
  const known = (l: Lane) => theirs.find((p) => p.lane === l && p.championId > 0)?.championId
  const laner = known(lane) ?? guessLaner(ids, mine)
  const jungler = lane === 'jungle' ? null : known('jungle') ?? (jungle ? guessLaner(ids.filter((id) => id !== laner), jungle) : null)
  return { laner, jungler }
}

// vsEnemy = the enemy's win rate against each champion in my lane, so 100 - wr is what a pick wins against it
export function counterPicks(list: TierList, available: Set<number>, vsEnemy: Matchups | null | undefined, limit: number): CounterPick[] {
  const out: CounterPick[] = []
  for (const [id, m] of Object.entries(vsEnemy ?? {})) {
    const r = list[+id]
    if (m.n >= MIN_COUNTER_GAMES && r && r.pctLane >= MIN_LANE_SHARE && available.has(+id)) out.push({ championId: +id, vs: +(100 - m.wr).toFixed(2), n: m.n, tier: r.tier })
  }
  return out.sort((a, b) => b.vs - a.vs || b.n - a.n).slice(0, limit)
}

// my unfinished ban action (the id to hover/complete) and whether it is my turn to ban
export function deriveBan(session: CsSession): { banActionId: number | null; myBanTurn: boolean } {
  const open = (session.actions ?? []).flat().find((a) => a.actorCellId === session.localPlayerCellId && a.type === 'ban' && !a.completed && typeof a.id === 'number')
  return { banActionId: open?.id ?? null, myBanTurn: !!open?.isInProgress }
}

const isId = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0

// What I can still pick / ban. The client's own lists are exact but empty outside my turn; then rebuild them:
// owned or free champions (any champion for a ban) minus what is already banned or picked.
export function champPool(pickable: unknown, bannable: unknown, owned: unknown, taken: Set<number>): DraftPool {
  const ids = (a: unknown) => (Array.isArray(a) ? a.filter(isId) : [])
  const all: any[] = Array.isArray(owned) ? owned.filter((c) => isId(c?.id)) : []
  const rebuilt = (own: boolean) => all.filter((c) => (!own || c.ownership?.owned || c.freeToPlay) && !taken.has(c.id)).map((c) => c.id as number)
  const p = ids(pickable)
  const b = ids(bannable)
  return { pickable: p.length ? p : rebuilt(true), bannable: b.length ? b : rebuilt(false) }
}

const chip = (r: TierRow, out: boolean): DraftChamp => ({ championId: r.championId, tier: r.tier, wr: r.wr, pr: r.pr, br: r.br, out })

// watchlist / most played / most banned in my lane. Watchlist and most played only list what I can pick;
// most banned keeps taken champions (greyed), since owning a champion is not needed to ban it
export function rateStrips(list: TierList, available: Set<number>, taken: Set<number>, watchlist: number[], n: number) {
  const inLane = Object.values(list).filter((r) => r.pctLane >= MIN_LANE_SHARE)
  const top = (key: 'pr' | 'br', rows: TierRow[]) => [...rows].sort((a, b) => b[key] - a[key]).slice(0, n)
  const watch: DraftChamp[] = watchlist.filter((id) => available.has(id)).map((id) => {
    const r = list[id]
    return r && r.pctLane >= MIN_LANE_SHARE ? chip(r, false) : { championId: id, tier: '', wr: 0, pr: 0, br: 0, out: false, none: true }
  })
  return {
    watch,
    popular: top('pr', inLane.filter((r) => available.has(r.championId))).map((r) => chip(r, false)),
    banned: top('br', inLane).map((r) => chip(r, taken.has(r.championId)))
  }
}

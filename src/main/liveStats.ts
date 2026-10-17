import type { Lane, LiveTag, MatchDetail, PlayerSummary, ProfileRank } from '../shared/types.ts'
import type { LeagueEntry, Match } from './riotApi.ts'

// Only the LCU fields we read
export interface RankedStats {
  queueMap?: Record<string, { tier?: string; division?: string; leaguePoints?: number; wins?: number; losses?: number } | undefined>
}
export interface MatchGame {
  queueId?: number
  gameCreation?: number
  gameDuration?: number // seconds
  participants?: {
    championId?: number
    stats?: { win?: boolean; kills?: number; deaths?: number; assists?: number }
    timeline?: { lane?: string; role?: string }
  }[]
}
export interface Mastery {
  championId: number
  championLevel: number
  championPoints: number
}

const WINDOW = 20
const REMAKE_SECONDS = 300
const SR_QUEUES = new Set([400, 420, 430, 440, 480, 490])
// ponytail: Blitz asks for 20 games, which almost never fires with a 20-game window; 10 role-tagged games is enough
const MIN_GAMES = 10
const AUTOFILL_MAX = 0.05
const OFFROLE_MAX = 0.25
const OTP_MIN = 0.6
const STREAK_MIN = 3

function laneOf(t?: { lane?: string; role?: string }): Lane | null {
  switch (t?.lane) {
    case 'TOP': return 'top'
    case 'JUNGLE': return 'jungle'
    case 'MIDDLE': case 'MID': return 'middle'
    case 'BOTTOM': return t.role?.includes('SUPPORT') ? 'support' : 'bottom'
    default: return null
  }
}

export function summarize(
  ranked: RankedStats | null | undefined,
  matches: MatchGame[],
  masteries: Mastery[],
  championId: number,
  assigned: Lane | null,
  autofilled?: boolean // Riot's flag; when known it replaces the heuristic autofill guess
): PlayerSummary {
  const solo = ranked?.queueMap?.RANKED_SOLO_5x5
  const ranks = !!solo?.tier && solo.tier !== 'NONE' && solo.tier !== 'UNRANKED'

  const games = matches
    .filter((g) => g.participants?.[0]?.stats && (g.gameDuration ?? REMAKE_SECONDS) >= REMAKE_SECONDS)
    .sort((a, b) => (b.gameCreation ?? 0) - (a.gameCreation ?? 0))
    .slice(0, WINDOW)
  const rows = games.map((g) => ({ ...g.participants![0], queueId: g.queueId }))
  const n = rows.length
  const recent = rows.map((r) => !!r.stats?.win)

  const sum = (key: 'kills' | 'deaths' | 'assists') => rows.reduce((s, r) => s + (r.stats?.[key] ?? 0), 0)
  const [k, d, a] = [sum('kills'), sum('deaths'), sum('assists')]
  const avg: [number, number, number] | null = n ? [k / n, d / n, a / n] : null

  const onChamp = rows.filter((r) => r.championId === championId)
  const m = masteries.find((x) => x.championId === championId)

  const laneCount = new Map<Lane, number>()
  let roleGames = 0
  for (const r of rows) {
    const lane = SR_QUEUES.has(r.queueId ?? 0) ? laneOf(r.timeline) : null
    if (!lane) continue
    roleGames++
    laneCount.set(lane, (laneCount.get(lane) ?? 0) + 1)
  }
  const roles = [...laneCount].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([lane, c]) => ({ lane, pct: Math.round((c / roleGames) * 100) }))

  const tags: LiveTag[] = []
  if (autofilled) tags.push('autofill')
  else if (assigned && roleGames >= MIN_GAMES) {
    const share = (laneCount.get(assigned) ?? 0) / roleGames
    if (share <= AUTOFILL_MAX && autofilled === undefined) tags.push('autofill')
    else if (share <= OFFROLE_MAX) tags.push('offrole')
  }
  if (n >= MIN_GAMES) {
    const perChamp = new Map<number, number>()
    for (const r of rows) perChamp.set(r.championId ?? 0, (perChamp.get(r.championId ?? 0) ?? 0) + 1)
    if (Math.max(...perChamp.values()) / n >= OTP_MIN) tags.push('otp')
  }

  let run = 0
  while (run < n && recent[run] === recent[0]) run++

  return {
    rank: ranks ? { tier: solo!.tier!, division: solo!.division ?? '', lp: solo!.leaguePoints ?? 0 } : null,
    wins: solo?.wins ?? 0,
    losses: solo?.losses ?? 0,
    recent,
    avg,
    kda: n ? (k + a) / Math.max(d, 1) : null,
    champ: { games: onChamp.length, wins: onChamp.filter((r) => r.stats?.win).length },
    mastery: m ? { level: m.championLevel, points: m.championPoints } : null,
    roles,
    tags,
    streak: run >= STREAK_MIN ? (recent[0] ? run : -run) : 0
  }
}

// match-v5 teamPosition -> the LCU timeline shape summarize() reads
const TIMELINE: Record<string, { lane: string; role?: string }> = {
  TOP: { lane: 'TOP' }, JUNGLE: { lane: 'JUNGLE' }, MIDDLE: { lane: 'MIDDLE' }, BOTTOM: { lane: 'BOTTOM', role: 'CARRY' }, UTILITY: { lane: 'BOTTOM', role: 'SUPPORT' }
}

// official API data (league-v4, match-v5, champion-mastery-v4) -> the same summary the LCU path produces
export function summaryFromRiot(
  league: LeagueEntry[],
  matches: Match[],
  puuid: string,
  masteries: Mastery[],
  championId: number,
  assigned: Lane | null,
  autofilled?: boolean
): PlayerSummary {
  const solo = league.find((e) => e.queueType === 'RANKED_SOLO_5x5')
  const ranked: RankedStats | null = solo ? { queueMap: { RANKED_SOLO_5x5: { tier: solo.tier, division: solo.rank, leaguePoints: solo.leaguePoints, wins: solo.wins, losses: solo.losses } } } : null
  const games: MatchGame[] = matches.flatMap((m) => {
    const p = m.info.participants.find((x) => x.puuid === puuid)
    if (!p) return []
    const { queueId, gameCreation, gameDuration } = m.info
    return [{ queueId, gameCreation, gameDuration, participants: [{ championId: p.championId, stats: { win: p.win, kills: p.kills, deaths: p.deaths, assists: p.assists }, timeline: TIMELINE[p.teamPosition] }] }]
  })
  return { ...summarize(ranked, games, masteries, championId, assigned, autofilled), source: 'riot' }
}

const POS_TIMELINE: Record<Lane, { lane: string; role?: string }> = { top: { lane: 'TOP' }, jungle: { lane: 'JUNGLE' }, middle: { lane: 'MIDDLE' }, bottom: { lane: 'BOTTOM', role: 'CARRY' }, support: { lane: 'BOTTOM', role: 'SUPPORT' } }

// OP.GG / Blitz data (season rank, season games per champion, recent games with all ten players) -> the same summary
export function summaryFromWeb(
  rank: ProfileRank | null,
  champs: Record<number, { games: number; wins: number; kda: number | null }> | null,
  games: MatchDetail[],
  puuid: string,
  masteries: Mastery[],
  championId: number,
  assigned: Lane | null,
  autofilled?: boolean
): PlayerSummary {
  const ranked: RankedStats | null = rank ? { queueMap: { RANKED_SOLO_5x5: { tier: rank.tier, division: rank.division, leaguePoints: rank.lp, wins: rank.wins, losses: rank.losses } } } : null
  const rows: MatchGame[] = games.flatMap((g) => {
    const p = g.players.find((x) => x.puuid === puuid)
    if (!p) return []
    const win = g.teams.find((t) => t.teamId === p.teamId)?.win ?? false
    return [{ queueId: g.queueId, gameCreation: g.at, gameDuration: g.duration, participants: [{ championId: p.championId, stats: { win, kills: p.kills, deaths: p.deaths, assists: p.assists }, timeline: p.position ? POS_TIMELINE[p.position] : undefined }] }]
  })
  const s = summarize(ranked, rows, masteries, championId, assigned, autofilled)
  const c = champs?.[championId]
  return { ...s, champ: c ? { games: c.games, wins: c.wins, kda: c.kda, season: true } : s.champ, source: champs ? 'opgg' : 'blitz' }
}

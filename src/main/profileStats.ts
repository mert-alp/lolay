// Pure helpers for the profile page: API/LCU games -> slim MatchDetail, rows, stats. No I/O.
import type { Lane, MatchDetail, MatchEntry, MatchFilter, MatchPlayer, MatchTeam } from '../shared/types.ts'
import type { Match } from './riotApi.ts'

export const REMAKE_SECONDS = 300

// every LoL shard: label for the UI, the usual default Riot ID tag, OP.GG's region code
export const REGIONS = [
  { platform: 'tr1', label: 'TR', tag: 'TR1', opgg: 'tr' },
  { platform: 'euw1', label: 'EUW', tag: 'EUW', opgg: 'euw' },
  { platform: 'eun1', label: 'EUNE', tag: 'EUNE', opgg: 'eune' },
  { platform: 'na1', label: 'NA', tag: 'NA1', opgg: 'na' },
  { platform: 'kr', label: 'KR', tag: 'KR1', opgg: 'kr' },
  { platform: 'br1', label: 'BR', tag: 'BR1', opgg: 'br' },
  { platform: 'la1', label: 'LAN', tag: 'LAN', opgg: 'lan' },
  { platform: 'la2', label: 'LAS', tag: 'LAS', opgg: 'las' },
  { platform: 'oc1', label: 'OCE', tag: 'OCE', opgg: 'oce' },
  { platform: 'jp1', label: 'JP', tag: 'JP1', opgg: 'jp' },
  { platform: 'ru', label: 'RU', tag: 'RU', opgg: 'ru' },
  { platform: 'me1', label: 'ME', tag: 'ME1', opgg: 'me' },
  { platform: 'ph2', label: 'PH', tag: 'PH2', opgg: 'ph' },
  { platform: 'sg2', label: 'SG', tag: 'SG2', opgg: 'sg' },
  { platform: 'th2', label: 'TH', tag: 'TH2', opgg: 'th' },
  { platform: 'tw2', label: 'TW', tag: 'TW2', opgg: 'tw' },
  { platform: 'vn2', label: 'VN', tag: 'VN2', opgg: 'vn' }
] as const
export const regionLabel = (platform: string) => REGIONS.find((r) => r.platform === platform.toLowerCase())?.label ?? platform.toUpperCase()

// queue ids behind each filter chip; 'all' = no filter
export const FILTER_QUEUES: Record<MatchFilter, number[]> = {
  all: [],
  solo: [420],
  flex: [440],
  normal: [400, 430, 490, 480],
  aram: [450, 2400]
}

const LANE: Record<string, Lane> = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'middle', BOTTOM: 'bottom', UTILITY: 'support' }

// "Name#TAG" -> parts; the tag falls back to defaultTag. null = empty name.
export function parseRiotId(input: string, defaultTag: string): { gameName: string; tagLine: string } | null {
  const s = input.trim()
  const i = s.lastIndexOf('#')
  const gameName = (i < 0 ? s : s.slice(0, i)).trim()
  const tagLine = (i < 0 ? '' : s.slice(i + 1)).trim() || defaultTag
  return gameName ? { gameName, tagLine } : null
}

// "Name#TAG" typed in the search box -> parts; the tag is '' while it has not been typed
export function splitQuery(q: string): { name: string; tag: string } {
  const i = q.lastIndexOf('#')
  return i < 0 ? { name: q.trim(), tag: '' } : { name: q.slice(0, i).trim(), tag: q.slice(i + 1).trim() }
}

// "TR1_123" -> "tr1"
export const platformOfMatchId = (id: string) => id.split('_')[0].toLowerCase()
const idNumber = (id: string) => Number(id.split('_')[1]) || 0
export const newestFirst = (ids: string[]) => [...new Set(ids)].sort((a, b) => idNumber(b) - idNumber(a))

const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

function teamOf(teamId: number, win: boolean, players: MatchPlayer[], o: Partial<Record<'baron' | 'dragon' | 'herald' | 'tower' | 'inhibitor' | 'kills', number>>): MatchTeam {
  const mine = players.filter((p) => p.teamId === teamId)
  return {
    teamId,
    win,
    kills: o.kills ?? mine.reduce((s, p) => s + p.kills, 0),
    gold: mine.reduce((s, p) => s + p.gold, 0),
    objectives: { baron: o.baron ?? 0, dragon: o.dragon ?? 0, herald: o.herald ?? 0, tower: o.tower ?? 0, inhibitor: o.inhibitor ?? 0 }
  }
}

export function detailFromRiot(m: Match): MatchDetail {
  const players: MatchPlayer[] = m.info.participants.map((p) => ({
    puuid: p.puuid,
    name: p.riotIdGameName ?? '',
    tag: p.riotIdTagline ?? '',
    championId: p.championId,
    teamId: p.teamId,
    position: LANE[p.teamPosition] ?? null,
    level: num(p.champLevel),
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    cs: p.totalMinionsKilled + p.neutralMinionsKilled,
    vision: p.visionScore,
    wards: num(p.wardsPlaced),
    damage: p.totalDamageDealtToChampions,
    gold: p.goldEarned,
    items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map(num),
    spells: [num(p.summoner1Id), num(p.summoner2Id)],
    keystone: num(p.perks?.styles?.[0]?.selections?.[0]?.perk),
    tree: num(p.perks?.styles?.[1]?.style)
  }))
  const teams = m.info.teams.map((t) => {
    const o = t.objectives
    return teamOf(t.teamId, t.win, players, {
      baron: o?.baron?.kills, dragon: o?.dragon?.kills, herald: o?.riftHerald?.kills, tower: o?.tower?.kills, inhibitor: o?.inhibitor?.kills, kills: o?.champion?.kills
    })
  })
  return { id: m.metadata.matchId, queueId: m.info.queueId, at: m.info.gameCreation, duration: m.info.gameDuration, players, teams }
}

// LCU game (/lol-match-history/v1/games/{id}, or an entry of the matches list that carries all ten players)
export function detailFromLcu(g: any, platform: string): MatchDetail | null {
  const parts: any[] = g?.participants ?? []
  if (!g?.gameId || parts.length < 2) return null
  const ident = new Map<number, any>((g.participantIdentities ?? []).map((x: any) => [x.participantId, x.player]))
  const players: MatchPlayer[] = parts.map((p) => {
    const s = p.stats ?? {}
    const who = ident.get(p.participantId) ?? {}
    const lane = String(p.timeline?.lane ?? '')
    const role = String(p.timeline?.role ?? '')
    return {
      puuid: who.puuid ?? '',
      name: who.gameName || who.summonerName || '',
      tag: who.tagLine ?? '',
      championId: num(p.championId),
      teamId: num(p.teamId),
      position: lane === 'BOTTOM' ? (role.includes('SUPPORT') ? 'support' : 'bottom') : (LANE[lane === 'MID' ? 'MIDDLE' : lane] ?? null),
      level: num(s.champLevel),
      kills: num(s.kills),
      deaths: num(s.deaths),
      assists: num(s.assists),
      cs: num(s.totalMinionsKilled) + num(s.neutralMinionsKilled),
      vision: num(s.visionScore),
      wards: num(s.wardsPlaced),
      damage: num(s.totalDamageDealtToChampions),
      gold: num(s.goldEarned),
      items: [0, 1, 2, 3, 4, 5, 6].map((i) => num(s[`item${i}`])),
      spells: [num(p.spell1Id), num(p.spell2Id)],
      keystone: num(s.perk0),
      tree: num(s.perkSubStyle)
    }
  })
  const teams = (g.teams ?? []).map((t: any) =>
    teamOf(num(t.teamId), t.win === 'Win' || t.win === true, players, { baron: t.baronKills, dragon: t.dragonKills, herald: t.riftHeraldKills, tower: t.towerKills, inhibitor: t.inhibitorKills })
  )
  return { id: `${platform.toUpperCase()}_${g.gameId}`, queueId: num(g.queueId), at: num(g.gameCreation), duration: num(g.gameDuration), players, teams }
}

export const POPULAR_PLATFORMS = ['euw1', 'eun1', 'na1', 'kr'] as const

// who a row is for: by puuid, or by Riot ID (puuids differ between data sources)
export type Who = string | { puuid?: string; gameName?: string; tagLine?: string }

// the row of one player; null when he is not in the match
export function entryOf(d: MatchDetail, who: Who): MatchEntry | null {
  const w = typeof who === 'string' ? { puuid: who } : who
  const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
  const me = d.players.find((p) => !!w.puuid && p.puuid === w.puuid) ?? d.players.find((p) => same(p.name, w.gameName) && same(p.tag, w.tagLine))
  if (!me) return null
  const team = d.teams.find((t) => t.teamId === me.teamId)
  return {
    id: d.id,
    queueId: d.queueId,
    at: d.at,
    duration: d.duration,
    win: team?.win ?? false,
    remake: d.duration < REMAKE_SECONDS,
    teamKills: team?.kills ?? 0,
    me,
    players: d.players.map(({ puuid, name, tag, championId, teamId }) => ({ puuid, name, tag, championId, teamId }))
  }
}

export interface ProfileStats {
  games: number
  wins: number
  wr: number // percent
  avg: [number, number, number]
  kda: number
  csPerMin: number
  kp: number | null // kill participation, percent
  champs: { championId: number; games: number; wins: number; kda: number }[] // most played first
  roles: { lane: Lane; games: number }[]
}

// remakes do not count
export function summarizeMatches(all: MatchEntry[], limit = 20): ProfileStats | null {
  const rows = all.filter((e) => !e.remake).slice(0, limit)
  const n = rows.length
  if (!n) return null
  const sum = (f: (e: MatchEntry) => number) => rows.reduce((s, e) => s + f(e), 0)
  const [k, d, a] = [sum((e) => e.me.kills), sum((e) => e.me.deaths), sum((e) => e.me.assists)]
  const minutes = sum((e) => e.duration) / 60
  const teamKills = sum((e) => e.teamKills)
  const wins = rows.filter((e) => e.win).length

  const byChamp = new Map<number, MatchEntry[]>()
  for (const e of rows) byChamp.set(e.me.championId, [...(byChamp.get(e.me.championId) ?? []), e])
  const champs = [...byChamp].map(([championId, g]) => {
    const t = g.reduce((s, e) => [s[0] + e.me.kills + e.me.assists, s[1] + e.me.deaths], [0, 0])
    return { championId, games: g.length, wins: g.filter((e) => e.win).length, kda: t[0] / Math.max(t[1], 1) }
  }).sort((x, y) => y.games - x.games || y.wins - x.wins)

  const lanes = new Map<Lane, number>()
  for (const e of rows) if (e.me.position) lanes.set(e.me.position, (lanes.get(e.me.position) ?? 0) + 1)

  return {
    games: n,
    wins,
    wr: (wins / n) * 100,
    avg: [k / n, d / n, a / n],
    kda: (k + a) / Math.max(d, 1),
    csPerMin: minutes ? sum((e) => e.me.cs) / minutes : 0,
    kp: teamKills ? ((k + a) / teamKills) * 100 : null,
    champs,
    roles: [...lanes].map(([lane, games]) => ({ lane, games })).sort((x, y) => y.games - x.games)
  }
}

export const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000e3], ['month', 2592000e3], ['day', 864e5], ['hour', 36e5], ['minute', 6e4]]
// "3 saat önce" / "3 hours ago"
export function timeAgo(at: number, lang: string, now = Date.now()): string {
  const f = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' })
  const diff = Math.max(0, now - at)
  for (const [unit, ms] of UNITS) if (diff >= ms) return f.format(-Math.floor(diff / ms), unit)
  return f.format(0, 'second')
}

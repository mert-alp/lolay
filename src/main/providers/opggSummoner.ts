// OP.GG's public summoner backend (the one its desktop app talks to): no key, only `User-Agent: OP.GG Desktop App`.
// Name search, profile, ranks, and the match list with all ten players per game. Region is part of every path.
// Throttled to ~5 req/s per host and cached; any non-200 or unexpected shape throws OpggError so callers can fall back to the Riot API.
import type { Lane, MatchDetail, MatchPlayer, MatchTeam, ProfileRank, SearchResult } from '../../shared/types.ts'
import { arenaTeams, regionLabel, REGIONS } from '../profileStats.ts'
import { createCache, createGate, type Clock } from './limit.ts'

const HOST = 'https://lol-api-summoner.op.gg'
const UA = 'OP.GG Desktop App'
const TTL = { search: 5 * 60e3, profile: 5 * 60e3, games: 2 * 60e3 }
const GAP_MS = 200 // ~5 requests per second
const TIMEOUT_MS = 8000
const MAX_CACHE = 200
const ROMAN = ['', 'I', 'II', 'III', 'IV']
const LANE: Record<string, Lane> = { TOP: 'top', JUNGLE: 'jungle', MID: 'middle', ADC: 'bottom', SUPPORT: 'support' }

export class OpggError extends Error {
  status: number
  kind: 'http' | 'schema' | 'network'
  constructor(kind: 'http' | 'schema' | 'network', status = 0, detail = '') {
    super(`OP.GG ${kind} (${status})${detail ? ` ${detail}` : ''}`)
    this.kind = kind
    this.status = status
  }
}

const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : [])

// profileIcon6923.jpg -> 6923
export const iconIdOf = (url: unknown) => Number(/profileIcon(\d+)/.exec(String(url ?? ''))?.[1]) || undefined

const rankOf = (t: any): ProfileRank | null =>
  t?.tier ? { tier: String(t.tier).toUpperCase(), division: ROMAN[num(t.division)] ?? '', lp: num(t.lp), wins: 0, losses: 0 } : null

export interface OpggAccount {
  puuid: string
  gameName: string
  tagLine: string
  level: number
  iconId?: number
  solo: ProfileRank | null // tier only; win/loss come with the summary
}

// v2/{region}/summoners?riot_id=...: every account with that name (or the one full Riot ID)
export function parseSummoners(body: unknown): OpggAccount[] {
  const data = (body as any)?.data
  if (!Array.isArray(data)) throw new OpggError('schema', 200, 'summoners')
  return data.flatMap((x): OpggAccount[] =>
    x?.puuid && x.game_name && x.tagline
      ? [{ puuid: String(x.puuid), gameName: String(x.game_name), tagLine: String(x.tagline), level: num(x.level), iconId: iconIdOf(x.profile_image_url), solo: rankOf(x.solo_tier_info) }]
      : []
  )
}

export interface OpggSummary {
  level: number
  iconId?: number
  solo: ProfileRank | null
  flex: ProfileRank | null
}

// v3/{region}/summoners/{puuid}/summary
export function parseSummary(body: unknown): OpggSummary {
  const s = (body as any)?.data?.summoner
  if (!s || !Array.isArray(s.league_stats)) throw new OpggError('schema', 200, 'summary')
  const pick = (type: string): ProfileRank | null => {
    const l = s.league_stats.find((x: any) => x?.game_type === type)
    const r = rankOf(l?.tier_info)
    return r ? { ...r, wins: num(l.win), losses: num(l.lose) } : null
  }
  return { level: num(s.level), iconId: iconIdOf(s.profile_image_url), solo: pick('SOLORANKED'), flex: pick('FLEXRANKED') }
}

export interface OpggChampStat {
  games: number
  wins: number
  kda: number | null // (K+A)/max(D,1) over the season
}

// v3/{region}/summoners/{puuid}/most-champions/rank: ranked solo games per champion this season (id 0 = the total row)
export function parseChampions(body: unknown): Record<number, OpggChampStat> {
  const rows = (body as any)?.data?.my_champion_stats
  if (!Array.isArray(rows)) throw new OpggError('schema', 200, 'most-champions')
  const out: Record<number, OpggChampStat> = {}
  for (const r of rows) {
    const id = num(r?.id)
    if (!id || !num(r.play)) continue
    const b = r.basic ?? {}
    out[id] = { games: num(r.play), wins: num(r.win), kda: num(b.death) || num(b.kill) || num(b.assist) ? +((num(b.kill) + num(b.assist)) / Math.max(num(b.death), 1)).toFixed(2) : null }
  }
  return out
}

// one game of v3/{region}/summoners/{puuid}/games -> the slim detail the profile page uses
export function detailFromOpgg(g: any, platform: string): MatchDetail | null {
  const parts = arr(g?.participants)
  if (!g?.id || parts.length < 2) return null
  // BLUE / RED on the Rift; Arena has a team per key (MINION, PORO, KRUG, ...) with a final standing
  const keys = [...new Set(parts.map((p) => String(p.team_key)))]
  const arena = keys.some((k) => k !== 'BLUE' && k !== 'RED')
  const teamIdOf = (key: unknown) => (arena ? keys.indexOf(String(key)) + 1 : key === 'RED' ? 200 : 100)
  const players: MatchPlayer[] = parts.map((p) => {
    const s = p.stats ?? {}
    const items = arr(p.items).map(num)
    return {
      puuid: String(p.summoner?.puuid ?? ''),
      name: String(p.summoner?.game_name ?? ''),
      tag: String(p.summoner?.tagline ?? ''),
      championId: num(p.champion_id),
      teamId: teamIdOf(p.team_key),
      ...(arena && num(s.subteam_placement) ? { placement: num(s.subteam_placement) } : {}),
      position: LANE[String(p.position)] ?? null,
      level: num(s.champion_level),
      kills: num(s.kill),
      deaths: num(s.death),
      assists: num(s.assist),
      cs: num(s.minion_kill) + num(s.neutral_minion_kill),
      vision: num(s.vision_score),
      wards: num(s.ward_place),
      damage: num(s.total_damage_dealt_to_champions),
      gold: num(s.gold_earned),
      items: [...items, 0, 0, 0, 0, 0, 0].slice(0, 6).concat(num(p.trinket_item)),
      spells: arr(p.spells).map(num).slice(0, 2),
      keystone: num(p.rune?.primary_rune_id),
      tree: num(p.rune?.secondary_page_id)
    }
  })
  const teams: MatchTeam[] = arena ? arenaTeams(players, (id) => parts.find((p) => teamIdOf(p.team_key) === id)?.stats?.result === 'WIN') : arr(g.teams).map((t) => {
    const s = t.game_stat ?? {}
    const teamId = t.key === 'RED' ? 200 : 100
    const mine = players.filter((p) => p.teamId === teamId)
    return {
      teamId,
      win: !!s.is_win,
      kills: num(s.kill) || mine.reduce((n, p) => n + p.kills, 0),
      gold: num(s.gold_earned) || mine.reduce((n, p) => n + p.gold, 0),
      objectives: { baron: num(s.baron_kill), dragon: num(s.dragon_kill), herald: num(s.rift_herald_kill), tower: num(s.tower_kill), inhibitor: num(s.inhibitor_kill) }
    }
  })
  return { id: `OPGG_${platform.toUpperCase()}_${g.id}`, queueId: num(g.queue_id), at: Date.parse(String(g.created_at)) || 0, duration: num(g.game_length_second), players, teams }
}

export function parseGames(body: unknown, platform: string): { games: MatchDetail[]; last?: string; count: number } {
  const data = (body as any)?.data
  if (!Array.isArray(data)) throw new OpggError('schema', 200, 'games')
  return {
    games: data.flatMap((g) => { const d = detailFromOpgg(g, platform); return d ? [d] : [] }),
    last: data.length ? String(data[data.length - 1]?.created_at ?? '') || undefined : undefined,
    count: data.length
  }
}

// v2 summoners answer for a name (not a prefix): accounts with that exact, case/space-insensitive name
export function searchResults(accounts: OpggAccount[], platform: string): SearchResult[] {
  return accounts.map((a) => ({ gameName: a.gameName, tagLine: a.tagLine, iconId: a.iconId, level: a.level || undefined, rank: a.solo && { tier: a.solo.tier, division: a.solo.division, lp: a.solo.lp }, platform, region: regionLabel(platform), source: 'opgg' as const }))
}

export type GameType = 'TOTAL' | 'SOLORANKED' | 'FLEXRANKED' | 'NORMAL' | 'ARAM'
const GAME_PAGE = 20 // the API refuses limits of 40 and up
const NEXT_PAGE = 10

export interface OpggOptions extends Clock {
  fetch?: typeof fetch
}

export function createOpggSummoner(o: OpggOptions = {}) {
  const doFetch = o.fetch ?? fetch
  const now = o.now ?? Date.now
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const code = (platform: string) => {
    const c = REGIONS.find((r) => r.platform === platform)?.opgg
    if (!c) throw new OpggError('http', 400, `region ${platform}`)
    return c
  }

  const gate = createGate(GAP_MS, o)

  async function request(path: string, method = 'GET'): Promise<unknown> {
    await gate()
    let res: Response
    try {
      res = await doFetch(`${HOST}${path}`, { method, headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new OpggError('network')
    }
    if (!res.ok) throw new OpggError('http', res.status, path.split('?')[0].replace(/\/[\w-]{40,}/, '/{puuid}'))
    try {
      return await res.json()
    } catch {
      throw new OpggError('schema', res.status, 'not json')
    }
  }

  const cache = createCache(MAX_CACHE, now)

  const e = encodeURIComponent
  const accountsOf = (platform: string, riotId: string) =>
    cache.get(`a|${platform}|${riotId.toLowerCase()}`, TTL.search, async () => parseSummoners(await request(`/api/v2/${code(platform)}/summoners?riot_id=${e(riotId)}`)))

  // accumulated game lists, extended page by page with ended_at
  const lists = new Map<string, { at: number; games: MatchDetail[]; last?: string; done: boolean }>()

  return {
    // a name, or "Name#TAG" (an empty tag is dropped); [] when unknown
    async search(platform: string, query: string): Promise<SearchResult[]> {
      const q = query.trim().replace(/#$/, '')
      if (!q) return []
      return searchResults(await accountsOf(platform, q), platform)
    },
    // the exact account, or null when this region has none
    async account(platform: string, gameName: string, tagLine: string): Promise<OpggAccount | null> {
      const all = await accountsOf(platform, `${gameName}#${tagLine}`)
      return all.find((a) => a.gameName.toLowerCase() === gameName.toLowerCase() && a.tagLine.toLowerCase() === tagLine.toLowerCase()) ?? null
    },
    summary(platform: string, puuid: string): Promise<OpggSummary> {
      return cache.get(`s|${platform}|${puuid}`, TTL.profile, async () => parseSummary(await request(`/api/v3/${code(platform)}/summoners/${e(puuid)}/summary?game_type=SOLORANKED`)))
    },
    // this season's ranked solo games per champion; {} when the account has none (OP.GG answers 404)
    champions(platform: string, puuid: string): Promise<Record<number, OpggChampStat>> {
      return cache.get(`c|${platform}|${puuid}`, TTL.profile, async () => {
        try {
          return parseChampions(await request(`/api/v3/${code(platform)}/summoners/${e(puuid)}/most-champions/rank?game_type=SOLORANKED`))
        } catch (err) {
          if (err instanceof OpggError && err.status === 404) return {}
          throw err
        }
      })
    },
    // at least `need` games (fewer when the history ends), newest first
    async games(platform: string, puuid: string, type: GameType, need: number): Promise<MatchDetail[]> {
      const key = `g|${platform}|${puuid}|${type}`
      let l = lists.get(key)
      if (!l || now() - l.at >= TTL.games) lists.set(key, (l = { at: now(), games: [], done: false }))
      while (l.games.length < need && !l.done) {
        const limit = l.games.length ? NEXT_PAGE : GAME_PAGE
        const body = await request(`/api/v3/${code(platform)}/summoners/${e(puuid)}/games?game_type=${type}&limit=${limit}&hl=en_US${l.last ? `&ended_at=${e(l.last)}` : ''}`)
        const page = parseGames(body, platform)
        l.games.push(...page.games)
        l.last = page.last
        l.done = page.count < limit || !page.last
      }
      return l.games
    },
    // asks OP.GG to re-crawl the account (its own ~2 min cooldown applies), then waits briefly for it to finish
    async renew(platform: string, puuid: string): Promise<void> {
      const c = code(platform)
      await request(`/api/v3/${c}/summoners/${e(puuid)}/renewal`, 'POST')
      for (let i = 0; i < 6; i++) {
        const s = (await request(`/api/v3/${c}/summoners/${e(puuid)}/renewal-status`)) as any
        if (s?.data?.finish) break
        await sleep(Math.min(num(s?.data?.delay) || 1000, 1500))
      }
      this.clear(puuid)
    },
    clear(puuid?: string) {
      cache.drop(puuid ?? '')
      for (const k of [...lists.keys()]) if (!puuid || k.includes(puuid)) lists.delete(k)
    }
  }
}

export type OpggSummonerApi = ReturnType<typeof createOpggSummoner>

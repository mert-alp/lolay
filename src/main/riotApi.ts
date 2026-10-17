// Official Riot API client. Never import electron here, and never put the key in a message, log or cache key.

const REGIONAL = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
} as const

export type Platform = keyof typeof REGIONAL
export type Regional = 'americas' | 'europe' | 'asia' | 'sea'

// region-locale `region` from the LCU -> platform host
const BY_REGION: Record<string, Platform> = {
  BR: 'br1', EUNE: 'eun1', EUW: 'euw1', JP: 'jp1', KR: 'kr', LA1: 'la1', LA2: 'la2', NA: 'na1', OCE: 'oc1', OC1: 'oc1',
  RU: 'ru', TR: 'tr1', PH: 'ph2', SG: 'sg2', TH: 'th2', TW: 'tw2', VN: 'vn2', ME1: 'me1'
}

// also accepts a platform id ("TR1")
export function platformOf(region: string): Platform | null {
  const k = region.trim().toUpperCase()
  return BY_REGION[k] ?? (k.toLowerCase() in REGIONAL ? (k.toLowerCase() as Platform) : null)
}
export const regionalOf = (platform: Platform): Regional => REGIONAL[platform]

export type RiotErrorCode = 'no_key' | 'invalid_key' | 'rate_limited' | 'not_found' | 'server'

export class RiotApiError extends Error {
  status: number
  code: RiotErrorCode
  constructor(status: number, code: RiotErrorCode, detail = '') {
    super(`Riot API ${code} (${status})${detail ? ` ${detail}` : ''}`)
    this.status = status
    this.code = code
  }
}

const codeOf = (status: number): RiotErrorCode =>
  status === 401 || status === 403 ? 'invalid_key' : status === 429 ? 'rate_limited' : status === 404 ? 'not_found' : 'server'

// response subsets: only the fields Lolay is likely to read
export interface Account {
  puuid: string
  gameName: string
  tagLine: string
}
export interface LeagueEntry {
  queueType: string // RANKED_SOLO_5x5 | RANKED_FLEX_SR
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
  hotStreak: boolean
  veteran: boolean
  freshBlood: boolean
  inactive: boolean
}
export interface Mastery {
  puuid: string
  championId: number
  championLevel: number
  championPoints: number
  lastPlayTime: number
}
export interface MatchParticipant {
  puuid: string
  riotIdGameName?: string
  riotIdTagline?: string
  championId: number
  teamId: number
  teamPosition: string
  win: boolean
  playerSubteamId?: number // Arena: 1..8
  subteamPlacement?: number // Arena: 1 = first
  kills: number
  deaths: number
  assists: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  goldEarned: number
  totalDamageDealtToChampions: number
  visionScore: number
  champLevel?: number
  wardsPlaced?: number
  summoner1Id?: number
  summoner2Id?: number
  item0?: number
  item1?: number
  item2?: number
  item3?: number
  item4?: number
  item5?: number
  item6?: number
  perks?: { styles?: { style: number; selections?: { perk: number }[] }[] }
}
export interface MatchObjectives {
  baron?: { kills: number }
  dragon?: { kills: number }
  horde?: { kills: number }
  riftHerald?: { kills: number }
  tower?: { kills: number }
  inhibitor?: { kills: number }
  champion?: { kills: number }
}
export interface Summoner {
  profileIconId: number
  summonerLevel: number
}
export interface Match {
  metadata: { matchId: string; participants: string[] }
  info: {
    gameCreation: number
    gameDuration: number
    gameVersion: string
    queueId: number
    participants: MatchParticipant[]
    teams: { teamId: number; win: boolean; bans: { championId: number; pickTurn: number }[]; objectives?: MatchObjectives }[]
  }
}
export interface ActiveGame {
  gameId: number
  gameMode: string
  gameQueueConfigId: number
  gameStartTime: number
  gameLength: number
  bannedChampions: { championId: number; teamId: number; pickTurn: number }[]
  participants: { puuid: string; riotId?: string; championId: number; teamId: number; bot: boolean; spell1Id: number; spell2Id: number }[]
}

const TTL = { account: 24 * 3600e3, league: 300e3, matchIds: 120e3, match: 24 * 3600e3, mastery: 600e3, active: 30e3 }
const MAX_CACHE = 300
const MAX_WAIT_MS = 30e3 // longer than this we fail with rate_limited instead of hanging the caller
const DEFAULT_LIMITS = [{ n: 20, ms: 1000 }, { n: 100, ms: 120e3 }] // development key

export interface RiotApiOptions {
  getKey: () => string | undefined
  fetch?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export function createRiotApi(opts: RiotApiOptions) {
  const doFetch = opts.fetch ?? fetch
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let limits = DEFAULT_LIMITS
  let sent: number[] = []
  let blockedUntil = 0

  // sliding windows shared by every call; waits until all of them have room
  async function acquire() {
    for (;;) {
      const t = now()
      sent = sent.filter((s) => s > t - limits[limits.length - 1].ms)
      let wait = blockedUntil - t
      for (const { n, ms } of limits) {
        const recent = sent.filter((s) => s > t - ms)
        if (recent.length >= n) wait = Math.max(wait, recent[recent.length - n] + ms - t + 50)
      }
      if (wait <= 0) return void sent.push(t)
      if (wait > MAX_WAIT_MS) throw new RiotApiError(429, 'rate_limited', 'local limiter')
      await sleep(wait)
    }
  }

  // "20:1,100:120" -> adopt the key's real limits
  function learn(h: Headers) {
    const parsed = (h.get('x-app-rate-limit') ?? '').split(',').map((p) => p.split(':').map(Number))
    const next = parsed.filter(([n, s]) => n > 0 && s > 0).map(([n, s]) => ({ n, ms: s * 1000 })).sort((a, b) => a.ms - b.ms)
    if (next.length) limits = next
  }

  async function request<T>(host: string, path: string): Promise<T> {
    const key = opts.getKey()?.trim()
    if (!key) throw new RiotApiError(0, 'no_key')
    for (let attempt = 0; ; attempt++) {
      await acquire()
      let res: Response
      try {
        res = await doFetch(`https://${host}.api.riotgames.com${path}`, {
          headers: { 'X-Riot-Token': key, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000)
        })
      } catch {
        throw new RiotApiError(0, 'server', 'network error')
      }
      learn(res.headers)
      if (res.status === 429 && attempt === 0) {
        const s = Number(res.headers.get('retry-after'))
        blockedUntil = now() + (s > 0 ? s : 1) * 1000
        continue
      }
      if (!res.ok) throw new RiotApiError(res.status, codeOf(res.status), path)
      try {
        return (await res.json()) as T
      } catch {
        throw new RiotApiError(res.status, 'server', 'bad json')
      }
    }
  }

  const cache = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>()
  // caches the promise (so concurrent callers share one request); failures are not kept
  function cached<T>(host: string, path: string, ttl: number, fallback: T): Promise<T> {
    const k = host + path
    const hit = cache.get(k)
    if (hit && now() - hit.at < hit.ttl) return hit.value as Promise<T>
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!)
    const value = request<T>(host, path).catch((e) => {
      if (e instanceof RiotApiError && e.code === 'not_found') return fallback
      cache.delete(k)
      throw e
    })
    cache.set(k, { at: now(), ttl, value })
    return value
  }

  const e = encodeURIComponent
  // account-v1 has no sea cluster
  const acct = (r: Regional) => (r === 'sea' ? 'asia' : r)

  // Riot API puuids are encrypted per key and are NOT the LCU puuid: start from a Riot ID, never pass an LCU puuid to a method here.
  const accountByRiotId = (gameName: string, tagLine: string, regional: Regional = 'europe') =>
    cached<Account | null>(acct(regional), `/riot/account/v1/accounts/by-riot-id/${e(gameName)}/${e(tagLine)}`, TTL.account, null)

  return {
    accountByRiotId,
    // Riot ID -> API puuid (cached 24h), null if no such account
    resolve: async (gameName: string, tagLine: string, regional: Regional = 'europe') => (await accountByRiotId(gameName, tagLine, regional))?.puuid ?? null,
    // the shard a player is active on ("tr1"): account-v1 itself answers from any cluster
    activeRegion: (puuid: string, regional: Regional = 'europe') =>
      cached<{ region: string } | null>(acct(regional), `/riot/account/v1/region/by-game/lol/by-puuid/${e(puuid)}`, TTL.account, null),
    accountByPuuid: (puuid: string, regional: Regional = 'europe') =>
      cached<Account | null>(acct(regional), `/riot/account/v1/accounts/by-puuid/${e(puuid)}`, TTL.account, null),
    leagueByPuuid: (platform: Platform, puuid: string) =>
      cached<LeagueEntry[]>(platform, `/lol/league/v4/entries/by-puuid/${e(puuid)}`, TTL.league, []),
    matchIds: (regional: Regional, puuid: string, o: { start?: number; count?: number; queue?: number } = {}) =>
      cached<string[]>(regional, `/lol/match/v5/matches/by-puuid/${e(puuid)}/ids?start=${o.start ?? 0}&count=${o.count ?? 20}${o.queue ? `&queue=${o.queue}` : ''}`, TTL.matchIds, []),
    match: (regional: Regional, matchId: string) =>
      cached<Match | null>(regional, `/lol/match/v5/matches/${e(matchId)}`, TTL.match, null),
    summonerByPuuid: (platform: Platform, puuid: string) =>
      cached<Summoner | null>(platform, `/lol/summoner/v4/summoners/by-puuid/${e(puuid)}`, TTL.account, null),
    masteryByChampion: (platform: Platform, puuid: string, championId: number) =>
      cached<Mastery | null>(platform, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${e(puuid)}/by-champion/${championId}`, TTL.mastery, null),
    activeGame: (platform: Platform, puuid: string) =>
      cached<ActiveGame | null>(platform, `/lol/spectator/v5/active-games/by-summoner/${e(puuid)}`, TTL.active, null),
    // cheapest call that proves the key works (uncached on purpose)
    platformStatus: (platform: Platform) => request<unknown>(platform, '/lol/status/v4/platform-data'),
    clearCache: () => cache.clear()
  }
}

export type RiotApi = ReturnType<typeof createRiotApi>

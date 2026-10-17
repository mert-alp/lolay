// Profile page backend. Every part (profile, match list, match detail) tries Blitz, then OP.GG, then the Riot API; the League client
// is the last resort for the signed-in account. Backends need no key except Riot's, so Riot's rate limit is spent only when they fail.
// No electron import: tests and the smoke script load it directly; profileIpc.ts wires it up.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DataSource, MatchDetail, MatchEntry, MatchesQuery, Profile, ProfileErrorCode, ProfileQuery, ProfileRank, ProfileResult } from '../shared/types.ts'
import { platformOf, regionalOf, RiotApiError } from './riotApi.ts'
import type { BlitzApi } from './providers/blitzSummoner.ts'
import type { GameType, OpggSummonerApi } from './providers/opggSummoner.ts'
import type { Platform, RiotApi } from './riotApi.ts'
import type { Seen } from './playerSearch.ts'
import { detailFromLcu, detailFromRiot, entryOf, FILTER_QUEUES, newestFirst, platformOfMatchId, POPULAR_PLATFORMS } from './profileStats.ts'

const MATCH_TTL = 24 * 3600e3
const LCU_GAMES = 100 // how deep the client history is read for filtering and paging
const CONCURRENCY = 6

export class ProfileError extends Error {
  code: ProfileErrorCode
  constructor(code: ProfileErrorCode) {
    super(code)
    this.code = code
  }
}

// IPC boundary: never throws, never leaks the message (it may carry a path)
export async function safe<T>(fn: () => Promise<T>): Promise<ProfileResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    if (e instanceof ProfileError || e instanceof RiotApiError) return { ok: false, error: e.code }
    console.error('profile', e instanceof Error ? e.name : 'error')
    return { ok: false, error: 'server' }
  }
}

export interface ProfileDeps {
  api: () => RiotApi
  lcuGet: (path: string) => Promise<any> // null = not connected or non-2xx
  cacheDir: string // match details are kept here for 24h
  seen?: (p: Seen[]) => void // feeds the player-search index
  blitz?: BlitzApi
  opgg?: OpggSummonerApi
  hint?: (name: string, tag: string) => Promise<string | undefined> // platform of a player seen before
  now?: () => number
}

const rank = (e: { tier?: string; rank?: string; division?: string; leaguePoints?: number; wins?: number; losses?: number } | undefined): ProfileRank | null =>
  e?.tier && e.tier !== 'NONE' && e.tier !== 'UNRANKED'
    ? { tier: e.tier, division: e.rank ?? e.division ?? '', lp: e.leaguePoints ?? 0, wins: e.wins ?? 0, losses: e.losses ?? 0 }
    : null

async function mapLimit<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) {
      const i = next++
      out[i] = await fn(list[i])
    }
  }))
  return out
}

const GAME_TYPE: Record<string, GameType> = { all: 'TOTAL', solo: 'SOLORANKED', flex: 'FLEXRANKED', normal: 'NORMAL', aram: 'ARAM' }
const errCode = (e: unknown) => (e instanceof RiotApiError ? e.code : e instanceof ProfileError ? e.code : (e as { kind?: string })?.kind ?? 'error')

export function createProfile(d: ProfileDeps) {
  const now = d.now ?? Date.now
  const memory = new Map<string, MatchDetail>() // client games live here; Riot ones are mirrored from disk
  let myPlatform: Platform = 'tr1'
  const warned = new Set<DataSource>()

  type Step<T> = [DataSource, (() => Promise<T | null>) | null | undefined]
  // first backend that has an answer; null from one = "no such thing", an error = unavailable (logged once per backend)
  async function chain<T>(steps: Step<T>[]): Promise<{ src: DataSource; value: T }> {
    let miss = false
    let err: unknown
    for (const [src, fn] of steps) {
      if (!fn) continue
      try {
        const value = await fn()
        warned.delete(src)
        if (value != null) return { src, value }
        miss = true
      } catch (e) {
        if (!warned.has(src)) console.error(`profile: ${src} unavailable (${errCode(e)}), trying the next source`)
        warned.add(src)
        err = e
      }
    }
    if (miss || !err) throw new ProfileError('not_found')
    throw err
  }

  const asPlatform = (s: string | undefined): Platform => platformOf(s ?? '') ?? myPlatform

  async function fromLcu(): Promise<{ me: any; platform: Platform }> {
    const me = await d.lcuGet('/lol-summoner/v1/current-summoner')
    if (!me?.puuid) throw new ProfileError('lcu_off')
    const region = (await d.lcuGet('/riotclient/region-locale'))?.region
    myPlatform = platformOf(String(region ?? '')) ?? myPlatform
    return { me, platform: myPlatform }
  }

  // account-v1 answers from any cluster; the shard (summoner/league/match calls) is the player's active region unless the caller knows it
  async function viaRiot(gameName: string, tagLine: string, known: Platform | null, mine: boolean): Promise<Profile> {
    const api = d.api()
    const acct = await api.accountByRiotId(gameName, tagLine)
    if (!acct) throw new ProfileError('not_found')
    const platform = known ?? platformOf((await api.activeRegion(acct.puuid))?.region ?? '') ?? myPlatform
    const [summ, league] = await Promise.all([api.summonerByPuuid(platform, acct.puuid), api.leagueByPuuid(platform, acct.puuid)])
    return {
      puuid: acct.puuid, src: 'riot', gameName: acct.gameName, tagLine: acct.tagLine, platform,
      level: summ?.summonerLevel ?? 0, iconId: summ?.profileIconId ?? 0,
      solo: rank(league.find((e) => e.queueType === 'RANKED_SOLO_5x5')), flex: rank(league.find((e) => e.queueType === 'RANKED_FLEX_SR')),
      me: mine
    }
  }

  async function viaLcu(me: any, platform: Platform, degraded?: ProfileErrorCode): Promise<Profile> {
    const ranked = await d.lcuGet(`/lol-ranked/v1/ranked-stats/${me.puuid}`)
    const q = ranked?.queueMap ?? {}
    return {
      puuid: me.puuid, src: 'lcu', degraded, gameName: me.gameName ?? me.displayName ?? '', tagLine: me.tagLine ?? '', platform,
      level: me.summonerLevel ?? 0, iconId: me.profileIconId ?? 0,
      solo: rank(q.RANKED_SOLO_5x5 && { ...q.RANKED_SOLO_5x5, rank: q.RANKED_SOLO_5x5.division }), flex: rank(q.RANKED_FLEX_SR && { ...q.RANKED_FLEX_SR, rank: q.RANKED_FLEX_SR.division }),
      me: true
    }
  }

  // ---- profile

  const asProfile = (src: DataSource, a: { puuid: string; gameName: string; tagLine: string; level: number; iconId: number; solo: ProfileRank | null; flex: ProfileRank | null }, platform: Platform, mine: boolean): Profile => ({ ...a, src, platform, me: mine })

  // shard of a player nobody told us about: seen before, else the region OP.GG finds the account in, else mine
  async function resolvePlatform(name: string, tag: string): Promise<Platform> {
    const hinted = platformOf((await d.hint?.(name, tag)) ?? '')
    if (hinted) return hinted
    if (d.opgg) {
      const o = d.opgg
      const regions = [...new Set<Platform>([myPlatform, ...POPULAR_PLATFORMS])]
      const hits = await Promise.all(regions.map((p) => o.account(p, name, tag).then((a) => (a ? p : null), () => null)))
      const found = hits.find((p): p is Platform => !!p)
      if (found) return found
    }
    return myPlatform
  }

  async function getProfile(q: 'me' | ProfileQuery): Promise<Profile> {
    const mine = q === 'me'
    const lcuMe = mine ? await fromLcu() : null
    const name = lcuMe ? lcuMe.me.gameName : (q as ProfileQuery).gameName
    const tag = lcuMe ? lcuMe.me.tagLine : (q as ProfileQuery).tagLine
    const given = lcuMe ? lcuMe.platform : q !== 'me' && q.platform ? asPlatform(q.platform) : null
    let shard: Promise<Platform> | null = null
    const platform = async () => given ?? (shard ??= resolvePlatform(name, tag))
    try {
      const { value } = await chain<Profile>([
        // Blitz answers for any region; the platform label comes from the region prefix of its match ids
        ['blitz', d.blitz && (async () => {
          const a = await d.blitz!.account('tr1', name, tag)
          if (!a) return null
          const p = given ?? platformOf(platformOfMatchId((await d.blitz!.matchIds('tr1', name, tag).catch(() => []))[0]?.id ?? '')) ?? (await platform())
          return asProfile('blitz', a, p, mine)
        })],
        ['opgg', d.opgg && (async () => {
          const p = await platform()
          const a = await d.opgg!.account(p, name, tag)
          if (!a) return null
          const s = await d.opgg!.summary(p, a.puuid)
          return asProfile('opgg', { puuid: a.puuid, gameName: a.gameName, tagLine: a.tagLine, level: s.level || a.level, iconId: s.iconId ?? a.iconId ?? 0, solo: s.solo, flex: s.flex }, p, mine)
        })],
        ['riot', async () => viaRiot(name, tag, given, mine).catch((e) => { if (e instanceof ProfileError && e.code === 'not_found') return null; throw e })]
      ])
      return value
    } catch (e) {
      // every backend is down: the client still knows my own account
      if (lcuMe && !(e instanceof ProfileError && e.code === 'not_found')) return viaLcu(lcuMe.me, lcuMe.platform, e instanceof RiotApiError ? e.code : 'server')
      throw e
    }
  }

  // ---- match details: memory -> disk (24h) -> the backend that listed it

  const file = (id: string) => join(d.cacheDir, `${id.replace(/[^\w-]/g, '_')}.json`)

  async function cachedDetail(id: string): Promise<MatchDetail | null> {
    const hit = memory.get(id)
    if (hit) return hit
    try {
      const c = JSON.parse(await readFile(file(id), 'utf8')) as { at: number; d: MatchDetail }
      if (now() - c.at < MATCH_TTL) {
        memory.set(id, c.d)
        return c.d
      }
    } catch {}
    return null
  }

  async function store(dt: MatchDetail): Promise<MatchDetail> {
    memory.set(dt.id, dt)
    await mkdir(d.cacheDir, { recursive: true })
    await writeFile(file(dt.id), JSON.stringify({ at: now(), d: dt })).catch(() => {})
    return dt
  }

  // Riot-shaped ids ("TR1_123") can come from Blitz or Riot; OP.GG games are stored when listed
  async function fetchDetail(id: string, via: 'blitz' | 'riot'): Promise<MatchDetail | null> {
    const platform = platformOf(platformOfMatchId(id))
    if (!platform) return null
    const m = via === 'blitz' ? await d.blitz?.match(id) : await d.api().match(regionalOf(platform), id)
    return m ? store(detailFromRiot(m)) : null
  }

  async function detail(id: string, via: 'blitz' | 'riot'): Promise<MatchDetail | null> {
    return (await cachedDetail(id)) ?? fetchDetail(id, via)
  }

  const rowsOf = (list: (MatchDetail | null)[], who: { puuid: string; gameName: string; tagLine: string }) =>
    list.flatMap((x) => {
      const e = x && entryOf(x, who)
      return e ? [e] : []
    })

  async function riotIds(q: MatchesQuery, puuid: string): Promise<string[]> {
    const api = d.api()
    const regional = regionalOf(asPlatform(q.platform))
    if (q.fresh) api.clearCache()
    const queues = FILTER_QUEUES[q.filter ?? 'all']
    if (queues.length <= 1) return api.matchIds(regional, puuid, { start: q.start, count: q.count, queue: queues[0] })
    // several queues behind one chip: newest `start+count` of each, merged
    const lists = await Promise.all(queues.map((queue) => api.matchIds(regional, puuid, { count: Math.min(100, q.start + q.count), queue })))
    return newestFirst(lists.flat()).slice(q.start, q.start + q.count)
  }

  async function lcuMatches(q: MatchesQuery): Promise<MatchEntry[]> {
    const list = await d.lcuGet(`/lol-match-history/v1/products/lol/${q.puuid}/matches?begIndex=0&endIndex=${LCU_GAMES}`)
    if (!list) throw new ProfileError('lcu_off')
    const queues = FILTER_QUEUES[q.filter ?? 'all']
    const games: any[] = (list.games?.games ?? []).filter((g: any) => !queues.length || queues.includes(g.queueId))
    const rows = await mapLimit(games.slice(q.start, q.start + q.count), CONCURRENCY, async (g) => {
      // the list may carry only my own participant: the single-game endpoint has all ten
      const full = detailFromLcu(g, q.platform) ?? detailFromLcu(await d.lcuGet(`/lol-match-history/v1/games/${g.gameId}`), q.platform)
      if (!full) return null
      memory.set(full.id, full)
      return entryOf(full, q.puuid)
    })
    return rows.filter((r): r is MatchEntry => !!r)
  }

  async function listMatches(q: MatchesQuery): Promise<MatchEntry[]> {
    if (q.src === 'lcu') return lcuMatches(q)
    const platform = asPlatform(q.platform)
    const queues = FILTER_QUEUES[q.filter ?? 'all']
    const who = { puuid: q.puuid, gameName: q.gameName, tagLine: q.tagLine }
    // an empty first page of the unfiltered list means "this backend knows nothing": ask the next one
    const orNext = (rows: MatchEntry[]) => (rows.length || q.start > 0 || queues.length ? rows : null)
    const { value } = await chain<MatchEntry[]>([
      // OP.GG first: Blitz's match list can lag behind by hours
      ['opgg', d.opgg && (async () => {
        const o = d.opgg!
        const puuid = q.src === 'opgg' ? q.puuid : (await o.account(platform, q.gameName, q.tagLine))?.puuid
        if (!puuid) return null
        if (q.fresh) await o.renew(platform, puuid).catch(() => {})
        const games = await o.games(platform, puuid, GAME_TYPE[q.filter ?? 'all'], q.start + q.count)
        const page = games.slice(q.start, q.start + q.count)
        await Promise.all(page.map(store))
        return orNext(rowsOf(page, { ...who, puuid }))
      })],
      ['blitz', d.blitz && (async () => {
        if (!q.gameName) return null
        if (q.fresh) d.blitz!.clear()
        const refs = await d.blitz!.matchIds(platform, q.gameName, q.tagLine)
        const matched: MatchDetail[] = []
        // newest first, in small parallel chunks; games Blitz knows to be in another queue are skipped unseen
        for (let i = 0; i < refs.length && matched.length < q.start + q.count; ) {
          const size = Math.max(1, Math.min(CONCURRENCY, q.start + q.count - matched.length))
          const chunk = refs.slice(i, i + size).filter((r) => !queues.length || r.queue == null || queues.includes(r.queue))
          i += size
          for (const x of await Promise.all(chunk.map((r) => detail(r.id, 'blitz')))) if (x && (!queues.length || queues.includes(x.queueId))) matched.push(x)
        }
        return orNext(rowsOf(matched.slice(q.start, q.start + q.count), { ...who, puuid: q.src === 'blitz' ? q.puuid : '' }))
      })],
      ['riot', async () => {
        const puuid = q.src === 'riot' ? q.puuid : (await d.api().accountByRiotId(q.gameName, q.tagLine))?.puuid
        if (!puuid) return null
        const found = await mapLimit(await riotIds(q, puuid), CONCURRENCY, (id) => detail(id, 'riot'))
        return rowsOf(found, { ...who, puuid })
      }]
    ])
    return value
  }

  async function get(q: 'me' | ProfileQuery): Promise<Profile> {
    const p = await getProfile(q)
    d.seen?.([{ gameName: p.gameName, tagLine: p.tagLine, platform: p.platform, iconId: p.iconId || undefined, level: p.level || undefined }])
    return p
  }

  async function matches(q: MatchesQuery): Promise<MatchEntry[]> {
    const rows = await listMatches(q)
    d.seen?.(rows.flatMap((e) => e.players.map((p) => ({ gameName: p.name, tagLine: p.tag, platform: q.platform }))))
    return rows
  }

  async function match(id: string): Promise<MatchDetail> {
    const dt = (await cachedDetail(id)) ?? (await chain<MatchDetail>([['blitz', d.blitz && (() => fetchDetail(id, 'blitz'))], ['riot', () => fetchDetail(id, 'riot')]]).then((r) => r.value, () => null))
    if (!dt) throw new ProfileError('not_found')
    return dt
  }

  // old files are never read again; sweep them once at startup
  async function prune() {
    for (const f of await readdir(d.cacheDir).catch(() => [] as string[])) {
      try {
        if (now() - (await stat(join(d.cacheDir, f))).mtimeMs >= MATCH_TTL) await rm(join(d.cacheDir, f), { force: true })
      } catch {}
    }
  }

  // a match found elsewhere (the end-of-game screen) is served from here, so its detail opens without a fetch
  const remember = (dt: MatchDetail) => store(dt)

  return { get, matches, match, prune, remember }
}

export type ProfileService = ReturnType<typeof createProfile>

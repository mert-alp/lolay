// Blitz's public LoL backend (read-only GETs, no key): account + ranked queues, the recent match ids, and full matches in Riot's match-v5 shape.
// Never call its upload endpoints (player_standing, player_match_stats). Throttled to ~5 req/s and cached; non-200 / odd shapes throw BlitzError.
import type { ProfileRank } from '../../shared/types.ts'
import type { Match } from '../riotApi.ts'
import { createCache, createGate, type Clock } from './limit.ts'

const HOST = 'https://lol.v2.iesdev.com'
const TTL = { account: 5 * 60e3, ids: 2 * 60e3, match: 24 * 3600e3 }
const GAP_MS = 200
const TIMEOUT_MS = 10000
const MAX_CACHE = 150

export class BlitzError extends Error {
  status: number
  kind: 'http' | 'schema' | 'network'
  constructor(kind: 'http' | 'schema' | 'network', status = 0, detail = '') {
    super(`Blitz ${kind} (${status})${detail ? ` ${detail}` : ''}`)
    this.kind = kind
    this.status = status
  }
}

const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

export interface BlitzAccount {
  puuid: string // Blitz's own encrypted puuid: only valid against Blitz matches
  gameName: string
  tagLine: string
  level: number
  iconId: number
  solo: ProfileRank | null
  flex: ProfileRank | null
}

// riot_account/lol/{PLATFORM}/{name}/{tag}
export function parseAccount(body: unknown): BlitzAccount {
  const b = body as any
  const a = b?.account
  if (!a?.puuid || !a.game_name || !Array.isArray(b.league_lol ?? [])) throw new BlitzError('schema', 200, 'account')
  const pick = (type: string): ProfileRank | null => {
    const l = (b.league_lol ?? []).find((x: any) => x?.queue_type === type)
    return l?.tier ? { tier: String(l.tier).toUpperCase(), division: String(l.rank ?? ''), lp: num(l.league_points), wins: num(l.wins), losses: num(l.losses) } : null
  }
  return {
    puuid: String(a.puuid), gameName: String(a.game_name), tagLine: String(a.tag_line ?? ''),
    level: num(b.summoner?.summoner_level), iconId: num(b.summoner?.profile_icon_id),
    solo: pick('RANKED_SOLO_5x5'), flex: pick('RANKED_FLEX_SR')
  }
}

export interface BlitzMatchRef {
  id: string // "TR1_123"
  queue?: number // known only for games a Blitz client recorded
}

// match_list: { "TR1_123": {queue, ...} | null } -> newest first
export function parseMatchList(body: unknown): BlitzMatchRef[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BlitzError('schema', 200, 'match_list')
  const n = (id: string) => Number(id.split('_')[1]) || 0
  return Object.entries(body as Record<string, any>)
    .map(([id, v]): BlitzMatchRef => ({ id, queue: typeof v?.queue === 'number' ? v.queue : undefined }))
    .sort((a, b) => n(b.id) - n(a.id))
}

export interface BlitzOptions extends Clock {
  fetch?: typeof fetch
}

export function createBlitzSummoner(o: BlitzOptions = {}) {
  const doFetch = o.fetch ?? fetch
  const now = o.now ?? Date.now
  const gate = createGate(GAP_MS, o)
  const cache = createCache(MAX_CACHE, now)
  const e = encodeURIComponent

  // null on 404 (no such account / match)
  async function get(path: string): Promise<unknown | null> {
    await gate()
    let res: Response
    try {
      res = await doFetch(`${HOST}${path}`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new BlitzError('network')
    }
    if (res.status === 404) return null
    if (!res.ok) throw new BlitzError('http', res.status, path.split('/').slice(1, 3).join('/'))
    try {
      return await res.json()
    } catch {
      throw new BlitzError('schema', res.status, 'not json')
    }
  }

  const who = (platform: string, name: string, tag: string) => `${platform.toUpperCase()}/${e(name)}/${e(tag)}`

  return {
    account: (platform: string, name: string, tag: string): Promise<BlitzAccount | null> =>
      cache.get(`a|${platform}|${name}|${tag}`.toLowerCase(), TTL.account, async () => {
        const b = await get(`/riot_account/lol/${who(platform, name, tag)}`)
        return b == null ? null : parseAccount(b)
      }),
    matchIds: (platform: string, name: string, tag: string): Promise<BlitzMatchRef[]> =>
      cache.get(`m|${platform}|${name}|${tag}`.toLowerCase(), TTL.ids, async () => {
        const b = await get(`/lol/match_list/${who(platform, name, tag)}`)
        return b == null ? [] : parseMatchList(b)
      }),
    match: (id: string): Promise<Match | null> =>
      cache.get(`x|${id}`, TTL.match, async () => {
        const b = (await get(`/lol/match/${e(id)}`)) as Match | null
        if (b && (!b.info?.participants || !b.metadata?.matchId)) throw new BlitzError('schema', 200, 'match')
        return b
      }),
    clear: () => cache.drop('')
  }
}

export type BlitzApi = ReturnType<typeof createBlitzSummoner>

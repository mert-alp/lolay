// Player search. The Riot API only resolves a full Riot ID, so partial names come from (1) a local index of every player
// we have seen and (2) OP.GG's public name search. No electron import: profileIpc.ts wires it up.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SearchQuery, SearchResponse, SearchResult } from '../shared/types.ts'
import { POPULAR_PLATFORMS, regionLabel, REGIONS, splitQuery } from './profileStats.ts'
import type { BlitzApi } from './providers/blitzSummoner.ts'
import type { OpggSummonerApi } from './providers/opggSummoner.ts'
import { platformOf } from './riotApi.ts'
import type { Platform, RiotApi } from './riotApi.ts'

const MAX_KNOWN = 5000
const LIMIT = 20
const FRIENDS_TTL = 60_000
const SAVE_MS = 2000

// lowercase, no diacritics, dotless i, no spaces: "Çağrı" ~ "cagri", "Ｃ Ｒ Ｘ" ~ "crx"
export const foldName = (s: string) => s.normalize('NFKC').toLocaleLowerCase('en').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/\s+/g, '')

export { splitQuery }

// 0 exact, 1 prefix, 2 substring, 3 letters in order, null no match
export function nameRank(name: string, query: string): number | null {
  const n = foldName(name)
  const q = foldName(query)
  if (!q) return 3
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  if (n.includes(q)) return 2
  if (q.length >= 3) {
    let i = 0
    for (const c of n) if (c === q[i]) i++
    if (i === q.length) return 3
  }
  return null
}

interface Known {
  gameName: string
  tagLine: string
  platform?: string
  iconId?: number
  level?: number
  seen: number
}
export type Seen = { gameName: string; tagLine: string; platform?: string; iconId?: number; level?: number }

const keyOf = (n: string, t: string) => `${n}#${t}`.toLowerCase()

export function createPlayerIndex(o: { file: string; now?: () => number }) {
  const now = o.now ?? Date.now
  let loaded: Promise<Map<string, Known>> | null = null
  let timer: NodeJS.Timeout | undefined

  // one load shared by concurrent callers
  const load = () =>
    (loaded ??= (async () => {
      const m = new Map<string, Known>()
      try {
        for (const k of JSON.parse(await readFile(o.file, 'utf8')) as Known[]) if (k.gameName && k.tagLine) m.set(keyOf(k.gameName, k.tagLine), k)
      } catch {}
      return m
    })())

  async function flush() {
    clearTimeout(timer)
    timer = undefined
    if (!loaded) return
    const list = [...(await loaded).values()].sort((a, b) => b.seen - a.seen).slice(0, MAX_KNOWN)
    try {
      await mkdir(dirname(o.file), { recursive: true })
      await writeFile(o.file, JSON.stringify(list))
    } catch {}
  }

  return {
    async add(list: Seen[]) {
      const m = await load()
      let changed = false
      for (const p of list) {
        if (!p.gameName || !p.tagLine) continue
        const k = keyOf(p.gameName, p.tagLine)
        const old = m.get(k)
        m.set(k, { gameName: p.gameName, tagLine: p.tagLine, platform: p.platform ?? old?.platform, iconId: p.iconId ?? old?.iconId, level: p.level ?? old?.level, seen: now() })
        changed = true
      }
      if (changed && !timer) {
        timer = setTimeout(flush, SAVE_MS)
        timer.unref?.()
      }
    },
    async find(query: string, platform?: string): Promise<SearchResult[]> {
      const { name, tag } = splitQuery(query)
      const t = foldName(tag)
      const hits: { k: Known; r: number }[] = []
      for (const k of (await load()).values()) {
        if (t && !foldName(k.tagLine).startsWith(t)) continue
        if (platform && k.platform && k.platform !== platform) continue
        const r = nameRank(k.gameName, name)
        if (r != null) hits.push({ k, r })
      }
      return hits.sort((a, b) => a.r - b.r || b.k.seen - a.k.seen).slice(0, LIMIT).map(({ k }) => ({ gameName: k.gameName, tagLine: k.tagLine, iconId: k.iconId, level: k.level, platform: k.platform, region: k.platform ? regionLabel(k.platform) : undefined, source: 'local' as const }))
    },
    // where a player was last seen
    async platformOf(name: string, tag: string): Promise<string | undefined> {
      return (await load()).get(keyOf(name, tag))?.platform
    },
    flush
  }
}
export type PlayerIndex = ReturnType<typeof createPlayerIndex>

export interface PlayerSearchDeps {
  index: PlayerIndex
  api: () => RiotApi
  platform: () => Platform // region of the signed-in account
  myTag: () => string | undefined // tagline of the signed-in account, a likely tag for friends
  friends: () => Promise<Seen[]>
  opgg: OpggSummonerApi
  blitz?: BlitzApi
}

const GUESSES = 6 // account-v1 calls a results view may spend on tags nobody typed
const tagOf = (p: string) => REGIONS.find((r) => r.platform === p)?.tag

export function createPlayerSearch(d: PlayerSearchDeps) {
  let friendsAt = 0

  async function refreshFriends() {
    if (Date.now() - friendsAt < FRIENDS_TTL) return
    friendsAt = Date.now()
    await d.index.add(await d.friends().catch(() => []))
  }

  // a full Riot ID: Blitz first (rank, level and icon in one call), then the Riot API. The shard comes from the hint, else account-v1's active region.
  async function exact(name: string, tag: string, hint?: Platform): Promise<SearchResult[]> {
    try {
      const b = await d.blitz?.account(hint ?? d.platform(), name, tag)
      if (b) return [{ gameName: b.gameName, tagLine: b.tagLine, iconId: b.iconId || undefined, level: b.level || undefined, rank: b.solo && { tier: b.solo.tier, division: b.solo.division, lp: b.solo.lp }, platform: hint, region: hint ? regionLabel(hint) : undefined, source: 'blitz' }]
    } catch {}
    try {
      const api = d.api()
      const a = await api.accountByRiotId(name, tag)
      if (!a) return []
      const platform = hint ?? platformOf((await api.activeRegion(a.puuid).catch(() => null))?.region ?? '') ?? undefined
      return [{ gameName: a.gameName, tagLine: a.tagLine, platform, region: platform ? regionLabel(platform) : undefined, source: 'riot' }]
    } catch {
      return []
    }
  }

  async function search({ query, deep, region }: SearchQuery): Promise<SearchResponse> {
    const q = query.trim()
    if (!q) return { results: [] }
    const { name, tag } = splitQuery(q)
    const mine = d.platform()
    const only = region && region !== 'all' ? platformOf(region) : null
    const regions = only ? [only] : [...new Set<Platform>([mine, ...POPULAR_PLATFORMS])]
    await refreshFriends()
    const [local, ...remote] = await Promise.all([d.index.find(q, only ?? undefined), ...(name ? regions.map((p) => d.opgg.search(p, q).catch(() => [] as SearchResult[])) : [])])
    const found = new Map<string, SearchResult>()
    // richer entries win: OP.GG and Riot know level and rank, the local index only what it saw
    for (const r of [...local, ...remote.flat()]) {
      const k = keyOf(r.gameName, r.tagLine)
      const old = found.get(k)
      found.set(k, old ? { ...old, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)), source: r.source === 'local' ? old.source : r.source } as SearchResult : r)
    }
    const add = (list: SearchResult[]) => { for (const r of list) if (!only || !r.platform || r.platform === only) found.set(keyOf(r.gameName, r.tagLine), { ...found.get(keyOf(r.gameName, r.tagLine)), ...r }) }
    if (name && tag && !found.has(keyOf(name, tag))) add(await exact(name, tag))
    if (deep && name && !tag && !found.size) {
      // the default tag of each searched region, then my own: in parallel, within the rate limit
      const todo = new Map<string, Platform | undefined>()
      for (const p of regions) if (!todo.has(tagOf(p) ?? '')) todo.set(tagOf(p) ?? '', p)
      const mt = d.myTag()
      if (mt && !todo.has(mt)) todo.set(mt, undefined)
      todo.delete('')
      for (const list of await Promise.all([...todo].slice(0, GUESSES).map(([t, p]) => exact(name, t, p)))) add(list)
    }
    const results = [...found.values()]
      .map((r) => ({ r, rank: nameRank(r.gameName, name) ?? 3 }))
      .sort((a, b) => a.rank - b.rank || (b.r.platform === mine ? 1 : 0) - (a.r.platform === mine ? 1 : 0) || (b.r.level ?? 0) - (a.r.level ?? 0))
      .slice(0, LIMIT)
      .map((x) => x.r)
    void d.index.add(results.filter((r) => r.source !== 'local'))
    return { results }
  }

  return { search }
}

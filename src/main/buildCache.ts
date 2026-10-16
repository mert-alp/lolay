import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BUILD_TTL, type Build, type Lane, type Source, type Tier } from '../shared/types.ts'
import { InsufficientDataError } from './providers/http.ts'

const PARTIAL_TTL = 5 * 60 * 1000 // partial and insufficient builds are looked at again soon
const PREFIX = 'build_' // keeps invalidate() away from version.json, static_* and champPath.json

export interface CacheQuery {
  source: Source
  championId: number
  lane?: Lane
  tier: Tier
  fresh?: boolean
}

// a build with nothing in it: the source has too little data for this champion/lane/rank
export function insufficientBuild(q: CacheQuery): Build {
  return {
    championId: q.championId, slug: '', lane: q.lane ?? 'middle', defaultLane: q.lane ?? 'middle',
    tier: q.source === 'metasrc' ? 'all' : q.tier, source: q.source, patch: '',
    wr: null, pr: null, br: null, games: 0, tierLabel: '',
    runes: [], spells: [], startItems: [], core: null, boots: [], item4: [], item5: [], item6: [],
    skillPriority: '', skillOrder: '', counters: { strong: [], weak: [] },
    partial: true, insufficient: true, fetchedAt: Date.now()
  }
}

// disk cache for derived values (rune pages): BUILD_TTL, or PARTIAL_TTL when a source failed; stale value on error.
// files share the build_ prefix so invalidate() below clears them too
export function createValueCache(opts: { cacheDir: string }) {
  const inflight = new Map<string, Promise<unknown>>()
  return async function cached<T>(key: string, load: () => Promise<{ value: T; partial: boolean }>): Promise<T> {
    const file = join(opts.cacheDir, `${PREFIX}${key}.json`)
    let old: { at: number; partial: boolean; value: T } | null = null
    try {
      old = JSON.parse(await readFile(file, 'utf8'))
    } catch {}
    if (old && Date.now() - old.at < (old.partial ? PARTIAL_TTL : BUILD_TTL)) return old.value
    let p = inflight.get(key) as Promise<T> | undefined
    if (!p) {
      p = load()
        .then(async (r) => {
          await mkdir(opts.cacheDir, { recursive: true })
          await writeFile(file, JSON.stringify({ at: Date.now(), ...r }))
          return r.value
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, p)
    }
    try {
      return await p
    } catch (e) {
      if (old) return old.value
      throw e
    }
  }
}

// disk cache + stale-while-revalidate + in-flight dedupe, shared by every provider; the key includes the source
export function createBuildCache(opts: { cacheDir: string; fetchBuild: (q: CacheQuery) => Promise<Build> }) {
  const inflight = new Map<string, Promise<Build>>()

  const fileOf = (q: CacheQuery, lane: Lane | undefined) =>
    `${PREFIX}${q.source}_${q.championId}_${lane ?? 'default'}_${q.source === 'metasrc' ? 'all' : q.tier}.json` // metasrc ignores the rank filter

  function refresh(file: string, q: CacheQuery): Promise<Build> {
    let p = inflight.get(file)
    if (!p) {
      p = opts
        .fetchBuild(q)
        .catch((e) => {
          if (e instanceof InsufficientDataError) return insufficientBuild(q)
          throw e
        })
        .then(async (b) => {
          await mkdir(opts.cacheDir, { recursive: true })
          const json = JSON.stringify(b)
          await writeFile(join(opts.cacheDir, file), json)
          // a default-lane build is also the build of its resolved lane, so applying it by lane gets the same data
          if (!q.lane && !b.insufficient) await writeFile(join(opts.cacheDir, fileOf(q, b.lane)), json)
          return b
        })
        .finally(() => inflight.delete(file))
      inflight.set(file, p)
    }
    return p
  }

  return {
    async getBuild(q: CacheQuery, onRefresh?: (b: Build) => void): Promise<Build> {
      const file = fileOf(q, q.lane)
      let cached: Build | null = null
      try {
        cached = JSON.parse(await readFile(join(opts.cacheDir, file), 'utf8'))
      } catch {}

      const go = () => refresh(file, q)
      if (cached && !q.fresh) {
        if (Date.now() - cached.fetchedAt > (cached.partial ? PARTIAL_TTL : BUILD_TTL)) {
          go().then((b) => onRefresh?.(b), (e) => console.error('background build refresh failed', file, e))
        }
        return cached
      }
      try {
        return await go()
      } catch (e) {
        if (cached) return cached
        throw e
      }
    },

    async invalidate(): Promise<void> {
      for (const f of await readdir(opts.cacheDir).catch(() => [] as string[])) {
        if (f.startsWith(PREFIX)) await rm(join(opts.cacheDir, f), { force: true })
      }
    }
  }
}

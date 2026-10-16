// Shared by the key-less summoner backends: a per-host request spacer and a promise cache.
export interface Clock {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

// one slot every gapMs, handed out in call order
export function createGate(gapMs: number, o: Clock = {}) {
  const now = o.now ?? Date.now
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let next = 0
  return async () => {
    const t = now()
    const at = Math.max(t, next)
    next = at + gapMs
    if (at > t) await sleep(at - t)
  }
}

// caches the promise (concurrent callers share one request); failures are not kept
export function createCache(max: number, now: () => number = Date.now) {
  const map = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>()
  return {
    get<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
      const hit = map.get(key)
      if (hit && now() - hit.at < hit.ttl) return hit.value as Promise<T>
      if (map.size >= max) map.delete(map.keys().next().value!)
      const value = load().catch((e) => {
        map.delete(key)
        throw e
      })
      map.set(key, { at: now(), ttl, value })
      return value
    },
    drop(part: string) {
      for (const k of [...map.keys()]) if (k.includes(part)) map.delete(k)
    }
  }
}

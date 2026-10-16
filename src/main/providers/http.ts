import type { Build, Lane, Matchup, Tier } from '../../shared/types.ts'

export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

// what every provider takes: lane omitted = the champion's default lane
export interface ProviderQuery {
  championId: number
  lane?: Lane
  tier: Tier
}
export type Provider = (q: ProviderQuery) => Promise<Build>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const gates = new Map<string, Promise<unknown>>()

// at most one request per `gap` ms per host, across all providers
export function throttled<T>(host: string, gap: number, fn: () => Promise<T>): Promise<T> {
  const run = (gates.get(host) ?? Promise.resolve()).then(fn)
  gates.set(host, run.then(() => sleep(gap), () => sleep(gap)))
  return run
}

export async function get(url: string, opts: { ua?: string; gap?: number; headers?: Record<string, string> } = {}): Promise<Response> {
  const res = await throttled(new URL(url).host, opts.gap ?? 1000, () =>
    fetch(url, {
      headers: { 'User-Agent': opts.ua ?? BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9', ...opts.headers },
      signal: AbortSignal.timeout(20000)
    })
  )
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${url}`)
  return res
}

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 10000) / 100 : 0)

// the source has no (or too little) data for this champion/lane/rank: not worth retrying
export class InsufficientDataError extends Error {}

// strong = we win more than half, weak = we lose more than half; the two lists never share a champion
export function splitCounters(rows: Matchup[]): Build['counters'] {
  const byWr = [...rows].sort((a, b) => b.wr - a.wr)
  return { strong: byWr.filter((m) => m.wr > 50).slice(0, 6), weak: byWr.filter((m) => m.wr < 50).reverse().slice(0, 6) }
}

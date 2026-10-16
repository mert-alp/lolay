import { createRiotApi, RiotApiError } from './riotApi.ts'
import type { RiotApi } from './riotApi.ts'

import type { RiotStatus } from '../shared/types.ts'
export type { RiotStatus }

const BACKOFF_MS = 30_000
// The Riot API is switched off: a personal key must not ship in a distributed app and there is no proxy server.
// Every caller already treats "no key" as "no answer" and falls back to Blitz / OP.GG / the League client.
const RIOT_ENABLED = false
const key = () => (RIOT_ENABLED ? process.env.RIOT_API_KEY?.trim() : undefined)

let api: RiotApi | undefined
let invalid = false // a call was rejected with 401/403: stay off the API until the key is re-checked
let pausedUntil = 0
export const riot = (): RiotApi => (api ??= createRiotApi({ getKey: key }))

export const riotInvalid = () => invalid
export const riotWorking = () => !invalid && !!key() // a key that has not been rejected
export const riotUsable = () => riotWorking() && Date.now() >= pausedUntil

// null = no answer (no key, invalid key, rate limit, network). Never throws.
export async function tryRiot<T>(fn: (api: RiotApi) => Promise<T>): Promise<T | null> {
  if (!riotUsable()) return null
  try {
    return await fn(riot())
  } catch (e) {
    if (e instanceof RiotApiError && e.code === 'invalid_key') invalid = true
    if (e instanceof RiotApiError && e.code === 'rate_limited') pausedUntil = Date.now() + BACKOFF_MS
    return null
  }
}

export async function riotStatus(): Promise<RiotStatus> {
  if (!key()) return { hasKey: false, valid: null }
  try {
    await riot().platformStatus('tr1') // any platform accepts any valid key
    invalid = false
    pausedUntil = 0
    return { hasKey: true, valid: true }
  } catch (e) {
    const code = e instanceof RiotApiError ? e.code : 'server'
    if (code === 'invalid_key') invalid = true
    return { hasKey: true, valid: code === 'invalid_key' ? false : null, error: code }
  }
}

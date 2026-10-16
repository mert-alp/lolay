import { createContext, useContext } from 'react'

// App provides it: opens a player's profile ("Name#TAG") or the search results ("search:fragment") from anywhere
export const OpenProfileCtx = createContext<(riotId: string) => void>(() => {})
export const useOpenProfile = () => useContext(OpenProfileCtx)

// "Name#TAG@euw1": the shard travels with the id when the opener knows it (search results, match participants)
export const withPlatform = (riotId: string, platform?: string) => (platform && !/@[a-z0-9]+$/i.test(riotId) ? `${riotId}@${platform}` : riotId)
export function splitPlatform(target: string, known: readonly string[]): { id: string; platform?: string } {
  const m = /^(.*)@([a-z0-9]+)$/i.exec(target)
  return m && known.includes(m[2].toLowerCase()) ? { id: m[1], platform: m[2].toLowerCase() } : { id: target }
}

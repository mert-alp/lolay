import type { Lane, RunePage } from '../../shared/types.ts'
import { get } from './http.ts'

// Blitz ProBuilds backend: recent games of known pro accounts, newest first, with the full rune page
const API = 'https://lol.v2.iesdev.com/lol/pro_match_ids'
const ROLE: Record<Lane, string> = { top: 'TOP', jungle: 'JUNGLE', middle: 'MIDDLE', bottom: 'BOTTOM', support: 'UTILITY' }

// the same player's identical page twice adds nothing; different players on the same page are kept
export function proPages(rows: any[], limit = 5): RunePage[] {
  const seen = new Set<string>()
  const out: RunePage[] = []
  for (const r of [...rows].sort((a, b) => b.timestamp - a.timestamp)) {
    if (r.runes?.length !== 6 || r.runeShards?.length !== 3) continue
    const perks = [...r.runes, ...[...r.runeShards].reverse()] // Blitz lists shards defense, flex, offense; the LCU wants offense first
    const key = `${r.player?.name}|${perks.join()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      wr: r.win ? 100 : 0,
      n: 1,
      perks,
      source: 'pro',
      label: r.player?.name,
      player: { name: r.player?.name ?? r.player_game_name, team: r.team?.tag ?? r.team?.name, region: r.region, when: r.timestamp }
    })
    if (out.length === limit) break
  }
  return out
}

export async function fetchProPages(championId: number, lane: Lane, limit = 5): Promise<RunePage[]> {
  const res = await get(`${API}?${new URLSearchParams({ role: ROLE[lane], champion_id: String(championId) })}`)
  return proPages(await res.json(), limit)
}

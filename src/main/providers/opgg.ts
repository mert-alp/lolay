import type { Build, ItemStat, Lane, Matchup, RunePage, SetStat, Tier } from '../../shared/types.ts'
import { get, InsufficientDataError, pct, splitCounters, type Provider } from './http.ts'

const API = 'https://lol-api-champion.op.gg/api/GLOBAL/champions/ranked'
const POS: Record<Lane, string> = { top: 'top', jungle: 'jungle', middle: 'mid', bottom: 'adc', support: 'support' }
const LANE_OF = Object.fromEntries(Object.entries(POS).map(([lane, pos]) => [pos, lane])) as Record<string, Lane>

const set = (r: any): SetStat => ({ ids: r.ids, wr: pct(r.win, r.play), n: r.play, pr: r.pick_rate * 100 })
const item = (r: any): ItemStat => ({ id: r.ids[0], wr: pct(r.win, r.play), n: r.play, pr: r.pick_rate * 100 })
const rows = (d: any, depth: number): ItemStat[] =>
  (d.single_items?.find((s: any) => s.depth === depth)?.items ?? [])
    .filter((r: any) => r.play >= 30)
    .sort((a: any, b: any) => b.play - a.play)
    .map(item)

export const page = (r: any): RunePage => ({
  wr: pct(r.win, r.play),
  n: r.play,
  perks: [...r.primary_rune_ids, ...r.secondary_rune_ids, ...r.stat_mod_ids]
})

// positions the champion is really played in, most played first
function laneOf(j: any): Lane | undefined {
  const top = [...(j.data.summary.positions ?? [])].sort((a: any, b: any) => b.stats.play - a.stats.play)[0]
  return top && LANE_OF[String(top.name).toLowerCase()]
}

export function toBuild(j: any, q: { championId: number; lane: Lane; tier: Tier }): Build {
  const d = j.data
  const pos = d.summary.positions.find((p: any) => String(p.name).toLowerCase() === POS[q.lane])
  const s = pos?.stats

  const pages: any[] = d.runes ?? []
  if (!s && !pages.length) throw new InsufficientDataError(`OP.GG has no data for ${q.championId} ${q.lane} ${q.tier}`)
  const main = pages.reduce((a, b) => (b.play > a.play ? b : a), pages[0])
  // the best win rate only counts among pages with a decent sample
  const best = pages.filter((r) => r.play >= Math.max(10, main.play * 0.05)).reduce((a, b) => (pct(b.win, b.play) > pct(a.win, a.play) ? b : a), main)
  const runes = main ? [page(main)] : []
  if (main && page(best).perks.join() !== runes[0].perks.join()) runes.push(page(best))

  // the requested lane may not be played: header numbers fall back to the rune sample
  const games = s?.play ?? pages.reduce((n, r) => n + r.play, 0)
  const sk = d.skill_masteries?.[0]
  const core = d.core_items?.[0]
  const minDuel = Math.max(100, games * 0.003)
  const duels: Matchup[] = (d.counters ?? [])
    .filter((c: any) => c.play >= minDuel)
    .map((c: any) => ({ championId: c.champion_id, wr: pct(c.win, c.play), n: c.play }))
    .sort((a: Matchup, b: Matchup) => b.wr - a.wr)

  return {
    championId: q.championId,
    slug: '',
    lane: q.lane,
    defaultLane: laneOf(j) ?? q.lane,
    tier: q.tier,
    source: 'opgg',
    patch: j.meta.version,
    wr: s ? s.win_rate * 100 : pct(pages.reduce((n, r) => n + r.win, 0), games),
    pr: s ? s.pick_rate * 100 : null,
    br: s ? s.ban_rate * 100 : null,
    games,
    tierLabel: s ? (s.tier_data.tier === 0 ? 'OP' : String(s.tier_data.tier)) : '',
    runes,
    spells: (d.summoner_spells ?? []).map(set),
    startItems: (d.starter_items ?? []).map(set),
    core: core ? { ids: core.ids, wr: pct(core.win, core.play), n: core.play, pr: core.pick_rate * 100 } : null,
    boots: (d.boots ?? []).map(item),
    item4: rows(d, 4),
    item5: rows(d, 5),
    item6: rows(d, 6),
    skillPriority: sk ? sk.ids.join('') : '',
    skillOrder: sk?.builds?.[0] ? sk.builds[0].order.slice(0, 15).join('') : '',
    counters: splitCounters(duels),
    partial: !runes.length,
    fetchedAt: Date.now()
  }
}

// target = enemy champion id: the same answer restricted to games against it
export async function fetchPos(championId: number, lane: Lane, tier: Tier, target?: number) {
  const params = new URLSearchParams({ tier: tier === 'grandmaster_plus' ? 'master_plus' : tier, is_more: 'true' }) // is_more adds single_items
  if (target) params.set('target_champion', String(target))
  return (await get(`${API}/${championId}/${POS[lane]}?${params}`, { ua: 'OP.GG Desktop App' })).json()
}

export function createOpgg(): Provider {
  return async ({ championId, lane, tier }) => {
    // the API 404s without a position, but every answer lists the positions the champion is played in
    let j = await fetchPos(championId, lane ?? 'middle', tier)
    const resolved = lane ?? laneOf(j) ?? 'middle'
    if (resolved !== (lane ?? 'middle')) j = await fetchPos(championId, resolved, tier)
    return toBuild(j, { championId, lane: resolved, tier })
  }
}

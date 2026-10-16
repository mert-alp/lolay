import type { Build, ItemStat, Lane, Matchup, RunePage, SetStat, StaticData, Tier } from '../../shared/types.ts'
import { get, InsufficientDataError, pct, splitCounters, type Provider } from './http.ts'

const BASE = 'https://stats2.u.gg/lol/1.5'
const VERSIONS = 'https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/ugg/ugg-api-versions.json'
const REGION = '12' // world
const RANK: Record<Tier, string> = {
  all: '8', gold_plus: '10', platinum_plus: '10', emerald_plus: '17', diamond_plus: '11', master_plus: '14', grandmaster_plus: '14', challenger: '1'
} // U.GG has no gold_plus: platinum_plus is the closest
const ROLE: Record<Lane, string> = { jungle: '1', support: '2', bottom: '3', top: '4', middle: '5' }

type Static = Pick<StaticData, 'version' | 'trees' | 'items'>
export interface UggFiles {
  rankings: any
  overview: any
  matchups: any
}

// the six non-shard perks come unordered: split by tree, sort by row. Shards keep their order.
export function orderPerks(primary: number, sub: number, perks: number[], shards: (number | string)[], trees: Static['trees']): number[] {
  const where = new Map<number, [number, number]>()
  for (const t of trees) t.slots.forEach((row, i) => row.forEach((id) => where.set(id, [t.id, i])))
  const of = (tree: number) =>
    perks.filter((p) => where.get(p)?.[0] === tree).sort((a, b) => where.get(a)![1] - where.get(b)![1])
  return [...of(primary), ...of(sub), ...shards.map(Number)]
}

const laneOf = (role?: string) => (Object.keys(ROLE) as Lane[]).find((l) => ROLE[l] === role)
const tierLabel = (sd: number) => (sd >= 2 ? 'S+' : sd >= 0.75 ? 'S' : sd >= 0 ? 'A' : sd >= -0.5 ? 'B' : sd >= -0.75 ? 'C' : 'D')

function slice(file: any, rank: string, role: string): any {
  return file?.[REGION]?.[rank]?.[role]
}

// the role with the most games, from the rankings file
function defaultRole(rankings: any, rank: string): string | undefined {
  const roles = Object.entries<any>(rankings?.[REGION]?.[rank] ?? {})
  return roles.sort((a, b) => b[1][1] - a[1][1])[0]?.[0]
}

export function toBuild(f: UggFiles, q: { championId: number; lane?: Lane; tier: Tier; patch: string }, st: Static): Build {
  const rank = RANK[q.tier]
  const mainRole = defaultRole(f.rankings, rank)
  const role = q.lane ? ROLE[q.lane] : mainRole
  const lane = laneOf(role)
  const rk = role && slice(f.rankings, rank, role)
  const ov = role && slice(f.overview, rank, role)?.[0]
  if (!lane || !rk || !ov) throw new InsufficientDataError(`U.GG has no data for ${q.championId} ${q.lane ?? 'default'} ${q.tier}`)

  const [runes, spells, start, core, skills, opts, total, , shards] = ov
  const builds: number = total?.[1] || rk[1]
  const set = (r: any): SetStat => ({ ids: r[2], wr: pct(r[1], r[0]), n: r[0], pr: pct(r[0], builds) })
  const items = (rows: number[][] = []): ItemStat[] => rows.map(([id, w, n]) => ({ id, wr: pct(w, n), n }))

  // the core set contains the boots; move them out (their stats are those of the whole set)
  const boots = (core?.[2] ?? []).filter((id: number) => st.items[id]?.boots)
  const duels: Matchup[] = ((slice(f.matchups, rank, role!)?.[0] ?? []) as number[][])
    .filter((r) => r[2] >= Math.max(100, rk[1] * 0.003))
    .map((r) => ({ championId: r[0], wr: pct(r[1], r[2]), n: r[2] }))
    .sort((a, b) => b.wr - a.wr)

  const page: RunePage = { wr: pct(runes[1], runes[0]), n: runes[0], perks: orderPerks(runes[2], runes[3], runes[4], shards?.[2] ?? [], st.trees) }
  return {
    championId: q.championId,
    slug: '',
    lane,
    defaultLane: laneOf(mainRole) ?? lane,
    tier: q.tier,
    source: 'ugg',
    patch: q.patch.replace('_', '.'),
    wr: pct(rk[0], rk[1]),
    pr: pct(rk[1], rk[11]),
    br: pct(rk[10], rk[13] || rk[11]),
    games: rk[1],
    tierLabel: tierLabel(rk[14]),
    runes: [page],
    spells: [set(spells)],
    startItems: [set(start)],
    core: core ? { ids: core[2].filter((id: number) => !boots.includes(id)), wr: pct(core[1], core[0]), n: core[0] } : null,
    boots: boots.map((id: number) => ({ id, wr: pct(core[1], core[0]), n: core[0] })),
    item4: items(opts?.[0]),
    item5: items(opts?.[1]),
    item6: items(opts?.[2]),
    skillPriority: skills?.[3] ?? '',
    skillOrder: (skills?.[2] ?? []).slice(0, 15).join(''),
    counters: splitCounters(duels),
    partial: page.perks.length !== 9,
    fetchedAt: Date.now()
  }
}

// ---- fetching ----

let versions: Promise<any> | null = null
const apiVersions = () => (versions ??= get(VERSIONS, { gap: 300 }).then((r) => r.json()).catch(() => ({}) as any))

const previousPatch = (p: string) => {
  const [major, minor] = p.split('_').map(Number)
  return minor > 1 ? `${major}_${minor - 1}` : null
}

export function createUgg(deps: { getStatic: () => Static }): Provider {
  return async ({ championId, lane, tier }) => {
    const st = deps.getStatic()
    const [major, minor] = st.version.split('.')
    const file = async (kind: string, patch: string) => {
      const v = (await apiVersions())[patch]?.[kind] ?? '1.5.0'
      return (await get(`${BASE}/${kind}/${patch}/ranked_solo_5x5/${championId}/${v}.json`, { gap: 300 })).json()
    }

    // right after a patch the stats may not exist yet: fall back to the previous one
    let patch = `${major}_${minor}`
    let rankings: any
    try {
      rankings = await file('rankings', patch)
    } catch (e) {
      const prev = previousPatch(patch)
      if (!prev || !/HTTP 40[34] /.test((e as Error).message)) throw e
      patch = prev
      rankings = await file('rankings', patch)
    }
    const [overview, matchups] = await Promise.all([file('overview', patch), file('matchups', patch)])
    return toBuild({ rankings, overview, matchups }, { championId, lane, tier, patch }, st)
  }
}

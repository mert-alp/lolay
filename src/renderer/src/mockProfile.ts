// Dev-only profile data for the browser preview (see mock.ts). Hash flags: #profile-nokey, #profile-slow
import type { MatchDetail, MatchPlayer, PostGame, MatchesQuery, Profile, ProfileQuery, ProfileResult, MatchEntry, Lane, SearchQuery, SearchResponse, SearchResult } from '@shared/types'
import { entryOf, FILTER_QUEUES } from '../../main/profileStats.ts'

const CHAMPS = [103, 86, 64, 222, 412, 238, 157, 11, 51, 117, 61, 134, 84, 7, 245, 121, 80, 59, 19, 105, 266, 202, 21, 498, 360, 777, 54, 90]
const NAMES = ['IronGaren', 'Pelin', 'Kuzgun', 'adc_main', 'Zeynep', 'Yasuo4Life', 'Alpha', 'NoHistory', 'sivas58', 'Ayşe Nur']
const TAGS = ['TR1', 'jg', '666', '4242', 'sup', 'EUW', 'tr', 'TR1', 'tr58', '0606']
const QUEUES = [420, 420, 440, 420, 450, 400, 420, 490, 420, 1700, 420, 900, 420, 450, 440, 420, 430, 420, 420, 450, 420, 420, 400, 420, 420, 420, 440, 420, 450, 420, 420, 420, 420, 420, 420, 420, 450, 400, 420, 420]
const SPELLS = [[4, 14], [4, 12], [4, 11], [4, 3], [4, 7]]
const ITEMS = [3118, 3020, 4645, 3157, 3089, 3135, 6655, 3165, 3102, 3003, 3040, 3115, 3152, 3116, 3191, 3026, 3071, 6692, 6333, 3053]
const KEYSTONES = [[8112, 8200], [8010, 8300], [8214, 8200], [9923, 8100], [8369, 8000], [8437, 8200], [8021, 8300]]

const rnd = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }
export const hashOf = (s: string) => [...s.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const LANES: Lane[] = ['top', 'jungle', 'middle', 'bottom', 'support']

const details = new Map<string, MatchDetail>()

function build(seed: number, i: number, puuid: string): MatchDetail {
  const id = `TR1_${7400000000 + seed * 100 + i}`
  const queueId = QUEUES[i % QUEUES.length]
  const duration = queueId === 450 ? 900 + Math.floor(rnd(seed + i) * 500) : 1200 + Math.floor(rnd(seed + i * 3) * 1500)
  const remake = i === 9
  const win = rnd(seed * 7 + i) > 0.46
  const mySlot = Math.floor(rnd(seed + 5) * 3) === 0 ? 2 : Math.floor(rnd(seed * 3 + i) * 5) // mostly one lane
  const myChamp = CHAMPS[Math.floor(rnd(seed + Math.floor(i / 3)) * 6)] // a small pool, like a real main
  const players: MatchPlayer[] = Array.from({ length: 10 }, (_, k) => {
    const team = k < 5 ? 100 : 200
    const isMe = k === mySlot
    const r = (n: number) => rnd(seed * 101 + i * 17 + k * 5 + n)
    const strong = (team === 100) === win
    const kills = Math.floor(r(1) * (strong ? 12 : 7))
    const deaths = Math.floor(r(2) * (strong ? 6 : 10))
    const [keystone, tree] = KEYSTONES[Math.floor(r(3) * KEYSTONES.length)]
    const owned = ITEMS.slice(Math.floor(r(4) * 6), Math.floor(r(4) * 6) + 6).concat(Array(6).fill(0)).slice(0, 6)
    const level = remake ? 2 : 11 + Math.floor(r(5) * 8)
    return {
      puuid: isMe ? puuid : `${seed}-${i}-${k}`,
      name: isMe ? '' : NAMES[(k + i) % NAMES.length],
      tag: isMe ? '' : TAGS[(k + i) % TAGS.length],
      championId: isMe ? myChamp : CHAMPS[Math.floor(r(6) * CHAMPS.length)],
      teamId: team,
      position: queueId === 450 || queueId === 1700 ? null : LANES[k % 5],
      level,
      kills: remake ? 0 : kills,
      deaths: remake ? 0 : deaths,
      assists: remake ? 0 : Math.floor(r(7) * 14),
      cs: remake ? 3 : Math.floor(duration / 60 * (3 + r(8) * 5)) * (k % 5 === 4 ? 0.2 : 1) | 0,
      vision: Math.floor(r(9) * 50),
      wards: Math.floor(r(10) * 22),
      damage: remake ? 120 : Math.floor(8000 + r(11) * 28000),
      gold: remake ? 500 : Math.floor(6000 + r(12) * 12000),
      items: remake ? Array(7).fill(0) : [...owned.map((x, n) => (n < Math.min(6, level - 7) ? x : 0)), 3340],
      spells: SPELLS[Math.floor(r(13) * SPELLS.length)],
      keystone,
      tree
    }
  })
  const team = (teamId: number) => {
    const mine = players.filter((p) => p.teamId === teamId)
    const w = (teamId === 100) === win
    const o = (n: number) => Math.floor(rnd(seed + i * 11 + teamId + n) * (w ? n : n / 2.5))
    return { teamId, win: w, kills: mine.reduce((s, p) => s + p.kills, 0), gold: mine.reduce((s, p) => s + p.gold, 0), objectives: { baron: o(2) > 0 ? 1 : 0, dragon: o(5), herald: o(2), tower: w ? 5 + o(6) : o(5), inhibitor: w ? 1 + o(2) : 0 } }
  }
  const d: MatchDetail = { id, queueId, at: Date.now() - (i * 5.5 + 0.7) * 36e5, duration: remake ? 190 : duration, players, teams: [team(100), team(200)] }
  details.set(id, d)
  return d
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const slow = () => (location.hash.includes('slow') ? 2500 : 350)

export async function mockProfileGet(q: 'me' | ProfileQuery): Promise<ProfileResult<Profile>> {
  await sleep(slow())
  if (location.hash.includes('profile-nokey') && q !== 'me') return { ok: false, error: 'no_key' }
  const me = q === 'me'
  if (!me && q.gameName.toLowerCase() === 'nobody') return { ok: false, error: 'not_found' }
  const gameName = me ? 'Schelter' : q.gameName
  const tagLine = me ? 'TR1' : q.tagLine
  const h = hashOf(`${gameName}#${tagLine}`)
  const tiers = ['GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER']
  const t1 = me ? 'EMERALD' : tiers[h % tiers.length]
  return {
    ok: true,
    data: {
      puuid: `mock-${h}`, src: 'riot', degraded: me && location.hash.includes('profile-degraded') ? 'invalid_key' : undefined, gameName, tagLine, platform: 'tr1', level: me ? 312 : 40 + (h % 400), iconId: me ? 4568 : 1 + (h % 40),
      solo: { tier: t1, division: t1 === 'MASTER' ? 'I' : ['I', 'II', 'III', 'IV'][h % 4], lp: me ? 63 : h % 100, wins: me ? 112 : 60 + (h % 90), losses: me ? 96 : 50 + (h % 80) },
      flex: me ? { tier: 'GOLD', division: 'II', lp: 31, wins: 22, losses: 19 } : h % 3 ? null : { tier: 'GOLD', division: 'IV', lp: 12, wins: 9, losses: 14 },
      me
    }
  }
}

export async function mockProfileMatches(q: MatchesQuery): Promise<ProfileResult<MatchEntry[]>> {
  await sleep(slow())
  const seed = hashOf(q.puuid) % 997
  const queues = FILTER_QUEUES[q.filter ?? 'all']
  const all = Array.from({ length: 40 }, (_, i) => build(seed, i, q.puuid)).filter((d) => !queues.length || queues.includes(d.queueId))
  return { ok: true, data: all.slice(q.start, q.start + q.count).flatMap((d) => { const e = entryOf(d, q.puuid); return e ? [e] : [] }) }
}

export async function mockProfileMatch(id: string): Promise<ProfileResult<MatchDetail>> {
  await sleep(250)
  const d = details.get(id)
  return d ? { ok: true, data: d } : { ok: false, error: 'not_found' }
}

// "CRx" finds CrX#9410, crx#4472, ... ; "nobody" finds nothing; a typed tag finds exactly that account
export async function mockSearch({ query }: SearchQuery): Promise<SearchResponse> {
  await sleep(200)
  const q = query.trim()
  const [name, tag] = q.includes('#') ? [q.slice(0, q.lastIndexOf('#')), q.slice(q.lastIndexOf('#') + 1)] : [q, '']
  if (!name || name.toLowerCase() === 'nobody') return { results: [] }
  const tiers = ['IRON', 'PLATINUM', 'EMERALD', 'DIAMOND', 'GOLD', 'MASTER']
  const tags = tag ? [tag] : ['9410', 'TR1', '4472', '3333', 'KRG', '0606', 'tr58']
  const results = tags.map((tg, i): SearchResult => {
    const h = hashOf(name + tg)
    const casing = [name, name.toLowerCase(), name.toUpperCase()][i % 3]
    return { gameName: casing, tagLine: tg, iconId: 1 + (h % 40), level: 20 + (h % 380), rank: i % 3 === 2 ? null : { tier: tiers[h % tiers.length], division: ['I', 'II', 'III', 'IV'][h % 4], lp: h % 100 }, region: 'TR', source: i === 0 ? 'opgg' : 'local' }
  })
  return { results }
}

// #postgame: a won ranked game of "me", already in the detail map so its table opens
export function mockPostGame(): PostGame {
  for (let i = 0; i < 40; i++) {
    const d = build(hashOf('me') % 997, i, 'me')
    const e = entryOf(d, 'me')
    if (e && e.win && !e.remake && d.queueId === 420) return { id: d.id, entry: e, src: 'blitz' }
  }
  return { id: 'none', entry: null, src: null }
}

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { MatchDetail } from '../src/shared/types.ts'
import { createProfile, safe } from '../src/main/profile.ts'
import { detailFromLcu, detailFromRiot, entryOf, fmtDuration, FILTER_QUEUES, newestFirst, parseRiotId, summarizeMatches, timeAgo } from '../src/main/profileStats.ts'
import { createRiotApi } from '../src/main/riotApi.ts'

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const match = fx('profile.match.json')
const lcuGame = fx('profile.lcu.json')

test('match-v5 -> slim detail: items, runes, objectives, team kills', () => {
  const d = detailFromRiot(match)
  assert.equal(d.id, 'TR1_1000')
  assert.equal(d.players.length, 4)
  const me = d.players[0]
  assert.deepEqual([me.name, me.tag, me.cs, me.level, me.wards, me.position], ['Schelter', 'TR1', 210, 17, 9, 'middle'])
  assert.deepEqual(me.items, [3118, 3020, 0, 0, 0, 0, 3340])
  assert.deepEqual([me.keystone, me.tree, me.spells], [8112, 8200, [4, 14]])
  assert.equal(d.players[3].position, 'support')
  assert.equal(d.players[3].keystone, 0) // no perks in the payload
  const [blue, red] = d.teams
  assert.deepEqual(blue.objectives, { baron: 1, dragon: 3, herald: 1, tower: 9, inhibitor: 2 })
  assert.equal(blue.kills, 16) // match-v5 champion kills
  assert.equal(red.gold, 15000) // summed from players
})

test('entryOf: result, team kills, ten-player brief; null for strangers', () => {
  const d = detailFromRiot(match)
  const e = entryOf(d, 'me')!
  assert.deepEqual([e.win, e.remake, e.teamKills, e.queueId, e.players.length], [true, false, 16, 420, 4])
  assert.equal(entryOf(d, 'foe1')!.win, false)
  assert.equal(entryOf(d, 'nobody'), null)
  assert.equal(entryOf({ ...d, duration: 200 }, 'me')!.remake, true)
})

test('LCU game -> detail; hidden players fall back to summonerName; list entries with one player are rejected', () => {
  const d = detailFromLcu(lcuGame, 'tr1')!
  assert.equal(d.id, 'TR1_2000')
  assert.deepEqual([d.players[0].name, d.players[0].tag, d.players[0].puuid], ['Schelter', 'TR1', 'lcu-me'])
  assert.equal(d.players[1].name, 'Braum')
  assert.equal(d.players[1].position, 'support')
  assert.deepEqual([d.players[0].keystone, d.players[0].tree, d.players[0].cs], [8005, 8200, 105])
  assert.deepEqual(d.teams.map((t) => t.win), [true, false])
  assert.equal(d.teams[0].objectives.tower, 7)
  assert.equal(detailFromLcu({ ...lcuGame, participants: [lcuGame.participants[0]] }, 'tr1'), null)
})

function row(champ: number, k: number, dth: number, a: number, win: boolean, o: { cs?: number; dur?: number; pos?: 'jungle' | 'middle' | null; teamKills?: number; remake?: boolean } = {}) {
  const d = detailFromRiot(match)
  const me = { ...d.players[0], championId: champ, kills: k, deaths: dth, assists: a, cs: o.cs ?? 180, position: o.pos === undefined ? ('middle' as const) : o.pos }
  const dd: MatchDetail = { ...d, duration: o.remake ? 200 : (o.dur ?? 1200), players: [me], teams: [{ ...d.teams[0], win, kills: o.teamKills ?? 20 }] }
  return entryOf(dd, 'me')!
}

test('summarizeMatches: totals, per-champion, roles; remakes ignored; empty = null', () => {
  const rows = [
    row(103, 10, 2, 10, true), // 20 team kills
    row(103, 4, 6, 6, false, { pos: 'jungle' }),
    row(64, 0, 0, 0, false, { remake: true }),
    row(64, 2, 1, 3, true, { cs: 20, pos: null, teamKills: 10 })
  ]
  const s = summarizeMatches(rows)!
  assert.equal(s.games, 3)
  assert.equal(s.wins, 2)
  assert.ok(Math.abs(s.wr - 66.666) < 0.01)
  assert.ok(Math.abs(s.kda - (16 + 19) / 9) < 1e-9)
  assert.ok(Math.abs(s.csPerMin - 380 / 60) < 1e-9) // 3 games x 1200s = 60 min
  assert.ok(Math.abs(s.kp! - (35 / 50) * 100) < 1e-9)
  assert.deepEqual(s.champs.map((c) => [c.championId, c.games, c.wins]), [[103, 2, 1], [64, 1, 1]])
  assert.deepEqual(s.roles, [{ lane: 'middle', games: 1 }, { lane: 'jungle', games: 1 }])
  assert.equal(summarizeMatches([row(1, 0, 0, 0, true, { remake: true })]), null)
  assert.equal(summarizeMatches([]), null)
  assert.equal(summarizeMatches(rows, 1)!.games, 1)
})

test('small helpers', () => {
  assert.deepEqual(parseRiotId(' Schelter #vv9 ', 'TR1'), { gameName: 'Schelter', tagLine: 'vv9' })
  assert.deepEqual(parseRiotId('Name', 'TR1'), { gameName: 'Name', tagLine: 'TR1' })
  assert.deepEqual(parseRiotId('a#b#c', 'TR1'), { gameName: 'a#b', tagLine: 'c' })
  assert.equal(parseRiotId('  #TR1', 'TR1'), null)
  assert.deepEqual(newestFirst(['TR1_5', 'TR1_30', 'TR1_5', 'TR1_100']), ['TR1_100', 'TR1_30', 'TR1_5'])
  assert.equal(fmtDuration(1934), '32:14')
  assert.equal(fmtDuration(65), '1:05')
  const now = 10_000_000_000
  assert.equal(timeAgo(now - 3 * 3600e3, 'en', now), '3 hr. ago')
  assert.equal(timeAgo(now - 3 * 864e5, 'tr', now), '3 gün önce')
  assert.equal(timeAgo(now - 5e3, 'en', now), 'now')
  assert.deepEqual(FILTER_QUEUES.solo, [420])
})

// ---- service

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function service(o: { key?: string | null; lcu?: (path: string) => unknown } = {}) {
  const calls: string[] = []
  const api = createRiotApi({
    getKey: () => (o.key === null ? undefined : 'RGAPI-test'),
    sleep: async () => {},
    fetch: (async (url: string) => {
      const path = new URL(url).pathname + new URL(url).search
      calls.push(path)
      if (path.includes('/by-riot-id/Schelter/TR1')) return json({ puuid: 'me', gameName: 'Schelter', tagLine: 'TR1' })
      if (path.includes('/by-riot-id/')) return json({}, 404)
      if (path.includes('/summoners/by-puuid/me')) return json({ profileIconId: 5, summonerLevel: 300 })
      if (path.includes('/entries/by-puuid/me')) return json([{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 40, wins: 10, losses: 5 }, { queueType: 'RANKED_FLEX_SR', tier: 'IRON', rank: 'IV', leaguePoints: 0, wins: 1, losses: 3 }])
      if (path.includes('/ids?')) {
        const q = new URL(url).searchParams.get('queue')
        return json(q === '400' ? ['TR1_30', 'TR1_10'] : q === '430' ? ['TR1_20'] : q ? [] : ['TR1_1000'])
      }
      if (path.includes('/matches/TR1_1000')) return json(match)
      return json({}, 404)
    }) as typeof fetch
  })
  const dir = mkdtempSync(join(tmpdir(), 'lolay-profile-'))
  const svc = createProfile({ api: () => api, lcuGet: async (p) => o.lcu?.(p) ?? null, cacheDir: dir })
  return { svc, calls, dir, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('get: Riot ID -> profile with ranks; unknown id is not_found', async () => {
  const { svc, done } = service()
  const p = await svc.get({ gameName: 'Schelter', tagLine: 'TR1' })
  assert.deepEqual([p.puuid, p.src, p.level, p.iconId, p.platform, p.me], ['me', 'riot', 300, 5, 'tr1', false])
  assert.deepEqual(p.solo, { tier: 'GOLD', division: 'II', lp: 40, wins: 10, losses: 5 })
  assert.equal(p.flex!.tier, 'IRON')
  assert.deepEqual(await safe(() => svc.get({ gameName: 'Nobody', tagLine: 'x' })), { ok: false, error: 'not_found' })
  done()
})

test('matches: details are cached on disk for 24h, entries come back newest first', async () => {
  const { svc, calls, dir, done } = service()
  const q = { puuid: 'me', gameName: 'Schelter', tagLine: 'TR1', platform: 'tr1', src: 'riot' as const, start: 0, count: 20 }
  const a = await svc.matches(q)
  assert.equal(a.length, 1)
  assert.equal(a[0].me.championId, 103)
  const fetched = () => calls.filter((c) => c.includes('/matches/TR1_1000')).length
  assert.equal(fetched(), 1)
  // a second service on the same folder: no match request
  const again = createProfile({ api: () => createRiotApi({ getKey: () => 'k', fetch: (async (u: string) => (String(u).includes('/ids?') ? json(['TR1_1000']) : json({}, 500))) as typeof fetch }), lcuGet: async () => null, cacheDir: dir })
  assert.equal((await again.matches(q)).length, 1)
  assert.equal((await svc.match('TR1_1000')).players.length, 4)
  assert.equal(fetched(), 1)
  done()
})

test('matches: a filter with several queues merges and pages them', async () => {
  const { svc, calls, done } = service()
  await svc.matches({ puuid: 'me', gameName: 'Schelter', tagLine: 'TR1', platform: 'tr1', src: 'riot', filter: 'normal', start: 1, count: 2 })
  const queues = calls.filter((c) => c.includes('/ids?')).map((c) => new URL('https://x' + c).searchParams.get('queue'))
  assert.deepEqual(queues.sort(), ['400', '430', '480', '490'])
  assert.ok(calls.some((c) => c.includes('/ids?start=0&count=3&queue=400'))) // start+count of each queue
  done()
})

test('get me: the League client + Riot API; without a key the client answers', async () => {
  const lcu = (p: string) =>
    p === '/lol-summoner/v1/current-summoner' ? { puuid: 'lcu-me', gameName: 'Schelter', tagLine: 'TR1', summonerLevel: 299, profileIconId: 7 }
    : p === '/riotclient/region-locale' ? { region: 'TR' }
    : p.startsWith('/lol-ranked/') ? { queueMap: { RANKED_SOLO_5x5: { tier: 'PLATINUM', division: 'I', leaguePoints: 45, wins: 27, losses: 46 }, RANKED_FLEX_SR: { tier: 'NONE', division: 'NA' } } }
    : null
  const ok = service({ lcu })
  const p = await ok.svc.get('me')
  assert.deepEqual([p.src, p.me, p.degraded, p.puuid], ['riot', true, undefined, 'me'])
  ok.done()

  const nokey = service({ lcu, key: null })
  const q = await nokey.svc.get('me')
  assert.deepEqual([q.src, q.me, q.degraded, q.puuid, q.level, q.solo!.tier, q.flex], ['lcu', true, 'no_key', 'lcu-me', 299, 'PLATINUM', null])
  nokey.done()

  assert.deepEqual(await safe(() => service().svc.get('me')), { ok: false, error: 'lcu_off' })
})

test('client matches: a one-player list entry is completed from the single-game endpoint', async () => {
  const listed = { ...lcuGame, participants: [lcuGame.participants[0]], participantIdentities: [lcuGame.participantIdentities[0]] }
  const lcu = (p: string) =>
    p.startsWith('/lol-match-history/v1/products/lol/lcu-me/matches') ? { games: { games: [listed, { ...listed, gameId: 1, queueId: 420 }] } }
    : p === '/lol-match-history/v1/games/2000' ? lcuGame
    : p === '/lol-match-history/v1/games/1' ? { ...lcuGame, gameId: 1, queueId: 420 }
    : null
  const { svc, done } = service({ lcu })
  const q = { puuid: 'lcu-me', gameName: 'Schelter', tagLine: 'TR1', platform: 'tr1', src: 'lcu' as const, start: 0, count: 10 }
  const all = await svc.matches(q)
  assert.deepEqual(all.map((e) => [e.id, e.queueId, e.win, e.players.length]), [['TR1_2000', 440, true, 2], ['TR1_1', 420, true, 2]])
  assert.deepEqual((await svc.matches({ ...q, filter: 'flex' })).map((e) => e.queueId), [440])
  assert.equal((await svc.match('TR1_2000')).teams.length, 2) // kept for the detail view
  done()
})

test('safe: Riot errors become codes, nothing else leaks', async () => {
  const { svc, done } = service({ key: null })
  assert.deepEqual(await safe(() => svc.get({ gameName: 'a', tagLine: 'b' })), { ok: false, error: 'no_key' })
  assert.deepEqual(await safe(async () => { throw new Error('C:\\secret\\path') }), { ok: false, error: 'server' })
  done()
})

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createProfile, safe } from '../src/main/profile.ts'
import { entryOf } from '../src/main/profileStats.ts'
import { createBlitzSummoner, parseAccount, parseMatchList } from '../src/main/providers/blitzSummoner.ts'
import { createOpggSummoner, OpggError, parseGames, parseSummary, parseSummoners } from '../src/main/providers/opggSummoner.ts'
import { createRiotApi } from '../src/main/riotApi.ts'

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

test('OP.GG summoners: accounts, icon id, rank', () => {
  const r = parseSummoners(fx('opgg.summoners.json'))
  assert.equal(r.length, 3)
  assert.deepEqual([r[0].gameName, r[0].tagLine, r[0].puuid, r[0].iconId], ['CrX', '9410', 'op-s0', 6923])
  assert.deepEqual(r[0].solo && [r[0].solo.tier, r[0].solo.division], ['PLATINUM', 'II'])
  assert.throws(() => parseSummoners({ nope: 1 }), OpggError)
})

test('OP.GG summary: level, icon, solo and flex with win/loss', () => {
  const s = parseSummary(fx('opgg.summary.json'))
  assert.deepEqual([s.level, s.iconId], [199, 3545])
  assert.deepEqual(s.solo, { tier: 'PLATINUM', division: 'I', lp: 8, wins: 25, losses: 46 })
  assert.deepEqual(s.flex, { tier: 'GOLD', division: 'IV', lp: 72, wins: 20, losses: 24 })
  assert.throws(() => parseSummary({ data: {} }), OpggError)
})

test('OP.GG games: ten players, items, runes, team objectives; the row finds me by puuid', () => {
  const { games, last, count } = parseGames(fx('opgg.games.json'), 'tr1')
  assert.equal(count, 2)
  assert.ok(games[0].id.startsWith('OPGG_TR1_'))
  assert.equal(games[0].players.length, 10)
  assert.equal(games[0].players.filter((p) => p.teamId === 100).length, 5)
  const e = entryOf(games[0], 'op-me')!
  assert.equal(e.me.name, 'Schelter')
  assert.equal(e.me.items.length, 7)
  assert.ok(e.me.keystone > 8000 && e.me.tree > 8000 && e.me.spells.length === 2)
  assert.equal(e.win, games[0].teams.find((t) => t.teamId === e.me.teamId)!.win)
  assert.ok(games[0].teams[0].objectives.tower > 0 && games[0].teams[0].kills > 0)
  assert.ok(last && e.at > 1.7e12)
  assert.equal(entryOf(games[0], { gameName: 'schelter', tagLine: 'tr1' })!.me.puuid, 'op-me') // by Riot ID when puuids differ
  assert.throws(() => parseGames({}, 'tr1'), OpggError)
})

test('OP.GG provider: header, throttle, cache, paging with ended_at, schema errors', async () => {
  const urls: string[] = []
  const slept: number[] = []
  let t = 1_000_000
  const g = fx('opgg.games.json')
  const op = createOpggSummoner({
    now: () => t,
    sleep: async (ms) => void (slept.push(ms), (t += ms)),
    fetch: (async (u: string, init: RequestInit) => {
      urls.push(u)
      assert.equal((init.headers as Record<string, string>)['User-Agent'], 'OP.GG Desktop App')
      if (u.includes('/summoners?riot_id=')) return json(fx('opgg.summoners.json'))
      if (u.includes('/games?')) return u.includes('ended_at') ? json({ data: [] }) : json(g)
      return new Response('<html>405</html>', { status: 200 })
    }) as typeof fetch
  })
  const a = await op.search('tr1', 'CRx#')
  assert.equal(a[0].region, 'TR')
  assert.ok(urls[0].endsWith('/api/v2/tr/summoners?riot_id=CRx')) // a dangling '#' is dropped
  await op.search('tr1', 'crx') // cached
  assert.equal(urls.length, 1)
  assert.equal((await op.account('tr1', 'crx', '9410'))?.puuid, 'op-s0') // exact Riot ID, case-insensitive: its own request
  assert.equal(urls.length, 2)
  const games = await op.games('tr1', 'op-me', 'TOTAL', 20)
  assert.equal(games.length, 2) // 2 < limit 20: history ends, no second page
  assert.equal(urls.filter((u) => u.includes('/games?')).length, 1)
  assert.equal((await op.games('tr1', 'op-me', 'TOTAL', 20)).length, 2)
  assert.equal(urls.filter((u) => u.includes('/games?')).length, 1)
  assert.ok(slept.length > 0) // requests were spaced
  await assert.rejects(op.summary('tr1', 'op-me'), (e: unknown) => e instanceof OpggError && e.kind === 'schema')
})

test('Blitz: account ranks, newest-first match ids, 404 = null', async () => {
  const a = parseAccount(fx('blitz.account.json'))
  assert.deepEqual([a.puuid, a.level, a.iconId], ['blitz-me', 199, 6381])
  assert.deepEqual(a.solo, { tier: 'PLATINUM', division: 'I', lp: 45, wins: 27, losses: 46 })
  assert.equal(a.flex?.tier, 'GOLD')
  const ids = parseMatchList(fx('blitz.match_list.json'))
  assert.equal(ids[0].id, 'TR1_1751309590')
  assert.deepEqual(ids.find((r) => r.id === 'TR1_1751262629'), { id: 'TR1_1751262629', queue: 420 })
  assert.equal(ids[0].queue, undefined)
  const calls: string[] = []
  const b = createBlitzSummoner({ sleep: async () => {}, fetch: (async (u: string) => (calls.push(u), json({}, 404))) as typeof fetch })
  assert.equal(await b.account('tr1', 'x y', 'a/b'), null)
  assert.ok(calls[0].endsWith('/riot_account/lol/TR1/x%20y/a%2Fb'))
  assert.deepEqual(await b.matchIds('tr1', 'x', 'y'), [])
})

// ---- the chain: Blitz -> OP.GG -> Riot, per part

function chain(o: { blitz?: 'ok' | 'down' | 'none'; opgg?: 'ok' | 'down' | 'none'; riotKey?: boolean }) {
  const hits: string[] = []
  const route = (host: string, ok: (u: string) => Response, mode: string) => (async (u: string) => {
    hits.push(host)
    if (mode === 'down') return json({}, 503)
    if (mode === 'none') return json(host === 'blitz' ? {} : { data: [] }, host === 'blitz' ? 404 : 200)
    return ok(u)
  }) as typeof fetch
  const blitz = createBlitzSummoner({
    sleep: async () => {},
    fetch: route('blitz', (u) => (u.includes('/match_list/') ? json(fx('blitz.match_list.json')) : u.includes('/riot_account/') ? json(fx('blitz.account.json')) : json(fx('profile.match.json'))), o.blitz ?? 'ok')
  })
  const opgg = createOpggSummoner({
    sleep: async () => {},
    fetch: route('opgg', (u) => (u.includes('/summary') ? json(fx('opgg.summary.json')) : u.includes('/games?') ? json(fx('opgg.games.json')) : json({ data: [{ puuid: 'op-me', game_name: 'Schelter', tagline: 'TR1', level: 199, solo_tier_info: null }] })), o.opgg ?? 'ok')
  })
  const api = createRiotApi({
    getKey: () => (o.riotKey === false ? undefined : 'k'),
    sleep: async () => {},
    fetch: (async (u: string) => {
      hits.push('riot')
      return u.includes('/by-riot-id/') ? json({ puuid: 'rp', gameName: 'Schelter', tagLine: 'TR1' }) : u.includes('/summoners/') ? json({ profileIconId: 9, summonerLevel: 7 }) : u.includes('/entries/') ? json([]) : u.includes('/ids?') ? json(['TR1_1000']) : u.includes('/region/') ? json({ region: 'tr1' }) : json(fx('profile.match.json'))
    }) as typeof fetch
  })
  const dir = mkdtempSync(join(tmpdir(), 'lolay-chain-'))
  const svc = createProfile({ api: () => api, lcuGet: async () => null, cacheDir: dir, blitz, opgg })
  return { svc, hits, done: () => rmSync(dir, { recursive: true, force: true }) }
}
const ID = { gameName: 'Schelter', tagLine: 'TR1', platform: 'tr1' }

test('chain: Blitz answers first and the others are not asked', async () => {
  const c = chain({})
  const p = await c.svc.get(ID)
  assert.deepEqual([p.src, p.platform, p.level, p.solo?.tier], ['blitz', 'tr1', 199, 'PLATINUM']) // platform from the match id prefix
  assert.ok(!c.hits.includes('opgg') && !c.hits.includes('riot'))
  c.done()
})

test('chain: Blitz down -> OP.GG; both down -> Riot; nobody knows him -> not_found', async () => {
  const a = chain({ blitz: 'down' })
  const p = await a.svc.get(ID)
  assert.deepEqual([p.src, p.level, p.flex?.tier], ['opgg', 199, 'GOLD'])
  assert.ok(!a.hits.includes('riot'))
  a.done()

  const b = chain({ blitz: 'down', opgg: 'down' })
  assert.equal((await b.svc.get(ID)).src, 'riot')
  b.done()

  const c = chain({ blitz: 'none', opgg: 'none', riotKey: false })
  assert.deepEqual(await safe(() => c.svc.get(ID)), { ok: false, error: 'not_found' })
  c.done()
})

test('chain: match lists try OP.GG first (Blitz lags), then Blitz read as Riot-shaped matches, then Riot', async () => {
  const q = { puuid: 'blitz-me', gameName: 'Schelter', tagLine: 'TR1', platform: 'tr1', src: 'blitz' as const, start: 0, count: 5 }
  const a = chain({})
  const op = await a.svc.matches(q)
  assert.equal(op.length, 2)
  assert.ok(op[0].id.startsWith('OPGG_TR1_'))
  assert.equal((await a.svc.match(op[0].id)).players.length, 10) // listed games are kept for the detail view
  a.done()

  const b = chain({ opgg: 'down' })
  const rows = await b.svc.matches(q)
  assert.ok(rows.length > 0 && rows.every((r) => r.me.name === 'Schelter'))
  assert.ok(!b.hits.includes('riot'))
  b.done()

  const c = chain({ blitz: 'down', opgg: 'down' })
  const rr = await c.svc.matches(q)
  assert.deepEqual(rr.map((r) => r.id), ['TR1_1000'])
  assert.ok(c.hits.includes('riot'))
  c.done()
})

test('OP.GG Arena game: a team per key, ordered by standing, my placement on the row', () => {
  const part = (key: string, name: string, place: number, result: string) => ({ team_key: key, champion_id: 1, summoner: { puuid: name, game_name: name, tagline: 'x' }, stats: { subteam_placement: place, result, kill: 1, death: 1, assist: 1 }, items: [], spells: [] })
  const g = { id: 'a1', queue_id: 1740, created_at: '2026-10-17T10:00:00Z', game_length_second: 1400, teams: [], participants: [part('MINION', 'me', 3, 'LOSE'), part('MINION', 'mate', 3, 'LOSE'), part('PORO', 'p1', 1, 'WIN'), part('KRUG', 'k1', 2, 'WIN')] }
  const d = parseGames({ data: [g], meta: {} }, 'tr1').games[0]
  assert.deepEqual(d.teams.map((t) => [t.placement, t.win]), [[1, true], [2, true], [3, false]])
  const e = entryOf(d, 'me')!
  assert.equal(e.placement, 3)
  assert.equal(new Set(e.players.map((p) => p.teamId)).size, 3)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRiotApi, platformOf, regionalOf, RiotApiError } from '../src/main/riotApi.ts'

const KEY = 'RGAPI-secret-key-123'
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), init)

function setup(reply: (url: string, n: number) => Response, key: string | null = KEY) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const slept: number[] = []
  let t = 1_000_000
  const api = createRiotApi({
    getKey: () => key ?? undefined,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> })
      return reply(url, calls.length)
    }) as typeof fetch,
    now: () => t,
    sleep: async (ms) => void (slept.push(ms), (t += ms))
  })
  return { api, calls, slept, tick: (ms: number) => void (t += ms) }
}

test('LCU region -> platform, platform -> cluster', () => {
  const regions = { BR: 'br1', EUNE: 'eun1', EUW: 'euw1', JP: 'jp1', KR: 'kr', LA1: 'la1', LA2: 'la2', NA: 'na1', OCE: 'oc1', OC1: 'oc1', RU: 'ru', TR: 'tr1', PH: 'ph2', SG: 'sg2', TH: 'th2', TW: 'tw2', VN: 'vn2', ME1: 'me1' }
  for (const [region, platform] of Object.entries(regions)) assert.equal(platformOf(region), platform, region)
  assert.equal(platformOf(' tr '), 'tr1')
  assert.equal(platformOf('EUW1'), 'euw1')
  assert.equal(platformOf('XX'), null)
  const clusters = { na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe', kr: 'asia', jp1: 'asia', oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea' } as const
  for (const [platform, regional] of Object.entries(clusters)) assert.equal(regionalOf(platform as keyof typeof clusters), regional, platform)
})

test('sends X-Riot-Token and builds encoded urls on the right host', async () => {
  const { api, calls } = setup(() => json({ puuid: 'p', gameName: 'A b', tagLine: 'T/R' }))
  await api.accountByRiotId('A b', 'T/R', 'sea') // sea has no account-v1 cluster
  assert.equal(calls[0].url, 'https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/A%20b/T%2FR')
  assert.equal(calls[0].headers['X-Riot-Token'], KEY)
})

test('resolve: Riot ID -> API puuid, null when unknown', async () => {
  const ok = setup(() => json({ puuid: 'api-puuid', gameName: 'g', tagLine: 't' }))
  assert.equal(await ok.api.resolve('g', 't'), 'api-puuid')
  const missing = setup(() => json({}, { status: 404 }))
  assert.equal(await missing.api.resolve('g', 't'), null)
})

test('endpoint paths', async () => {
  const { api, calls } = setup(() => json([]))
  await api.leagueByPuuid('tr1', 'pu')
  await api.matchIds('europe', 'pu', { count: 5, queue: 420 })
  await api.masteryByChampion('tr1', 'pu', 103)
  await api.activeGame('tr1', 'pu')
  assert.deepEqual(
    calls.map((c) => c.url.replace('.api.riotgames.com', '')),
    [
      'https://tr1/lol/league/v4/entries/by-puuid/pu',
      'https://europe/lol/match/v5/matches/by-puuid/pu/ids?start=0&count=5&queue=420',
      'https://tr1/lol/champion-mastery/v4/champion-masteries/by-puuid/pu/by-champion/103',
      'https://tr1/lol/spectator/v5/active-games/by-summoner/pu'
    ]
  )
})

test('no key: no_key and no request', async () => {
  for (const key of [null, '', '  ']) {
    const { api, calls } = setup(() => json({}), key)
    await assert.rejects(api.accountByPuuid('p'), (e: RiotApiError) => e.code === 'no_key')
    assert.equal(calls.length, 0)
  }
})

test('401/403 -> invalid_key and the key never shows in the error', async () => {
  for (const status of [401, 403]) {
    const { api } = setup(() => json({ status: { message: 'Unauthorized' } }, { status }))
    await assert.rejects(api.leagueByPuuid('tr1', 'p'), (e: RiotApiError) => {
      assert.equal(e.code, 'invalid_key')
      assert.equal(e.status, status)
      assert.ok(!`${e.message} ${e.stack}`.includes(KEY))
      return true
    })
  }
})

test('network failure and 5xx -> server, key stays out of the message', async () => {
  const net = createRiotApi({ getKey: () => KEY, fetch: (async () => Promise.reject(new Error(`boom ${KEY}`))) as typeof fetch })
  await assert.rejects(net.match('europe', 'EUW1_1'), (e: RiotApiError) => e.code === 'server' && !e.message.includes(KEY))
  const { api } = setup(() => json({}, { status: 503 }))
  await assert.rejects(api.match('europe', 'EUW1_1'), (e: RiotApiError) => e.code === 'server' && e.status === 503)
})

test('404 -> null / empty, and cached', async () => {
  const { api, calls } = setup(() => json({}, { status: 404 }))
  assert.equal(await api.activeGame('tr1', 'p'), null)
  assert.equal(await api.activeGame('tr1', 'p'), null)
  assert.equal(await api.accountByRiotId('x', 'y'), null)
  assert.deepEqual(await api.leagueByPuuid('tr1', 'p'), [])
  assert.equal(calls.length, 3)
})

test('429 honours Retry-After and retries once', async () => {
  const { api, calls, slept } = setup((_u, n) => (n === 1 ? json({}, { status: 429, headers: { 'Retry-After': '3' } }) : json({ ok: 1 })))
  assert.deepEqual(await api.match('europe', 'm'), { ok: 1 })
  assert.equal(calls.length, 2)
  assert.ok(slept[0] >= 3000)
  const again = setup(() => json({}, { status: 429, headers: { 'Retry-After': '1' } }))
  await assert.rejects(again.api.match('europe', 'm'), (e: RiotApiError) => e.code === 'rate_limited')
  assert.equal(again.calls.length, 2) // retried once, not forever
})

test('a very long Retry-After fails fast instead of hanging', async () => {
  const { api, calls } = setup(() => json({}, { status: 429, headers: { 'Retry-After': '110' } }))
  await assert.rejects(api.match('europe', 'm'), (e: RiotApiError) => e.code === 'rate_limited')
  assert.equal(calls.length, 1)
})

test('local limiter: at most 20 requests per second', async () => {
  const { api, calls, slept } = setup(() => json({}))
  await Promise.all(Array.from({ length: 21 }, (_, i) => api.match('europe', `m${i}`)))
  assert.equal(calls.length, 21)
  assert.ok(slept.length > 0 && slept[0] >= 1000)
})

test('adopts limits from X-App-Rate-Limit', async () => {
  const { api, slept } = setup(() => json({}, { headers: { 'X-App-Rate-Limit': '2:1,100:120' } }))
  await api.match('europe', 'a')
  await api.match('europe', 'b')
  await api.match('europe', 'c')
  assert.equal(slept.length, 1)
})

test('cache: repeated and concurrent calls hit the network once; failures are retried', async () => {
  const { api, calls } = setup((_u, n) => (n === 1 ? json({}, { status: 500 }) : json({ puuid: 'p', gameName: 'g', tagLine: 't' })))
  await assert.rejects(api.accountByPuuid('p'))
  const [a, b] = await Promise.all([api.accountByPuuid('p'), api.accountByPuuid('p')])
  assert.equal(a, b)
  assert.equal(calls.length, 2)
})

test('cache entries expire', async () => {
  const { api, calls, tick } = setup(() => json(null))
  await api.activeGame('tr1', 'p')
  tick(31_000)
  await api.activeGame('tr1', 'p')
  assert.equal(calls.length, 2)
})

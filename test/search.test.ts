import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createPlayerIndex, createPlayerSearch, foldName, nameRank, splitQuery } from '../src/main/playerSearch.ts'
import { createOpggSummoner } from '../src/main/providers/opggSummoner.ts'
import { createRiotApi } from '../src/main/riotApi.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const tmp = () => mkdtempSync(join(tmpdir(), 'lolay-search-'))

test('foldName / nameRank: Turkish-aware, prefix before substring', () => {
  assert.equal(foldName('Çağrı İşık'), 'cagriisik')
  assert.equal(foldName('Ｃ Ｒ Ｘ'), 'crx')
  assert.equal(nameRank('CrX', 'crx'), 0)
  assert.equal(nameRank('CRXKing', 'crx'), 1)
  assert.equal(nameRank('xCRx', 'crx'), 2)
  assert.equal(nameRank('c_r_x', 'crx'), 3) // letters in order
  assert.equal(nameRank('abc', 'crx'), null)
  assert.equal(nameRank('cr', 'crx'), null)
  assert.deepEqual(splitQuery(' a b #TR1 '), { name: 'a b', tag: 'TR1' })
  assert.deepEqual(splitQuery('abc'), { name: 'abc', tag: '' })
})

test('index: ranks matches, filters by tag, survives a restart', async () => {
  const dir = tmp()
  const file = join(dir, 'players.json')
  const a = createPlayerIndex({ file })
  await a.add([{ gameName: 'CRxKing', tagLine: 'TR1' }, { gameName: 'xcrx', tagLine: 'EUW' }, { gameName: 'CrX', tagLine: '9410', level: 357 }, { gameName: 'Other', tagLine: 'TR1' }, { gameName: '', tagLine: 'x' }])
  assert.deepEqual((await a.find('crx')).map((r) => r.gameName), ['CrX', 'CRxKing', 'xcrx'])
  assert.deepEqual((await a.find('crx#94')).map((r) => `${r.gameName}#${r.tagLine}`), ['CrX#9410'])
  await a.flush()
  const b = createPlayerIndex({ file })
  assert.equal((await b.find('CrX'))[0].level, 357)
  rmSync(dir, { recursive: true, force: true })
})

const opggBody = { data: [{ puuid: 'o1', game_name: 'CrX', tagline: '9410', level: 357, profile_image_url: 'https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon6923.jpg', solo_tier_info: { tier: 'PLATINUM', division: 2, lp: 19 } }, { puuid: 'o2', game_name: 'crx', tagline: '4472', level: 69, profile_image_url: '', solo_tier_info: null }, { game_name: 'broken' }] }

function search(opgg: unknown, known: { gameName: string; tagLine: string }[] = []) {
  const riotCalls: string[] = []
  const api = createRiotApi({
    getKey: () => 'k',
    sleep: async () => {},
    fetch: (async (u: string) => {
      const m = /by-riot-id\/([^/]+)\/([^/?]+)/.exec(u)!
      riotCalls.push(`${decodeURIComponent(m[1])}#${m[2]}`)
      return m[2] === 'TR1' || m[2] === 'vv9' ? json({ puuid: 'p', gameName: decodeURIComponent(m[1]), tagLine: m[2] }) : json({}, 404)
    }) as typeof fetch
  })
  const dir = tmp()
  const index = createPlayerIndex({ file: join(dir, 'p.json') })
  void index.add(known)
  const s = createPlayerSearch({
    index, api: () => api, platform: () => 'tr1', myTag: () => 'vv9', friends: async () => [{ gameName: 'Friend', tagLine: 'TR1' }],
    opgg: createOpggSummoner({ sleep: async () => {}, fetch: (async () => (opgg ? json(opgg) : json({}, 500))) as typeof fetch })
  })
  return { s, riotCalls, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('search: local + OP.GG merged and deduped by Riot ID, best match first', async () => {
  const { s, riotCalls, done } = search(opggBody, [{ gameName: 'CRxKing', tagLine: 'TR1' }, { gameName: 'crx', tagLine: '4472' }])
  const { results } = await s.search({ query: 'CRx' })
  assert.deepEqual(results.map((r) => `${r.gameName}#${r.tagLine}:${r.source}`), ['CrX#9410:opgg', 'crx#4472:opgg', 'CRxKing#TR1:local'])
  assert.equal(results[0].rank?.tier, 'PLATINUM')
  assert.equal(riotCalls.length, 0) // suggestions never spend Riot calls
  done()
})

test('search: friends are findable; a typed tag falls back to one account-v1 lookup', async () => {
  const { s, riotCalls, done } = search(null)
  assert.deepEqual((await s.search({ query: 'frie' })).results.map((r) => r.gameName), ['Friend'])
  const r = await s.search({ query: 'Schelter#vv9' })
  assert.deepEqual(r.results.map((x) => [x.gameName, x.tagLine, x.source]), [['Schelter', 'vv9', 'riot']]) // no Blitz in this setup: Riot answers
  assert.deepEqual(riotCalls, ['Schelter#vv9'])
  done()
})

test('search: deep results guess TR1 and my own tag (max 3 calls), only without a tag and without hits', async () => {
  const { s, riotCalls, done } = search({ data: [] })
  assert.deepEqual((await s.search({ query: 'Nobody' })).results, [])
  assert.equal(riotCalls.length, 0)
  const r = await s.search({ query: 'Nobody', deep: true })
  assert.deepEqual(riotCalls.sort(), ['Nobody#EUNE', 'Nobody#EUW', 'Nobody#KR1', 'Nobody#NA1', 'Nobody#TR1', 'Nobody#vv9']) // the default tag of each searched region, then mine: at most six
  assert.deepEqual(r.results.map((x) => x.tagLine).sort(), ['TR1', 'vv9'])
  riotCalls.length = 0
  await s.search({ query: 'Ghost', deep: true, region: 'euw1' })
  assert.deepEqual(riotCalls.sort(), ['Ghost#EUW', 'Ghost#vv9'])
  assert.deepEqual((await s.search({ query: '' })).results, [])
  done()
})

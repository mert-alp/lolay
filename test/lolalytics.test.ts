import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock, test } from 'node:test'
import { champPathSlug, createLolalytics, parseQwik, slugFromDdragonId, toBuild } from '../src/main/lolalytics.ts'
import { InsufficientDataError } from '../src/main/providers/http.ts'

const html = readFileSync(new URL('./fixtures/ahri.html', import.meta.url), 'utf8')
const expected = JSON.parse(readFileSync(new URL('./fixtures/ahri.expected.json', import.meta.url), 'utf8'))
const parsed = parseQwik(html)

test('parseQwik resolves loader data like the reference implementation', () => {
  assert.equal(parsed.data.header.cid, 103)
  assert.deepEqual(parsed.data.summary.pick.runes.set.pri, [8112, 8139, 8140, 8106])
  // html and expected json were captured moments apart, so numbers drift: compare structure only
  assert.deepEqual(Object.keys(parsed.data), Object.keys(expected))
  assert.deepEqual(parsed.data.enemy_h, expected.enemy_h)
  assert.deepEqual(Object.keys(parsed.data.summary.pick), Object.keys(expected.summary.pick))
})

test('parseQwik exposes champPath', () => {
  assert.equal(parsed.champPath?.['103'], 'ahri')
})

test('parseQwik without qwik json', () => {
  assert.deepEqual(parseQwik('<html></html>'), { data: null, champPath: null })
})

test('toBuild maps Ahri middle emerald_plus', () => {
  const b = toBuild(parsed.data, 'emerald_plus')
  assert.equal(b.championId, 103)
  assert.equal(b.lane, 'middle')
  assert.equal(b.tierLabel, 'S')
  assert.equal(b.patch, '16.20')
  assert.deepEqual(b.runes[0].perks, [8112, 8139, 8140, 8106, 8226, 8210, 5005, 5008, 5001])
  assert.equal(b.runes.length, 2)
  assert.deepEqual(b.spells[0].ids, [4, 14])
  assert.equal(b.skillOrder.length, 15)
  assert.ok(b.skillOrder.startsWith('WQE'))
  assert.equal(b.skillPriority, 'QWE')
  assert.deepEqual(b.core?.ids, [3118, 3020, 4645])
  assert.deepEqual(b.startItems[0].ids, [1056, 2003, 2003])
  assert.ok(!b.boots.some((x) => x.id === 9999))
  assert.ok(b.counters.strong.length > 0 && b.counters.weak.length > 0)
  assert.ok(b.counters.strong[0].wr >= b.counters.weak[0].wr)
  assert.equal(b.partial, false)
})

test('champPathSlug is empty until a page is fetched', () => {
  assert.equal(champPathSlug(103), undefined)
})

test('slugFromDdragonId', () => {
  assert.equal(slugFromDdragonId('MonkeyKing'), 'wukong')
  assert.equal(slugFromDdragonId('DrMundo'), 'drmundo')
  assert.equal(slugFromDdragonId('KogMaw'), 'kogmaw')
  assert.equal(slugFromDdragonId("Kai'Sa"), 'kaisa')
})

// ---- not enough data ----

// Ahri support Challenger: n=4 and no `summary` at all (header copied from the live page)
const header = { patch: '16.20', defaultLane: 'middle', cid: 103, lane: 'support', queue: 420, wr: 25, pr: 0.08, n: 4, br: 1.87, tier: '?' }

test('toBuild: a page without summary is insufficient data, not a crash', () => {
  assert.throws(() => toBuild({ header }, 'challenger'), InsufficientDataError)
})

test('toBuild: off-role lane whose summary has no runes is insufficient data', () => {
  assert.throws(() => toBuild({ header, summary: { pick: {}, win: {} } }, 'emerald_plus'), InsufficientDataError)
})

test('toBuild: damage split from header.damage, null when the page has none', () => {
  const b = toBuild(parsed.data, 'emerald_plus')
  assert.ok(b.damage && b.damage.magic > b.damage.true && b.damage.true > b.damage.physical)
  const d = structuredClone(parsed.data)
  delete d.header.damage
  assert.equal(toBuild(d, 'emerald_plus').damage, null)
})

test('toBuild: a missing win page just leaves one rune page', () => {
  const d = structuredClone(parsed.data)
  delete d.summary.win
  const b = toBuild(d, 'emerald_plus')
  assert.equal(b.runes.length, 1)
  assert.equal(b.runeStatsLevel, 'keystone')
})

// minimal Qwik page: objs[0] is the loader data, "1" and "2" are the objects it points at
const qwikPage = (data: object) =>
  `<script type="qwik/json">${JSON.stringify({ objs: [{ skillOrder: 'x', builtBootSet3: 'x', header: '1', ...data }, header] })}</script>`

async function withFetch(handler: (url: string) => Response, fn: (urls: string[]) => Promise<void>) {
  const real = globalThis.fetch
  const urls: string[] = []
  globalThis.fetch = (async (url: string) => (urls.push(url), handler(url))) as typeof fetch
  try {
    await fn(urls)
  } finally {
    globalThis.fetch = real
  }
}

const provider = async () => createLolalytics({ cacheDir: await mkdtemp(join(tmpdir(), 'lolay-')), slugOf: () => 'ahri' })
const ask = { championId: 103, lane: 'support', tier: 'challenger' } as const

test('provider: insufficient page is reported as such and does not fall back to the JSON API', async () => {
  await withFetch(() => new Response(qwikPage({})), async (urls) => {
    await assert.rejects((await provider())(ask), InsufficientDataError)
    assert.equal(urls.length, 1)
  })
})

test('provider: a 5xx falls back to the JSON API, logs the page error, and the build is partial', async () => {
  const api = { header: { lane: 'support', defaultLane: 'middle', n: 900 }, summary: { runes: { pick: { wr: 55, n: 500, set: { pri: [8112, 8139, 8140, 8106], sec: [8226, 8210], mod: [5005, 5008, 5001] } } } } }
  const errors = mock.method(console, 'error', () => {})
  try {
    await withFetch((url) => (url.includes('/mega/') ? Response.json(api) : new Response('', { status: 503 })), async (urls) => {
      const b = await (await provider())(ask)
      assert.equal(urls.length, 2)
      assert.equal(b.partial, true)
      assert.equal(b.wr, null) // the keystone's win rate is not the champion's
      assert.equal(errors.mock.callCount(), 1)
    })
  } finally {
    errors.mock.restore()
  }
})

test('provider: a 404 is not retried through the JSON API', async () => {
  await withFetch(() => new Response('', { status: 404 }), async (urls) => {
    await assert.rejects((await provider())(ask), /HTTP 404/)
    assert.equal(urls.length, 1)
  })
})

test('provider: when both fail the page error is kept as cause', async () => {
  const errors = mock.method(console, 'error', () => {})
  try {
    await withFetch(() => new Response('', { status: 502 }), async () => {
      await assert.rejects((await provider())(ask), (e: Error) => /HTTP 502/.test((e.cause as Error).message))
    })
  } finally {
    errors.mock.restore()
  }
})

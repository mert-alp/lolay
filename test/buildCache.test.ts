import assert from 'node:assert/strict'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock, test } from 'node:test'
import { BUILD_TTL, type Build } from '../src/shared/types.ts'
import { createBuildCache, type CacheQuery } from '../src/main/buildCache.ts'
import { InsufficientDataError } from '../src/main/providers/http.ts'

const build = (o: Partial<Build> = {}): Build => ({
  championId: 103, slug: 'ahri', lane: 'middle', defaultLane: 'middle', tier: 'emerald_plus', source: 'lolalytics', patch: '16.20',
  wr: 51, pr: 9, br: 3, games: 1000, tierLabel: 'S', runes: [], spells: [], startItems: [], core: null, boots: [],
  item4: [], item5: [], item6: [], skillPriority: '', skillOrder: '', counters: { strong: [], weak: [] },
  partial: false, fetchedAt: Date.now(), ...o
})
const q: CacheQuery = { source: 'lolalytics', championId: 103, tier: 'emerald_plus' }
const dir = () => mkdtemp(join(tmpdir(), 'lolay-cache-'))

test('a build fetched without a lane is also cached under its resolved lane', async () => {
  let calls = 0
  const cache = createBuildCache({ cacheDir: await dir(), fetchBuild: async () => (calls++, build({ lane: 'jungle', defaultLane: 'jungle' })) })
  const shown = await cache.getBuild(q)
  const applied = await cache.getBuild({ ...q, lane: shown.lane })
  assert.equal(calls, 1)
  assert.deepEqual(applied, shown)
})

test('insufficient data becomes a cached empty build, not an error', async () => {
  let calls = 0
  const cache = createBuildCache({
    cacheDir: await dir(),
    fetchBuild: async () => {
      calls++
      throw new InsufficientDataError('n=4')
    }
  })
  const a = await cache.getBuild({ ...q, lane: 'support' })
  await cache.getBuild({ ...q, lane: 'support' })
  assert.equal(a.insufficient, true)
  assert.equal(a.lane, 'support')
  assert.equal(a.runes.length, 0)
  assert.equal(calls, 1) // no retry spam
})

test('an insufficient default-lane build is not copied to another lane', async () => {
  const cacheDir = await dir()
  const cache = createBuildCache({ cacheDir, fetchBuild: async () => Promise.reject(new InsufficientDataError('x')) })
  await cache.getBuild(q)
  assert.equal((await readdir(cacheDir)).length, 1)
})

test('a failing background refresh is logged and the cached build is still served', async () => {
  let fail = false
  const stale = build({ fetchedAt: Date.now() - BUILD_TTL - 1000 })
  const cache = createBuildCache({ cacheDir: await dir(), fetchBuild: async () => (fail ? Promise.reject(new Error('boom')) : stale) })
  await cache.getBuild({ ...q, lane: 'middle' }) // writes the stale build
  fail = true
  const errors = mock.method(console, 'error', () => {})
  try {
    let refreshed = false
    const got = await cache.getBuild({ ...q, lane: 'middle' }, () => (refreshed = true))
    assert.equal(got.fetchedAt, stale.fetchedAt)
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(refreshed, false)
    assert.equal(errors.mock.callCount(), 1)
    assert.match(String(errors.mock.calls[0].arguments[0]), /refresh failed/)
  } finally {
    errors.mock.restore()
  }
})

test('an ARAM build has its own cache file, apart from the Rift build of the same champion', async () => {
  const cacheDir = await dir()
  const cache = createBuildCache({ cacheDir, fetchBuild: async (x) => build({ queue: x.queue }) })
  await cache.getBuild({ ...q, lane: 'middle' })
  const aram = await cache.getBuild({ ...q, queue: 'aram' })
  assert.equal(aram.queue, 'aram')
  assert.deepEqual((await readdir(cacheDir)).sort(), ['build_2_lolalytics_103_aram_emerald_plus.json', 'build_2_lolalytics_103_middle_emerald_plus.json'])
})

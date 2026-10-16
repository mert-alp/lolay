import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createMeta, findMovers, mergeChanges, patchCandidates, PatchMissing, previousPatch, type ListFetcher } from '../src/main/meta.ts'
import { parseTierList } from '../src/main/tierlist.ts'

const load = (f: string) => parseTierList(JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')))
const cur = load('meta.all.json')
const prev = load('meta.all.prev.json')

test('patch candidates and previous patch', () => {
  assert.deepEqual(patchCandidates('16.20.1'), ['16.20', '16.19', '16.18'])
  assert.deepEqual(patchCandidates('16.2.1'), ['16.2', '16.1'])
  assert.deepEqual(patchCandidates(null), [])
  assert.equal(previousPatch('16.20'), '16.19')
  assert.equal(previousPatch('16.1'), null)
})

test('mergeChanges adds the change against the previous patch', () => {
  const ahri = mergeChanges(cur, prev).find((r) => r.championId === 103)!
  assert.equal(ahri.dWr, 0.34) // 52.9 vs 52.56
  assert.equal(ahri.dPr, 0.22)
  assert.equal(ahri.tier, 'S')
  assert.equal(mergeChanges(cur).every((r) => r.dWr == null), true)
})

test('mergeChanges drops unranked rows and skips tiny samples', () => {
  const rows = mergeChanges({ 1: { ...cur[103], rank: 0 }, 2: { ...cur[1], games: 100 } }, prev)
  assert.deepEqual(rows.map((r) => r.championId), [1])
  assert.equal(rows[0].dWr, undefined)
})

test('findMovers ranks by momentum (WR change + half PR change) and ignores patch noise', () => {
  const row = (championId: number, dWr: number, dPr: number) => ({ ...cur[103], championId, rank: 1, pr: 5, games: 5000, dWr, dPr })
  const m = findMovers([row(1, 1.2, 0), row(2, 0.3, 0.2), row(3, 0.2, 1.4), row(4, -0.9, 0), row(5, -0.2, -0.1), row(6, 0.1, -2.2)])
  assert.equal(m.kind, 'patch')
  assert.deepEqual(m.up, [1, 3]) // 1.2, 0.9 — row 2 (0.4) is noise
  assert.deepEqual(m.down, [6, 4]) // -1.0, -0.9 (worst first) — row 5 is noise
  assert.equal(m.down.some((id) => m.up.includes(id)), false)
})

test('findMovers falls back to the lane average without a previous patch', () => {
  const m = findMovers(mergeChanges(cur))
  assert.equal(m.kind, 'avg')
  assert.equal(m.up[0], 11) // highest avgWrDelta
})

function fake(missing: string[], broken: string[] = []) {
  const calls: (string | undefined)[] = []
  const fetchList: ListFetcher = async (_l, _t, patch) => {
    calls.push(patch)
    if (patch && missing.includes(patch)) throw new PatchMissing(patch)
    if (patch && broken.includes(patch)) throw new Error('HTTP 500')
    return patch === '16.19' ? prev : cur
  }
  return { calls, meta: createMeta(fetchList) }
}

test('getMeta walks back to the newest patch Lolalytics has, then compares with the one before', async () => {
  const { calls, meta } = fake(['16.21'])
  const r = await meta({ lane: 'all', tier: 'emerald_plus' }, '16.21.1')
  assert.deepEqual(calls, ['16.21', '16.20', '16.19'])
  assert.equal(r.patch, '16.20')
  assert.equal(r.previousPatch, '16.19')
  assert.equal(r.movers.kind, 'patch')
})

test('getMeta without a previous patch still answers', async () => {
  const { meta } = fake([], ['16.19'])
  const r = await meta({ lane: 'top', tier: 'all' }, '16.20.1')
  assert.equal(r.previousPatch, null)
  assert.equal(r.movers.kind, 'avg')
  assert.equal((await meta({ lane: 'top', tier: 'all', compare: false }, '16.20.1')).previousPatch, null)
})

test('getMeta uses the default list when the version is unknown or no patch resolves; real errors surface', async () => {
  const a = fake([])
  assert.equal((await a.meta({ lane: 'all', tier: 'all' }, null)).patch, null)
  assert.deepEqual(a.calls, [undefined])
  const b = fake(['16.20', '16.19', '16.18'])
  assert.equal((await b.meta({ lane: 'all', tier: 'all' }, '16.20.1')).patch, null)
  await assert.rejects(fake([], ['16.20']).meta({ lane: 'all', tier: 'all' }, '16.20.1'), /HTTP 500/)
})

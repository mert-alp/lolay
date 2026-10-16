import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftOf, isComplete, perksOf, pickRune, pickShard, pickTree, progress } from '../src/shared/runes.ts'

const trees = [
  { id: 1, slots: [[10, 11, 12], [20, 21, 22], [30, 31, 32], [40, 41, 42]] },
  { id: 2, slots: [[50, 51], [60, 61, 62], [70, 71, 72], [80, 81, 82]] }
]
const page = [10, 20, 30, 40, 61, 72, 5008, 5010, 5001]

test('a recommended page is complete and keeps its order', () => {
  const d = draftOf(page, trees)
  assert.ok(isComplete(d))
  assert.deepEqual(perksOf(d, trees), page)
})

test('third secondary pick drops the oldest, same row replaces in place', () => {
  let d = draftOf(page, trees) // secondary: 61 (row1), 72 (row2)
  d = pickRune(d, trees, 82) // row 3: 61 is the oldest and goes
  assert.deepEqual(d.perks.slice(4, 6), [72, 82])
  d = pickRune(d, trees, 71) // row 2 again: replaces 72
  assert.deepEqual(d.perks.slice(4, 6), [71, 82])
  d = pickRune(d, trees, 50) // keystone of the secondary tree is not selectable
  assert.deepEqual(d.perks.slice(4, 6), [71, 82])
})

test('secondary output is sorted by row', () => {
  let d = pickTree(draftOf(page, trees), 'secondary', 2)
  d = pickRune(pickRune(d, trees, 82), trees, 61)
  assert.deepEqual(perksOf(d, trees).slice(4, 6), [61, 82])
})

test('changing trees clears the affected picks and validates live', () => {
  let d = pickTree(draftOf(page, trees), 'primary', 2) // secondary was tree 2
  assert.equal(d.secondary, 0)
  assert.deepEqual(progress(d), { primary: 0, secondary: 0, shards: 3 })
  assert.ok(!isComplete(d))
  d = pickTree(d, 'secondary', 1)
  d = [50, 60, 70, 80].reduce((x, r) => pickRune(x, trees, r), d)
  d = pickRune(pickRune(d, trees, 21), trees, 32)
  assert.ok(isComplete(d))
  assert.equal(pickTree(d, 'secondary', 2), d) // cannot repeat the primary tree
})

test('shards only accept their own row options', () => {
  const d = draftOf(page, trees)
  assert.equal(pickShard(d, 0, 5010), d)
  assert.equal(pickShard(d, 0, 5007).perks[6], 5007)
  assert.equal(pickShard(d, 2, 5011).perks[8], 5011)
})

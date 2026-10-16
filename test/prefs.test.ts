import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanPrefs, flashSlot, okRunePage, okSpellPair, orderSpells, prefKey, watchSpells, type SpellWatch } from '../src/shared/prefs.ts'

test('Flash key is read from the pair the client shows', () => {
  assert.equal(flashSlot([14, 4]), 'F')
  assert.equal(flashSlot([4, 12]), 'D')
  assert.equal(flashSlot([14, 12]), null)
})

test('spells are arranged by the Flash key', () => {
  assert.deepEqual(orderSpells([4, 14], 'F'), [14, 4])
  assert.deepEqual(orderSpells([14, 4], 'D'), [4, 14])
  assert.deepEqual(orderSpells([14, 12], 'F'), [14, 12])
})

test('the first known pair is detection, our own echo is ignored, any other change is the user', () => {
  let w: SpellWatch = { seen: null, ours: null }
  let r = watchSpells(w, [0, 0]) // slots not filled yet
  assert.equal(r.change, null)
  r = watchSpells(w, [14, 4])
  assert.equal(r.change, 'first')
  w = { ...r.watch, ours: [12, 4] } // auto-import is about to write this
  r = watchSpells(w, [12, 4])
  assert.equal(r.change, null)
  w = r.watch
  assert.equal(watchSpells(w, [12, 4]).change, null) // unchanged event
  assert.equal(watchSpells(w, [4, 12]).change, 'user') // swapped in the client
  assert.equal(watchSpells(w, [14, 4]).change, 'user')
})

test('preferences are keyed by champion + lane and junk is dropped', () => {
  assert.equal(prefKey(103, 'middle'), '103:middle')
  assert.equal(prefKey(103, null), null)
  assert.equal(prefKey(0, 'top'), null)
  assert.deepEqual(cleanPrefs({ a: [4, 14], b: [4, 4], c: 'x', d: [1] }, okSpellPair), { a: [4, 14] })
  assert.deepEqual(cleanPrefs(undefined, okRunePage), {})
  assert.deepEqual(cleanPrefs([1], okRunePage), {})
  assert.ok(okRunePage([8112, 8139, 8140, 8106, 8226, 8210, 5005, 5008, 5001]))
  assert.ok(!okRunePage([8112, 0, 8140, 8106, 8226, 8210, 5005, 5008, 5001]))
})

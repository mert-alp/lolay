import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveSelection, selectionKey } from '../src/main/champSelect.ts'
import type { CsSession } from '../src/main/champSelect.ts'

const none = { appliedKey: null }

const session = (me: Partial<CsSession['myTeam'][number]>, myActions: { type: string; completed: boolean }[] = []): CsSession => ({
  localPlayerCellId: 2,
  myTeam: [
    { cellId: 1, championId: 99, championPickIntent: 0, assignedPosition: 'top' },
    { cellId: 2, championId: 0, championPickIntent: 0, assignedPosition: 'middle', ...me }
  ],
  actions: [[{ actorCellId: 1, type: 'pick', completed: true }], myActions.map((a) => ({ actorCellId: 2, ...a }))]
})

test('hover in draft is not locked', () => {
  const s = deriveSelection(session({ championPickIntent: 103 }, [{ type: 'ban', completed: true }, { type: 'pick', completed: false }]), none)
  assert.deepEqual(s, { championId: 103, lane: 'middle', locked: false, shouldApply: false })
})

test('completed pick action applies once', () => {
  const sess = session({ championId: 103 }, [{ type: 'pick', completed: true }])
  const first = deriveSelection(sess, none)
  assert.deepEqual(first, { championId: 103, lane: 'middle', locked: true, shouldApply: true })
  assert.equal(deriveSelection(sess, { appliedKey: selectionKey(103, 'middle') }).shouldApply, false)
})

test('someone else locking does not count', () => {
  const sess = session({ championPickIntent: 103 }, [{ type: 'pick', completed: false }])
  assert.equal(deriveSelection(sess, none).locked, false)
})

test('ARAM without pick actions locks on championId and re-applies after a bench swap', () => {
  const aram = (championId: number): CsSession => ({
    ...session({ championId, assignedPosition: '' }),
    actions: []
  })
  const first = deriveSelection(aram(103), none)
  assert.deepEqual(first, { championId: 103, lane: null, locked: true, shouldApply: true })
  const key = selectionKey(103, null)
  assert.equal(deriveSelection(aram(103), { appliedKey: key }).shouldApply, false)
  assert.equal(deriveSelection(aram(24), { appliedKey: key }).shouldApply, true)
})

test('blind pick hover without championId is not locked', () => {
  const sess: CsSession = { ...session({ championPickIntent: 103, assignedPosition: '' }), actions: [] }
  assert.equal(deriveSelection(sess, none).shouldApply, false)
})

test('lane mapping', () => {
  const lane = (assignedPosition: string) => deriveSelection(session({ assignedPosition }), none).lane
  assert.equal(lane('utility'), 'support')
  assert.equal(lane('bottom'), 'bottom')
  assert.equal(lane('jungle'), 'jungle')
  assert.equal(lane('top'), 'top')
  assert.equal(lane(''), null)
})

test('unknown local player', () => {
  const sess = { ...session({}), localPlayerCellId: 9 }
  assert.deepEqual(deriveSelection(sess, none), { championId: 0, lane: null, locked: false, shouldApply: false })
})

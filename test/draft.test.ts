import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { derivePhase, deriveTurn } from '../src/main/champSelect.ts'
import type { CsSession } from '../src/main/champSelect.ts'
import { champPool, counterPicks, deriveBan, favorites, findEnemies, guessLaner, rankPicks, rateStrips, scorePick } from '../src/main/recommend.ts'
import { createCache, parseMatchups, parseTierList } from '../src/main/tierlist.ts'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const list = parseTierList(fixture('tierlist.middle.json'))
const vs = parseMatchups(fixture('matchups.ahri.json'))

test('tier list maps the numeric tier to the site label', () => {
  assert.equal(list[103].tier, 'S') // Ahri: 2
  assert.equal(list[134].tier, 'A+') // Syndra: 4
  assert.equal(list[61].tier, 'C-') // Orianna: 12
  assert.equal(list[2].tier, '') // 0 = unranked
  assert.equal(list[103].lane, 'middle')
  assert.ok(list[103].delta > 0)
})

test('tier list rejects the API soft-404', () => {
  assert.throws(() => parseTierList({ status: 404 }))
})

test('matchups are our win rate against each champion', () => {
  assert.equal(vs[157].wr, 52.28)
  assert.ok(vs[157].n > 1000)
})

test('score formula', () => {
  assert.equal(scorePick(0, 0, 0, null), 40)
  assert.equal(scorePick(2, 10, 0, null), 67) // 40 + 12 + 15
  assert.equal(scorePick(2, 10, 100000, null), 72) // + mastery 5
  assert.equal(scorePick(2, 10, 0, 54), 79) // + counter 12
  assert.equal(scorePick(2, 10, 0, 55), 82) // + counter 15 (capped)
  assert.equal(scorePick(2, 10, 0, 45), 52)
  assert.equal(scorePick(9, 99, 9e9, 90), 99)
  assert.equal(scorePick(-9, 0, 0, 0), 7) // 40 - 18 - 15
})

const all = new Set(Object.keys(list).map(Number))

test('picks skip unavailable, off-lane and unranked champions', () => {
  const avail = new Set(all)
  avail.delete(103) // banned or not owned
  const picks = rankPicks({ list, available: avail, mastery: new Map(), limit: 20 })
  const ids = picks.map((p) => p.championId)
  assert.ok(!ids.includes(103))
  assert.ok(!ids.includes(2)) // tier 0
  assert.ok(ids.includes(157))
  assert.deepEqual(picks.map((p) => p.score), picks.map((p) => p.score).sort((a, b) => b - a))
})

test('mastery and matchup move the ranking', () => {
  const base = rankPicks({ list, available: all, mastery: new Map(), limit: 20 })
  const boosted = rankPicks({ list, available: all, mastery: new Map([[84, 400000]]), limit: 20 })
  assert.ok(boosted.find((p) => p.championId === 84)!.score > base.find((p) => p.championId === 84)!.score)
  // vsEnemy holds the enemy's win rate against each pick: 157 beats Ahri-like picks at 60% -> 40% for the pick
  const withVs = rankPicks({ list, available: all, mastery: new Map(), vsEnemy: { 238: { wr: 60, n: 500 }, 134: { wr: 60, n: 20 } }, limit: 20 })
  assert.equal(withVs.find((p) => p.championId === 238)!.vs, 40)
  assert.equal(withVs.find((p) => p.championId === 134)!.vs, null) // too few games
})

test('favorites prefer champions played in the lane, fall back to raw mastery', () => {
  const mastery = new Map([[91, 900000], [245, 500000], [157, 300000], [999, 800000]]) // 91: 22% mid, 999: unknown
  assert.deepEqual(favorites(list, mastery, all, 8), [91, 245, 157]) // 999 is not in the list
  assert.deepEqual(favorites(list, new Map([[999, 5]]), new Set([999]), 8), [999])
  assert.deepEqual(favorites(list, mastery, new Set([157]), 8), [157]) // only what can be picked
})

test('the enemy laner is the enemy champion most played in my lane', () => {
  assert.equal(guessLaner([91, 134, 7], list), 134)
  assert.equal(guessLaner([91], list), null) // 22% is a side lane
  assert.equal(guessLaner([], list), null)
})

test('turn: my unfinished pick action, spells', () => {
  const s: CsSession = {
    localPlayerCellId: 2,
    myTeam: [{ cellId: 2, championId: 0, championPickIntent: 0, assignedPosition: 'middle', spell1Id: 4, spell2Id: 14 }],
    actions: [
      [{ id: 1, actorCellId: 2, type: 'ban', completed: true }],
      [{ id: 7, actorCellId: 3, type: 'pick', completed: false, isInProgress: true }, { id: 8, actorCellId: 2, type: 'pick', completed: false, isInProgress: false }]
    ]
  }
  assert.deepEqual(deriveTurn(s), { pickActionId: 8, myTurn: false, spell1Id: 4, spell2Id: 14 })
  s.actions[1][1].isInProgress = true
  assert.equal(deriveTurn(s).myTurn, true)
  s.actions[1][1].completed = true
  assert.deepEqual(deriveTurn(s), { pickActionId: null, myTurn: false, spell1Id: 4, spell2Id: 14 })
})

test('ban turn: my unfinished ban action', () => {
  const s: CsSession = {
    localPlayerCellId: 2,
    myTeam: [],
    actions: [[{ id: 1, actorCellId: 2, type: 'ban', completed: false, isInProgress: false }, { id: 2, actorCellId: 5, type: 'ban', completed: false, isInProgress: true }]]
  }
  assert.deepEqual(deriveBan(s), { banActionId: 1, myBanTurn: false })
  s.actions[0][0].isInProgress = true
  assert.deepEqual(deriveBan(s), { banActionId: 1, myBanTurn: true })
  s.actions[0][0].completed = true
  assert.deepEqual(deriveBan(s), { banActionId: null, myBanTurn: false })
})

test('strips: watchlist keeps order and flags missing lane data, top lists are sorted and capped', () => {
  const avail = new Set(all)
  avail.delete(103)
  avail.add(999)
  const taken = new Set([103])
  const s = rateStrips(list, avail, taken, [157, 103, 999], 8)
  assert.deepEqual(s.watch.map((c) => [c.championId, !!c.none]), [[157, false], [999, true]]) // 103 is not pickable, 999 has no row
  assert.equal(s.popular.length, 8)
  assert.ok(!s.popular.some((c) => c.championId === 103))
  assert.deepEqual(s.popular.map((c) => c.pr), s.popular.map((c) => c.pr).sort((a, b) => b - a))
  assert.deepEqual(s.banned.map((c) => c.br), s.banned.map((c) => c.br).sort((a, b) => b - a))
  assert.ok(s.banned.every((c) => c.out === (c.championId === 103)))
})

test('cache: one load per key, failures are not remembered, entries expire', async () => {
  let t = 0
  const cached = createCache(1000, () => t)
  let n = 0
  const load = async () => ++n
  assert.equal(await cached('a', load), 1)
  assert.equal(await cached('a', load), 1)
  t = 1001
  assert.equal(await cached('a', load), 2)
  await assert.rejects(cached('b', () => Promise.reject(new Error('x'))))
  assert.equal(await cached('b', load), 3)
})

test('counter picks invert the enemy matchup list: their worst matchups are my best picks', () => {
  const vsEnemy = { 157: { wr: 45.7, n: 1200 }, 238: { wr: 47, n: 900 }, 134: { wr: 40, n: 150 }, 999: { wr: 30, n: 5000 }, 103: { wr: 44, n: 800 } }
  const avail = new Set(all)
  avail.delete(103) // not pickable
  const c = counterPicks(list, avail, vsEnemy, 6)
  assert.deepEqual(c.map((x) => x.championId), [157, 238]) // 134: too few games, 999: not in the lane, 103: taken
  assert.equal(c[0].vs, 54.3)
  assert.equal(c[0].n, 1200)
  assert.equal(c[0].tier, list[157].tier)
  assert.equal(counterPicks(list, avail, vsEnemy, 1).length, 1)
  assert.deepEqual(counterPicks(list, avail, null, 6), [])
})

test('enemies: the announced position wins, else the champion most played in the lane', () => {
  const jungle = { 64: { ...list[134], championId: 64, pctLane: 90 }, 134: { ...list[134], pctLane: 2 } }
  const hidden = [{ championId: 91, lane: null }, { championId: 134, lane: null }, { championId: 64, lane: null }]
  assert.deepEqual(findEnemies(hidden, 'middle', list, jungle), { laner: 134, jungler: 64 })
  assert.deepEqual(findEnemies(hidden, 'jungle', jungle, null), { laner: 64, jungler: null }) // the enemy jungler is the laner
  const told = [{ championId: 91, lane: 'middle' as const }, { championId: 134, lane: 'jungle' as const }]
  assert.deepEqual(findEnemies(told, 'middle', list, jungle), { laner: 91, jungler: 134 })
  assert.deepEqual(findEnemies([], 'middle', list, jungle), { laner: null, jungler: null })
})

test('my phase: ban / pick in progress, waiting, done', () => {
  const s: CsSession = {
    localPlayerCellId: 2,
    myTeam: [],
    actions: [[{ id: 1, actorCellId: 2, type: 'ban', completed: false, isInProgress: false }], [{ id: 8, actorCellId: 2, type: 'pick', completed: false, isInProgress: false }]]
  }
  assert.equal(derivePhase(s), 'waiting')
  s.actions[0][0].isInProgress = true
  assert.equal(derivePhase(s), 'ban')
  s.actions[0][0].completed = true
  s.actions[0][0].isInProgress = false
  assert.equal(derivePhase(s), 'waiting')
  s.actions[1][0].isInProgress = true
  assert.equal(derivePhase(s), 'pick')
  s.actions[1][0].completed = true
  assert.equal(derivePhase(s), 'done')
})

test('pool: the client lists win, else owned / free (any for a ban) minus taken', () => {
  const owned = [{ id: 1, ownership: { owned: true } }, { id: 2, freeToPlay: true }, { id: 3, ownership: { owned: false } }, { id: 4, ownership: { owned: true } }]
  assert.deepEqual(champPool([5, 6], [7], owned, new Set()), { pickable: [5, 6], bannable: [7] })
  assert.deepEqual(champPool([], null, owned, new Set([4])), { pickable: [1, 2], bannable: [1, 2, 3] })
  assert.deepEqual(champPool(null, null, null, new Set()), { pickable: [], bannable: [] })
})

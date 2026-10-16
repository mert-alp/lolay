import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { nextSkill } from '../src/main/overlayLogic.ts'
import { parseJunglePaths } from '../src/main/providers/opggJungle.ts'

const html = readFileSync(new URL('./fixtures/opgg.jungle.leesin.html', import.meta.url), 'utf8')

test('jungle paths: most played route per side', () => {
  const r = parseJunglePaths(html)
  assert.deepEqual(r.BLUE, ['RAPTORS', 'RED', 'KRUG', 'WOLVES', 'BLUE', 'GROMP'])
  assert.deepEqual(r.RED, ['RAPTORS', 'RED', 'KRUG', 'WOLVES', 'BLUE', 'GROMP'])
})

test('jungle paths: picks by play, not by position', () => {
  const swapped = html.replace('"play\\":72665', '"play\\":1').replace('"play\\":58790', '"play\\":99999')
  assert.deepEqual(parseJunglePaths(swapped).BLUE?.slice(0, 2), ['BLUE', 'GROMP'])
})

test('jungle paths: garbage gives nulls', () => {
  assert.deepEqual(parseJunglePaths('<html>nope</html>'), { BLUE: null, RED: null })
  assert.deepEqual(parseJunglePaths(''), { BLUE: null, RED: null })
})

const o15 = 'QEWQQRQEQEREWWW'
const ab = (Q = 0, W = 0, E = 0, R = 0) => ({ Q, W, E, R })

test('skill: level 1 with an unspent point names the first skill', () => {
  assert.equal(nextSkill(o15, 'QEW', 1, ab()), 'Q')
})

test('skill: spent == level means nothing to level', () => {
  assert.equal(nextSkill(o15, 'QEW', 1, ab(1)), null)
  assert.equal(nextSkill(o15, 'QEW', 3, ab(1, 1, 1)), null)
})

test('skill: follows the order and fills the unspent point', () => {
  assert.equal(nextSkill(o15, 'QEW', 2, ab(1)), 'E')
  assert.equal(nextSkill(o15, 'QEW', 3, ab(1, 0, 1)), 'W')
  assert.equal(nextSkill(o15, 'QEW', 4, ab(1, 1, 1)), 'Q')
})

test('skill: R only from 6/11/16', () => {
  assert.equal(nextSkill(o15, 'QEW', 6, ab(3, 1, 1)), 'R')
  assert.equal(nextSkill(o15, 'QEW', 7, ab(3, 1, 1, 1)), 'Q')
  assert.equal(nextSkill('RQWEQQQEEEWWWRR'.slice(0, 15), 'QEW', 3, ab(0, 0, 0)), 'Q') // R first in the order is not legal at 3
})

test('skill: levels beyond 15 extend with R at 16 then the priority', () => {
  assert.equal(nextSkill(o15, 'QEW', 16, ab(5, 4, 4, 2)), 'R')
  assert.equal(nextSkill(o15, 'QEW', 17, ab(5, 4, 4, 3)), 'E')
})

test('skill: irregular champions and unusable builds give null', () => {
  for (const k of ['Jayce', 'Elise', 'Nidalee', 'Karma', 'Udyr']) assert.equal(nextSkill(o15, 'QEW', 1, ab(), k), null)
  assert.equal(nextSkill('', '', 1, ab()), null)
  assert.equal(nextSkill(o15, 'QEW', 19, ab()), null)
})

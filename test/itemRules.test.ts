import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPath, enemyComp, popularPath, teamAdvice, vsItems } from '../src/shared/itemRules.ts'
import { parseControl } from '../src/main/champTraits.ts'
import type { StaticItem } from '../src/shared/types.ts'

const item = (o: Partial<StaticItem> = {}): StaticItem => ({ name: 'x', gold: 3000, desc: '', final: true, ...o })
const items: Record<number, StaticItem> = {
  3102: item({ def: ['SpellBlock'] }), // Banshee's Veil
  3111: item({ boots: true, def: ['SpellBlock', 'Tenacity'] }), // Mercury's Treads
  1057: item({ final: undefined, def: ['SpellBlock'] }), // Negatron Cloak: a component
  3157: item({ def: ['Armor'] }), // Zhonya's
  3089: item(), // Rabadon's
  3916: item({ final: undefined }), // Oblivion Orb: a component, still anti-heal
  3165: item(), // Morellonomicon
  4645: item()
}
const s = (id: number, n: number, wr = 51) => ({ id, wr, n })

test('popularPath: core, then the first 4th / 5th / 6th item not already in it', () => {
  const b = { core: { ids: [6655, 3020, 4645], wr: 53, n: 900 }, item4: [s(4645, 900), s(3089, 800)], item5: [s(3089, 500), s(3157, 400)], item6: [s(3157, 300)] }
  assert.deepEqual(popularPath(b), [6655, 3020, 4645, 3089, 3157])
  assert.deepEqual(buildPath({ ...b, boots: [s(3020, 2000)] }), { path: [6655, 3020, 4645, 3089, 3157], boots: [], options: [] }) // boots already in the core
  assert.deepEqual(buildPath({ ...b, boots: [s(3158, 2000)] }).boots, [3158])
  assert.deepEqual(popularPath({ core: null, item4: [], item5: [], item6: [] }), [])
})

test('teamAdvice: heavy magic damage asks for MR the champion really buys, finished items only, most bought first', () => {
  const pool = [s(3102, 800), s(3111, 3000), s(1057, 5000), s(3157, 4000), s(3089, 9000), s(4401, 50)]
  const comp = enemyComp([{ championId: 1, damage: { physical: 10, magic: 90, true: 0 } }], null)
  const rows = teamAdvice(pool, items, comp)
  assert.deepEqual(rows.map((r) => r.kind), ['mr'])
  assert.deepEqual(rows[0].items.map((i) => i.id), [3111, 3102]) // no Negatron Cloak, no 4401 (too few games)
})

test('teamAdvice: crowd control and healing, components allowed for anti-heal; nothing without enemies', () => {
  const pool = [s(3111, 3000), s(3916, 700), s(3165, 600), s(3089, 9000)]
  const comp = enemyComp([{ championId: 89, heal: 30000 }, { championId: 99, heal: 4000 }], { 89: 3, 99: 2 })
  assert.deepEqual(comp.cc, { avg: 2.5, high: [89] })
  assert.deepEqual(comp.healers, [89])
  const rows = teamAdvice(pool, items, comp)
  assert.deepEqual(rows.map((r) => [r.kind, r.items.map((i) => i.id)]), [['tenacity', [3111]], ['antiheal', [3916, 3165]]])
  assert.deepEqual(teamAdvice(pool, items, enemyComp([], null)), [])
})

test('vsItems: finished items bought against the laner that the popular path lacks', () => {
  assert.deepEqual(vsItems([s(3157, 400), s(3089, 900), s(1057, 600), s(3102, 20)], items, [3089]).map((i) => i.id), [3157])
})

test('parseControl: Meraki control rating by champion id', () => {
  assert.deepEqual(parseControl({ Ahri: { id: 103, attributeRatings: { control: 2 } }, Broken: { id: 'x' } }), { 103: 2 })
})

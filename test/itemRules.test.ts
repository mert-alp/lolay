import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arrangeSets, buildPath, enemyComp, setsDisturbed, popularPath, teamAdvice, vsItems } from '../src/shared/itemRules.ts'
import { ccSeconds } from '../src/main/champTraits.ts'
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
  const comp = enemyComp([{ championId: 99, heal: 4000 }, { championId: 89, heal: 30000 }], { 89: 3.25, 99: 1 })
  assert.deepEqual(comp.cc, { total: 4.25, avg: 2.125, list: [{ championId: 89, sec: 3.25 }, { championId: 99, sec: 1 }] })
  assert.deepEqual(comp.healers, [89])
  const rows = teamAdvice(pool, items, comp)
  assert.deepEqual(rows.map((r) => [r.kind, r.items.map((i) => i.id)]), [['tenacity', [3111]], ['antiheal', [3916, 3165]]])
  assert.deepEqual(teamAdvice(pool, items, enemyComp([], null)), [])
})

test('vsItems: finished items bought against the laner that the popular path lacks', () => {
  assert.deepEqual(vsItems([s(3157, 400), s(3089, 900), s(1057, 600), s(3102, 20)], items, [3089]).map((i) => i.id), [3157])
})

test('ccSeconds: the longest CC of each ability at max rank, skins left out', () => {
  const spell = (values: Record<string, number[]>, tags: string[] = []) => ({ mSpell: { mSpellTags: tags, DataValues: Object.entries(values).map(([name, v]) => ({ name, values: v })) } })
  const bin = {
    'Characters/Leona/Spells/LeonaQAbility/LeonaQ': spell({ StunDuration: [1, 1, 1, 1, 1, 1, 1], BaseDamage: [10, 10, 35, 60, 85, 110, 135] }),
    'Characters/Leona/Spells/LeonaEAbility/LeonaE': spell({ RootDuration: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] }),
    'Characters/Leona/Spells/LeonaEAbility/LeonaERoot': spell({ RootDuration: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] }), // same ability: counted once
    'Characters/Amumu/Spells/AmumuRAbility/AmumuR': spell({ RDuration: [1.5, 1.5, 1.5, 1.5] }, ['Trait_ImmobilizingCCSpell']),
    'Characters/Naut/Spells/NautQAbility/NautQ': spell({ BaseDamage: [85, 85, 125] }, ['Trait_ImmobilizingCCSpell']), // CC without a duration: 1 s
    'Characters/Leona/Spells/LeonaSkin34Manager/X': spell({ StunDuration: [5, 5, 5, 5, 5, 5, 5] }),
    'Characters/Zed/Spells/ZedEAbility/ZedE': spell({ SlowDuration: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5], MarkDuration: [3, 3, 3, 3, 3, 3, 3] })
  }
  assert.equal(ccSeconds(bin), 4) // 1 + 0.5 + 1.5 + 1
  assert.equal(ccSeconds({}), 0)
})

test('arrangeSets: ours first, Blitz sets and older LoLo sets gone, hand-made sets kept', () => {
  const ours = (t: string) => t.startsWith('LoLo') || t.startsWith('Lolay')
  const mine = { title: 'LoLo Ahri middle', uid: 'm' }
  const sets = [{ title: 'Blitz.gg Ahri Mid', uid: 'b' }, { title: 'My Ahri', uid: 'u' }, { title: 'Lolay Ahri middle', uid: 'old' }]
  assert.deepEqual(arrangeSets(sets, mine, ours).map((x) => x.uid), ['m', 'u'])
  assert.equal(setsDisturbed([mine, { title: 'My Ahri', uid: 'u' }], 'm'), false)
  assert.equal(setsDisturbed([{ title: 'My Ahri', uid: 'u' }, mine], 'm'), true)
  assert.equal(setsDisturbed([mine, { title: 'BLITZ Ahri', uid: 'b' }], 'm'), true)
})

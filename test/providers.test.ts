import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Build, StaticData } from '../src/shared/types.ts'
import { parseQwik, toBuild as lolalytics } from '../src/main/lolalytics.ts'
import { InsufficientDataError, splitCounters } from '../src/main/providers/http.ts'
import { toBuild as opgg } from '../src/main/providers/opgg.ts'
import { orderPerks, toBuild as ugg } from '../src/main/providers/ugg.ts'
import { parseBuild, parseRunes, slugOf } from '../src/main/providers/metasrc.ts'

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')
const json = (f: string) => JSON.parse(read(f))
const st = json('static.min.json') as StaticData

// shapes every provider must honour
function contract(b: Build) {
  assert.equal(b.championId, 103)
  assert.equal(b.lane, 'middle')
  assert.ok(b.runes.length >= 1)
  for (const r of b.runes) {
    assert.equal(r.perks.length, 9)
    assert.ok(r.perks.slice(6).every((p) => p >= 5000 && p < 6000), 'last three are shards')
    assert.ok(r.perks.slice(0, 6).every((p) => p > 8000))
    // 4 from the keystone's tree, 2 from another one
    const tree = (id: number) => st.trees.find((t) => t.slots.some((row) => row.includes(id)))!.id
    assert.equal(new Set(r.perks.slice(0, 4).map(tree)).size, 1)
    assert.equal(new Set(r.perks.slice(4, 6).map(tree)).size, 1)
    assert.notEqual(tree(r.perks[0]), tree(r.perks[4]))
  }
  assert.ok(b.wr! > 40 && b.wr! < 60)
  assert.ok(b.games > 1000)
  assert.ok(b.spells[0].ids.includes(4))
  assert.ok(b.core && b.core.ids.length >= 2 && b.core.ids.every((id) => !st.items[id]?.boots))
  assert.ok(b.boots.length > 0 && b.boots.every((x) => st.items[x.id]?.boots))
  assert.equal(b.skillOrder.length, 15)
  assert.match(b.skillOrder, /^[QWER]{15}$/)
  assert.equal(b.skillPriority.length, 3)
  assert.equal(b.fetchedAt > 0, true)
}

test('opgg normalizes Ahri middle emerald_plus', () => {
  const b = opgg(json('opgg.ahri.json'), { championId: 103, lane: 'middle', tier: 'emerald_plus' })
  contract(b)
  assert.equal(b.source, 'opgg')
  assert.equal(b.patch, '16.20')
  assert.equal(b.tierLabel, '1')
  assert.equal(b.defaultLane, 'middle')
  assert.ok(Math.abs(b.pr! - 9.21) < 0.01 && Math.abs(b.br! - 2.95) < 0.01) // fractions become percents
  assert.deepEqual(b.runes[0].perks, [8112, 8139, 8140, 8106, 8210, 8226, 5005, 5008, 5001])
  assert.ok(b.runes.length === 2 && b.runes[1].wr >= b.runes[0].wr)
  assert.deepEqual(b.spells[0].ids, [4, 14])
  assert.deepEqual(b.core?.ids, [3118, 4645, 3157])
  assert.ok(b.item4.length > 0 && b.item5.length > 0)
  assert.equal(b.skillPriority, 'QWE')
  assert.equal(b.skillOrder, 'WQEQQRQWQWRWWEE')
  assert.ok(b.counters.strong.length > 0 && b.counters.weak.length > 0)
  assert.ok(b.counters.strong[0].wr >= b.counters.weak[0].wr)
  assert.equal(b.partial, false)
})

test('opgg: a lane the champion is not played in still builds', () => {
  const b = opgg(json('opgg.ahri.json'), { championId: 103, lane: 'jungle', tier: 'emerald_plus' })
  assert.equal(b.lane, 'jungle')
  assert.equal(b.defaultLane, 'middle')
  assert.equal(b.tierLabel, '')
})

test('ugg orderPerks splits by tree and sorts by row', () => {
  assert.deepEqual(orderPerks(8100, 8200, [8112, 8106, 8139, 8140, 8226, 8237], ['5005', '5008', '5011'], st.trees), [8112, 8139, 8140, 8106, 8226, 8237, 5005, 5008, 5011])
  assert.deepEqual(orderPerks(8100, 8200, [8237, 8226, 8140, 8139, 8106, 8112], [], st.trees).slice(0, 4), [8112, 8139, 8140, 8106])
})

test('ugg normalizes Ahri emerald_plus', () => {
  const files = { rankings: json('ugg.rankings.json'), overview: json('ugg.overview.json'), matchups: json('ugg.matchups.json') }
  const b = ugg(files, { championId: 103, lane: 'middle', tier: 'emerald_plus', patch: '16_20' }, st)
  contract(b)
  assert.equal(b.source, 'ugg')
  assert.equal(b.patch, '16.20')
  assert.deepEqual(b.runes[0].perks, [8112, 8139, 8140, 8106, 8226, 8237, 5005, 5008, 5011])
  assert.deepEqual(b.spells[0].ids, [4, 14])
  assert.deepEqual(b.core?.ids, [3118, 3100]) // 3020 (Sorcerer's Shoes) moved to boots
  assert.equal(b.boots[0].id, 3020)
  assert.equal(b.skillPriority, 'QWE')
  assert.equal(b.skillOrder, 'WQEQQRQWQWRWWEE')
  assert.ok(b.item4.length > 0)
  assert.ok(b.counters.strong.length > 0 && b.counters.weak.length > 0)
  assert.ok(b.counters.strong[0].wr >= b.counters.weak[0].wr)
  assert.ok(b.counters.strong.every((m) => m.n >= 458)) // 0.3% of the games
})

test('ugg without a lane picks the role with the most games', () => {
  const files = { rankings: json('ugg.rankings.json'), overview: json('ugg.overview.json'), matchups: json('ugg.matchups.json') }
  const b = ugg(files, { championId: 103, tier: 'emerald_plus', patch: '16_20' }, st)
  assert.equal(b.lane, 'middle')
  assert.equal(b.defaultLane, 'middle')
  assert.throws(() => ugg(files, { championId: 103, lane: 'top', tier: 'emerald_plus', patch: '16_20' }, st), /no data/)
})

test('metasrc build page', () => {
  const b = parseBuild(read('metasrc.ahri.build.html'), { championId: 103, slug: 'ahri' }, st)
  assert.equal(b.source, 'metasrc')
  assert.equal(b.tier, 'all')
  assert.equal(b.lane, 'middle')
  assert.equal(b.patch, '16.20')
  assert.equal(b.tierLabel, 'S+')
  assert.equal(b.games, 980239)
  assert.equal(b.wr, 50.48)
  assert.deepEqual(b.spells[0].ids, [4, 14])
  assert.deepEqual(b.spells[1].ids, [4, 12])
  assert.deepEqual(b.startItems[0].ids, [1056, 2003, 2003])
  assert.deepEqual(b.core?.ids, [3118, 4645]) // boots moved out
  assert.equal(b.boots[0].id, 3175)
  assert.deepEqual(b.item4.map((x) => x.id).slice(0, 2), [3089, 3157])
  assert.ok(b.item5.length > 0 && b.item6.length > 0)
  assert.equal(b.skillPriority, 'QWE')
  assert.equal(b.skillOrder.length, 15)
  assert.ok(b.counters.strong.length > 0 && b.counters.weak.length > 0)
  assert.ok(b.counters.strong[0].wr >= b.counters.weak[0].wr)
  assert.ok(b.counters.strong.every((m) => st.champions[m.championId] && m.n > 0))
  assert.equal(b.runes.length, 0) // the runes come from the second page
})

test('metasrc runes page', () => {
  const runes = parseRunes(read('metasrc.ahri.runes.html'))
  assert.ok(runes.length >= 1)
  assert.equal(runes[0].perks.length, 9)
  assert.deepEqual(runes[0].perks.slice(0, 6), [8112, 8139, 8140, 8106, 8226, 8210])
  assert.deepEqual(runes[0].perks.slice(6), [5005, 5008, 5001]) // most picked node of each shard row
  assert.ok(runes[0].perks.slice(6).every((p) => p >= 5000 && p < 6000))
  assert.equal(runes[0].n, 585536)
  assert.ok(runes[0].wr > 50 && runes[0].wr < 51)
})

test('metasrc slugs', () => {
  const slugs: [string, string][] = [
    ["Kog'Maw", 'kogmaw'], ['Dr. Mundo', 'dr-mundo'], ['Jarvan IV', 'jarvan-iv'], ['Nunu & Willump', 'nunu'],
    ['Nunu ve Willump', 'nunu'], ['Renata Glasc', 'renata-glasc'], ["K'Sante", 'ksante'], ['Wukong', 'wukong'], ['Lee Sin', 'lee-sin']
  ]
  for (const [name, slug] of slugs) assert.equal(slugOf(name), slug)
})

// ---- counters ----

const mu = (championId: number, wr: number) => ({ championId, wr, n: 1000 })

test('splitCounters: few rows never land in both lists, strong is above 50 and weak below', () => {
  const { strong, weak } = splitCounters([mu(1, 55), mu(2, 52), mu(3, 49), mu(4, 51), mu(5, 50), mu(6, 45)])
  assert.deepEqual(strong.map((m) => m.championId), [1, 2, 4])
  assert.deepEqual(weak.map((m) => m.championId), [6, 3]) // worst first; 50.0 is neither
})

test('splitCounters: only winning matchups leave the weak list empty', () => {
  const { strong, weak } = splitCounters([mu(1, 53), mu(2, 51)])
  assert.equal(strong.length, 2)
  assert.deepEqual(weak, [])
})

test('splitCounters: at most six per list', () => {
  const rows = Array.from({ length: 20 }, (_, i) => mu(i, i < 10 ? 51 + i / 10 : 49 - i / 10))
  const { strong, weak } = splitCounters(rows)
  assert.equal(strong.length, 6)
  assert.equal(weak.length, 6)
  assert.ok(weak[0].wr <= weak[5].wr)
})

test('every provider keeps strong and weak apart', () => {
  const files = { rankings: json('ugg.rankings.json'), overview: json('ugg.overview.json'), matchups: json('ugg.matchups.json') }
  const builds = [
    opgg(json('opgg.ahri.json'), { championId: 103, lane: 'middle', tier: 'emerald_plus' }),
    ugg(files, { championId: 103, lane: 'middle', tier: 'emerald_plus', patch: '16_20' }, st),
    parseBuild(read('metasrc.ahri.build.html'), { championId: 103, slug: 'ahri' }, st),
    lolalytics(parseQwik(read('ahri.html')).data, 'emerald_plus')
  ]
  for (const { counters: { strong, weak }, source } of builds) {
    assert.ok(strong.every((m) => m.wr > 50), `${source} strong`)
    assert.ok(weak.every((m) => m.wr < 50), `${source} weak`)
    const ids = new Set(strong.map((m) => m.championId))
    assert.ok(weak.every((m) => !ids.has(m.championId)), `${source} overlap`)
  }
})

// ---- not enough data ----

test('ugg: a lane without data is insufficient, not a generic error', () => {
  const files = { rankings: json('ugg.rankings.json'), overview: json('ugg.overview.json'), matchups: json('ugg.matchups.json') }
  assert.throws(() => ugg(files, { championId: 103, lane: 'top', tier: 'emerald_plus', patch: '16_20' }, st), InsufficientDataError)
})

test('opgg: no stats and no rune pages is insufficient', () => {
  const j = json('opgg.ahri.json')
  j.data.summary.positions = []
  j.data.runes = []
  assert.throws(() => opgg(j, { championId: 103, lane: 'jungle', tier: 'emerald_plus' }), InsufficientDataError)
})

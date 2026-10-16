import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createValueCache } from '../src/main/buildCache.ts'
import { matchupPages } from '../src/main/lolalytics.ts'
import { proPages } from '../src/main/providers/probuilds.ts'
import { collectRunePages, defaultPage, opggTopPage, opggVariants, type RunePagesDeps } from '../src/main/runePages.ts'
import { pageTitle } from '../src/shared/runes.ts'
import type { RunePage, StaticData } from '../src/shared/types.ts'

const fx = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'))
const opgg = fx('opgg.ahri.runepages.json')
const opggZed = fx('opgg.ahri.vszed.runes.json')
const lolaZed = fx('lolalytics.ahri.vszed.json')
const pros = fx('probuilds.ahri.json')

const sd = {
  version: '16.20.1',
  lang: 'tr',
  champions: { 103: { key: 103, id: 'Ahri', name: 'Ahri' }, 238: { key: 238, id: 'Zed', name: 'Zed' }, 64: { key: 64, id: 'LeeSin', name: 'Lee Sin' } },
  runes: { 8112: { id: 8112, name: 'Elektrik Akımı' }, 8992: { id: 8992, name: 'Elektrik Akımı 2' } },
  trees: [{ id: 8100, name: 'Hüküm' }, { id: 8200, name: 'Büyücülük' }, { id: 8300, name: 'İlham' }]
} as unknown as StaticData

test('opggVariants: one best page per keystone group, labelled; same keystone gets the secondary tree', () => {
  const v = opggVariants(opgg, sd)
  assert.equal(v.length, 4) // the fifth group is under 3%
  assert.deepEqual(v[0].perks, [8112, 8139, 8140, 8106, 8210, 8226, 5005, 5008, 5001])
  assert.equal(v[0].n, 69655)
  assert.equal(v[0].wr, 50.53)
  assert.ok(v.every((p) => p.source === 'opgg' && p.perks.length === 9))
  // 8112 appears in three groups, so those carry the secondary tree
  assert.match(v[0].label!, /^Elektrik Akımı · /)
  assert.equal(new Set(v.map((p) => p.label)).size, v.length)
})

test('opggVariants ignores keystones under 3% pick', () => {
  const small = { data: { rune_pages: [{ ...opgg.data.rune_pages[0], pick_rate: 0.02 }] } }
  assert.deepEqual(opggVariants(small, sd), [])
  assert.deepEqual(opggVariants({}, sd), [])
})

test('opggTopPage needs a sample', () => {
  assert.equal(opggTopPage(opggZed)?.n, 2856)
  assert.equal(opggTopPage(opggZed, 5000), null)
  assert.equal(opggTopPage({ data: { runes: [] } }), null)
})

test('matchupPages: pick and win-focused page, nothing for thin data', () => {
  const p = matchupPages(lolaZed)
  assert.equal(p.length, 2)
  assert.deepEqual(p[0].perks, [8112, 8139, 8140, 8106, 8226, 8210, 5005, 5008, 5001])
  assert.deepEqual(matchupPages({ summary: { pick: { runes: { n: 5, set: { pri: [], sec: [], mod: [] } } } } }), [])
  assert.deepEqual(matchupPages(null), [])
})

test('proPages: newest first, shards flipped to offense-first, deduped per player', () => {
  const p = proPages(pros, 5)
  assert.equal(p.length, 5)
  assert.equal(p[0].player?.name, 'Fresskowy')
  assert.deepEqual(p[0].perks, [8112, 8139, 8137, 8106, 8226, 8237, 5005, 5008, 5011])
  assert.equal(p[0].source, 'pro')
  assert.ok(p.every((x, i) => i === 0 || x.player!.when! <= p[i - 1].player!.when!))
  assert.equal(proPages([pros[0], pros[0]]).length, 1)
  assert.deepEqual(proPages([{ ...pros[0], runes: [1] }]), [])
})

const page = (perks: number[], n = 100, o: Partial<RunePage> = {}): RunePage => ({ wr: 51, n, perks, ...o })
const A = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const B = [1, 2, 3, 4, 5, 6, 7, 8, 10]
const deps = (o: Partial<RunePagesDeps> = {}): RunePagesDeps => ({
  sd, tier: 'emerald_plus', baseSource: 'lolalytics',
  base: async () => [page(A), page(B)],
  opgg: async (_c, _l, _t, target) => (target ? opggZed : opgg),
  lolaVs: async ({ vsChampionId }) => matchupPages(lolaZed).map((p) => ({ ...p, perks: [...p.perks.slice(0, 8), vsChampionId] })), // distinct per enemy
  pro: async () => proPages(pros, 2),
  ...o
})

test('collectRunePages orders matchup, stats, pro; dedupes by perks; labels', async () => {
  const { value, partial } = await collectRunePages({ championId: 103, lane: 'middle', vsLaner: 238, vsJungler: 64 }, deps())
  assert.equal(partial, false)
  const labels = value.map((p) => p.label)
  assert.equal(labels[0], 'Ahri vs Zed')
  assert.ok(labels.includes('Ahri vs Lee Sin (Orman)'))
  assert.equal(value.filter((p) => / vs /.test(p.label ?? '')).length, 2) // two matchup pages at most
  assert.equal(value.at(-1)!.source, 'pro')
  assert.equal(new Set(value.map((p) => [...p.perks].sort().join())).size, value.length)
  assert.ok(value.length <= 6)
  assert.ok(value.some((p) => p.label === 'En Çok Seçilen' && p.source === 'lolalytics'))
})

test('collectRunePages without enemies has no matchup pages; a failing source marks the result partial', async () => {
  const ok = await collectRunePages({ championId: 103, lane: 'middle' }, deps())
  assert.ok(!ok.value.some((p) => / vs /.test(p.label ?? '')))
  const bad = await collectRunePages({ championId: 103, lane: 'middle' }, deps({ pro: async () => Promise.reject(new Error('boom')) }))
  assert.equal(bad.partial, true)
  assert.ok(bad.value.length > 0)
  const nodata = await collectRunePages({ championId: 103, lane: 'middle', vsLaner: 238 }, deps({ lolaVs: async () => Promise.reject(new Error('HTTP 404 for x')) }))
  assert.equal(nodata.partial, false)
})

test('jungle: the enemy jungler is the laner, not a second matchup', async () => {
  const { value } = await collectRunePages({ championId: 64, lane: 'jungle', vsLaner: 59, vsJungler: 59 }, deps())
  const vs = value.filter((p) => / vs /.test(p.label ?? ''))
  assert.ok(vs.length > 0)
  assert.ok(vs.every((p) => p.label!.startsWith('Lee Sin vs 59') && !p.label!.includes('('))) // same lane: no lane suffix
})

test('labels are names, never numbers; pro pages carry the player', async () => {
  const { value } = await collectRunePages({ championId: 103, lane: 'middle', vsLaner: 238 }, deps({ base: async () => [page(A), page(B), page([9, 9, 9, 9, 9, 9, 9, 9, 9])] }))
  assert.ok(value.every((p) => !/#\d|^\d+$/.test(p.label ?? '')))
  const pro = value.filter((p) => p.source === 'pro')
  assert.ok(pro.length > 0 && pro.length <= 2)
  assert.ok(pro.every((p) => p.label === p.player?.name))
  assert.equal(pageTitle(pro[0], 'En Çok Seçilen', sd.runes), pro[0].player!.name)
  assert.equal(pageTitle(page([8112]), undefined, sd.runes), 'Elektrik Akımı') // no label: the keystone, not "#3"
  assert.equal(pageTitle(page([8112], 1, { label: 'Ahri vs Zed' }), 'En Çok Seçilen', sd.runes), 'Ahri vs Zed')
})

test('at most 6 pages, and sources that would not fit are not asked', async () => {
  const many = Array.from({ length: 6 }, (_, i) => page([i, 2, 3, 4, 5, 6, 7, 8, 9]))
  let asked = 0
  const full = await collectRunePages({ championId: 103, lane: 'middle' }, deps({
    base: async () => many,
    opgg: async () => (asked++, opgg),
    pro: async () => (asked++, proPages(pros, 5))
  }))
  assert.equal(full.value.length, 6)
  assert.equal(asked, 0)
  const loose = await collectRunePages({ championId: 103, lane: 'middle', vsLaner: 238, vsJungler: 64 }, deps({ pro: async () => proPages(pros, 5) }))
  assert.ok(loose.value.length <= 6)
  assert.ok(loose.value.filter((p) => p.source === 'pro').length <= 2)
})

test('a small matchup sample is listed after the base pages and never the default', async () => {
  const low = { ...lolaZed, header: { ...lolaZed.header, n: 60 } }
  const { value } = await collectRunePages({ championId: 103, lane: 'middle', vsLaner: 238 }, deps({ lolaVs: async () => matchupPages(low), opgg: async () => null }))
  assert.ok(value.some((p) => p.low))
  assert.ok(!value[0].low)
  assert.equal(defaultPage(value), value[0])
  assert.equal(defaultPage(value)!.label, 'En Çok Seçilen')
  const good = await collectRunePages({ championId: 103, lane: 'middle', vsLaner: 238 }, deps())
  assert.equal(defaultPage(good.value)!.label, 'Ahri vs Zed')
  assert.ok(!good.value[0].low)
})

test('createValueCache serves fresh values from disk and recomputes partial ones', async () => {
  const cached = createValueCache({ cacheDir: await mkdtemp(join(tmpdir(), 'lolay-vc-')) })
  let n = 0
  assert.equal(await cached('k', async () => ({ value: ++n, partial: false })), 1)
  assert.equal(await cached('k', async () => ({ value: ++n, partial: false })), 1)
  assert.equal(await cached('p', async () => ({ value: ++n, partial: true })), 2)
  assert.equal(await cached('p', async () => ({ value: ++n, partial: true })), 2) // within the partial TTL
})

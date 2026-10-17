import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createDdragon } from '../src/main/ddragon.ts'

const files = {
  champion: { data: { Ahri: { key: '103', id: 'Ahri', name: 'Ahri' } } },
  item: { data: {} },
  runesReforged: [],
  summoner: { data: {} }
}

async function setup(serve: (url: string) => Response) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'lolay-dd-'))
  await writeFile(join(cacheDir, 'version.json'), JSON.stringify({ version: '1.0.0' }))
  await writeFile(join(cacheDir, 'static_1.0.0_tr_5.json'), '{}')
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string) => serve(String(url))) as typeof fetch
  return { cacheDir, restore: () => void (globalThis.fetch = real) }
}

test('a failed download keeps the old version and its static files', async () => {
  const { cacheDir, restore } = await setup((url) => (url.endsWith('versions.json') ? Response.json(['2.0.0']) : new Response('', { status: 500 })))
  try {
    const dd = createDdragon({ cacheDir })
    await assert.rejects(dd.checkVersion('tr'))
    assert.equal(dd.version(), '1.0.0')
    assert.ok(existsSync(join(cacheDir, 'static_1.0.0_tr_5.json')))
    assert.equal(JSON.parse(await readFile(join(cacheDir, 'version.json'), 'utf8')).version, '1.0.0')
  } finally {
    restore()
  }
})

test('the new static data is written before the old files go', async () => {
  const perks = [{ id: 5008, name: 'Değişken Kuvvet', iconPath: '/x/StatMods/StatModsAdaptiveForceIcon.png' }]
  const { cacheDir, restore } = await setup((url) => {
    if (url.endsWith('versions.json')) return Response.json(['2.0.0'])
    if (url.endsWith('perks.json')) return Response.json(perks)
    const name = /\/(\w+)\.json$/.exec(url)![1] as keyof typeof files
    return Response.json(files[name])
  })
  try {
    const dd = createDdragon({ cacheDir })
    assert.equal(await dd.checkVersion('tr'), true)
    assert.equal(dd.version(), '2.0.0')
    assert.ok(existsSync(join(cacheDir, 'static_2.0.0_tr_5.json')))
    assert.ok(!existsSync(join(cacheDir, 'static_1.0.0_tr_5.json')))
    const data = await dd.getStatic('tr')
    assert.equal(data.runes[5008].name, 'Değişken Kuvvet')
    assert.match(data.runes[5008].icon, /statmodsadaptiveforceicon\.png$/)
    assert.throws(() => dd.styleOfPerk(8999), /unknown rune/) // unknown tree: refuse instead of returning 0
    assert.equal(dd.styleOfPerk(5008), 0)
  } finally {
    restore()
  }
})

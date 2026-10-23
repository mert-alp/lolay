import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { writeGameItemSet } from '../src/main/gameItemSet.ts'

test('writeGameItemSet: one LoLo file with priority, other champions lose theirs, files of the client and other apps stay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lolo-'))
  const rec = (c: string) => join(dir, 'Config', 'Champions', c, 'Recommended')
  await mkdir(rec('Caitlyn'), { recursive: true })
  await writeFile(join(rec('Caitlyn'), 'LoLo.json'), '{}')
  await writeFile(join(rec('Caitlyn'), 'RIOT_ItemSet_1.json'), '{}')
  await writeFile(join(rec('Caitlyn'), '!opgg-0.json'), '{}')

  await writeGameItemSet(dir, 'Jhin', { title: 'LoLo Jhin bottom', sortrank: 5 })
  assert.deepEqual(JSON.parse(await readFile(join(rec('Jhin'), 'LoLo.json'), 'utf8')), { title: 'LoLo Jhin bottom', sortrank: 5, priority: true })
  assert.deepEqual((await readdir(rec('Caitlyn'))).sort(), ['!opgg-0.json', 'RIOT_ItemSet_1.json'])

  await writeGameItemSet(join(dir, 'missing'), 'Jhin', {}) // first import ever: no Champions folder yet
  assert.ok((await readdir(join(dir, 'missing', 'Config', 'Champions', 'Jhin', 'Recommended'))).includes('LoLo.json'))
})

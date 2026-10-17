import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { get } from './providers/http.ts'

// Meraki's champion data (~13 MB, all abilities) has a 1..3 "control" rating per champion; only that map is kept, once per patch
const URL = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json'

export function parseControl(j: any): Record<number, number> {
  const out: Record<number, number> = {}
  for (const c of Object.values<any>(j ?? {})) {
    const v = c?.attributeRatings?.control
    if (Number.isInteger(c?.id) && Number.isInteger(v)) out[c.id] = v
  }
  return out
}

export function createTraits(opts: { cacheDir: string; patch: () => string | null }) {
  const file = join(opts.cacheDir, 'traits.json')
  let mem: { patch: string; control: Record<number, number> } | null = null
  let failed: string | null = null // patch whose download failed this session: no 13 MB retry on every call
  let inflight: Promise<Record<number, number> | null> | null = null

  async function load(patch: string): Promise<Record<number, number> | null> {
    try {
      const disk = JSON.parse(await readFile(file, 'utf8'))
      if (disk?.patch === patch) return (mem = disk).control
    } catch {}
    if (failed === patch) return null
    try {
      const control = parseControl(await (await get(URL, { gap: 0 })).json())
      if (!Object.keys(control).length) throw new Error('Meraki champions without control ratings')
      mem = { patch, control }
      await mkdir(opts.cacheDir, { recursive: true })
      await writeFile(file, JSON.stringify(mem))
      return control
    } catch (e) {
      console.error('champion traits', e)
      failed = patch
      return null
    }
  }

  // champion id -> control rating 1..3; null = unknown (the CC hint is left out)
  return async function control(): Promise<Record<number, number> | null> {
    const patch = opts.patch() ?? 'unknown'
    if (mem?.patch === patch) return mem.control
    inflight ??= load(patch).finally(() => (inflight = null))
    return inflight
  }
}

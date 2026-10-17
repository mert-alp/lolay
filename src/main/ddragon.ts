import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Lang, StaticData, StaticRune } from '../shared/types.ts'

const CDN = 'https://ddragon.leagueoflegends.com'
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global'
const LOCALE: Record<Lang, string> = { tr: 'tr_TR', en: 'en_US' }
const REV = 5 // bump when StaticData changes shape: older cache files are refetched
const CDRAGON_LOCALE: Record<Lang, string> = { tr: 'tr_tr', en: 'default' }

async function json(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (res.status !== 200) throw new Error(`Data Dragon HTTP ${res.status} for ${url}`)
  return res.json()
}

async function fetchStatic(v: string, lang: Lang): Promise<StaticData> {
  const base = `${CDN}/cdn/${v}/data/${LOCALE[lang]}`
  const [champ, item, runeTrees, summ, perks] = await Promise.all([
    ...['champion', 'item', 'runesReforged', 'summoner'].map((f) => json(`${base}/${f}.json`)),
    json(`${CDRAGON}/${CDRAGON_LOCALE[lang]}/v1/perks.json`)
  ])

  const data: StaticData = { version: v, lang, champions: {}, items: {}, runes: {}, trees: [], spells: {} }
  for (const c of Object.values<any>(champ.data)) data.champions[Number(c.key)] = { key: Number(c.key), id: c.id, name: c.name }
  for (const [id, i] of Object.entries<any>(item.data)) {
    const tags: string[] = i.tags ?? []
    const def = (['SpellBlock', 'Armor', 'Tenacity'] as const).filter((x) => tags.includes(x))
    data.items[Number(id)] = {
      name: i.name, gold: i.gold.total, desc: i.description || i.plaintext || '',
      ...(tags.includes('Boots') && { boots: true as const }),
      ...(!i.into?.length && !tags.includes('Consumable') && !tags.includes('Trinket') && { final: true as const }),
      ...(def.length && { def })
    }
  }
  for (const s of Object.values<any>(summ.data)) data.spells[Number(s.key)] = { key: Number(s.key), id: s.id, name: s.name, desc: s.description ?? '', cd: String(s.cooldownBurn ?? '') }

  const img = (icon: string) => `${CDN}/cdn/img/${icon}`
  for (const t of runeTrees) {
    data.trees.push({ id: t.id, name: t.name, icon: img(t.icon), slots: t.slots.map((s: any) => s.runes.map((r: any) => r.id)) })
    for (const s of t.slots) for (const r of s.runes) data.runes[r.id] = { id: r.id, name: r.name, icon: img(r.icon), styleId: t.id, desc: r.longDesc || r.shortDesc || '' }
  }
  // stat shards are not in runesReforged: name and icon come from the client's own game data
  for (const p of perks) {
    if (p.id < 5000 || p.id >= 6000) continue
    const file = String(p.iconPath).split('/').pop()!.toLowerCase()
    data.runes[p.id] = { id: p.id, name: p.name, icon: `${CDRAGON}/default/v1/perk-images/statmods/${file}`, styleId: 0, desc: p.longDesc || p.shortDesc || '' } satisfies StaticRune
  }
  return data
}

export function createDdragon(opts: { cacheDir: string }) {
  const versionFile = join(opts.cacheDir, 'version.json')
  const memo = new Map<Lang, StaticData>()
  const inflight = new Map<string, Promise<StaticData>>()
  let current: string | null = null
  try {
    current = JSON.parse(readFileSync(versionFile, 'utf8')).version ?? null
  } catch {}

  // disk first, else download and write; one download per version+language at a time
  function load(v: string, lang: Lang): Promise<StaticData> {
    const file = join(opts.cacheDir, `static_${v}_${lang}_${REV}.json`)
    let p = inflight.get(file)
    if (!p) {
      p = (async () => {
        try {
          return JSON.parse(await readFile(file, 'utf8')) as StaticData
        } catch {
          const data = await fetchStatic(v, lang)
          await mkdir(opts.cacheDir, { recursive: true })
          await writeFile(file, JSON.stringify(data))
          return data
        }
      })().finally(() => inflight.delete(file))
      inflight.set(file, p)
    }
    return p
  }

  return {
    async checkVersion(lang: Lang): Promise<boolean> {
      let latest: string
      try {
        latest = (await json(`${CDN}/api/versions.json`))[0]
      } catch (e) {
        if (current) return false // offline: keep working with cached data
        throw e
      }
      if (latest === current) return false
      // the new data must be on disk before the old one goes away; a failed download keeps the old version
      const data = await load(latest, lang)
      current = latest
      memo.clear()
      memo.set(lang, data)
      await writeFile(versionFile, JSON.stringify({ version: latest }))
      for (const f of await readdir(opts.cacheDir)) {
        if (f.startsWith('static_') && !(f.startsWith(`static_${latest}_`) && f.endsWith(`_${REV}.json`))) await rm(join(opts.cacheDir, f), { force: true })
      }
      return true
    },

    version: (): string | null => current,

    async getStatic(lang: Lang): Promise<StaticData> {
      if (!current) await this.checkVersion(lang)
      const hit = memo.get(lang)
      if (hit && hit.version === current) return hit
      const data = await load(current!, lang)
      memo.set(lang, data)
      return data
    },

    // Tree id of a perk, 0 for stat shards. Needs getStatic() called once before (tree ids are language independent).
    styleOfPerk(perkId: number): number {
      if (perkId < 6000) return 0
      const data = memo.get('en') ?? memo.get('tr')
      if (!data) throw new Error('styleOfPerk: call getStatic() first')
      const styleId = data.runes[perkId]?.styleId
      if (!styleId) throw new Error(`unknown rune ${perkId}`) // static data older than the build's patch
      return styleId
    }
  }
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { get } from './providers/http.ts'

// CommunityDragon has each champion's game data (~50 KB): every spell's values, e.g. StunDuration [1,1,1,1,1,1,1]
const BIN = (slug: string) => `https://raw.communitydragon.org/latest/game/data/characters/${slug}/${slug}.bin.json`

const CC_VALUE = /(stun|root|snare|knock|airborne|charm|fear|flee|taunt|sleep|suppress|polymorph|berserk|silence|ground|^cc)\w*dur/i
const PLAIN_DURATION = /^(r|q|w|e|enemycast)?duration$/i // a CC spell whose value has no CC word: Amumu RDuration, Lissandra EnemyCastDuration
const IMMOBILIZING = 'Trait_ImmobilizingCCSpell'
const UNKNOWN_CC = 1 // ponytail: a CC spell without any duration value (Nautilus Q) counts as 1 s; a closer number needs the tooltip text

// Seconds of crowd control a champion's abilities can apply at max rank, one CC per ability (the longest).
export function ccSeconds(bin: any): number {
  const perAbility = new Map<string, number>()
  for (const [path, v] of Object.entries<any>(bin ?? {})) {
    const sp = v?.mSpell
    if (!sp || /skin/i.test(path)) continue
    const ability = path.split('/').slice(0, 4).join('/') // Characters/Leona/Spells/LeonaZenithBladeAbility
    const max = (d: any) => Math.max(0, ...((d?.values ?? []) as number[]).slice(1, 6).filter((x) => Number.isFinite(x) && x < 10))
    const values: any[] = sp.DataValues ?? []
    let sec = Math.max(0, ...values.filter((d) => CC_VALUE.test(d?.name ?? '')).map(max))
    if (!sec && (sp.mSpellTags ?? []).includes(IMMOBILIZING)) sec = Math.max(0, ...values.filter((d) => PLAIN_DURATION.test(d?.name ?? '')).map(max)) || UNKNOWN_CC
    if (sec) perAbility.set(ability, Math.max(perAbility.get(ability) ?? 0, sec))
  }
  return +[...perAbility.values()].reduce((s, x) => s + x, 0).toFixed(2)
}

// champion id -> CC seconds, fetched per champion when first needed and kept per patch
export function createTraits(opts: { cacheDir: string; patch: () => string | null }) {
  const file = join(opts.cacheDir, 'traits.json')
  let mem: { patch: string; cc: Record<number, number> } | null = null
  const failed = new Set<number>() // not retried this session

  async function table(patch: string) {
    if (mem?.patch === patch) return mem
    try {
      const disk = JSON.parse(await readFile(file, 'utf8'))
      if (disk?.patch === patch && disk.cc) return (mem = disk as { patch: string; cc: Record<number, number> })
    } catch {}
    return (mem = { patch, cc: {} })
  }

  return async function cc(champs: { championId: number; slug: string }[]): Promise<Record<number, number>> {
    const t = await table(opts.patch() ?? 'unknown')
    const missing = champs.filter((c) => !(c.championId in t.cc) && !failed.has(c.championId))
    await Promise.all(missing.map(async (c) => {
      try {
        t.cc[c.championId] = ccSeconds(await (await get(BIN(c.slug), { gap: 0 })).json())
      } catch (e) {
        console.error('champion cc', c.slug, e)
        failed.add(c.championId)
      }
    }))
    if (missing.length) {
      await mkdir(opts.cacheDir, { recursive: true })
      await writeFile(file, JSON.stringify(t)).catch(() => {})
    }
    return t.cc
  }
}

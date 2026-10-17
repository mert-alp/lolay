import { randomUUID } from 'node:crypto'
import type { ApplyRequest, ApplyResult, Build, ItemStat, Lang } from '../shared/types.ts'
import { orderSpells } from '../shared/prefs.ts'
import { request } from './lcu.ts'
import { ddragon, getBuild, getStatic } from './services.ts'
import { getSettings } from './settings.ts'
import { getState } from './state.ts'

const PREFIX = 'Lolay'
const BLOCKS: Record<Lang, string[]> = {
  tr: ['Başlangıç', 'Çekirdek Eşyalar', 'Botlar', '4. Eşya', '5. Eşya', '6. Eşya'], // same names as the Champion page
  en: ['Starting', 'Core Build', 'Boots', '4th Item', '5th Item', '6th Item']
}

const ok = (status: number) => status >= 200 && status < 300

async function call(method: string, path: string, body?: unknown) {
  const res = await request(method, path, body)
  if (!ok(res.status)) throw new Error(`${method} ${path} -> ${res.status}`)
  return res.data
}

const del = (id: number) => call('DELETE', `/lol-perks/v1/pages/${id}`)

async function applyRunes(perks: number[] | undefined, title: string): Promise<'skipped' | void> {
  if (perks?.length !== 9 || !perks.every(Number.isInteger)) return 'skipped' // nothing valid to write
  const primaryStyleId = ddragon.styleOfPerk(perks[0])
  const subStyleId = ddragon.styleOfPerk(perks[4])
  // unknown perk (static data older than Lolalytics' patch): fail before deleting anything
  if (!primaryStyleId || !subStyleId) throw new Error(`unknown rune tree for ${perks[0]}/${perks[4]}`)
  const pages: any[] = await call('GET', '/lol-perks/v1/pages')
  for (const p of pages) if (p.isDeletable && String(p.name).startsWith(PREFIX)) await del(p.id)
  const page = {
    name: title.slice(0, 25), // the client rejects longer names
    primaryStyleId,
    subStyleId,
    selectedPerkIds: perks,
    current: true
  }
  // all slots taken by the user's own pages: free one first (the active page, else the first deletable)
  const inv = await call('GET', '/lol-perks/v1/inventory')
  if (inv?.canAddCustomPage === false) {
    const cur = (await request('GET', '/lol-perks/v1/currentpage')).data
    const victim = cur?.isDeletable ? cur : (await call('GET', '/lol-perks/v1/pages')).find((p: any) => p.isDeletable)
    if (!victim) throw new Error('no deletable rune page')
    await del(victim.id)
  }
  // single attempt: a 400 here is a payload problem, never a reason to delete more pages
  const res = await request('POST', '/lol-perks/v1/pages', page)
  if (!ok(res.status)) throw new Error(`POST /lol-perks/v1/pages -> ${res.status} ${res.data?.message ?? ''}`)
  await request('PUT', '/lol-perks/v1/currentpage', res.data.id)
}

async function applySpells(ids: number[] | undefined): Promise<'skipped' | void> {
  if (getState().phase !== 'ChampSelect' || ids?.length !== 2 || !ids.every((id) => Number.isInteger(id) && id > 0) || ids[0] === ids[1]) return 'skipped'
  const [spell1Id, spell2Id] = orderSpells(ids, getSettings().flashOn)
  await call('PATCH', '/lol-champ-select/v1/session/my-selection', { spell1Id, spell2Id })
}

const block = (type: string, ids: number[]) => {
  const counts = new Map<number, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return { type, items: [...counts].map(([id, count]) => ({ id: String(id), count })) }
}

async function applyItems(build: Build, title: string, lang: Lang): Promise<'skipped' | void> {
  const top = (items: ItemStat[], n: number) => items.slice(0, n).map((i) => i.id)
  const t = BLOCKS[lang]
  const blocks = [
    block(t[0], build.startItems[0]?.ids ?? []),
    block(t[1], build.core?.ids ?? []),
    block(t[2], top(build.boots, 2)),
    block(t[3], top(build.item4, 3)),
    block(t[4], top(build.item5, 3)),
    block(t[5], top(build.item6, 3))
  ].filter((b) => b.items.length)
  if (!blocks.length) return 'skipped' // keep the previous Lolay set instead of replacing it with an empty one
  const { summonerId } = (await call('GET', '/lol-summoner/v1/current-summoner')) as { summonerId: number }
  const url = `/lol-item-sets/v1/item-sets/${summonerId}/sets`
  const current = await call('GET', url)
  if (!Array.isArray(current?.itemSets)) throw new Error('unexpected item-sets response')
  const itemSets = [
    ...current.itemSets.filter((s: any) => !String(s.title).startsWith(PREFIX)),
    {
      title,
      type: 'custom',
      map: build.queue ? 'HA' : 'SR',
      mode: build.queue ? 'ARAM' : 'CLASSIC',
      associatedChampions: [build.championId],
      associatedMaps: [build.queue ? 12 : 11],
      preferredItemSlots: [],
      sortrank: 0,
      startedFrom: 'blank',
      uid: randomUUID(),
      blocks
    }
  ]
  await call('PUT', url, { accountId: current.accountId, itemSets, timestamp: Date.now() })
}

// the renderer only gets a code; the raw text stays in the log
function errorCode(e: unknown): NonNullable<ApplyResult['error']> {
  const m = (e as Error).message
  if (/LCU|ECONN|socket/i.test(m)) return 'client'
  return /rune/i.test(m) ? 'runes' : 'failed'
}

// Each part is independent: one failing does not stop the others.
export async function applyBuild(req: ApplyRequest): Promise<ApplyResult> {
  const out: ApplyResult = {}
  const part = async (key: 'runes' | 'spells' | 'items', fn: () => Promise<'skipped' | void>) => {
    try {
      ;(out as Record<string, string>)[key] = (await fn()) ?? 'ok'
    } catch (e) {
      console.error('apply', key, e)
      ;(out as Record<string, string>)[key] = 'error'
      out.error ??= errorCode(e)
    }
  }
  try {
    const name = (await getStatic()).champions[req.championId]?.name ?? String(req.championId)
    const title = `${PREFIX} ${name} ${req.queue ? 'ARAM' : req.lane}`
    let build: Build | undefined
    const load = async () => (build ??= await getBuild({ championId: req.championId, lane: req.lane, queue: req.queue }))
    if (req.perks || req.runeIndex !== undefined) await part('runes', async () => applyRunes(req.perks ?? (await load()).runes[req.runeIndex!]?.perks, title))
    if (req.spells) await part('spells', async () => applySpells(req.spellIds ?? (await load()).spells[0]?.ids))
    if (req.items) await part('items', async () => applyItems(await load(), title, getState().lang))
  } catch (e) {
    console.error('apply', e)
    out.error = errorCode(e)
  }
  return out
}

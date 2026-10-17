import { ipcMain } from 'electron'
import { IPC } from '../shared/types.ts'
import type { DraftBench, DraftPool, DraftRecommendation, Lane, Tier } from '../shared/types.ts'
import { deriveTurn } from './champSelect.ts'
import type { CsSession } from './champSelect.ts'
import { request } from './lcu.ts'
import { toLane } from './liveRoster.ts'
import { champPathSlug, slugFromDdragonId } from './lolalytics.ts'
import { champPool, counterPicks, deriveBan, favoriteVs, favorites, findEnemies, myBanChips, rankBench, rankPicks, rateStrips } from './recommend.ts'
import { getStatic } from './services.ts'
import { updateSettings } from './settings.ts'
import { itemAdvice } from './itemAdvice.ts'
import { getState, setState } from './state.ts'
import { getAramList, getMatchups, getTierList, type TierList } from './tierlist.ts'

const MAX_LIST = 18 // suggestions / counters sent; the UI shows 6 and expands to the rest

const FLASH = 4
const SESSION = '/lol-champ-select/v1/session'

const ok = (status: number) => status >= 200 && status < 300
const id = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0

async function get(path: string): Promise<any> {
  try {
    const res = await request('GET', path)
    return ok(res.status) ? res.data : null
  } catch {
    return null
  }
}

async function send(method: string, path: string, body?: unknown): Promise<boolean> {
  try {
    const res = await request(method, path, body)
    if (!ok(res.status)) console.error('draft', method, path, res.status, res.data?.message ?? '')
    return ok(res.status)
  } catch (e) {
    console.error('draft', method, path, e)
    return false
  }
}

// the session is read again on every action: hover/lock only touch my own unfinished pick action, ban() only my ban
async function myPick(): Promise<ReturnType<typeof deriveTurn> | null> {
  const s: CsSession | null = await get(SESSION)
  const turn = s ? deriveTurn(s) : null
  return turn?.pickActionId == null ? null : turn
}

export async function hover(championId: number): Promise<boolean> {
  const turn = id(championId) && (await myPick())
  return !!turn && send('PATCH', `${SESSION}/actions/${turn.pickActionId}`, { championId })
}

// Lock in = PATCH {championId, completed:true}. Verified on the live client: POST .../complete answers 204
// but does nothing, so it is only a fallback, and success is read back from the session.
async function lockIn(actionId: number, championId: number): Promise<boolean> {
  const path = `${SESSION}/actions/${actionId}`
  const done = async () => {
    const s = await get(SESSION)
    return !!(s?.actions ?? []).flat().find((a: any) => a.id === actionId)?.completed
  }
  if ((await send('PATCH', path, { championId, completed: true })) && (await done())) return true
  return (await send('PATCH', path, { championId })) && (await send('POST', `${path}/complete`)) && (await done())
}

export async function lock(championId: number): Promise<boolean> {
  const turn = id(championId) && (await myPick())
  if (!turn || !turn.myTurn) return false
  return lockIn(turn.pickActionId!, championId)
}

// hover my open ban action; complete = also lock it in (only on my turn)
export async function ban(championId: number, complete: boolean): Promise<boolean> {
  const s: CsSession | null = id(championId) ? await get(SESSION) : null
  const b = s && deriveBan(s)
  if (!b || b.banActionId == null || (complete && !b.myBanTurn)) return false
  if (complete) return lockIn(b.banActionId, championId)
  return send('PATCH', `${SESSION}/actions/${b.banActionId}`, { championId })
}

// spell1 is the D slot, spell2 the F slot; Flash keeps its key in the settings so auto-import follows
export async function setSpells(spell1Id: number, spell2Id: number): Promise<boolean> {
  if (!id(spell1Id) || !id(spell2Id) || spell1Id === spell2Id) return false
  if (!(await send('PATCH', `${SESSION}/my-selection`, { spell1Id, spell2Id }))) return false
  if ([spell1Id, spell2Id].includes(FLASH)) setState({ settings: updateSettings({ flashOn: spell2Id === FLASH ? 'F' : 'D' }) })
  return true
}

// the enemy laner / jungler from the session's theirTeam (positions are usually empty in ranked draft)
export async function enemiesOf(theirs: { championId: number; assignedPosition?: string }[], lane: Lane, tier: Tier, list?: TierList) {
  const known = theirs.filter((p) => p.championId > 0).map((p) => ({ championId: p.championId, lane: toLane(p.assignedPosition) }))
  const mine = list ?? (await getTierList(lane, tier).catch(() => ({})))
  const jungle = lane === 'jungle' ? null : await getTierList('jungle', tier).catch(() => null)
  return findEnemies(known, lane, mine, jungle)
}

export async function pool(): Promise<DraftPool> {
  const [session, pickable, bannable, owned] = await Promise.all([
    get(SESSION),
    get('/lol-champ-select/v1/pickable-champion-ids'),
    get('/lol-champ-select/v1/bannable-champion-ids'),
    get('/lol-champions/v1/owned-champions-minimal')
  ])
  const taken = new Set<number>((session?.actions ?? []).flat().filter((a: any) => a.completed && a.championId > 0).map((a: any) => a.championId))
  return champPool(pickable, bannable, owned, taken)
}

export async function recommend(): Promise<DraftRecommendation | null> {
  const { champSelect: cs, tier } = getState()
  const lane = cs?.lane
  if (!cs || !lane) return null
  const [st, list, session, pickable, owned, mastery] = await Promise.all([
    getStatic(),
    getTierList(lane, tier),
    get(SESSION),
    get('/lol-champ-select/v1/pickable-champion-ids'),
    get('/lol-champions/v1/owned-champions-minimal'),
    get('/lol-champion-mastery/v1/local-player/champion-mastery')
  ])
  const done: any[] = (session?.actions ?? []).flat().filter((a: any) => a.completed && a.championId > 0)
  const taken = new Set<number>(done.map((a) => a.championId))
  const theirs: any[] = (session?.theirTeam ?? []).filter((p: any) => p.championId > 0)

  // pickable-champion-ids is exact on my turn; before that rebuild it from owned/free champions minus bans and picks
  const available = new Set<number>(Array.isArray(pickable) && pickable.length ? pickable : (Array.isArray(owned) ? owned : []).filter((c: any) => (c.ownership?.owned || c.freeToPlay) && !taken.has(c.id)).map((c: any) => c.id))
  const points = new Map<number, number>((Array.isArray(mastery) ? mastery : []).map((m: any) => [m.championId, m.championPoints ?? 0]))

  const { laner: enemyId, jungler: enemyJungleId } = await enemiesOf(theirs, lane, tier, list)
  const enemy = enemyId ? st.champions[enemyId] : undefined
  const vsEnemy = enemy ? await getMatchups(champPathSlug(enemyId!) ?? slugFromDdragonId(enemy.id), lane, tier).catch(() => null) : null

  const favs = favorites(list, points, available, 8)
  return {
    favorites: favs,
    favoriteVs: favoriteVs(favs, vsEnemy),
    myBans: myBanChips(getState().settings.banHistory, list, taken, 6),
    picks: rankPicks({ list, available, mastery: points, vsEnemy, limit: MAX_LIST }),
    enemyId: enemyId ?? null,
    enemyJungleId,
    counters: counterPicks(list, available, vsEnemy, MAX_LIST),
    ...rateStrips(list, available, taken, getState().settings.watchlist, 8),
    ...(session ? deriveBan(session) : { banActionId: null, myBanTurn: false })
  }
}

// ARAM: the bench by the ARAM tier list (no data = still listed, unrated)
export async function bench(): Promise<DraftBench | null> {
  const { champSelect: cs, tier } = getState()
  if (!cs?.aram) return null
  const [session, list] = await Promise.all([get(SESSION), getAramList(tier).catch(() => ({}))])
  return session ? rankBench(session, list) : null
}

// endpoints from community LCU docs, not yet seen working on the live client
export const benchSwap = (championId: number) => id(championId) && send('POST', `${SESSION}/bench/swap/${championId}`)
export const reroll = () => send('POST', `${SESSION}/my-selection/reroll`)

export function registerDraftIpc() {
  ipcMain.handle(IPC.draftRecommend, () => recommend())
  ipcMain.handle(IPC.draftPool, () => pool())
  ipcMain.handle(IPC.draftHover, (_e, championId: number) => hover(championId))
  ipcMain.handle(IPC.draftLock, (_e, championId: number) => lock(championId))
  ipcMain.handle(IPC.draftBan, (_e, championId: number, complete: boolean) => ban(championId, complete === true))
  ipcMain.handle(IPC.draftSetSpells, (_e, a: number, b: number) => setSpells(a, b))
  ipcMain.handle(IPC.draftBench, () => bench())
  ipcMain.handle(IPC.draftBenchSwap, (_e, championId: number) => benchSwap(championId))
  ipcMain.handle(IPC.draftReroll, () => reroll())
  ipcMain.handle(IPC.draftItemAdvice, (_e, championId: number, lane: Lane) => itemAdvice(championId, lane))
}

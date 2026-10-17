import type { ChampSelectState, Lane, Settings } from '../shared/types.ts'
import { flashSlot, orderSpells, prefKey, samePair, watchSpells, type SpellWatch } from '../shared/prefs.ts'
import { applyBuild } from './apply.ts'
import { derivePhase, deriveSelection, deriveTurn, phaseEndsAt, selectionKey, turnStarted } from './champSelect.ts'
import type { CsSession, Selection } from './champSelect.ts'
import { enemiesOf } from './draftActions.ts'
import { recordBans } from './recommend.ts'
import { defaultRunePerks, getBuild } from './services.ts'
import { getSettings, updateSettings } from './settings.ts'
import { getState, setState } from './state.ts'
import { alertTurn } from './win.ts'

const SUMMONERS_RIFT = 11
const HOWLING_ABYSS = 12 // ARAM and ARAM Mayhem
const MATCHUP_WAIT = 8000

let session: CsSession | null = null
let mapId = 0
let appliedKey: string | null = null // auto-import started for this champion+lane
let importedKey: string | null = null // ... and finished without error
let failedKey: string | null = null // ... and failed
let importingKey: string | null = null // ... and still running
let result: { key: string; parts: NonNullable<ChampSelectState['importResult']> } | null = null // per-part outcome
let prefetchKey = ''
let seenBans = new Set<number>() // my ban action ids already counted
let watch: SpellWatch = { seen: null, ours: null }
let turnKey: number | null = null // my action whose turn was last alerted
let endsAt: number | null = null // read when the session arrives: refresh() also runs later

// ARAM builds and their own spell / rune preferences ('aram' takes the lane's place in the key)
const queueOf = () => (mapId === HOWLING_ABYSS ? ('aram' as const) : undefined)

export function setMapId(id: number) {
  mapId = id
  refresh()
}

export function onChampSelect(data: CsSession | null, eventType = 'Update') {
  if (eventType === 'Delete' || !data) return resetChampSelect()
  session = data
  endsAt = phaseEndsAt(data)
  const turn = turnStarted(turnKey, data)
  turnKey = turn.key
  if (turn.fire && getSettings().turnAlert) alertTurn()
  trackSpells(data)
  const banHistory = recordBans(data, seenBans, getSettings().banHistory)
  if (banHistory) setState({ settings: updateSettings({ banHistory }) })
  refresh()
}

// keepBans: the LCU dropped, the same champ select may come back with the same completed bans
export function resetChampSelect(keepBans = false) {
  session = null
  appliedKey = importedKey = failedKey = importingKey = result = null
  prefetchKey = ''
  turnKey = endsAt = null
  if (!keepBans) seenBans = new Set()
  watch = { seen: null, ours: null }
  setState({ champSelect: null })
}

function refresh() {
  if (!session) return
  const sel = deriveSelection(session, { appliedKey })
  const key = selectionKey(sel.championId, sel.lane)
  const { autoImport } = getSettings()
  const autoImportAllowed = (mapId === SUMMONERS_RIFT || mapId === HOWLING_ABYSS) && (autoImport.runes || autoImport.spells || autoImport.items)
  const doApply = sel.shouldApply && autoImportAllowed
  if (doApply) {
    appliedKey = key // set before awaiting so rapid session events cannot apply twice
    importingKey = key
  }
  setState({
    champSelect: {
      championId: sel.championId,
      lane: sel.lane,
      locked: sel.locked,
      imported: importedKey === key,
      importFailed: failedKey === key,
      importing: importingKey === key,
      importResult: result?.key === key ? result.parts : null, // a new champion or lane starts clean
      autoImportAllowed,
      ...deriveTurn(session),
      phase: derivePhase(session),
      endsAt,
      aram: !!queueOf()
    }
  })
  if (sel.championId) prefetch(sel, key)
  if (doApply) void autoApply(sel, key)
}

// The pair the client shows is the user's truth: where Flash sits is remembered, and a pair we did not write is the
// user's own choice for this champion + lane (a swap in the client counts the same as one in the app).
function trackSpells(s: CsSession) {
  const { spell1Id, spell2Id } = deriveTurn(s)
  const now: [number, number] = [spell1Id, spell2Id]
  const r = watchSpells(watch, now)
  watch = r.watch
  if (!r.change) return
  const cur = getSettings()
  const patch: Partial<Settings> = {}
  const slot = flashSlot(now)
  if (slot && slot !== cur.flashOn) patch.flashOn = slot
  if (r.change === 'user') {
    const sel = deriveSelection(s, { appliedKey })
    const key = prefKey(sel.championId, queueOf() ?? sel.lane)
    if (key && !samePair(cur.spellPrefs[key], now)) patch.spellPrefs = { ...cur.spellPrefs, [key]: now }
  }
  if (Object.keys(patch).length) setState({ settings: updateSettings(patch) })
}

// warm the build cache; the renderer asks for the build itself
function prefetch(sel: Selection, key: string) {
  const k = `${key}:${getState().tier}:${queueOf() ?? getState().settings.source}`
  if (k === prefetchKey) return
  prefetchKey = k
  getBuild({ championId: sel.championId, lane: sel.lane ?? undefined, queue: queueOf() }).catch(() => {})
}

// the default rune page against the enemy laner / jungler; the build's own first page when that takes too long
async function matchupPerks(championId: number, lane: Lane): Promise<number[] | null> {
  const find = async () => {
    const e = await enemiesOf(session?.theirTeam ?? [], lane, getState().tier)
    return defaultRunePerks({ championId, lane, vsLaner: e.laner ?? undefined, vsJungler: e.jungler ?? undefined })
  }
  return Promise.race([find().catch(() => null), new Promise<null>((r) => setTimeout(r, MATCHUP_WAIT, null))])
}

async function autoApply(sel: Selection, key: string) {
  try {
    const { autoImport } = getSettings()
    const queue = queueOf()
    const build = await getBuild({ championId: sel.championId, lane: sel.lane ?? undefined, queue })
    if (build.insufficient) {
      failedKey = key // nothing to import, and nothing to retry
      return
    }
    // the user's own page and pair for this champion + lane win over the recommended ones
    const { runePrefs, spellPrefs, flashOn } = getSettings()
    const k = prefKey(sel.championId, queue ?? build.lane) ?? ''
    const own = runePrefs[k]
    const spellIds = spellPrefs[k]
    const pair = spellIds ?? build.spells[0]?.ids
    if (autoImport.spells && pair?.length === 2) watch = { ...watch, ours: orderSpells(pair, flashOn) }
    const res = await applyBuild({
      championId: sel.championId,
      lane: build.lane,
      queue,
      perks: autoImport.runes ? own ?? (queue ? null : await matchupPerks(build.championId, build.lane)) ?? build.runes[0]?.perks : undefined, // ARAM has no laner
      spells: autoImport.spells,
      spellIds,
      items: autoImport.items
    })
    result = { key, parts: { runes: res.runes, spells: res.spells, items: res.items } }
    if (res.error) {
      console.error('auto import', res)
      failedKey = key
    } else if (appliedKey === key) importedKey = key
  } catch (e) {
    console.error('auto import', e)
    failedKey = key
  } finally {
    if (importingKey === key) importingKey = null
    refresh()
  }
}

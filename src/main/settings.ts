import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SOURCES, type Settings } from '../shared/types.ts'
import { cleanPrefs, okRunePage, okSpellPair } from '../shared/prefs.ts'

const defaults: Settings = {
  lang: null,
  tierOverride: null,
  source: 'lolalytics',
  autoImport: { runes: true, spells: true, items: true },
  autoAccept: false,
  autoAcceptDelay: 3,
  flashOn: 'F',
  startWithWindows: true,
  watchlist: [],
  spellPrefs: {},
  runePrefs: {},
  banHistory: {},
  overlay: true,
  overlaySkill: true,
  overlayRoute: true,
  overlayMap: 280,
  overlayPos: {}
}

export const startHidden = process.argv.includes('--hidden')

const file = () => join(app.getPath('userData'), 'settings.json')
let current: Settings = defaults

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8'))
    current = { ...defaults, ...saved, autoImport: { ...defaults.autoImport, ...saved.autoImport } }
    if (!SOURCES.includes(current.source)) current.source = defaults.source
    if (!Array.isArray(current.watchlist)) current.watchlist = []
    current.spellPrefs = cleanPrefs(saved.spellPrefs, okSpellPair)
    current.runePrefs = cleanPrefs(saved.runePrefs, okRunePage)
    const bans = saved.banHistory
    current.banHistory = bans && typeof bans === 'object' && !Array.isArray(bans) ? Object.fromEntries(Object.entries(bans).filter(([id, n]) => +id > 0 && Number.isInteger(n) && (n as number) > 0)) as Record<number, number> : {}
    for (const k of ['overlay', 'overlaySkill', 'overlayRoute'] as const) if (typeof current[k] !== 'boolean') current[k] = defaults[k]
    const pos = saved.overlayPos
    current.overlayPos = Object.fromEntries(['skill', 'route'].filter((k) => Array.isArray(pos?.[k]) && pos[k].length === 2 && pos[k].every(Number.isFinite)).map((k) => [k, pos[k]]))
    if (!Number.isFinite(current.overlayMap) || current.overlayMap < 120 || current.overlayMap > 600) current.overlayMap = defaults.overlayMap
  } catch {
    current = defaults
  }
  applyLoginItem()
  return current
}

export const getSettings = () => current

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...current, ...patch, autoImport: { ...current.autoImport, ...patch.autoImport } }
  next.autoAcceptDelay = Math.min(8, Math.max(0, Number(next.autoAcceptDelay) || 0))
  const loginChanged = next.startWithWindows !== current.startWithWindows
  current = next
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(file(), JSON.stringify(current, null, 2))
  } catch (e) {
    console.error('settings save failed', e)
  }
  if (loginChanged) applyLoginItem()
  return current
}

// dev runs would register electron.exe itself, so only when packaged
function applyLoginItem() {
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: current.startWithWindows,
    path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath,
    args: ['--hidden']
  })
}

import { app, BrowserWindow } from 'electron'
import { IPC } from '../shared/types.ts'
import type { AppState } from '../shared/types.ts'
import { localeToLang, rankToTier } from './rank.ts'
import { getSettings } from './settings.ts'

let clientLocale: string | null = null
let state: AppState
const listeners = new Set<(s: AppState) => void>()

const derive = (s: AppState): AppState => ({
  ...s,
  // before the client tells us its locale, follow the OS language
  lang: s.settings.lang ?? localeToLang(clientLocale ?? (app.getLocale().startsWith('tr') ? 'tr_TR' : null)),
  // unknown summoner (League closed) -> Lolalytics' own default instead of 'all'
  tier: s.settings.tierOverride ?? (s.summoner ? rankToTier(s.summoner.soloTier) : 'emerald_plus')
})

export function initState() {
  state = derive({
    lcu: 'disconnected',
    summoner: null,
    phase: 'None',
    readyCheck: null,
    champSelect: null,
    live: null,
    settings: getSettings(),
    lang: 'en',
    tier: 'all',
    dataVersion: null,
    postGame: null
  })
}

export const getState = () => state
export const onState = (cb: (s: AppState) => void) => void listeners.add(cb)

export function setState(patch: Partial<AppState>) {
  const next = derive({ ...state, ...patch })
  if (JSON.stringify(next) === JSON.stringify(state)) return
  state = next
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(IPC.state, state)
  listeners.forEach((cb) => cb(state))
}

export function setClientLocale(locale: string | null) {
  clientLocale = locale
  setState({})
}

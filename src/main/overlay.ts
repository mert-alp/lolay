import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { IPC, type Camp, type OverlayState } from '../shared/types.ts'
import * as lcu from './lcu.ts'
import { liveGet } from './liveClient.ts'
import { nextSkill } from './overlayLogic.ts'
import { getJunglePath } from './providers/opggJungle.ts'
import { getBuild, getStatic } from './services.ts'
import { getState, onState, setState } from './state.ts'

const TICK_MS = 1000
const RETRY_MS = 10_000

interface Ctx {
  championId: number
  key: string // ddragon id
  side: 'BLUE' | 'RED'
  order: string
  priority: string
  route: Camp[] | null
}

let win: BrowserWindow | null = null
let timer: NodeJS.Timeout | null = null
let run = 0 // bumped on every start/stop so a stale tick or init drops its result
let ctx: Ctx | null = null
let initAt = 0
let initing = false
let shown = false

function createWindow() {
  // ponytail: primary display only; follow the League window if multi-monitor matters
  const w = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds,
    transparent: true,
    frame: false,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: { preload: join(app.getAppPath(), 'out/preload/index.cjs'), sandbox: true, contextIsolation: true }
  })
  w.setIgnoreMouseEvents(true, { forward: true }) // click-through, but the renderer still sees the mouse so a panel header can ask to catch it
  w.setAlwaysOnTop(true, 'screen-saver')
  w.on('closed', () => {
    if (win === w) win = null
    shown = false
  })
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}#overlay`)
  else void w.loadFile(join(app.getAppPath(), 'out/renderer/index.html'), { hash: 'overlay' })
  return w
}

// my champion, side, lane and skill order; the route only for a jungler
async function init(): Promise<Ctx | null> {
  const me = getState().live?.myTeam.find((p) => p.me)
  if (!me || me.championId <= 0) return null
  const [sd, gf] = await Promise.all([getStatic(), lcu.request('GET', '/lol-gameflow/v1/session').then((r) => r.data, () => null)])
  const key = sd.champions[me.championId]?.id
  if (!key) return null
  const inTeam = (t: any[] | undefined) => !!me.puuid && (t ?? []).some((p) => p.puuid === me.puuid)
  const side = inTeam(gf?.gameData?.teamOne) ? 'BLUE' : inTeam(gf?.gameData?.teamTwo) ? 'RED' : null
  if (!side) return null // gameflow not ready: retry rather than show the other side's path
  const [build, paths] = await Promise.all([
    getBuild({ championId: me.championId, lane: me.position ?? undefined }).catch(() => null),
    me.position === 'jungle' ? getJunglePath(key).catch(() => null) : null
  ])
  return { championId: me.championId, key, side, order: build?.skillOrder ?? '', priority: build?.skillPriority ?? '', route: paths?.[side] ?? null }
}

// one throw must not end the loop: the next tick is always armed while this run is current
async function tick(id: number) {
  try {
    await step(id)
  } catch (e) {
    console.error('overlay tick', e)
  }
  if (id === run) timer = setTimeout(() => void tick(id), TICK_MS)
}

async function step(id: number) {
  const [ap, gs] = await Promise.all([liveGet('/liveclientdata/activeplayer'), liveGet('/liveclientdata/gamestats')])
  if (id !== run) return
  if (ap && gs) {
    if (!ctx && !initing && Date.now() >= initAt) {
      initing = true
      ctx = await init().catch((e) => (console.error('overlay init', e), null))
      initing = false
      if (id !== run) return
      if (!ctx) initAt = Date.now() + RETRY_MS
    }
    if (ctx) {
      const a = ap.abilities ?? {}
      const lv = (k: string) => Number(a[k]?.abilityLevel) || 0
      const overlay: OverlayState = {
        championId: ctx.championId,
        skill: nextSkill(ctx.order, ctx.priority, Number(ap.level) || 0, { Q: lv('Q'), W: lv('W'), E: lv('E'), R: lv('R') }, ctx.key),
        route: ctx.route,
        side: ctx.side,
        gameTime: Math.floor((Number(gs.gameTime) || 0) / 5) * 5 // the overlay only compares against minutes; 5 s steps spare the IPC
      }
      setState({ overlay })
      if (!shown) {
        win ??= createWindow()
        win.showInactive()
        win.setAlwaysOnTop(true, 'screen-saver')
        shown = true
      }
    }
  }
}

function start() {
  if (timer) return
  const id = ++run
  ctx = null
  initAt = 0
  timer = setTimeout(() => void tick(id), 0)
}

function stop() {
  const was = timer || shown
  run++
  if (timer) clearTimeout(timer)
  timer = null
  ctx = null
  initing = false
  win?.setIgnoreMouseEvents(true, { forward: true }) // never leave the game blocked by a stuck interactive state
  if (shown) win?.hide()
  shown = false
  if (was && getState().overlay) setState({ overlay: null })
}

export function destroyOverlay() {
  stop()
  win?.destroy()
  win = null
}

// follows the state: running while the game runs (a reconnect or loading screen keeps it) and the setting is on
export function initOverlay() {
  ipcMain.on(IPC.overlayMouse, (e, on: boolean) => {
    if (win && !win.isDestroyed() && e.sender === win.webContents) win.setIgnoreMouseEvents(!on, { forward: true })
  })
  onState((s) => {
    const inGame = s.phase === 'InProgress' || (!!timer && (s.phase === 'Reconnect' || s.phase === 'GameStart'))
    if (s.settings.overlay && inGame) start()
    else stop()
  })
}

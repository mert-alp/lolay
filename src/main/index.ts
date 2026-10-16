import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'
import { IPC } from '../shared/types.ts'
import type { ApplyRequest, BuildQuery, MetaQuery, RunePagesQuery, Settings } from '../shared/types.ts'
import { applyBuild } from './apply.ts'
import { registerDraftIpc } from './draftActions.ts'
import { stopLcu } from './lcu.ts'
import { onRiotReload } from './liveMatch.ts'
import { destroyOverlay, initOverlay } from './overlay.ts'
import { getMeta } from './meta.ts'
import { registerProfileIpc } from './profileIpc.ts'
import { readyCheckAction } from './readyCheck.ts'
import { riotStatus } from './riotService.ts'
import { builds, ddragon, getBuild, getRunePages, getStatic } from './services.ts'
import { startSession } from './session.ts'
import { loadSettings, startHidden, updateSettings } from './settings.ts'
import { getState, initState, onState, setState } from './state.ts'
import { getWindow, setWindow, showWindow } from './win.ts'

const ICON = join(app.getAppPath(), 'resources/icon.png')
const DATA_CHECK_MS = 6 * 60 * 60 * 1000
const MENU = {
  tr: { show: 'Göster', autoAccept: 'Otomatik kabul', quit: 'Çıkış' },
  en: { show: 'Show', autoAccept: 'Auto accept', quit: 'Quit' }
}

// first .env holding a RIOT_API_KEY wins: project root (dev), next to the portable exe, userData
let keyDir: string | null = null
const envDir = () => (app.isPackaged ? process.env.PORTABLE_EXECUTABLE_DIR ?? dirname(app.getPath('exe')) : app.getAppPath())
const status = async () => ({ ...(await riotStatus()), envPath: join(keyDir ?? envDir(), '.env') })

function reloadKey() {
  const dirs = [app.getAppPath(), process.env.PORTABLE_EXECUTABLE_DIR, dirname(app.getPath('exe')), app.getPath('userData')]
  for (const dir of dirs) {
    if (!dir) continue
    try {
      const key = parseEnv(readFileSync(join(dir, '.env'), 'utf8')).RIOT_API_KEY?.trim()
      if (key) return void ((process.env.RIOT_API_KEY = key), (keyDir = dir))
    } catch {}
  }
}

let quitting = false
let tray: Tray

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 380,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0e1015',
    show: false,
    icon: ICON,
    webPreferences: { preload: join(app.getAppPath(), 'out/preload/index.cjs'), sandbox: true, contextIsolation: true }
  })
  setWindow(win)
  win.once('ready-to-show', () => {
    if (!startHidden) win.show()
  })
  win.on('session-end', () => {
    quitting = true
  })
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(app.getAppPath(), 'out/renderer/index.html'))
}

function buildTrayMenu() {
  const { lang, settings } = getState()
  const t = MENU[lang]
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t.show, click: showWindow },
      {
        label: t.autoAccept,
        type: 'checkbox',
        checked: settings.autoAccept,
        click: (item) => setState({ settings: updateSettings({ autoAccept: item.checked }) })
      },
      { type: 'separator' },
      { label: t.quit, click: () => app.quit() }
    ])
  )
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 32, height: 32 }))
  tray.setToolTip('Lolay')
  tray.on('click', showWindow)
  let menuKey = ''
  const rebuild = () => {
    const { lang, settings } = getState()
    const key = `${lang}:${settings.autoAccept}`
    if (key === menuKey) return
    menuKey = key
    buildTrayMenu()
  }
  onState(rebuild)
  rebuild()
}

function registerIpc() {
  ipcMain.handle(IPC.getState, () => getState())
  ipcMain.handle(IPC.getStatic, () => getStatic())
  ipcMain.handle(IPC.getBuild, (e, q: BuildQuery) =>
    getBuild(q, (build) => {
      if (!e.sender.isDestroyed()) e.sender.send(IPC.buildRefreshed, build)
    })
  )
  ipcMain.handle(IPC.runePages, (_e, q: RunePagesQuery) => getRunePages(q))
  ipcMain.handle(IPC.meta, (_e, q: MetaQuery) => getMeta(q, ddragon.version()))
  ipcMain.handle(IPC.applyBuild, (_e, req: ApplyRequest) => applyBuild(req))
  ipcMain.handle(IPC.readyCheck, (_e, action: 'accept' | 'decline' | 'cancelAuto') => readyCheckAction(action))
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => {
    const settings = updateSettings(patch)
    setState({ settings })
    return settings
  })
  ipcMain.handle(IPC.riotStatus, status)
  ipcMain.handle(IPC.riotReload, async () => {
    reloadKey()
    const s = await status()
    onRiotReload()
    return s
  })
  registerDraftIpc()
  registerProfileIpc()
  ipcMain.on(IPC.windowControl, (_e, action: 'minimize' | 'maximize' | 'hide') => {
    const w = getWindow()
    if (action === 'maximize') w?.isMaximized() ? w.unmaximize() : w?.maximize() // toggle
    else w?.[action]()
  })
}

// a new patch invalidates cached builds
async function checkData() {
  try {
    if (await ddragon.checkVersion(getState().lang)) await builds.invalidate()
    setState({ dataVersion: ddragon.version() })
  } catch (e) {
    console.error('data version check failed', e)
  }
}

// errors also go to userData/lolay.log so problems seen in a real client session can be diagnosed afterwards
function mirrorErrorsToFile() {
  const file = join(app.getPath('userData'), 'lolay.log')
  try { if (statSync(file).size > 1_000_000) writeFileSync(file, '') } catch {}
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      orig(...args)
      const line = args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      try { appendFileSync(file, `${new Date().toISOString()} ${level} ${line}
`) } catch {}
    }
  }
}
mirrorErrorsToFile()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => {
    quitting = true
    stopLcu()
    destroyOverlay()
  })
  app.on('window-all-closed', () => {}) // live in the tray
  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    reloadKey()
    loadSettings()
    initState()
    initOverlay()
    registerIpc()
    createWindow()
    createTray()
    startSession()
    void checkData()
    setInterval(checkData, DATA_CHECK_MS)
  })
}

import { app } from 'electron'
import updater from 'electron-updater'
import { setState } from './state.ts'

const { autoUpdater } = updater // CommonJS package
const CHECK_MS = 6 * 60 * 60 * 1000 // the app lives in the tray for days

// New releases come from GitHub (latest.yml next to the setup exe), download in the background,
// and the window asks before restarting into them; quitting from the tray installs them too.
export function startUpdater() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return // dev run / portable exe: nothing to update
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (i) => setState({ update: { version: i.version, ready: false } }))
  autoUpdater.on('update-downloaded', (i) => setState({ update: { version: i.version, ready: true } }))
  autoUpdater.on('error', (e) => console.error('update', e))
  const check = () => void autoUpdater.checkForUpdates().catch((e) => console.error('update check', e))
  check()
  setInterval(check, CHECK_MS)
}

// silent install of the downloaded setup, then LoLo starts again
export const installUpdate = () => autoUpdater.quitAndInstall(true, true)

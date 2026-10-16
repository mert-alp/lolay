import type { BrowserWindow } from 'electron'

let win: BrowserWindow | null = null

export const setWindow = (w: BrowserWindow) => (win = w)
export const getWindow = () => win

export function showWindow() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

// champ select: bring the window to the front like Blitz (from tray, minimized or behind the client),
// without taking keyboard focus from the League client
export function showWindowInactive() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.showInactive()
  win.moveTop()
}

// ready check: briefly on top so it is seen over the client
export function flashOnTop() {
  if (!win) return
  showWindow()
  win.setAlwaysOnTop(true)
  setTimeout(() => win?.setAlwaysOnTop(false), 1000)
}

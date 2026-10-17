import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types.ts'
import type { LolayApi } from '../shared/types.ts'

const listen = <T>(channel: string, cb: (v: T) => void) => {
  const handler = (_: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, handler)
  return () => void ipcRenderer.off(channel, handler)
}

const api: LolayApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: (cb) => listen(IPC.state, cb),
  getStatic: () => ipcRenderer.invoke(IPC.getStatic),
  getBuild: (q) => ipcRenderer.invoke(IPC.getBuild, q),
  getRunePages: (q) => ipcRenderer.invoke(IPC.runePages, q),
  getMeta: (q) => ipcRenderer.invoke(IPC.meta, q),
  onBuildRefreshed: (cb) => listen(IPC.buildRefreshed, cb),
  applyBuild: (req) => ipcRenderer.invoke(IPC.applyBuild, req),
  readyCheck: (action) => ipcRenderer.invoke(IPC.readyCheck, action),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  riotStatus: () => ipcRenderer.invoke(IPC.riotStatus),
  riotReload: () => ipcRenderer.invoke(IPC.riotReload),
  windowControl: (action) => ipcRenderer.send(IPC.windowControl, action),
  draftRecommend: () => ipcRenderer.invoke(IPC.draftRecommend),
  searchPlayers: (q) => ipcRenderer.invoke(IPC.searchPlayers, q),
  profileGet: (q) => ipcRenderer.invoke(IPC.profileGet, q),
  profileMatches: (q) => ipcRenderer.invoke(IPC.profileMatches, q),
  profileMatch: (id) => ipcRenderer.invoke(IPC.profileMatch, id),
  draftPool: () => ipcRenderer.invoke(IPC.draftPool),
  draftHover: (id) => ipcRenderer.invoke(IPC.draftHover, id),
  draftLock: (id) => ipcRenderer.invoke(IPC.draftLock, id),
  draftBan: (id, complete) => ipcRenderer.invoke(IPC.draftBan, id, complete),
  draftSetSpells: (a, b) => ipcRenderer.invoke(IPC.draftSetSpells, a, b),
  queueNames: () => ipcRenderer.invoke(IPC.queueNames),
  draftBench: () => ipcRenderer.invoke(IPC.draftBench),
  draftBenchSwap: (id) => ipcRenderer.invoke(IPC.draftBenchSwap, id),
  draftReroll: () => ipcRenderer.invoke(IPC.draftReroll)
}

contextBridge.exposeInMainWorld('lolay', api)

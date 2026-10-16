import type { ReadyCheckState } from '../shared/types.ts'
import { request } from './lcu.ts'
import { getSettings } from './settings.ts'
import { getState, onState, setState } from './state.ts'
import { flashOnTop } from './win.ts'

const BASE = '/lol-matchmaking/v1/ready-check'
let autoTimer: NodeJS.Timeout | null = null

const clearAuto = () => {
  if (autoTimer) clearTimeout(autoTimer)
  autoTimer = null
}

onState((s) => {
  if (autoTimer && !s.settings.autoAccept) void readyCheckAction('cancelAuto')
})

const respond = (action: 'accept' | 'decline') => request('POST', `${BASE}/${action}`).catch((e) => console.error('ready-check', action, e))

export function onReadyCheck(data: { state?: string; playerResponse?: string; timer?: number } | null, eventType = 'Update') {
  const pending = eventType !== 'Delete' && data?.state === 'InProgress' && data.playerResponse === 'None'
  if (!pending) return resetReadyCheck()
  const prev = getState().readyCheck
  const rc: ReadyCheckState = { playerResponse: 'None', timer: data.timer ?? 0, autoAcceptAt: prev?.autoAcceptAt ?? null }
  if (!prev) {
    flashOnTop()
    const { autoAccept, autoAcceptDelay } = getSettings()
    if (autoAccept) {
      rc.autoAcceptAt = Date.now() + autoAcceptDelay * 1000
      autoTimer = setTimeout(() => {
        autoTimer = null
        void respond('accept')
      }, autoAcceptDelay * 1000)
    }
  }
  setState({ readyCheck: rc })
}

// accepted/declined elsewhere (e.g. in the client), ended, or connection lost
export function resetReadyCheck() {
  clearAuto()
  setState({ readyCheck: null })
}

export async function readyCheckAction(action: 'accept' | 'decline' | 'cancelAuto') {
  if (action === 'cancelAuto') {
    clearAuto()
    const rc = getState().readyCheck
    if (rc) setState({ readyCheck: { ...rc, autoAcceptAt: null } })
    return
  }
  clearAuto()
  await respond(action)
}

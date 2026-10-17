import type { Lane } from '../shared/types.ts'

// Only the fields of /lol-champ-select/v1/session we read
export interface CsSession {
  localPlayerCellId: number
  myTeam: { cellId: number; championId: number; championPickIntent: number; assignedPosition: string; spell1Id?: number; spell2Id?: number }[]
  theirTeam?: { championId: number; assignedPosition?: string }[]
  actions: { id?: number; actorCellId: number; type: string; completed: boolean; championId?: number; isInProgress?: boolean }[][]
  timer?: { adjustedTimeLeftInPhase?: number; isInfinite?: boolean } // not in a recorded fixture yet: optional everywhere
  benchChampions?: { championId: number }[] // ARAM
  rerollsRemaining?: number
}

export interface Selection {
  championId: number
  lane: Lane | null
  locked: boolean
  shouldApply: boolean
}

const LANE_BY_POSITION: Record<string, Lane> = { top: 'top', jungle: 'jungle', middle: 'middle', bottom: 'bottom', utility: 'support' }

export const selectionKey = (championId: number, lane: Lane | null) => `${championId}:${lane}`

export function deriveSelection(session: CsSession, prev: { appliedKey: string | null }): Selection {
  const me = session.myTeam?.find((p) => p.cellId === session.localPlayerCellId)
  if (!me) return { championId: 0, lane: null, locked: false, shouldApply: false }
  const championId = me.championId || me.championPickIntent || 0
  const lane = LANE_BY_POSITION[me.assignedPosition] ?? null
  const myPicks = (session.actions ?? []).flat().filter((a) => a.actorCellId === session.localPlayerCellId && a.type === 'pick')
  // blind / ARAM have no pick actions: a set championId means it is final
  const locked = myPicks.length ? myPicks.some((a) => a.completed) : me.championId > 0
  const shouldApply = locked && championId > 0 && selectionKey(championId, lane) !== prev.appliedKey
  return { championId, lane, locked, shouldApply }
}

export type MyPhase = 'ban' | 'pick' | 'waiting' | 'done'

// what I am doing in the draft: banning / picking now, waiting for a later action of mine, or finished
export function derivePhase(session: CsSession): MyPhase {
  const open = (session.actions ?? []).flat().filter((a) => a.actorCellId === session.localPlayerCellId && (a.type === 'ban' || a.type === 'pick') && !a.completed)
  const now = open.find((a) => a.isInProgress)
  return now ? (now.type === 'ban' ? 'ban' : 'pick') : open.length ? 'waiting' : 'done'
}

export interface Turn {
  pickActionId: number | null
  myTurn: boolean
  spell1Id: number
  spell2Id: number
}

// my pick action that can still be hovered/locked, and my summoner spell slots (spell1 = D, spell2 = F)
export function deriveTurn(session: CsSession): Turn {
  const me = session.myTeam?.find((p) => p.cellId === session.localPlayerCellId)
  const open = (session.actions ?? []).flat().find((a) => a.actorCellId === session.localPlayerCellId && a.type === 'pick' && !a.completed && typeof a.id === 'number')
  return { pickActionId: open?.id ?? null, myTurn: !!open?.isInProgress, spell1Id: me?.spell1Id ?? 0, spell2Id: me?.spell2Id ?? 0 }
}

// epoch ms when the current turn / phase runs out, from the client's countdown; null = unknown or no limit
export function phaseEndsAt(session: CsSession, now = Date.now()): number | null {
  const left = session.timer?.adjustedTimeLeftInPhase
  return !session.timer?.isInfinite && typeof left === 'number' && left > 0 ? now + left : null
}

// The alert fires once when my turn starts, not on every session update while it lasts.
// prev = the action id returned last time; key = my ban / pick action in progress now (null = not my turn)
export function turnStarted(prev: number | null, session: CsSession): { key: number | null; fire: boolean } {
  // TODO(kullanıcı): 5-10 satır
  return { key: prev, fire: false }
}

import { onChampSelect, resetChampSelect, setMapId } from './champSelectFlow.ts'
import * as lcu from './lcu.ts'
import { onLiveChampSelect, onLiveGameflow, onLivePhase, resetLive } from './liveMatch.ts'
import { onReadyCheck, resetReadyCheck, setQueueName } from './readyCheck.ts'
import { getState, setClientLocale, setState } from './state.ts'
import { showWindowInactive } from './win.ts'

async function get(path: string): Promise<any> {
  try {
    const res = await lcu.request('GET', path)
    return res.status >= 200 && res.status < 300 ? res.data : null
  } catch {
    return null
  }
}

async function loadSummoner() {
  const me = await get('/lol-summoner/v1/current-summoner') // 404 until the user is logged in
  if (!me) return
  const ranked = await get(`/lol-ranked/v1/ranked-stats/${me.puuid}`)
  if (getState().lcu !== 'connected') return
  const prev = getState().summoner
  if (!ranked && prev) return // request failed: keep the known rank
  const solo = ranked?.queueMap?.RANKED_SOLO_5x5
  const ranks = !!solo?.tier && solo.tier !== 'NONE'
  setState({
    summoner: {
      name: me.gameName || me.displayName || '',
      iconId: me.profileIconId ?? 0,
      soloTier: ranks ? solo.tier : null,
      soloDivision: ranks ? solo.division : null
    }
  })
}

function setPhase(data: unknown) {
  const phase = typeof data === 'string' ? data : 'None'
  setState({ phase })
  onLivePhase(phase)
  if (phase === 'ChampSelect') {
    showWindowInactive()
    // the session event may have arrived before the phase event and been ignored
    void get('/lol-champ-select/v1/session').then((cs) => cs && onChampSelect(cs))
  } else resetChampSelect()
  if (phase === 'EndOfGame') void loadSummoner()
}

const mapOf = (session: any) => Number(session?.gameData?.queue?.mapId) || 0
const queueOf = (session: any): string | undefined => session?.gameData?.queue?.description || session?.gameData?.queue?.shortName || undefined

async function onConnect() {
  setState({ lcu: 'connected' })
  setClientLocale((await get('/riotclient/region-locale'))?.locale ?? null)
  await loadSummoner()
  const flow = await get('/lol-gameflow/v1/session')
  setMapId(mapOf(flow))
  setQueueName(queueOf(flow))
  setPhase(await get('/lol-gameflow/v1/gameflow-phase'))
  const rc = await get('/lol-matchmaking/v1/ready-check')
  if (rc) onReadyCheck(rc)
  const cs = await get('/lol-champ-select/v1/session')
  if (cs) onChampSelect(cs)
}

function onDisconnect() {
  resetReadyCheck()
  resetChampSelect(true)
  resetLive()
  setMapId(0)
  setState({ lcu: 'disconnected', summoner: null, phase: 'None' })
}

export function startSession() {
  lcu.on('connect', () => onConnect().catch((e) => console.error('lcu connect', e)))
  lcu.on('disconnect', onDisconnect)
  lcu.subscribe('/lol-gameflow/v1/gameflow-phase', (data, type) => setPhase(type === 'Delete' ? null : data))
  lcu.subscribe('/lol-gameflow/v1/session', (data, type) => {
    setMapId(type === 'Delete' ? 0 : mapOf(data))
    setQueueName(type === 'Delete' ? undefined : queueOf(data))
    onLiveGameflow(data, type)
  })
  lcu.subscribe('/lol-matchmaking/v1/ready-check', onReadyCheck)
  lcu.subscribe('/lol-champ-select/v1/session', (data, type) => {
    if (type === 'Delete' || getState().phase === 'ChampSelect') onChampSelect(data, type)
    onLiveChampSelect(data, type)
  })
  lcu.subscribe('/lol-summoner/v1/current-summoner', () => void loadSummoner())
  lcu.startLcu()
}

import type { Lane, LivePlayer, MatchDetail, ProfileRank } from '../shared/types.ts'
import * as lcu from './lcu.ts'
import { playerList, type ClientPlayer } from './liveClient.ts'
import { fetchRiotData, GAME_BUDGET, type RiotData } from './liveRiot.ts'
import { fromChampSelect, fromGameflow, mergeActiveGame, sortByLane, toLane, type Roster, type RosterPlayer } from './liveRoster.ts'
import { createBlitzSummoner } from './providers/blitzSummoner.ts'
import { createOpggSummoner, type OpggChampStat } from './providers/opggSummoner.ts'
import { summarize, summaryFromRiot, summaryFromWeb, type MatchGame, type RankedStats, type Mastery } from './liveStats.ts'
import { platformOf, regionalOf, type ActiveGame, type Platform } from './riotApi.ts'
import { riotInvalid, riotUsable, riotWorking, tryRiot } from './riotService.ts'
import { setState } from './state.ts'

const TRACKED = new Set(['ChampSelect', 'GameStart', 'InProgress', 'Reconnect', 'WaitingForStats', 'PreEndOfGame'])
const IN_GAME = new Set(['GameStart', 'InProgress'])
const TTL_MS = 10 * 60_000
const RETRY_MS = 30_000 // a failed lookup is cached this long
const CONCURRENCY = 3
const HISTORY = 20
const CLIENT_POLL_MS = 5000
const CLIENT_POLL_TRIES = 12
const SPECTATOR_POLL_MS = 30_000 // spectator-v5 only knows the game some time after it starts
const SPECTATOR_TRIES = 8

// OP.GG (Blitz for the rank when OP.GG fails) by Riot ID is primary: the LCU only answers fully about me.
// The Riot API (needs a key) stays as the last resort.
type Raw = { at: number } & (
  | { src: 'web'; rank: ProfileRank | null; champs: Record<number, OpggChampStat> | null; games: MatchDetail[]; puuid: string; masteries: Mastery[] }
  | { src: 'lcu'; ranked: RankedStats | null; matches: MatchGame[]; masteries: Mastery[] }
  | { src: 'riot'; data: RiotData }
)

// own instances: the profile page's are local to its IPC module; both are cached and throttled per host
const opgg = createOpggSummoner()
const blitz = createBlitzSummoner()

const cache = new Map<string, Raw>()
const pending = new Set<string>()
const queue: string[] = []
let running = 0

let phase = 'None'
let roster: Roster | null = null
let me: { puuid: string; riotId: string | null } | null = null
const names = new Map<string, { name: string; tag: string }>()
const positions = new Map<string, Lane>()
const autofills = new Map<string, boolean>() // Riot's flag from champ select, kept for the game phase
const aliasTried = new Set<string>()
let clientTimer: NodeJS.Timeout | null = null
let clientDone = false

let platform: Platform | null = null
let spent = 0 // Riot API calls this game
const apis = new Map<string, string>() // roster puuid -> Riot API puuid
const tried = new Set<string>() // enemies already sent to the Riot API this game
let myApi: string | null = null
let active: ActiveGame | null = null // spectator-v5 view of the running game
let spectatorTimer: NodeJS.Timeout | null = null
let spectatorTries = 0

async function call(method: string, path: string, body?: unknown): Promise<any> {
  try {
    const res = await lcu.request(method, path, body)
    return res.status >= 200 && res.status < 300 ? res.data : null
  } catch {
    return null
  }
}

const spend = (n: number) => spent + n <= GAME_BUDGET && !!(spent += n)

async function platformNow() {
  if (!platform) platform = platformOf((await call('GET', '/riotclient/region-locale'))?.region ?? '')
  return platform
}

const enemyInGame = (p: RosterPlayer) => IN_GAME.has(phase) && !!roster?.enemy.some((e) => e.puuid === p.puuid)

async function lcuRaw(p: RosterPlayer): Promise<Raw | null> {
  const puuid = p.puuid!
  if (apis.get(puuid) === puuid) return null // known by its Riot API puuid only: the LCU cannot look it up
  const [ranked, history, mastery] = await Promise.all([
    call('GET', `/lol-ranked/v1/ranked-stats/${puuid}`),
    call('GET', `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=0&endIndex=${HISTORY - 1}`),
    call('GET', `/lol-champion-mastery/v1/${puuid}/champion-mastery`)
  ])
  const games: any[] = history?.games?.games ?? []
  if (!ranked && !games.length && !mastery) return null
  return {
    at: Date.now(),
    src: 'lcu',
    ranked,
    matches: games.map((g) => ({ queueId: g.queueId, gameCreation: g.gameCreation, gameDuration: g.gameDuration, participants: g.participants?.slice(0, 1) })),
    masteries: Array.isArray(mastery)
      ? mastery.map((m: any) => ({ championId: m.championId, championLevel: m.championLevel, championPoints: m.championPoints }))
      : []
  }
}

const lcuMastery = async (puuid: string): Promise<Mastery[]> => {
  const m = await call('GET', `/lol-champion-mastery/v1/${puuid}/champion-mastery`)
  return Array.isArray(m) ? m.map((x: any) => ({ championId: x.championId, championLevel: x.championLevel, championPoints: x.championPoints })) : []
}

// Riot ID -> OP.GG account -> season rank, season games per champion, last games; Blitz gives the rank when OP.GG fails
async function webRaw(p: RosterPlayer): Promise<Raw | null> {
  const puuid = p.puuid!
  let who = p.name && p.tag ? { name: p.name, tag: p.tag } : names.get(puuid)
  if (!who) {
    const s = await call('GET', `/lol-summoner/v2/summoners/puuid/${puuid}`)
    if (s?.gameName && s.tagLine) names.set(puuid, (who = { name: s.gameName, tag: s.tagLine }))
  }
  const plat = await platformNow()
  if (!who || !plat) return null
  try {
    const acc = await opgg.account(plat, who.name, who.tag)
    if (acc) {
      const [sum, champs, games, masteries] = await Promise.all([
        opgg.summary(plat, acc.puuid),
        opgg.champions(plat, acc.puuid).catch(() => null),
        opgg.games(plat, acc.puuid, 'TOTAL', HISTORY).catch(() => [] as MatchDetail[]),
        lcuMastery(puuid)
      ])
      return { at: Date.now(), src: 'web', rank: sum.solo, champs, games: games.slice(0, HISTORY), puuid: acc.puuid, masteries }
    }
  } catch (e) {
    console.error('live op.gg', who.name, e)
  }
  try {
    const b = await blitz.account(plat, who.name, who.tag)
    if (b) return { at: Date.now(), src: 'web', rank: b.solo, champs: null, games: [], puuid: b.puuid, masteries: await lcuMastery(puuid) }
  } catch (e) {
    console.error('live blitz', who.name, e)
  }
  return null
}

// Riot ID -> API puuid -> league, ranked games, mastery. null = unavailable (no key, rejected key, rate limit, unknown player).
async function riotRaw(p: RosterPlayer): Promise<Raw | null> {
  const puuid = p.puuid!
  const plat = riotUsable() ? await platformNow() : null
  if (!plat) return null
  const known = names.get(puuid)
  const name = p.name ?? known?.name
  const tag = p.tag ?? known?.tag
  let api = apis.get(puuid)
  if (!api && name && tag && spend(1)) {
    api = (await tryRiot((r) => r.resolve(name, tag, regionalOf(plat)))) ?? undefined
    if (api) apis.set(puuid, api)
  }
  if (!api) return null
  const data = await fetchRiotData(plat, api, p.championId, spend, (d) => {
    cache.set(puuid, { at: Date.now(), src: 'riot', data: d })
    publish()
  })
  return data && { at: Date.now(), src: 'riot', data }
}

async function fetchRaw(puuid: string) {
  const p = [...(roster?.my ?? []), ...(roster?.enemy ?? [])].find((x) => x.puuid === puuid)
  if (!p) return
  const enemy = enemyInGame(p)
  if (enemy) tried.add(puuid)
  let raw: Raw | null = null
  // the LCU's numbers for other players are not theirs to trust (wins without losses): only for me
  const mine = p.puuid === me?.puuid
  for (const step of mine ? [webRaw, lcuRaw, riotRaw] : [webRaw, riotRaw]) if ((raw = await step(p))) break
  cache.set(puuid, raw ?? { at: Date.now() - (TTL_MS - RETRY_MS), src: 'lcu', ranked: null, matches: [], masteries: [] })
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const puuid = queue.shift()!
    running++
    void fetchRaw(puuid).finally(() => {
      running--
      pending.delete(puuid)
      publish()
      pump()
    })
  }
}

function want(list: RosterPlayer[]) {
  for (const p of list) {
    const { puuid, bot } = p
    if (!puuid || bot || pending.has(puuid)) continue
    const raw = cache.get(puuid)
    // an enemy loaded from the LCU before the game started gets one Riot API pass
    const upgrade = raw?.src === 'lcu' && enemyInGame(p) && riotUsable() && !tried.has(puuid)
    if (raw && Date.now() - raw.at < TTL_MS && !upgrade) continue
    pending.add(puuid)
    queue.push(puuid)
  }
  pump()
}

async function resolveNames(list: RosterPlayer[]) {
  const todo = list.filter((p) => p.puuid && !p.name && !names.has(p.puuid) && !aliasTried.has(p.puuid)).map((p) => p.puuid!)
  todo.forEach((id) => aliasTried.add(id))
  if (!todo.length) return
  const data = await call('POST', '/lol-summoner/v1/summoner-aliases-by-puuids', todo)
  const rows: any[] = Array.isArray(data) ? data : Object.entries(data ?? {}).map(([puuid, v]) => ({ puuid, ...(v as object) }))
  for (const r of rows) if (r.gameName) names.set(r.puuid, { name: r.gameName, tag: r.tagLine ?? '' })
  await Promise.all(
    todo.filter((id) => !names.has(id)).map(async (id) => {
      const s = await call('GET', `/lol-summoner/v2/summoners/puuid/${id}`)
      if (s?.gameName) names.set(id, { name: s.gameName, tag: s.tagLine ?? '' })
    })
  )
  publish()
}

function player(p: RosterPlayer): LivePlayer {
  const known = p.puuid ? names.get(p.puuid) : undefined
  const position = p.position ?? (p.puuid ? positions.get(p.puuid) ?? null : null)
  const raw = p.puuid ? cache.get(p.puuid) : undefined
  const autofilled = p.autofilled ?? (p.puuid ? autofills.get(p.puuid) : undefined)
  return {
    ...p,
    autofilled,
    name: p.name ?? known?.name ?? null,
    tag: p.tag ?? known?.tag ?? null,
    position,
    summary: !raw
      ? null
      : raw.src === 'web'
        ? summaryFromWeb(raw.rank, raw.champs, raw.games, raw.puuid, raw.masteries, p.championId, position, autofilled)
        : raw.src === 'riot'
          ? summaryFromRiot(raw.data.league, raw.data.matches, raw.data.puuid, raw.data.masteries, p.championId, position, autofilled)
          : { ...summarize(raw.ranked, raw.matches, raw.masteries, p.championId, position, autofilled), source: 'lcu' }
  }
}

function publish() {
  if (!roster || !TRACKED.has(phase)) return setState({ live: null })
  const my = sortByLane(roster.my.map(player))
  const enemy = sortByLane(roster.enemy.map(player))
  setState({
    live: { phase, myTeam: my, enemyTeam: enemy, bans: roster.bans, loading: [...my, ...enemy].some((p) => p.puuid && !p.summary), riotInvalid: riotInvalid() || undefined }
  })
}

function setRoster(next: Roster) {
  const merged = active && me?.riotId ? mergeActiveGame(next, active, me.riotId) : null
  merged?.apiPuuid.forEach((api, puuid) => apis.set(puuid, api))
  roster = merged?.roster ?? next
  const all = [...roster.my, ...roster.enemy]
  for (const p of all) {
    if (p.puuid && p.position) positions.set(p.puuid, p.position)
    if (p.puuid && p.autofilled !== undefined) autofills.set(p.puuid, p.autofilled)
  }
  publish()
  want(all)
  void resolveNames(all)
}

function reset() {
  roster = null
  names.clear()
  positions.clear()
  autofills.clear()
  aliasTried.clear()
  clientDone = false
  stopClientPoll()
  stopSpectator()
  active = null
  spent = 0
  apis.clear()
  tried.clear()
  setState({ live: null })
}

function matchClientList(list: ClientPlayer[]) {
  for (const p of roster ? [...roster.my, ...roster.enemy].map(player) : []) {
    const c = !p.name ? undefined : list.find((x) => x.riotIdGameName?.toLowerCase() === p.name?.toLowerCase() && (x.riotIdTagLine ?? '').toLowerCase() === (p.tag ?? '').toLowerCase())
    const lane = toLane(c?.position)
    if (p.puuid && lane) positions.set(p.puuid, lane)
  }
  publish()
}

// positions are only known once the game client is up; names come from the LCU
function startClientPoll() {
  if (clientTimer || clientDone) return
  let tries = 0
  const tick = async () => {
    clientTimer = null
    const list = await playerList()
    if (list) {
      clientDone = true
      return matchClientList(list)
    }
    if (++tries < CLIENT_POLL_TRIES && phase === 'InProgress') clientTimer = setTimeout(tick, CLIENT_POLL_MS)
  }
  clientTimer = setTimeout(tick, 2000)
}

function stopClientPoll() {
  if (clientTimer) clearTimeout(clientTimer)
  clientTimer = null
}

// once the game runs, spectator-v5 (my API puuid, then the game) names all ten players; the timer stays set while a poll is in flight
async function pollSpectator() {
  const riotId = me?.riotId
  const [name, tag] = (riotId ?? '').split('#')
  let retry = !!riotId && !active && IN_GAME.has(phase) && riotWorking() && ++spectatorTries < SPECTATOR_TRIES
  const plat = retry && riotUsable() ? await platformNow() : null
  if (plat) {
    if (!myApi && spend(1)) myApi = await tryRiot((r) => r.resolve(name, tag, regionalOf(plat)))
    if (myApi && spend(1)) active = await tryRiot((r) => r.activeGame(plat, myApi!))
    if (active && IN_GAME.has(phase)) {
      retry = false
      if (roster) setRoster(roster)
    }
  }
  spectatorTimer = retry && IN_GAME.has(phase) ? setTimeout(pollSpectator, SPECTATOR_POLL_MS) : null
}

function startSpectator() {
  if (!spectatorTimer && !active) spectatorTimer = setTimeout(pollSpectator, 0)
}

function stopSpectator() {
  if (spectatorTimer) clearTimeout(spectatorTimer)
  spectatorTimer = null
  spectatorTries = 0
}

async function applyGameflow(gf: any) {
  if (!IN_GAME.has(gf?.phase)) return
  if (!me) {
    const s = await call('GET', '/lol-summoner/v1/current-summoner')
    me = s?.puuid ? { puuid: s.puuid, riotId: s.gameName && s.tagLine ? `${s.gameName}#${s.tagLine}` : null } : null
  }
  setRoster(fromGameflow(gf, me?.puuid ?? null))
  startSpectator()
}

export function onLivePhase(next: string) {
  phase = next
  if (!TRACKED.has(next)) return reset()
  if (next === 'ChampSelect') void call('GET', '/lol-champ-select/v1/session').then(onLiveChampSelect)
  if (IN_GAME.has(next)) void call('GET', '/lol-gameflow/v1/session').then(applyGameflow)
  if (next === 'InProgress') startClientPoll()
  else stopClientPoll()
  publish()
}

export function onLiveChampSelect(cs: any, eventType = 'Update') {
  if (phase !== 'ChampSelect' || eventType === 'Delete' || !cs) return
  setRoster(fromChampSelect(cs))
}

export function onLiveGameflow(gf: any, eventType = 'Update') {
  if (eventType !== 'Delete') void applyGameflow(gf)
}

// the key was re-read: retry everything the Riot API could not answer
export function onRiotReload() {
  cache.clear()
  tried.clear()
  spent = 0
  spectatorTries = 0
  if (!roster) return
  publish()
  want([...roster.my, ...roster.enemy])
  if (IN_GAME.has(phase)) startSpectator()
}

export function resetLive() {
  phase = 'None'
  me = null
  platform = null
  myApi = null
  reset()
}

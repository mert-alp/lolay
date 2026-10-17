import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/types.ts'
import type { MatchesQuery, ProfileQuery, SearchQuery } from '../shared/types.ts'
import * as lcu from './lcu.ts'
import { createPlayerIndex, createPlayerSearch } from './playerSearch.ts'
import { createBlitzSummoner } from './providers/blitzSummoner.ts'
import { createOpggSummoner } from './providers/opggSummoner.ts'
import { createProfile, safe } from './profile.ts'
import { detailFromLcu, detailFromRiot, entryOf } from './profileStats.ts'
import { platformOf } from './riotApi.ts'
import type { Platform } from './riotApi.ts'
import { riot } from './riotService.ts'
import { getState, onState, setState } from './state.ts'
import type { MatchDetail } from '../shared/types.ts'

async function lcuGet(path: string): Promise<any> {
  try {
    const res = await lcu.request('GET', path)
    return res.status >= 200 && res.status < 300 ? res.data : null
  } catch {
    return null
  }
}

export function registerProfileIpc() {
  const cache = join(app.getPath('userData'), 'cache')
  const index = createPlayerIndex({ file: join(cache, 'players.json') })
  // key-less backends first (Blitz, OP.GG), the Riot API only as the last resort
  const blitz = createBlitzSummoner()
  const opgg = createOpggSummoner()
  const svc = createProfile({ api: riot, lcuGet, cacheDir: join(cache, 'matches'), seen: (p) => void index.add(p), blitz, opgg, hint: (n, t) => index.platformOf(n, t) })
  void svc.prune()

  // region and tag of the signed-in account steer name searches
  const mine: { platform: Platform; tag?: string } = { platform: 'tr1' }
  async function refreshMine() {
    const me = await lcuGet('/lol-summoner/v1/current-summoner')
    if (me?.tagLine) mine.tag = me.tagLine
    const p = platformOf(String((await lcuGet('/riotclient/region-locale'))?.region ?? ''))
    if (p) mine.platform = p
  }
  const search = createPlayerSearch({
    index,
    api: riot,
    platform: () => mine.platform,
    myTag: () => mine.tag,
    opgg,
    blitz,
    friends: async () => ((await lcuGet('/lol-chat/v1/friends')) ?? []).map((f: any) => ({ gameName: f.gameName, tagLine: f.gameTag }))
  })

  // everyone in a live game or champ select becomes searchable
  onState((s) => {
    if (s.live) void index.add([...s.live.myTeam, ...s.live.enemyTeam].flatMap((p) => (p.name && p.tag ? [{ gameName: p.name, tagLine: p.tag }] : [])))
  })
  app.on('before-quit', () => void index.flush())

  // ---- end of game: the match from Blitz (the League client's own copy until Blitz has it), then fresh profile lists
  let lastPhase = ''
  let postGameRun = 0
  onState((s) => {
    if (s.phase === lastPhase) return
    const prev = lastPhase
    lastPhase = s.phase
    if (s.phase === 'ChampSelect' && s.postGame) setState({ postGame: null })
    if ((s.phase === 'EndOfGame' || s.phase === 'PreEndOfGame') && prev !== 'EndOfGame' && prev !== 'PreEndOfGame') void postGame(++postGameRun)
  })

  const POST_TRIES = 18 // every 10 s for 3 minutes: Blitz usually has the match within one or two
  async function postGame(run: number) {
    const [flow, me] = await Promise.all([lcuGet('/lol-gameflow/v1/session'), lcuGet('/lol-summoner/v1/current-summoner')])
    const gameId = Number(flow?.gameData?.gameId)
    if (!gameId || !me?.puuid) return
    await refreshMine()
    const id = `${mine.platform.toUpperCase()}_${gameId}`
    const who = { puuid: me.puuid, gameName: me.gameName, tagLine: me.tagLine }
    const show = async (d: MatchDetail, src: 'blitz' | 'lcu') => {
      await svc.remember(d)
      const entry = entryOf(d, who)
      if (entry && run === postGameRun) setState({ postGame: { id, entry, src } })
      return !!entry
    }
    setState({ postGame: { id, entry: null, src: null } })
    let lcuShown = false
    for (let i = 0; i < POST_TRIES && run === postGameRun && getState().postGame?.id === id; i++) {
      const m = await blitz.match(id).catch(() => null)
      if (m && (await show(detailFromRiot(m), 'blitz'))) break
      if (!lcuShown) {
        const g = await lcuGet(`/lol-match-history/v1/games/${gameId}`)
        const d = g && detailFromLcu(g, mine.platform)
        if (d) lcuShown = await show(d, 'lcu')
      }
      blitz.clear() // the 404 is cached otherwise
      await new Promise((r) => setTimeout(r, 10_000))
    }
    // the profile's lists: OP.GG re-crawls my account, Blitz is asked again
    const acc = me.gameName && me.tagLine ? await opgg.account(mine.platform, me.gameName, me.tagLine).catch(() => null) : null
    if (acc) await opgg.renew(mine.platform, acc.puuid).catch(() => {})
  }

  ipcMain.handle(IPC.searchPlayers, async (_e, q: SearchQuery) => {
    await refreshMine()
    return search.search({ query: String(q?.query ?? ''), deep: !!q?.deep })
  })
  ipcMain.handle(IPC.profileGet, (_e, q: 'me' | ProfileQuery) => safe(() => svc.get(q)))
  ipcMain.handle(IPC.profileMatches, (_e, q: MatchesQuery) => safe(() => svc.matches(q)))
  ipcMain.handle(IPC.profileMatch, (_e, id: string) => safe(() => svc.match(String(id))))

  // modes newer than the app's own labels ("Diğer" otherwise); kept once the client has answered
  let queues: Record<number, string> | null = null
  ipcMain.handle(IPC.queueNames, async () => {
    if (queues) return queues
    const list = await lcuGet('/lol-game-queues/v1/queues')
    const names: Record<number, string> = Object.fromEntries((Array.isArray(list) ? list : []).filter((q) => q?.id && q.description).map((q) => [q.id, String(q.description)]))
    if (Object.keys(names).length) queues = names
    return names
  })
}

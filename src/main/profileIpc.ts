import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/types.ts'
import type { MatchesQuery, ProfileQuery, SearchQuery } from '../shared/types.ts'
import * as lcu from './lcu.ts'
import { createPlayerIndex, createPlayerSearch } from './playerSearch.ts'
import { createBlitzSummoner } from './providers/blitzSummoner.ts'
import { createOpggSummoner } from './providers/opggSummoner.ts'
import { createProfile, safe } from './profile.ts'
import { platformOf } from './riotApi.ts'
import type { Platform } from './riotApi.ts'
import { riot } from './riotService.ts'
import { onState } from './state.ts'

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

  ipcMain.handle(IPC.searchPlayers, async (_e, q: SearchQuery) => {
    await refreshMine()
    return search.search({ query: String(q?.query ?? ''), deep: !!q?.deep })
  })
  ipcMain.handle(IPC.profileGet, (_e, q: 'me' | ProfileQuery) => safe(() => svc.get(q)))
  ipcMain.handle(IPC.profileMatches, (_e, q: MatchesQuery) => safe(() => svc.matches(q)))
  ipcMain.handle(IPC.profileMatch, (_e, id: string) => safe(() => svc.match(String(id))))
}

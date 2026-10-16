import { LANES } from '../shared/types.ts'
import type { Lane, LivePlayer } from '../shared/types.ts'
import type { ActiveGame } from './riotApi.ts'

export type RosterPlayer = Omit<LivePlayer, 'summary'>
export interface Roster {
  my: RosterPlayer[]
  enemy: RosterPlayer[]
  bans?: { my: number[]; their: number[] }
}

const POSITIONS: Record<string, Lane> = { top: 'top', jungle: 'jungle', middle: 'middle', mid: 'middle', bottom: 'bottom', utility: 'support', support: 'support' }
export const toLane = (p: unknown): Lane | null => POSITIONS[String(p ?? '').toLowerCase()] ?? null

const spellsOf = (...ids: unknown[]) => ids.filter((n): n is number => typeof n === 'number' && n > 0)

// stable: players without a known lane keep their order, after the known ones
export function sortByLane<T extends { position: Lane | null }>(list: T[]): T[] {
  const rank = (p: T) => (p.position ? LANES.indexOf(p.position) : LANES.length)
  return list.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p)
}

// completed bans per side: the session's ban lists once filled, else the completed ban actions
export function bansOf(cs: any): { my: number[]; their: number[] } {
  const ids = (a: unknown): number[] => (Array.isArray(a) ? a : []).filter((n): n is number => typeof n === 'number' && n > 0)
  const done: any[] = (cs?.actions ?? []).flat().filter((a: any) => a?.type === 'ban' && a.completed && a.championId > 0)
  const side = (list: unknown, ally: boolean) => {
    const v = ids(list)
    return v.length ? v : done.filter((a) => !!a.isAllyAction === ally).map((a) => a.championId as number)
  }
  return { my: side(cs?.bans?.myTeamBans, true), their: side(cs?.bans?.theirTeamBans, false) }
}

// /lol-champ-select/v1/session. Hidden names (enemies in ranked, anonymous allies) get no puuid: nothing is looked up for them.
export function fromChampSelect(cs: any): Roster {
  const mk = (p: any, team: string): RosterPlayer => {
    const hidden = p.nameVisibilityType === 'HIDDEN' || (team === 'their' && !p.puuid)
    // bots carry a puuid but no summoner: strictly 0 and no name, so a missing field never makes a human a bot
    const bot = !hidden && p.summonerId === 0 && !p.gameName
    const puuid: string | null = !hidden && !bot && p.puuid ? p.puuid : null
    return {
      key: puuid ?? `${team}-${p.cellId}`,
      puuid,
      championId: p.championId || p.championPickIntent || 0,
      spells: spellsOf(p.spell1Id, p.spell2Id),
      position: toLane(p.assignedPosition),
      name: hidden ? null : p.gameName || null,
      tag: hidden ? null : p.tagLine || null,
      hidden,
      bot,
      autofilled: team === 'my' && typeof p.isAutofilled === 'boolean' ? p.isAutofilled : undefined,
      me: team === 'my' && p.cellId === cs.localPlayerCellId
    }
  }
  return { my: (cs?.myTeam ?? []).map((p: any) => mk(p, 'my')), enemy: (cs?.theirTeam ?? []).map((p: any) => mk(p, 'their')), bans: bansOf(cs) }
}

// /lol-gameflow/v1/session during GameStart / InProgress
export function fromGameflow(gf: any, myPuuid: string | null): Roster {
  const gd = gf?.gameData
  const picks = new Map<string, any>((gd?.playerChampionSelections ?? []).map((s: any) => [s.puuid || s.summonerInternalName, s]))
  const mk = (p: any, team: number, i: number): RosterPlayer => {
    const bot = (!!p.botDifficulty && p.botDifficulty !== 'NONE') || (p.summonerId === 0 && !p.summonerName)
    const sel = bot ? undefined : picks.get(p.puuid) ?? picks.get(p.summonerInternalName)
    const [name, tag] = String(p.summonerName ?? '').split('#')
    const puuid: string | null = !bot && p.puuid ? p.puuid : null
    return {
      key: puuid ?? `${team}-${i}`,
      puuid,
      championId: p.championId || sel?.championId || 0,
      spells: spellsOf(sel?.spell1Id, sel?.spell2Id),
      position: toLane(p.selectedPosition),
      name: name || null,
      tag: tag || null,
      hidden: false,
      bot,
      me: !!myPuuid && p.puuid === myPuuid
    }
  }
  const one: RosterPlayer[] = (gd?.teamOne ?? []).map((p: any, i: number) => mk(p, 1, i))
  const two: RosterPlayer[] = (gd?.teamTwo ?? []).map((p: any, i: number) => mk(p, 2, i))
  return two.some((p) => p.me) ? { my: two, enemy: one } : { my: one, enemy: two }
}

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase()
const sameId = (p: RosterPlayer, riotId?: string) => {
  const [name, tag = ''] = (riotId ?? '').split('#')
  return !!riotId && !!p.name && lower(p.name) === lower(name) && (!p.tag || lower(p.tag) === lower(tag))
}

// spectator-v5 lists all ten players: it completes the enemy team (names, champions, spells) and gives every human's Riot API puuid
// (roster puuid -> API puuid). Enemies it adds get the API puuid as their own. null = I am not in this game.
export function mergeActiveGame(r: Roster, game: ActiveGame, myRiotId: string): { roster: Roster; apiPuuid: Map<string, string> } | null {
  const me = game.participants.find((x) => lower(x.riotId) === lower(myRiotId))
  if (!me) return null
  const apiPuuid = new Map<string, string>()
  for (const p of r.my) {
    const part = game.participants.find((x) => x.teamId === me.teamId && sameId(p, x.riotId))
    if (p.puuid && part) apiPuuid.set(p.puuid, part.puuid)
  }
  const bots = r.enemy.filter((p) => p.bot)
  let b = 0
  const enemy = game.participants.filter((x) => x.teamId !== me.teamId).map((part, i): RosterPlayer => {
    if (part.bot) {
      const old = bots[b++]
      return old ? { ...old, championId: old.championId || part.championId } : { key: `bot-${i}`, puuid: null, championId: part.championId, spells: [], position: null, name: null, tag: null, hidden: false, bot: true, me: false }
    }
    const old = r.enemy.find((p) => !p.bot && sameId(p, part.riotId))
    const [name, tag] = (part.riotId ?? '').split('#')
    const base: RosterPlayer = old ?? { key: part.puuid, puuid: part.puuid, championId: 0, spells: [], position: null, name: null, tag: null, hidden: false, bot: false, me: false }
    apiPuuid.set(base.puuid ?? part.puuid, part.puuid)
    return {
      ...base,
      championId: base.championId || part.championId,
      spells: base.spells.length ? base.spells : spellsOf(part.spell1Id, part.spell2Id),
      name: base.name ?? (name || null),
      tag: base.tag ?? (tag || null)
    }
  })
  return { roster: { ...r, enemy }, apiPuuid }
}

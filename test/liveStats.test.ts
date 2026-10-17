import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { bansOf, fromChampSelect, fromGameflow, mergeActiveGame, sortByLane } from '../src/main/liveRoster.ts'
import { summarize, summaryFromRiot, summaryFromWeb, type MatchGame } from '../src/main/liveStats.ts'
import type { ActiveGame, LeagueEntry, Match } from '../src/main/riotApi.ts'
import { damagePct, teamDamage } from '../src/shared/damage.ts'

// newest first via gameCreation; lane/role as the LCU reports them
const game = (i: number, win: boolean, championId: number, lane = 'MIDDLE', kda: [number, number, number] = [5, 2, 7], queueId = 420): MatchGame => ({
  queueId,
  gameCreation: 1_000_000 - i,
  gameDuration: 1800,
  participants: [{ championId, stats: { win, kills: kda[0], deaths: kda[1], assists: kda[2] }, timeline: { lane, role: 'SOLO' } }]
})
const ranked = { queueMap: { RANKED_SOLO_5x5: { tier: 'EMERALD', division: 'II', leaguePoints: 45, wins: 60, losses: 50 } } }
const masteries = [{ championId: 103, championLevel: 7, championPoints: 123456 }]

test('rank, record and mastery', () => {
  const s = summarize(ranked, [], masteries, 103, null)
  assert.deepEqual(s.rank, { tier: 'EMERALD', division: 'II', lp: 45 })
  assert.equal(s.wins, 60)
  assert.deepEqual(s.mastery, { level: 7, points: 123456 })
  assert.equal(s.recent.length, 0)
  assert.equal(s.kda, null)
  assert.equal(summarize({ queueMap: { RANKED_SOLO_5x5: { tier: 'NONE' } } }, [], [], 1, null).rank, null)
  assert.equal(summarize(null, [], [], 1, null).mastery, null)
})

test('window, remakes, kda and champion record', () => {
  const matches = [
    ...Array.from({ length: 25 }, (_, i) => game(i, i % 2 === 0, i < 6 ? 103 : 7)),
    { ...game(99, true, 103), gameDuration: 200 } // remake is ignored
  ]
  const s = summarize(ranked, matches, masteries, 103, null)
  assert.equal(s.recent.length, 20)
  assert.equal(s.recent[0], true)
  assert.deepEqual(s.avg, [5, 2, 7])
  assert.equal(s.kda, 6)
  assert.deepEqual(s.champ, { games: 6, wins: 3 })
})

test('streaks need three in a row', () => {
  const run = (wins: boolean[]) => summarize(null, wins.map((w, i) => game(i, w, i)), [], 0, null).streak
  assert.equal(run([true, true, true, true, false]), 4)
  assert.equal(run([false, false, false, true]), -3)
  assert.equal(run([true, true, false]), 0)
})

test('otp needs a real sample and 60% on one champion', () => {
  const games = (champs: number[]) => champs.map((c, i) => game(i, true, c))
  assert.ok(summarize(null, games([1, 1, 1, 1, 1, 1, 2, 3, 4, 5]), [], 0, null).tags.includes('otp'))
  assert.ok(!summarize(null, games([1, 1, 1, 1, 1, 2, 3, 4, 5, 6]), [], 0, null).tags.includes('otp'))
  assert.ok(!summarize(null, games([1, 1, 1]), [], 0, null).tags.includes('otp'))
})

test('autofill and off-role from games in the assigned lane', () => {
  const lanes = (l: string[]) => l.map((lane, i) => game(i, true, i, lane))
  const mid12 = lanes(Array(12).fill('MIDDLE'))
  assert.deepEqual(summarize(null, mid12, [], 0, 'top').tags, ['autofill'])
  assert.deepEqual(summarize(null, mid12, [], 0, 'middle').tags, [])
  // 2 of 10 top games = 20%: off-role, not autofill
  assert.deepEqual(summarize(null, lanes([...Array(8).fill('MIDDLE'), 'TOP', 'TOP']), [], 0, 'top').tags, ['offrole'])
  // too few role-tagged games to judge (ARAM games carry no lane)
  const aram = Array.from({ length: 12 }, (_, i) => game(i, true, i, 'MIDDLE', [1, 1, 1], 450))
  assert.deepEqual(summarize(null, aram, [], 0, 'top').tags, [])
  assert.equal(summarize(null, aram, [], 0, 'top').roles.length, 0)
})

test('roles split bottom lane by support role and rank by share', () => {
  const sup: MatchGame = game(0, true, 1, 'BOTTOM')
  sup.participants![0].timeline!.role = 'DUO_SUPPORT'
  const s = summarize(null, [sup, game(1, true, 2, 'BOTTOM'), game(2, true, 3, 'BOTTOM'), game(3, true, 4, 'TOP')], [], 0, null)
  assert.deepEqual(s.roles, [{ lane: 'bottom', pct: 50 }, { lane: 'support', pct: 25 }, { lane: 'top', pct: 25 }])
})

test('roster from champ select hides enemy and anonymous identities', () => {
  const r = fromChampSelect({
    localPlayerCellId: 1,
    myTeam: [
      { cellId: 0, puuid: 'a', gameName: 'Ann', tagLine: 'TR1', assignedPosition: 'utility', championId: 0, championPickIntent: 412, spell1Id: 4, spell2Id: 14 },
      { cellId: 1, puuid: 'b', gameName: 'Me', tagLine: 'X', assignedPosition: 'top', championId: 86 },
      { cellId: 2, puuid: 'c', nameVisibilityType: 'HIDDEN', assignedPosition: 'jungle' }
    ],
    theirTeam: [{ cellId: 5, puuid: '', championId: 0, championPickIntent: 238, nameVisibilityType: 'HIDDEN' }]
  })
  assert.deepEqual(r.my.map((p) => [p.puuid, p.me, p.championId, p.position]), [['a', false, 412, 'support'], ['b', true, 86, 'top'], [null, false, 0, 'jungle']])
  assert.deepEqual(r.my[0].spells, [4, 14])
  assert.deepEqual(r.enemy.map((p) => [p.puuid, p.hidden, p.championId]), [[null, true, 238]])
  assert.deepEqual(sortByLane(r.my).map((p) => p.position), ['top', 'jungle', 'support'])
})

test('roster from gameflow puts my team first', () => {
  const gf = {
    gameData: {
      teamOne: [{ puuid: 'e1', summonerName: 'Foe#001', championId: 238 }],
      teamTwo: [{ puuid: 'me', summonerName: 'Me#TR1', championId: 103, selectedPosition: 'MIDDLE' }],
      playerChampionSelections: [{ puuid: 'me', championId: 103, spell1Id: 4, spell2Id: 12 }]
    }
  }
  const r = fromGameflow(gf, 'me')
  assert.equal(r.my[0].me, true)
  assert.deepEqual([r.my[0].name, r.my[0].tag, r.my[0].position, r.my[0].spells], ['Me', 'TR1', 'middle', [4, 12]])
  assert.equal(r.enemy[0].puuid, 'e1')
  assert.equal(fromGameflow(gf, null).my[0].puuid, 'e1')
})

const bots = JSON.parse(readFileSync(new URL('./fixtures/cs-bots.json', import.meta.url), 'utf8'))

test('custom game vs bots: four bots, one human (me)', () => {
  const r = fromChampSelect(bots)
  assert.deepEqual(r.my.map((p) => p.bot), [false, true, true, true, true])
  assert.deepEqual([r.my[0].me, r.my[0].puuid, r.my[0].name, r.my[0].tag], [true, 'human-puuid', 'schelter', 'vv9'])
  // bots get no puuid (nothing is looked up) but keep their champion and lane
  assert.ok(r.my.slice(1).every((p) => p.puuid === null && !p.me && !p.hidden && p.championId > 0))
  assert.deepEqual(r.my.slice(1).map((p) => p.position), ['jungle', 'middle', 'top', 'bottom'])
  assert.equal(new Set(r.my.map((p) => p.key)).size, 5)
})

test('hidden enemies are neither bots nor looked up', () => {
  const r = fromChampSelect(bots)
  assert.equal(r.enemy.length, 5)
  assert.ok(r.enemy.every((p) => p.hidden && !p.bot && p.puuid === null && p.name === null && p.autofilled === undefined))
})

test('Riot isAutofilled is carried for allies; a missing flag stays unknown', () => {
  const cs = structuredClone(bots)
  cs.myTeam[2].isAutofilled = true
  assert.deepEqual(fromChampSelect(cs).my.map((p) => p.autofilled), [false, false, true, false, false])
  delete cs.myTeam[0].isAutofilled
  assert.equal(fromChampSelect(cs).my[0].autofilled, undefined)
  // an ally with a hidden name and no summonerId is anonymous, not a bot
  assert.equal(fromChampSelect({ localPlayerCellId: 0, myTeam: [{ cellId: 1, nameVisibilityType: 'HIDDEN' }], theirTeam: [] }).my[0].bot, false)
})

test('autofill flag wins over the lane heuristic', () => {
  const mid12 = Array.from({ length: 12 }, (_, i) => game(i, true, i, 'MIDDLE'))
  assert.deepEqual(summarize(null, [], [], 0, null, true).tags, ['autofill']) // flag alone is enough
  assert.deepEqual(summarize(null, mid12, [], 0, 'top', false).tags, ['offrole']) // Riot says not autofilled
  assert.deepEqual(summarize(null, mid12, [], 0, 'top', undefined).tags, ['autofill']) // unknown: heuristic
})

test('gameflow bots: difficulty or no summoner, never a lookup', () => {
  const gf = {
    gameData: {
      teamOne: [
        { puuid: 'p1', summonerName: 'Me#TR1', summonerId: 7, championId: 1 },
        { puuid: 'b1', summonerName: '', summonerId: 0, championId: 2 },
        { puuid: '', summonerName: 'Annie Bot', botDifficulty: 'EASY', championId: 3 }
      ],
      teamTwo: [{ puuid: 'b2', summonerName: '', summonerId: 0, championId: 4 }]
    }
  }
  const r = fromGameflow(gf, 'p1')
  assert.deepEqual(r.my.map((p) => [p.bot, p.puuid]), [[false, 'p1'], [true, null], [true, null]])
  assert.deepEqual(r.enemy.map((p) => [p.bot, p.puuid]), [[true, null]])
  assert.equal(new Set([...r.my, ...r.enemy].map((p) => p.key)).size, 4)
})

test('bans: session lists, else completed ban actions per side', () => {
  assert.deepEqual(bansOf({ bans: { myTeamBans: [1, 0, 2], theirTeamBans: [3] } }), { my: [1, 2], their: [3] })
  const actions = [[
    { type: 'ban', completed: true, championId: 10, isAllyAction: true },
    { type: 'ban', completed: true, championId: 11, isAllyAction: false },
    { type: 'ban', completed: false, championId: 12, isAllyAction: false },
    { type: 'pick', completed: true, championId: 13, isAllyAction: true }
  ]]
  assert.deepEqual(bansOf({ bans: { myTeamBans: [], theirTeamBans: [] }, actions }), { my: [10], their: [11] })
  assert.deepEqual(bansOf(bots), { my: [], their: [] }) // fixture: no bans in a custom game
  assert.deepEqual(fromChampSelect({ localPlayerCellId: 0, myTeam: [], theirTeam: [], actions }).bans, { my: [10], their: [11] })
})

test('damage split: normalized per champion, equal weight in the team', () => {
  assert.equal(damagePct(null), null)
  assert.equal(damagePct({ physical: 0, magic: 0, true: 0 }), null)
  const p = damagePct({ physical: 1743.28, magic: 18307.37, true: 5419.53 })!
  assert.ok(Math.abs(p.physical + p.magic + p.true - 100) < 1e-9)
  assert.ok(p.magic > 70 && p.physical < 8)
  const team = teamDamage([{ physical: 100, magic: 0, true: 0 }, { physical: 0, magic: 5000, true: 0 }, null, undefined])!
  assert.deepEqual(team, { pct: { physical: 50, magic: 50, true: 0 }, n: 2 })
  assert.equal(teamDamage([null]), null)
})

// hand-made match-v5 documents: only the fields summaryFromRiot reads
const riotMatch = (i: number, o: { win: boolean; championId?: number; pos?: string; k?: number; d?: number; a?: number; queueId?: number; duration?: number }): Match =>
  ({
    metadata: { matchId: `TR1_${i}`, participants: ['me', 'other'] },
    info: {
      gameCreation: 2_000_000 - i,
      gameDuration: o.duration ?? 1700,
      queueId: o.queueId ?? 420,
      participants: [
        { puuid: 'other', championId: 1, teamPosition: 'TOP', win: !o.win, kills: 9, deaths: 9, assists: 9 },
        { puuid: 'me', championId: o.championId ?? 103, teamPosition: o.pos ?? 'MIDDLE', win: o.win, kills: o.k ?? 6, deaths: o.d ?? 2, assists: o.a ?? 8 }
      ]
    }
  }) as unknown as Match
const solo = { queueType: 'RANKED_SOLO_5x5', tier: 'DIAMOND', rank: 'IV', leaguePoints: 33, wins: 80, losses: 70 } as LeagueEntry
const flex = { queueType: 'RANKED_FLEX_SR', tier: 'GOLD', rank: 'I', leaguePoints: 1, wins: 5, losses: 5 } as LeagueEntry
const riotMastery = { puuid: 'me', championId: 103, championLevel: 8, championPoints: 99000, lastPlayTime: 0 }

test('summaryFromRiot: rank, form, kda, champion and mastery from the official API shapes', () => {
  const matches = [
    riotMatch(0, { win: true }),
    riotMatch(1, { win: true }),
    riotMatch(2, { win: true, championId: 7, k: 2, d: 2, a: 2 }),
    riotMatch(3, { win: false, duration: 200 }), // remake
    riotMatch(4, { win: false, championId: 7, k: 2, d: 2, a: 2 })
  ]
  const s = summaryFromRiot([flex, solo], matches, 'me', [riotMastery], 103, null)
  assert.equal(s.source, 'riot')
  assert.deepEqual(s.rank, { tier: 'DIAMOND', division: 'IV', lp: 33 })
  assert.deepEqual([s.wins, s.losses], [80, 70])
  assert.deepEqual(s.recent, [true, true, true, false])
  assert.equal(s.streak, 3)
  assert.deepEqual(s.champ, { games: 2, wins: 2 })
  assert.deepEqual(s.mastery, { level: 8, points: 99000 })
  assert.deepEqual(s.avg, [4, 2, 5])
  assert.equal(s.kda, 4.5) // (16 kills + 20 assists) / 8 deaths
})

test('summaryFromRiot: unranked, no games, other participants ignored', () => {
  const s = summaryFromRiot([flex], [], 'me', [], 103, null)
  assert.equal(s.rank, null)
  assert.deepEqual([s.recent.length, s.kda, s.mastery], [0, null, null])
  assert.equal(summaryFromRiot([], [riotMatch(0, { win: true })], 'nobody', [], 103, null).recent.length, 0)
})

test('summaryFromRiot: teamPosition feeds roles, off-role and autofill', () => {
  const games = (pos: string[]) => pos.map((p, i) => riotMatch(i, { win: true, pos: p, championId: i }))
  const mid = games(Array(12).fill('MIDDLE'))
  assert.deepEqual(summaryFromRiot([], mid, 'me', [], 0, 'top').tags, ['autofill'])
  assert.deepEqual(summaryFromRiot([], mid, 'me', [], 0, 'top', false).tags, ['offrole'])
  const s = summaryFromRiot([], games(['BOTTOM', 'BOTTOM', 'UTILITY', 'JUNGLE']), 'me', [], 0, null)
  assert.deepEqual(s.roles, [{ lane: 'bottom', pct: 50 }, { lane: 'support', pct: 25 }, { lane: 'jungle', pct: 25 }])
  const aram = summaryFromRiot([], [riotMatch(0, { win: true, queueId: 450, pos: '' })], 'me', [], 0, null)
  assert.equal(aram.roles.length, 0)
})

const part = (puuid: string, riotId: string, teamId: number, championId: number, bot = false) => ({ puuid, riotId, championId, teamId, bot, spell1Id: 4, spell2Id: 14 })
const active = (parts: ReturnType<typeof part>[]) => ({ participants: parts }) as unknown as ActiveGame

test('mergeActiveGame completes the enemy team and maps API puuids', () => {
  const gf = {
    gameData: {
      teamOne: [{ puuid: 'lcu-me', summonerName: 'Me#TR1', championId: 103 }, { puuid: 'lcu-ally', summonerName: 'Ally#X', championId: 86 }],
      teamTwo: [{ puuid: 'lcu-foe', summonerName: 'Foe#001', championId: 238 }]
    }
  }
  const r = fromGameflow(gf, 'lcu-me')
  const game = active([
    part('api-me', 'Me#TR1', 100, 103),
    part('api-ally', 'ally#x', 100, 86),
    part('api-foe', 'foe#001', 200, 238),
    part('api-foe2', 'Newbie#777', 200, 51)
  ])
  const m = mergeActiveGame(r, game, 'me#tr1')!
  assert.deepEqual(m.roster.enemy.map((p) => [p.puuid, p.name, p.tag, p.championId, p.spells]), [['lcu-foe', 'Foe', '001', 238, [4, 14]], ['api-foe2', 'Newbie', '777', 51, [4, 14]]])
  assert.deepEqual([...m.apiPuuid], [['lcu-me', 'api-me'], ['lcu-ally', 'api-ally'], ['lcu-foe', 'api-foe'], ['api-foe2', 'api-foe2']])
  assert.equal(m.roster.my[0].me, true)
  // merging an already merged roster changes nothing
  assert.deepEqual(mergeActiveGame(m.roster, game, 'me#tr1')!.roster, m.roster)
  // not in this game
  assert.equal(mergeActiveGame(r, game, 'someone#else'), null)
})

test('mergeActiveGame: enemy bots keep their slot, no puuid', () => {
  const r = { my: [], enemy: [{ key: 'b', puuid: null, championId: 32, spells: [], position: null, name: null, tag: null, hidden: false, bot: true, me: false }] }
  const m = mergeActiveGame(r, active([part('api-me', 'Me#T', 100, 1), part('', '', 200, 32, true), part('', '', 200, 33, true)]), 'me#t')!
  assert.deepEqual(m.roster.enemy.map((p) => [p.bot, p.puuid, p.championId]), [[true, null, 32], [true, null, 33]])
})

test('summaryFromWeb: season W/L from the rank, champion season stats, recent games from the player\'s own side', () => {
  const p = (puuid: string, teamId: number, championId: number) => ({ puuid, name: '', tag: '', championId, teamId, position: 'middle' as const, level: 18, kills: 5, deaths: 2, assists: 7, cs: 200, vision: 20, wards: 8, damage: 20000, gold: 12000, items: [], spells: [], keystone: 0, tree: 0 })
  const game = (i: number, myTeamWins: boolean) => ({
    id: `TR1_${i}`, queueId: 420, at: 1000 - i, duration: 1800,
    players: [p('me', 100, 103), p('foe', 200, 238)],
    teams: [{ teamId: 100, win: myTeamWins, kills: 0, gold: 0, objectives: { baron: 0, dragon: 0, herald: 0, tower: 0, inhibitor: 0 } }, { teamId: 200, win: !myTeamWins, kills: 0, gold: 0, objectives: { baron: 0, dragon: 0, herald: 0, tower: 0, inhibitor: 0 } }]
  })
  const s = summaryFromWeb({ tier: 'EMERALD', division: 'IV', lp: 63, wins: 112, losses: 96 }, { 103: { games: 14, wins: 9, kda: 4.4 } }, [game(1, true), game(2, false), game(3, true)], 'me', [], 103, 'middle')
  assert.deepEqual([s.wins, s.losses, s.rank?.tier], [112, 96, 'EMERALD'])
  assert.deepEqual(s.recent, [true, false, true])
  assert.deepEqual(s.champ, { games: 14, wins: 9, kda: 4.4, season: true })
  assert.equal(s.source, 'opgg')
  assert.deepEqual(summaryFromWeb(null, null, [], 'me', [], 103, null).champ, { games: 0, wins: 0 })
})

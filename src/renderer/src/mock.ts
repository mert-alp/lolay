// Dev-only fallback so the renderer can be previewed in a plain browser (no Electron preload).
// Hash flags: #readycheck, #champselect (no pick yet: Öneriler tab), #champselect-ban (same, my ban turn; the Tüm Şampiyonlar tab picks bans), #champselect-hover (hovering Ekko vs the enemy Vi: Build tab, "Ekko vs Vi" page first), #champselect-locked (locked, mid-import), #live (in game), #livecs (champ select roster), #connected (empty live page)
import { LANES } from '@shared/types'
import { mockProfileGet, mockProfileMatch, mockProfileMatches, mockSearch } from './mockProfile'
import type { AppState, Build, DraftChamp, DraftRecommendation, Damage, Lane, LiveMatchState, LivePlayer, LolayApi, Matchup, MetaQuery, MetaResult, MetaRow, PlayerSummary, Settings, Source, StaticData } from '@shared/types'

const DD = 'https://ddragon.leagueoflegends.com'
const stat = (wr: number, n: number, pr?: number) => ({ wr, n, pr })
const mu = (ids: number[], wr0: number): Matchup[] => ids.map((championId, i) => ({ championId, wr: +(wr0 + (i % 2 ? -0.7 : 0.4) * (i + 1) * (wr0 > 50 ? 1 : -1)).toFixed(2), n: 6200 - i * 1100 }))

function ahri(lane: Lane, source: Source): Build {
  return {
    championId: 103, slug: 'ahri', lane, defaultLane: 'middle', tier: source === 'metasrc' ? 'all' : 'emerald_plus', source, patch: '16.20',
    wr: 51.84, pr: 9.6, br: 4.3, games: 165412, tierLabel: 'S',
    runes: [
      { ...stat(52.1, 98200), perks: [8112, 8139, 8140, 8106, 8226, 8210, 5005, 5008, 5001] },
      { ...stat(54.6, 6100), perks: [8112, 8126, 8140, 8135, 8226, 8210, 5008, 5010, 5011] },
      { ...stat(51.2, 5400), label: 'Fırtına Çağrısı', source: 'opgg', perks: [8214, 8226, 8210, 8237, 8139, 8135, 5008, 5008, 5001] },
      { ...stat(53.0, 2100), label: 'Çevik Ayak', source: 'opgg', perks: [8369, 8304, 8321, 8347, 8226, 8210, 5008, 5010, 5011] },
      { ...stat(52.8, 1), source: 'pro', label: 'Faker', player: { name: 'Faker', team: 'T1', region: 'KR', when: Date.now() - 3 * 36e5 }, perks: [8112, 8139, 8138, 8135, 8226, 8210, 5005, 5008, 5001] },
      { ...stat(50.0, 1), source: 'pro', label: 'Chovy', player: { name: 'Chovy', team: 'GEN', region: 'KR', when: Date.now() - 2 * 864e5 }, perks: [8214, 8226, 8210, 8236, 8143, 8135, 5008, 5010, 5011] }
    ],
    spells: [{ ...stat(52.0, 120000, 71.2), ids: [4, 14] }, { ...stat(50.9, 31000, 18.4), ids: [4, 12] }],
    startItems: [{ ...stat(52.2, 80000, 60), ids: [1056, 2003] }, { ...stat(51.5, 20000, 15), ids: [1056, 2003, 2003] }],
    core: { ...stat(53.4, 70000, 40), ids: [3118, 3020, 4645] },
    boots: [{ id: 3020, ...stat(52.4, 90000, 70) }, { id: 3158, ...stat(51.1, 20000, 15) }, { id: 3111, ...stat(49.8, 4000, 3) }],
    item4: [{ id: 3157, ...stat(55.1, 30000) }, { id: 3089, ...stat(54.2, 28000) }, { id: 3135, ...stat(53.0, 9000) }],
    item5: [{ id: 3089, ...stat(56.1, 20000) }, { id: 3135, ...stat(55.2, 15000) }, { id: 3157, ...stat(54.4, 11000) }],
    item6: [{ id: 3135, ...stat(57.0, 8000) }, { id: 3165, ...stat(56.1, 6000) }, { id: 3102, ...stat(55.3, 4000) }],
    skillPriority: 'QWE', skillOrder: 'WQEQQRQWQWRWWEE',
    counters: { strong: mu([13, 61, 69], 53), weak: mu([142, 1, 245], 47) },
    partial: false, fetchedAt: Date.now()
  }
}

const form = (s: string) => s.split('').map((c) => c === 'W')
function sum(o: Omit<Partial<PlayerSummary>, 'recent'> & { recent: string }): PlayerSummary {
  return {
    rank: { tier: 'EMERALD', division: 'II', lp: 45 }, wins: 88, losses: 71, avg: [6.1, 4.2, 7.3], kda: 3.2,
    champ: { games: 4, wins: 3 }, mastery: { level: 7, points: 184230 }, roles: [{ lane: 'middle', pct: 70 }, { lane: 'bottom', pct: 20 }],
    tags: [], streak: 0, ...o, recent: form(o.recent)
  }
}
const pl = (key: string, championId: number, position: Lane | null, name: string | null, tag: string | null, summary: PlayerSummary | null, extra: Partial<LivePlayer> = {}): LivePlayer => ({
  key, puuid: key, championId, spells: [4, 14], position, name, tag, hidden: false, bot: false, me: false, summary, ...extra
})
const noData = sum({ recent: '', avg: null, kda: null, champ: { games: 0, wins: 0 }, roles: [], rank: null, wins: 0, losses: 0 })

function liveState(cs: boolean): LiveMatchState {
  const my: LivePlayer[] = [
    pl('a1', 86, 'top', 'IronGaren', 'TR1', sum({ recent: 'WWWWLWLWWLWWLWWLWLWW', streak: 4, rank: { tier: 'PLATINUM', division: 'I', lp: 72 }, roles: [{ lane: 'top', pct: 85 }, { lane: 'middle', pct: 10 }], mastery: { level: 10, points: 412900 }, champ: { games: 9, wins: 6 }, kda: 2.6, avg: [4.8, 4.9, 7.9] })),
    pl('a2', 64, 'jungle', 'Pelin', 'jg', sum({ recent: 'LWLLLWLWLLLWLWLLWLWL', streak: -3, rank: { tier: 'GOLD', division: 'III', lp: 18 }, wins: 41, losses: 49, tags: ['offrole'], roles: [{ lane: 'jungle', pct: 20 }, { lane: 'top', pct: 50 }], mastery: { level: 4, points: 22100 }, champ: { games: 1, wins: 0 }, kda: 1.9, avg: [3.9, 5.8, 7.1] })),
    pl('a3', 103, 'middle', 'Schelter', 'TR1', sum({ recent: 'WLWWLWWLLWWWLWLWWLWW', rank: { tier: 'EMERALD', division: 'IV', lp: 63 }, wins: 112, losses: 96, tags: ['otp'], champ: { games: 14, wins: 9 }, mastery: { level: 9, points: 301500 }, kda: 4.4, avg: [7.9, 3.8, 8.8], roles: [{ lane: 'middle', pct: 92 }] }), { me: true, spells: [4, 12] }),
    pl('a4', 222, 'bottom', 'adc_main', '4242', sum({ recent: 'WWLLWLLWWLLLWWLWLLWL', rank: { tier: 'MASTER', division: 'NA', lp: 211 }, wins: 240, losses: 188, tags: ['autofill'], roles: [{ lane: 'middle', pct: 65 }, { lane: 'support', pct: 30 }], champ: { games: 0, wins: 0 }, mastery: null, kda: 3.1, avg: [8.2, 5.5, 8.9] })),
    pl('a5', 412, 'support', 'Zeynep', 'sup', null)
  ]
  const foe = (i: number, id: number, pos: Lane | null, name: string | null, tag: string | null, s: PlayerSummary | null) => pl(`e${i}`, id, pos, name, tag, s && { ...s, source: 'riot' })
  const enemy: LivePlayer[] = cs
    ? [254, 11, 51, 117, 157].map((id, i) => ({ key: `e${i}`, puuid: null, championId: i === 3 ? 0 : id, spells: [], position: null, name: null, tag: null, hidden: true, bot: false, me: false, summary: null }))
    : [
        foe(1, 157, 'top', 'Yasuo4Life', 'EUW', sum({ recent: 'LLWLWLLWLLLWLLWWLLWL', streak: -3, rank: { tier: 'SILVER', division: 'II', lp: 9 }, wins: 77, losses: 90, tags: ['otp'], roles: [{ lane: 'top', pct: 55 }, { lane: 'middle', pct: 45 }], champ: { games: 15, wins: 6 }, mastery: { level: 12, points: 701900 }, kda: 1.7, avg: [6.4, 8.1, 7.3] })),
        foe(2, 11, 'jungle', 'Alpha', 'tr', sum({ recent: 'WWWLWWLWWWLWWLWWWLWW', rank: { tier: 'DIAMOND', division: 'IV', lp: 0 }, wins: 160, losses: 121, champ: { games: 6, wins: 5 }, kda: 4.8, avg: [8.1, 3.9, 10.6], roles: [{ lane: 'jungle', pct: 95 }] })),
        foe(3, 238, 'middle', 'Kuzgun', '666', sum({ recent: 'WLWLLWLWLLWWLLWLWLLW', rank: { tier: 'CHALLENGER', division: 'NA', lp: 842 }, wins: 311, losses: 230, champ: { games: 11, wins: 7 }, kda: 5.3, avg: [10.1, 4.2, 6.4], mastery: { level: 14, points: 1204000 }, roles: [{ lane: 'middle', pct: 80 }] })),
        foe(4, 51, 'bottom', 'x', 'xx', null),
        foe(5, 117, 'support', 'NoHistory', 'TR1', noData)
      ]
  return { phase: cs ? 'ChampSelect' : 'InProgress', myTeam: my, enemyTeam: enemy, loading: true }
}

// champ select preview: me + 2 hidden allies (champion stats only) + 1 loading + 1 bot
function csStrip(): LiveMatchState {
  const base = liveState(true)
  const bot = pl('bot1', 32, 'jungle', null, null, null, { puuid: null, bot: true })
  const hid = (key: string, championId: number, position: Lane) => ({ ...pl(key, championId, position, null, null, null), puuid: null, hidden: true })
  const swap: Record<string, LivePlayer> = { a2: bot, a1: hid('a1', 24, 'top'), a4: hid('a4', 18, 'bottom') }
  return { ...base, myTeam: base.myTeam.map((p) => swap[p.key] ?? p), bans: { my: [4, 55, 91], their: [64, 7, 84, 99, 21] } }
}

const DAMAGE: Record<number, Damage> = {
  86: { physical: 15000, magic: 2000, true: 3500 },
  103: { physical: 1743.28, magic: 18307.37, true: 5419.53 },
  222: { physical: 21000, magic: 600, true: 900 },
  412: { physical: 4000, magic: 9000, true: 1200 }
}

const cache = new Map<string, Promise<StaticData>>()
async function loadStatic(lang: 'tr' | 'en'): Promise<StaticData> {
  const key = lang
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const loc = lang === 'tr' ? 'tr_TR' : 'en_US'
      const version: string = (await (await fetch(`${DD}/api/versions.json`)).json())[0]
      const j = (p: string) => fetch(`${DD}/cdn/${version}/data/${loc}/${p}`).then((r) => r.json())
      const CD = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global'
      const perks: any[] = await fetch(`${CD}/${lang === 'tr' ? 'tr_tr' : 'default'}/v1/perks.json`).then((r) => r.json()).catch(() => [])
      const [ch, it, sp, ru] = await Promise.all([j('champion.json'), j('item.json'), j('summoner.json'), j('runesReforged.json')])
      const data: StaticData = { version, lang, champions: {}, items: {}, runes: {}, trees: [], spells: {} }
      for (const c of Object.values<any>(ch.data)) data.champions[+c.key] = { key: +c.key, id: c.id, name: c.name }
      for (const [id, v] of Object.entries<any>(it.data)) data.items[+id] = { name: v.name, gold: v.gold.total, desc: v.description || v.plaintext || '' }
      for (const s of Object.values<any>(sp.data)) data.spells[+s.key] = { key: +s.key, id: s.id, name: s.name, desc: s.description, cd: String(s.cooldownBurn) }
      for (const tr of ru as any[]) {
        const icon = (p: string) => `${DD}/cdn/img/${p}`
        data.trees.push({ id: tr.id, name: tr.name, icon: icon(tr.icon), slots: tr.slots.map((s: any) => s.runes.map((r: any) => r.id)) })
        for (const s of tr.slots) for (const r of s.runes) data.runes[r.id] = { id: r.id, name: r.name, icon: icon(r.icon), styleId: tr.id, desc: r.longDesc || r.shortDesc || '' }
      }
      for (const p of perks) {
        if (p.id < 5000 || p.id >= 6000) continue
        const file = String(p.iconPath).split('/').pop()!.toLowerCase()
        data.runes[p.id] = { id: p.id, name: p.name, icon: `${CD}/default/v1/perk-images/statmods/${file}`, styleId: 0, desc: p.longDesc || p.shortDesc || '' }
      }
      return data
    })())
  }
  return cache.get(key)!
}

// deterministic fake tier list: every champion has a main lane, some also flex into others
const rnd = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }
const TIER_LABELS = ['S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C']
async function metaMock(q: MetaQuery, lang: 'tr' | 'en'): Promise<MetaResult> {
  await new Promise((r) => setTimeout(r, 450))
  const ids = Object.keys((await loadStatic(lang)).champions).map(Number)
  const tierShift = (['all', 'gold_plus', 'platinum_plus', 'emerald_plus'].indexOf(q.tier) - 3) * 0.12
  const rows: MetaRow[] = []
  for (const id of ids) {
    const main = LANES[Math.floor(rnd(id) * 5)]
    for (const lane of q.lane === 'all' ? [main] : [q.lane]) {
      const flex = lane !== main
      if (flex && rnd(id + lane.length * 31) > 0.14) continue
      const s = id * 5 + LANES.indexOf(lane)
      const pr = flex ? 0.4 + rnd(s + 1) * 1.6 : 0.8 + rnd(s + 1) ** 2.2 * 17
      const wr = +(47 + rnd(s + 2) * 7.4 + tierShift + (flex ? 0 : 0.4)).toFixed(2)
      const dWr = +((rnd(s + 3) - 0.5) * (rnd(s + 4) > 0.85 ? 3.2 : 1.1)).toFixed(2)
      rows.push({
        championId: id, tier: '', rank: 0, lane, pctLane: flex ? 3 + rnd(s + 5) * 14 : 72 + rnd(s + 5) * 26,
        wr, delta: +(wr - 50.3 + (rnd(s + 6) - 0.5)).toFixed(2), pr: +pr.toFixed(2), br: +(rnd(s + 7) ** 3 * 28).toFixed(2),
        games: Math.round(pr * 17500), dWr, dPr: +((rnd(s + 8) - 0.5) * 1.2).toFixed(2)
      })
    }
  }
  // Lolalytics ranks per lane; rare flex picks stay unranked
  for (const lane of LANES) {
    const laneRows = rows.filter((r) => r.lane === lane && (q.lane !== 'all' || r.pctLane > 60) && r.pr >= 0.8).sort((a, b) => b.wr + b.pr * 0.05 - (a.wr + a.pr * 0.05))
    laneRows.forEach((r, i) => { r.rank = i + 1; r.tier = TIER_LABELS[Math.min(TIER_LABELS.length - 1, Math.floor((i / laneRows.length) * 10.5))] })
  }
  const ranked = rows.filter((r) => r.rank > 0)
  const eligible = ranked.filter((r) => r.pr >= 1).sort((a, b) => b.dWr! - a.dWr!)
  return {
    patch: '16.20', previousPatch: '16.19', rows: ranked,
    movers: { kind: 'patch', up: eligible.slice(0, 5).map((r) => r.championId), down: eligible.slice(-5).reverse().map((r) => r.championId) }
  }
}

const pick = (championId: number, score: number, tier: string, wr: number, vs: number | null, points: number) => ({ championId, score, tier, wr, delta: +(wr - 50.8).toFixed(2), pr: 6.2, vs, points })
const rate = (championId: number, tier: string, wr: number, pr: number, br: number, out = false): DraftChamp => ({ championId, tier, wr, pr, br, out })
const POOL = Array.from({ length: 900 }, (_, i) => i + 1)
const REC: DraftRecommendation = {
  watch: [rate(103, 'S', 52.9, 9.6, 4.3), rate(238, 'A+', 51.2, 12.1, 21.4), { ...rate(157, '', 0, 0, 0), none: true }],
  popular: [rate(238, 'A+', 51.2, 12.1, 21.4), rate(103, 'S', 52.9, 9.6, 4.3), rate(134, 'A+', 52.6, 8.4, 3.1), rate(112, 'S', 52.2, 7.9, 1.2), rate(7, 'A+', 52.4, 7.1, 6.8), rate(61, 'C-', 50.3, 6.5, 0.6), rate(84, 'B+', 50.9, 6.1, 9.9), rate(69, 'B', 50.5, 5.2, 2.4)],
  myBans: [rate(157, 'B', 49.9, 4.8, 33.5), rate(238, 'A+', 51.2, 12.1, 21.4), rate(84, 'B+', 50.9, 6.1, 9.9, true)],
  favoriteVs: { 103: 53.4, 61: 48.7, 134: 51.9 },
  banned: [rate(157, 'B', 49.9, 4.8, 33.5), rate(238, 'A+', 51.2, 12.1, 21.4), rate(91, 'A', 52.0, 3.7, 19.8, true), rate(84, 'B+', 50.9, 6.1, 9.9, true), rate(7, 'A+', 52.4, 7.1, 6.8), rate(103, 'S', 52.9, 9.6, 4.3), rate(134, 'A+', 52.6, 8.4, 3.1), rate(69, 'B', 50.5, 5.2, 2.4)],
  banActionId: null,
  myBanTurn: false,
  favorites: [103, 61, 134, 238, 84, 7, 245],
  enemyId: 254,
  enemyJungleId: null,
  counters: [[11, 56.9, 1840, 'S'], [60, 55.8, 960, 'A+'], [77, 55.1, 2100, 'A'], [121, 54.3, 1200, 'S-'], [28, 53.8, 640, 'A-'], [5, 53.2, 880, 'B+']].map(([championId, vs, n, tier]) => ({ championId, vs, n, tier })) as DraftRecommendation['counters'],
  picks: [pick(103, 84, 'S', 52.9, 53.1, 301500), pick(134, 77, 'A+', 52.6, 51.2, 120400), pick(112, 74, 'S', 52.2, 50.4, 18600), pick(61, 69, 'C-', 50.3, 49.1, 241900), pick(7, 66, 'A+', 52.4, null, 40200), pick(84, 58, 'B+', 50.9, 47.6, 9800)]
}

export function installMock() {
  let settings: Settings = {
    lang: null, tierOverride: null, source: 'lolalytics',
    autoImport: { runes: true, spells: true, items: true },
    autoAccept: false, autoAcceptDelay: 2, flashOn: 'F', startWithWindows: false,
    watchlist: [103, 238, 157], spellPrefs: {}, runePrefs: {}, banHistory: { 157: 6, 238: 4, 84: 2 }
  }
  const listeners = new Set<(s: AppState) => void>()
  let picked = 0 // champion hovered through the mock API
  let spells: [number, number] = [4, 14]
  const state = (): AppState => {
    const h = location.hash
    const cs = h.includes('champselect')
    const ban = h.includes('champselect-ban')
    const live = h.includes('livecs') ? liveState(true) : h.includes('#live') ? liveState(false) : cs ? csStrip() : null
    return {
      lcu: cs || live || h.includes('readycheck') || h.includes('connected') ? 'connected' : 'disconnected',
      summoner: h.includes('connected') || cs || live || h.includes('readycheck') ? { name: 'Schelter', iconId: 1, soloTier: 'EMERALD', soloDivision: 'IV' } : null,
      phase: h.includes('readycheck') ? 'ReadyCheck' : cs ? 'ChampSelect' : live ? live.phase : 'None',
      readyCheck: h.includes('readycheck') ? { playerResponse: 'None', timer: 2, autoAcceptAt: Date.now() + 3200, queue: 'Dereceli Tek/Çift', bgChampionId: 103 } : null,
      live,
      champSelect: cs
        ? h.includes('locked')
          ? { championId: 245, lane: 'jungle', locked: true, imported: false, importing: true, importResult: { runes: 'ok', spells: 'ok' }, autoImportAllowed: true, spell1Id: spells[0], spell2Id: spells[1], pickActionId: null, myTurn: false, phase: 'done' }
          : { championId: picked || (h.includes('hover') ? 245 : 0), lane: 'jungle', locked: false, imported: false, importing: false, importResult: null, autoImportAllowed: true, spell1Id: spells[0], spell2Id: spells[1], pickActionId: 8, myTurn: !ban, phase: ban ? 'ban' : 'pick' }
        : null,
      settings,
      lang: settings.lang ?? 'tr',
      tier: settings.tierOverride ?? 'emerald_plus',
      dataVersion: '16.20.1'
    }
  }
  const emit = () => listeners.forEach((l) => l(state()))
  addEventListener('hashchange', emit)
  const api: LolayApi = {
    getState: async () => state(),
    riotStatus: async () => ({ hasKey: true, valid: true, envPath: 'C:/lolay/.env' }),
    riotReload: async () => ({ hasKey: true, valid: true, envPath: 'C:/lolay/.env' }),
    onState: (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    getStatic: () => loadStatic(state().lang),
    getBuild: async (q) => { await new Promise((r) => setTimeout(r, 400)); return { ...ahri(q.lane ?? 'middle', settings.source), championId: q.championId, damage: DAMAGE[q.championId] ?? null } },
    getRunePages: async (q) => {
      await new Promise((r) => setTimeout(r, 300))
      const runes = ahri(q.lane, settings.source).runes
      if (!q.vsLaner) return runes
      const names = (await loadStatic(state().lang)).champions
      return [{ ...stat(54.1, 1636), label: `${names[q.championId]?.name} vs ${names[q.vsLaner]?.name}`, vs: q.vsLaner, source: 'lolalytics', perks: [8128, 8143, 8140, 8135, 8347, 8304, 5005, 5008, 5001] }, ...runes]
    },
    getMeta: (q) => metaMock(q, state().lang),
    applyBuild: async () => ({ runes: 'ok', spells: 'ok', items: 'ok' }),
    readyCheck: async () => {},
    setSettings: async (p) => { settings = { ...settings, ...p }; emit(); return settings },
    onBuildRefreshed: () => () => {},
    windowControl: () => {},
    draftRecommend: async () => { await new Promise((r) => setTimeout(r, 300)); return location.hash.includes('champselect-ban') ? { ...REC, banActionId: 3, myBanTurn: true } : REC },
    searchPlayers: mockSearch,
    profileGet: mockProfileGet,
    profileMatches: mockProfileMatches,
    profileMatch: mockProfileMatch,
    draftPool: async () => ({ pickable: POOL.filter((id) => id % 7 !== 0), bannable: POOL }),
    draftHover: async (id) => { picked = id; emit(); return true },
    draftLock: async () => true,
    draftBan: async () => true,
    draftSetSpells: async (a, b) => { spells = [a, b]; if (a === 4 || b === 4) settings = { ...settings, flashOn: b === 4 ? 'F' : 'D' }; emit(); return true }
  }
  window.lolay = api
}

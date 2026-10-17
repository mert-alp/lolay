// Contract shared by main, preload and renderer. Keep it plain data (structured-clone safe).
import type { ItemAdvice } from './itemRules.ts'

export type Lane = 'top' | 'jungle' | 'middle' | 'bottom' | 'support'
export const LANES: Lane[] = ['top', 'jungle', 'middle', 'bottom', 'support']

// Lolalytics tier filters that actually exist (bronze/silver/iron *_plus return 404)
export type Tier =
  | 'all'
  | 'gold_plus'
  | 'platinum_plus'
  | 'emerald_plus'
  | 'diamond_plus'
  | 'master_plus'
  | 'grandmaster_plus'
  | 'challenger'
export const TIERS: Tier[] = ['all', 'gold_plus', 'platinum_plus', 'emerald_plus', 'diamond_plus', 'master_plus', 'grandmaster_plus', 'challenger']

export type Lang = 'tr' | 'en'

export const BUILD_TTL = 3 * 60 * 60 * 1000 // cached builds older than this are refreshed in the background

export type Source = 'lolalytics' | 'opgg' | 'ugg' | 'metasrc'
export const SOURCES: Source[] = ['lolalytics', 'opgg', 'ugg', 'metasrc']

export interface Stat {
  wr: number // win rate, percent (52.8)
  n: number // games
  pr?: number // pick rate, percent
}

export interface RunePage extends Stat {
  perks: number[] // LCU selectedPerkIds order: 4 primary, 2 secondary, 3 shards
  label?: string // shown instead of the generic page name, e.g. "Electrocute", "Ekko vs Vi"
  low?: true // matchup page from a small sample: shown, never the default
  source?: Source | 'pro' // 'pro' = a page played by a pro player
  player?: { name: string; team?: string; region?: string; when?: number } // when = epoch ms of the game
  vs?: number // matchup page: the enemy championId it was built against
}
export interface ItemStat extends Stat {
  id: number
}
export interface SetStat extends Stat {
  ids: number[]
}
export interface Matchup extends Stat {
  championId: number // wr = OUR champion's win rate against this one
}

export interface Damage {
  physical: number
  magic: number
  true: number
}

export interface Build {
  championId: number
  slug: string
  lane: Lane
  defaultLane: Lane
  tier: Tier // metasrc has no rank filter and always reports 'all'
  source: Source // provider that produced this build
  patch: string // ddragon-style patch, e.g. "16.20"
  wr: number | null // null = unknown (partial builds)
  pr: number | null
  br: number | null
  games: number
  tierLabel: string // "S+", "S", "A"... (OP.GG: "OP", "1".."5")
  // [0] most picked, [1] win-rate focused (omitted if identical). runeStatsLevel 'page': observed full pages (OP.GG, U.GG, METAsrc).
  // 'keystone' (Lolalytics): wr/n are the keystone's stats and [1] is assembled per slot, not an observed page.
  runes: RunePage[]
  runeStatsLevel?: 'page' | 'keystone'
  spells: SetStat[] // sorted by pick rate desc, ids are summoner spell keys (4 = Flash)
  startItems: SetStat[]
  core: SetStat | null
  boots: ItemStat[]
  item4: ItemStat[]
  item5: ItemStat[]
  item6: ItemStat[]
  skillPriority: string // "QWE"
  skillOrder: string // 15 chars of Q/W/E/R, level 1..15
  counters: { strong: Matchup[]; weak: Matchup[] } // strong = we beat them, weak = they beat us
  partial: boolean // true when key sections are missing (provider fallback or incomplete page)
  damage?: Damage | null // Lolalytics only: average damage split of the champion, absolute numbers
  queue?: 'aram' // an ARAM build: `lane` means nothing then
  items?: ItemStat[] // Lolalytics only: every item this champion builds, for item advice
  heal?: number // Lolalytics only: average healing per game
  timeWr?: (number | null)[] // Lolalytics only: win rate per game length, TIME_BUCKETS minutes; null = no games
  insufficient?: true // the source has too little data for this champion/lane/rank; every list is empty
  fetchedAt: number
}

// build:runePages — many pages for one champion/lane; vs* = enemy champion ids (AppState.live enemyTeam) for matchup pages
export interface RunePagesQuery {
  championId: number
  lane: Lane
  vsLaner?: number // enemy champion in our lane
  vsJungler?: number // enemy jungler (ignored when we play jungle: pass the enemy jungler as vsLaner)
}

export const TIME_BUCKETS = ['0-15', '15-20', '20-25', '25-30', '30-35', '35-40', '40+'] // Lolalytics' own labels

export interface BuildQuery {
  championId: number
  lane?: Lane // omitted = champion's default lane
  tier?: Tier // omitted = effective tier from state
  fresh?: boolean // bypass cache
  queue?: 'aram' // ARAM build (Howling Abyss): always Lolalytics, lane ignored
}

// Static Data Dragon data, localized
export interface StaticChampion {
  key: number // numeric champion id (103)
  id: string // ddragon id ("Ahri", "MonkeyKing") -> icon file `${id}.png`
  name: string
}
export interface StaticItem {
  name: string
  gold: number
  boots?: true // ddragon tag "Boots"
  final?: true // builds into nothing and is no consumable / trinket: a finished item
  def?: ('SpellBlock' | 'Armor' | 'Tenacity')[] // the ddragon tags item advice looks at
  desc: string // ddragon description (restricted HTML, see shared/richText.ts); plaintext when empty
}
export interface StaticRune {
  id: number
  name: string
  icon: string // full URL
  styleId: number
  desc: string // long description (restricted HTML)
}
export interface StaticRuneTree {
  id: number
  name: string
  icon: string // full URL
  slots: number[][] // rune ids per row, row 0 = keystones
}
export interface StaticSpell {
  key: number // 4
  id: string // "SummonerFlash" -> icon file `${id}.png`
  name: string
  desc: string
  cd: string // cooldown seconds as ddragon prints it ("300")
}
export interface StaticData {
  version: string // ddragon version "16.20.1"
  lang: Lang
  champions: Record<number, StaticChampion>
  items: Record<number, StaticItem>
  runes: Record<number, StaticRune> // includes stat shards (5001..5013) with icons
  trees: StaticRuneTree[]
  spells: Record<number, StaticSpell>
}

export const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn'
export const champIcon = (v: string, id: string) => `${DDRAGON}/${v}/img/champion/${id}.png`
export const itemIcon = (v: string, id: number) => `${DDRAGON}/${v}/img/item/${id}.png`
export const spellIcon = (v: string, id: string) => `${DDRAGON}/${v}/img/spell/${id}.png`

export interface Settings {
  lang: Lang | null // null = follow League client locale
  tierOverride: Tier | null // null = derive from own solo rank
  source: Source // build/rune data provider
  autoImport: { runes: boolean; spells: boolean; items: boolean }
  autoAccept: boolean
  autoAcceptDelay: number // seconds 0..8
  turnAlert: boolean // my pick / ban turn: bring the window up and flash it in the taskbar
  flashOn: 'D' | 'F'
  startWithWindows: boolean
  installDir?: string // discovered League install dir (lockfile cache)
  watchlist: number[] // champion ids starred on the Meta page
  spellPrefs: Record<string, [number, number]> // the user's own spell pair per `${championId}:${lane}`, D then F
  runePrefs: Record<string, number[]> // the user's own rune page (9 perks) per `${championId}:${lane}`
  banHistory: Record<number, number> // championId -> how many times I banned it (my completed ban actions)
}

// Meta page: one Lolalytics tier list row, plus the change against the previous patch when it was reachable
export interface MetaRow {
  championId: number
  tier: string // "S+", "A-"...; '' = too few games to rank
  rank: number // rank within its lane
  lane: Lane
  pctLane: number // share of this champion's games played in `lane`
  wr: number
  delta: number // win rate minus the lane average (Lolalytics avgWrDelta)
  pr: number
  br: number
  games: number
  dWr?: number // win rate change in points vs the previous patch
  dPr?: number // pick rate change in points
}
export interface MetaQuery {
  lane: Lane | 'all' // 'all' = every champion in its main lane
  tier: Tier
  compare?: boolean // fetch the previous patch (default true)
}
export interface MetaMovers {
  kind: 'patch' | 'avg' // 'avg' = no previous patch: ranked by win rate vs the lane average
  up: number[]
  down: number[]
}
export interface MetaResult {
  patch: string | null // "16.20"
  previousPatch: string | null // null = rows carry no dWr/dPr
  rows: MetaRow[]
  movers: MetaMovers
}

export type GameflowPhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'GameStart'
  | 'InProgress'
  | 'WaitingForStats'
  | 'EndOfGame'
  | string

export interface ReadyCheckState {
  playerResponse: 'None' | 'Accepted' | 'Declined' | string
  timer: number // seconds elapsed (LCU)
  autoAcceptAt: number | null // epoch ms when auto-accept fires, null = not scheduled/cancelled
  queue?: string // queue name from the gameflow session, e.g. "Ranked Solo/Duo"
  bgChampionId?: number // my top mastery champion, drawn as the backdrop
}

export interface ChampSelectState {
  championId: number // 0 = none yet (hover shows intent)
  lane: Lane | null
  locked: boolean
  imported: boolean // auto-import done for current champ+lane
  importFailed?: boolean // auto-import ran and failed (apply manually)
  importing: boolean // auto-import running for current champ+lane
  importResult?: Pick<ApplyResult, 'runes' | 'spells' | 'items'> | null // per-part outcome of the auto-import; a part that never ran is absent
  autoImportAllowed: boolean // false on non Summoner's Rift maps (ARAM, Arena)
  spell1Id: number // my summoner spell keys: slot D and slot F; 0 = unknown
  spell2Id: number
  pickActionId: number | null // my unfinished pick action; null = nothing to hover/lock (blind pick, ARAM, already locked)
  myTurn: boolean // that action is in progress
  phase: 'ban' | 'pick' | 'waiting' | 'done' // my open ban / pick action in progress; waiting = a later action of mine; done = none left
  endsAt: number | null // epoch ms when the current turn runs out; null = unknown
  aram: boolean // Howling Abyss (ARAM, ARAM Mayhem): ARAM builds, the bench instead of lanes
}

export type LiveTag = 'autofill' | 'offrole' | 'otp'

// derived from the player's last <=20 games (LCU match history), ranked solo stats and champion mastery
export interface PlayerSummary {
  rank: { tier: string; division: string; lp: number } | null // ranked solo; null = unranked / unknown
  wins: number // ranked solo
  losses: number
  recent: boolean[] // newest first, true = win; empty = no match history
  avg: [number, number, number] | null // avg kills, deaths, assists
  kda: number | null // (K+A)/max(D,1) over the window
  champ: { games: number; wins: number } // current champion within the window
  mastery: { level: number; points: number } | null
  roles: { lane: Lane; pct: number }[] // most played roles (Summoner's Rift games), pct of those games
  tags: LiveTag[]
  streak: number // +N win / -N loss streak, 0 below 3
  source?: 'lcu' | 'riot' // where the numbers came from; absent in previews
}

export interface LivePlayer {
  key: string
  puuid: string | null // null = enemy with hidden identity (or a bot): nothing to look up
  championId: number // 0 = none picked yet
  spells: number[] // summoner spell keys, [] when unknown
  position: Lane | null
  name: string | null // Riot ID game name
  tag: string | null
  hidden: boolean // identity hidden by Riot
  bot: boolean // computer player: no puuid, no stats lookup
  autofilled?: boolean // Riot's own flag (champ select), kept into the game; undefined = unknown
  me: boolean
  summary: PlayerSummary | null // null while loading (only when puuid is set)
}

export interface LiveMatchState {
  phase: GameflowPhase
  myTeam: LivePlayer[]
  enemyTeam: LivePlayer[]
  bans?: { my: number[]; their: number[] } // champion ids banned so far (champ select only)
  loading: boolean // any summary still pending
  riotInvalid?: true // the Riot API key was rejected: enemy stats are unavailable
}

export interface AppState {
  lcu: 'disconnected' | 'connected'
  summoner: { name: string; iconId: number; soloTier: string | null; soloDivision: string | null } | null
  phase: GameflowPhase
  readyCheck: ReadyCheckState | null // non-null only while a ready check is in progress
  champSelect: ChampSelectState | null
  live: LiveMatchState | null // non-null from champ select until the game ends
  settings: Settings
  lang: Lang // effective language
  tier: Tier // effective Lolalytics tier
  dataVersion: string | null // ddragon version
}

export interface ApplyRequest {
  championId: number
  lane: Lane
  queue?: 'aram' // ARAM build and a Howling Abyss item set
  runeIndex?: number // index into build.runes; omitted = skip runes
  perks?: number[] // the exact displayed rune page; wins over runeIndex
  spells?: boolean
  spellIds?: [number, number] // the pair to apply; omitted = the build's most picked
  items?: boolean
}
export interface ApplyResult {
  runes?: 'ok' | 'skipped' | 'error'
  spells?: 'ok' | 'skipped' | 'error'
  items?: 'ok' | 'skipped' | 'error'
  error?: 'client' | 'runes' | 'failed' // the raw text goes to the main process log
}

// champions I can still pick / ban right now (main/recommend.ts champPool)
export interface DraftPool {
  pickable: number[]
  bannable: number[]
}

// Draft recommendations (main/recommend.ts)
export interface DraftPick {
  championId: number
  score: number // 1..99
  tier: string // Lolalytics tier of the champion in my lane: "S+", "A-"...
  wr: number
  delta: number // win rate minus the lane average
  pr: number
  vs: number | null // its win rate against the likely enemy laner, null = unknown
  points: number // my mastery points
}
// a champion that beats the enemy laner in my lane
export interface CounterPick {
  championId: number
  vs: number // its win rate against the enemy laner
  n: number // games of that matchup
  tier: string // Lolalytics tier in my lane, '' = unranked
}
// one champion's tier list row in my lane, for the watchlist / most played / most banned strips
export interface DraftChamp {
  championId: number
  tier: string // '' = unranked
  wr: number
  pr: number
  br: number
  out: boolean // already banned or taken
  none?: true // watchlist champion without data in my lane (the numbers are 0)
}
// ARAM champ select: my champion and the bench, rated by the ARAM tier list
export interface BenchChamp {
  championId: number
  tier: string // '' = no ARAM data
  wr: number
}
export interface DraftBench {
  mine: BenchChamp | null
  bench: BenchChamp[] // best first
  rerolls: number | null // null = no rerolls in this mode
}

export interface DraftRecommendation {
  favorites: number[] // my most played champions in this lane that I can pick now
  picks: DraftPick[] // best first
  enemyId: number | null // the likely enemy laner (as the jungler: the enemy jungler)
  enemyJungleId: number | null // the likely enemy jungler, when I do not play jungle
  counters: CounterPick[] // best win rate against the enemy laner first; empty = unknown enemy or no data
  watch: DraftChamp[] // my watchlist, pickable ones only
  popular: DraftChamp[] // most picked in my lane, pickable ones only
  banned: DraftChamp[] // most banned in my lane; `out` ones are shown greyed
  myBans: DraftChamp[] // the champions I ban most (settings.banHistory), most first; `out` ones are shown greyed
  favoriteVs: Record<number, number> // favorite championId -> its win rate against the enemy laner (enough games only)
  banActionId: number | null // my unfinished ban action; null = no ban to make
  myBanTurn: boolean // that action is in progress
}

// Profile page (main/profile.ts)
export type ProfileErrorCode = 'not_found' | 'no_key' | 'invalid_key' | 'rate_limited' | 'lcu_off' | 'server'
export type ProfileResult<T> = { ok: true; data: T } | { ok: false; error: ProfileErrorCode }
export type MatchFilter = 'all' | 'solo' | 'flex' | 'normal' | 'aram'
export interface ProfileRank {
  tier: string
  division: string
  lp: number
  wins: number
  losses: number
}
export type DataSource = 'blitz' | 'opgg' | 'riot' | 'lcu'
export interface Profile {
  puuid: string // the puuid of `src` (every backend has its own); pass both back to profileMatches
  src: DataSource
  degraded?: ProfileErrorCode // own profile served by the League client because the Riot API failed
  gameName: string
  tagLine: string
  platform: string // "tr1"
  level: number
  iconId: number
  solo: ProfileRank | null
  flex: ProfileRank | null
  me: boolean
}
export interface MatchPlayer {
  puuid: string
  name: string
  tag: string
  championId: number
  teamId: number // 100 | 200
  position: Lane | null
  level: number
  kills: number
  deaths: number
  assists: number
  cs: number
  vision: number // vision score
  wards: number // wards placed
  damage: number // to champions
  gold: number
  items: number[] // 7 slots, 0 = empty, the last is the trinket
  spells: number[] // 2 summoner spell keys
  keystone: number // rune id
  tree: number // secondary rune tree id
}
export interface MatchTeam {
  teamId: number
  win: boolean
  kills: number
  gold: number
  objectives: { baron: number; dragon: number; herald: number; tower: number; inhibitor: number }
}
export interface MatchDetail {
  id: string // "TR1_123456"
  queueId: number
  at: number // epoch ms
  duration: number // seconds
  players: MatchPlayer[]
  teams: MatchTeam[]
}
export interface MatchEntry {
  id: string
  queueId: number
  at: number
  duration: number
  win: boolean
  remake: boolean
  teamKills: number
  me: MatchPlayer
  players: Pick<MatchPlayer, 'puuid' | 'name' | 'tag' | 'championId' | 'teamId'>[]
}
export interface ProfileQuery {
  gameName: string
  tagLine: string
  platform?: string // default: the platform of the signed-in League client
}
export interface MatchesQuery {
  puuid: string
  platform: string
  src: DataSource
  gameName: string // lets the other backends find the same player when `src` fails
  tagLine: string
  filter?: MatchFilter
  start: number
  count: number
  fresh?: boolean // bypass the short id cache (refresh button)
}

// Player search (main/playerSearch.ts): local index + Riot ID lookups + OP.GG name search
export interface SearchResult {
  gameName: string
  tagLine: string
  iconId?: number
  level?: number
  rank?: { tier: string; division: string; lp: number } | null
  region?: string // "TR"
  platform?: string // "tr1"
  source: 'local' | 'blitz' | 'riot' | 'opgg'
}
export interface SearchQuery {
  query: string // "Name", "Name#TAG" or a fragment
  deep?: boolean // the results view: may spend Riot API calls on guessed tags
  region?: string // platform id ("euw1") to search in; omitted or 'all' = my region plus the popular ones
}
export interface SearchResponse {
  results: SearchResult[]
}

// window.lolay, exposed by preload
export interface RiotStatus {
  hasKey: boolean
  valid: boolean | null
  error?: string
  envPath?: string // where the .env with RIOT_API_KEY is read from
}

export interface LolayApi {
  riotStatus(): Promise<RiotStatus>
  riotReload(): Promise<RiotStatus>
  getState(): Promise<AppState>
  onState(cb: (s: AppState) => void): () => void
  getStatic(): Promise<StaticData>
  getBuild(q: BuildQuery): Promise<Build>
  getRunePages(q: RunePagesQuery): Promise<RunePage[]> // matchup pages first, then selected-source + OP.GG keystone variants, then pro games; cached 3 h
  getMeta(q: MetaQuery): Promise<MetaResult>
  onBuildRefreshed(cb: (b: Build) => void): () => void // stale-while-revalidate: fresher build for an earlier getBuild
  applyBuild(req: ApplyRequest): Promise<ApplyResult>
  readyCheck(action: 'accept' | 'decline' | 'cancelAuto'): Promise<void>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  windowControl(action: 'minimize' | 'maximize' | 'hide'): void
  draftRecommend(): Promise<DraftRecommendation | null> // null = not in champ select / no lane
  searchPlayers(q: SearchQuery): Promise<SearchResponse>
  profileGet(q: 'me' | ProfileQuery): Promise<ProfileResult<Profile>>
  profileMatches(q: MatchesQuery): Promise<ProfileResult<MatchEntry[]>>
  profileMatch(matchId: string): Promise<ProfileResult<MatchDetail>>
  draftPool(): Promise<DraftPool>
  draftHover(championId: number): Promise<boolean>
  draftLock(championId: number): Promise<boolean>
  draftBan(championId: number, complete: boolean): Promise<boolean> // hover my ban; complete = also lock it in
  draftSetSpells(spell1Id: number, spell2Id: number): Promise<boolean>
  draftBench(): Promise<DraftBench | null> // null = not in an ARAM champ select
  draftBenchSwap(championId: number): Promise<boolean>
  draftReroll(): Promise<boolean>
  draftItemAdvice(championId: number, lane: Lane): Promise<ItemAdvice | null> // null = not in a Rift champ select
  queueNames(): Promise<Record<number, string>> // the client's own queue names, {} without the client
}

export const IPC = {
  getState: 'state:get',
  state: 'state:changed',
  getStatic: 'static:get',
  getBuild: 'build:get',
  runePages: 'build:runePages',
  meta: 'meta:list',
  buildRefreshed: 'build:refreshed',
  applyBuild: 'build:apply',
  readyCheck: 'readycheck:action',
  setSettings: 'settings:set',
  windowControl: 'window:control',
  riotStatus: 'riot:status',
  riotReload: 'riot:reload',
  draftRecommend: 'draft:recommend',
  searchPlayers: 'search:players',
  profileGet: 'profile:get',
  profileMatches: 'profile:matches',
  profileMatch: 'profile:match',
  draftPool: 'draft:pool',
  draftHover: 'draft:hover',
  draftLock: 'draft:lock',
  draftBan: 'draft:ban',
  draftSetSpells: 'draft:setSpells',
  queueNames: 'queues:names',
  draftBench: 'draft:bench',
  draftBenchSwap: 'draft:benchSwap',
  draftReroll: 'draft:reroll',
  draftItemAdvice: 'draft:itemAdvice'
} as const

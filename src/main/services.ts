import { app } from 'electron'
import { join } from 'node:path'
import type { Build, BuildQuery, RunePage, RunePagesQuery, Source, StaticData } from '../shared/types.ts'
import { createBuildCache, createValueCache } from './buildCache.ts'
import { createDdragon } from './ddragon.ts'
import { champPathSlug, createLolalytics, fetchMatchupPages, slugFromDdragonId } from './lolalytics.ts'
import type { Provider } from './providers/http.ts'
import { createMetasrc } from './providers/metasrc.ts'
import { createOpgg, fetchPos } from './providers/opgg.ts'
import { fetchProPages } from './providers/probuilds.ts'
import { collectRunePages, defaultPage } from './runePages.ts'
import { createUgg } from './providers/ugg.ts'
import { getState } from './state.ts'

const cacheDir = join(app.getPath('userData'), 'cache')
let loaded: StaticData | null = null

export const ddragon = createDdragon({ cacheDir })

const staticNow = () => {
  if (!loaded) throw new Error('static data not loaded')
  return loaded
}
const slugOf = (id: number) => {
  const c = staticNow().champions[id]
  if (!c) throw new Error(`unknown champion ${id}`)
  return slugFromDdragonId(c.id)
}
const providers: Record<Source, Provider> = {
  lolalytics: createLolalytics({ cacheDir, slugOf }),
  opgg: createOpgg(),
  ugg: createUgg({ getStatic: staticNow }),
  metasrc: createMetasrc({ getStatic: staticNow })
}
export const builds = createBuildCache({ cacheDir, fetchBuild: ({ source, championId, lane, tier, queue }) => providers[source]({ championId, lane, tier, queue }) })

// every consumer goes through here so the champion id -> slug table is always loaded
export async function getStatic(): Promise<StaticData> {
  loaded = await ddragon.getStatic(getState().lang)
  return loaded
}

export async function getBuild(q: BuildQuery, onRefresh?: (b: Build) => void): Promise<Build> {
  await getStatic()
  const { settings, tier } = getState()
  return builds.getBuild({ ...q, source: q.queue ? 'lolalytics' : settings.source, tier: q.tier ?? tier }, onRefresh)
}

const runeCache = createValueCache({ cacheDir })

// many rune pages for the build view: selected source + OP.GG keystone variants + matchup pages + recent pro games
export async function getRunePages(q: RunePagesQuery): Promise<RunePage[]> {
  const sd = await getStatic()
  const { settings, tier } = getState()
  const key = ['runes2', settings.source, q.championId, q.lane, tier, sd.lang, q.vsLaner ?? 0, q.vsJungler ?? 0].join('_')
  return runeCache(key, () =>
    collectRunePages(q, {
      sd,
      tier,
      baseSource: settings.source,
      base: async () => (await getBuild({ championId: q.championId, lane: q.lane })).runes,
      opgg: async (championId, lane, t, target) => fetchPos(championId, lane, t, target),
      lolaVs: ({ championId, lane, vsChampionId, vsLane, tier: t }) =>
        fetchMatchupPages({ slug: champPathSlug(championId) ?? slugOf(championId), vsSlug: champPathSlug(vsChampionId) ?? slugOf(vsChampionId), lane, vsLane, tier: t }),
      pro: fetchProPages
    })
  )
}

// the page auto-import uses when the user has none of their own: "Ekko vs Vi" if that matchup is known, else the most picked
export async function defaultRunePerks(q: RunePagesQuery): Promise<number[] | null> {
  try {
    return defaultPage(await getRunePages(q))?.perks ?? null
  } catch {
    return null
  }
}

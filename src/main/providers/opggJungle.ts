import type { Camp } from '../../shared/types.ts'
import { get } from './http.ts'

export type JunglePaths = { BLUE: Camp[] | null; RED: Camp[] | null }

// OP.GG ships the data as escaped JSON inside Next.js `self.__next_f.push` chunks: per side `"team_key":"BLUE","routes":[{"route":[...],"play":N,...}]`
export function parseJunglePaths(html: string): JunglePaths {
  const flat = html.replace(/\\"/g, '"')
  const out: JunglePaths = { BLUE: null, RED: null }
  for (const [, side, body] of flat.matchAll(/"team_key":"(BLUE|RED)","routes":\[(.*?)\],"play":\d+\}/g)) {
    let best = 0
    for (const [, camps, play] of body.matchAll(/"route":\[([^\]]*)\],"play":(\d+)/g)) {
      const route = camps.split(',').map((c) => c.trim().replace(/^"|"$/g, '')).filter(Boolean)
      if (route.length >= 3 && +play > best) {
        best = +play
        out[side as 'BLUE' | 'RED'] = route
      }
    }
  }
  return out
}

const cache = new Map<string, Promise<JunglePaths>>()

// ponytail: in-memory per champion and day (a route is fetched once per game); disk cache if startup refetches ever matter
export function getJunglePath(ddragonId: string): Promise<JunglePaths> {
  const slug = ddragonId.toLowerCase().replace(/[^a-z0-9]/g, '') // OP.GG redirects its own aliases (wukong -> monkeyking)
  const key = `${slug}_${new Date().toISOString().slice(0, 10)}`
  let p = cache.get(key)
  if (!p) {
    p = get(`https://op.gg/lol/champions/${slug}/jungle-paths/jungle`, { gap: 1000 }).then(async (r) => parseJunglePaths(await r.text()))
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

// The user's own choices: which key Flash sits on, a spell pair and a rune page per champion + lane.

export const FLASH = 4

export type Pair = [number, number]

export const prefKey = (championId: number, lane: string | null | undefined): string | null => (championId > 0 && lane ? `${championId}:${lane}` : null)

export const samePair = (a: readonly number[] | undefined, b: readonly number[] | undefined) => !!a && !!b && a[0] === b[0] && a[1] === b[1]

// spell1 = D, spell2 = F
export function flashSlot(pair: readonly number[]): 'D' | 'F' | null {
  return pair[1] === FLASH ? 'F' : pair[0] === FLASH ? 'D' : null
}

// Flash goes on the user's key, the other spell takes the other slot
export function orderSpells(ids: readonly number[], flashOn: 'D' | 'F'): Pair {
  const [a, b] = ids
  if (!ids.includes(FLASH)) return [a, b]
  const other = ids.find((id) => id !== FLASH) ?? b
  return flashOn === 'D' ? [FLASH, other] : [other, FLASH]
}

export interface SpellWatch {
  seen: Pair | null // last pair the session showed
  ours: Pair | null // pair our own auto-import wrote, so its echo is not mistaken for a user change
}

// 'first' = the first known pair of this champ select, 'user' = the pair changed and we did not do it
export function watchSpells(w: SpellWatch, now: Pair): { watch: SpellWatch; change: 'first' | 'user' | null } {
  if (now[0] <= 0 || now[1] <= 0) return { watch: w, change: null }
  if (!w.seen) return { watch: { ...w, seen: now }, change: 'first' }
  if (samePair(w.seen, now)) return { watch: w, change: null }
  return { watch: { ...w, seen: now }, change: samePair(w.ours ?? undefined, now) ? null : 'user' }
}

const isId = (n: unknown) => Number.isInteger(n) && (n as number) > 0

// settings.json is user-editable and older versions have neither map: keep only well-formed entries
export function cleanPrefs<T>(raw: unknown, ok: (v: unknown) => boolean): Record<string, T> {
  const out: Record<string, T> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [k, v] of Object.entries(raw)) if (ok(v)) out[k] = v as T
  return out
}
export const okSpellPair = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(isId) && v[0] !== v[1]
export const okRunePage = (v: unknown) => Array.isArray(v) && v.length === 9 && v.every(isId)

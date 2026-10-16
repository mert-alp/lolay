import type { Damage } from './types.ts'

// share of each damage type, percent summing to 100; null when there is nothing to split
export function damagePct(d: Damage | null | undefined): Damage | null {
  const total = d ? d.physical + d.magic + d.true : 0
  if (!d || !(total > 0)) return null
  return { physical: (d.physical / total) * 100, magic: (d.magic / total) * 100, true: (d.true / total) * 100 }
}

// every champion counts equally, whatever its absolute damage numbers are
export function teamDamage(list: (Damage | null | undefined)[]): { pct: Damage; n: number } | null {
  const rows = list.map(damagePct).filter((d): d is Damage => !!d)
  if (!rows.length) return null
  const avg = (k: keyof Damage) => rows.reduce((s, d) => s + d[k], 0) / rows.length
  return { pct: { physical: avg('physical'), magic: avg('magic'), true: avg('true') }, n: rows.length }
}

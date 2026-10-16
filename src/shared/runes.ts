import type { RunePage } from './types.ts'

// Rune page rules (LoL client): 1 keystone + 1 rune in each of rows 1-3, a second tree with 2 runes from different rows, 3 stat shards.

export const SHARD_ROWS = [
  [5008, 5005, 5007], // offense
  [5008, 5010, 5001], // flex
  [5011, 5013, 5001] // defense
]

interface Tree { id: number; slots: number[][] }

// perks: 9 slots in LCU order, 0 = empty. [0..3] primary rows 0-3, [4..5] secondary (older pick first), [6..8] shards
export interface RuneDraft { primary: number; secondary: number; perks: number[] }

const treeOf = (trees: Tree[], rune: number) => trees.find((t) => t.slots.some((r) => r.includes(rune)))
const rowOf = (tree: Tree, rune: number) => tree.slots.findIndex((r) => r.includes(rune))

export function draftOf(perks: number[], trees: Tree[]): RuneDraft {
  return { primary: treeOf(trees, perks[0])?.id ?? 0, secondary: treeOf(trees, perks[4])?.id ?? 0, perks: [...perks] }
}

export function pickTree(d: RuneDraft, which: 'primary' | 'secondary', id: number): RuneDraft {
  const perks = [...d.perks]
  if (which === 'primary') {
    if (id === d.primary) return d
    perks.fill(0, 0, 4)
    // the old secondary tree is gone when it becomes the primary one
    return id === d.secondary ? { primary: id, secondary: 0, perks: perks.fill(0, 4, 6) } : { ...d, primary: id, perks }
  }
  if (id === d.secondary || id === d.primary) return d
  return { ...d, secondary: id, perks: perks.fill(0, 4, 6) }
}

export function pickRune(d: RuneDraft, trees: Tree[], rune: number): RuneDraft {
  const tree = treeOf(trees, rune)
  if (!tree) return d
  const row = rowOf(tree, rune)
  const perks = [...d.perks]
  if (tree.id === d.primary) {
    perks[row] = rune
    return { ...d, perks }
  }
  if (tree.id !== d.secondary || row === 0) return d
  const sub = perks.slice(4, 6)
  const same = sub.findIndex((p) => p && rowOf(tree, p) === row)
  if (same >= 0) sub[same] = rune // one rune per row: replace it
  else if (sub[0] && sub[1]) sub.splice(0, 2, sub[1], rune) // third pick drops the oldest
  else sub[sub[0] ? 1 : 0] = rune
  perks.splice(4, 2, ...sub)
  return { ...d, perks }
}

export function pickShard(d: RuneDraft, row: number, shard: number): RuneDraft {
  if (!SHARD_ROWS[row]?.includes(shard)) return d
  const perks = [...d.perks]
  perks[6 + row] = shard
  return { ...d, perks }
}

export function progress(d: RuneDraft) {
  const n = (a: number, b: number) => d.perks.slice(a, b).filter(Boolean).length
  return { primary: n(0, 4), secondary: n(4, 6), shards: n(6, 9) }
}

export function isComplete(d: RuneDraft): boolean {
  const p = progress(d)
  return !!d.primary && !!d.secondary && p.primary === 4 && p.secondary === 2 && p.shards === 3
}

// LCU order: the two secondary runes sit in row order
export function perksOf(d: RuneDraft, trees: Tree[]): number[] {
  const tree = trees.find((t) => t.id === d.secondary)
  const sub = d.perks.slice(4, 6)
  if (tree && sub[0] && sub[1] && rowOf(tree, sub[0]) > rowOf(tree, sub[1])) sub.reverse()
  return [...d.perks.slice(0, 4), ...sub, ...d.perks.slice(6, 9)]
}

// A page's name in the list: the pro player, its own label ("Ekko vs Vi"), the generic slot name, else its keystone. Never a number.
export function pageTitle(p: RunePage, slotName: string | undefined, runes: Record<number, { name: string }>): string {
  return p.player?.name || p.label || slotName || runes[p.perks[0]]?.name || ''
}

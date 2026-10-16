import type { Skill } from '../shared/types.ts'

type Abilities = { Q: number; W: number; E: number; R: number }

// ability levels that do not follow the usual rules: no advice beats wrong advice
const ODD = new Set(['Jayce', 'Elise', 'Nidalee', 'Karma', 'Udyr'])
const R_AT = [6, 11, 16]

// levels 16..18: ultimate first, then the priority skills up to rank 5
function extend(order: string, priority: string): string {
  let seq = order
  const n = (k: string) => seq.split(k).length - 1
  for (let lvl = seq.length + 1; lvl <= 18; lvl++) {
    const next = lvl === 16 && n('R') < 3 ? 'R' : [...priority, ...'QWE'].find((k) => k !== 'R' && n(k) < 5)
    if (!next) break
    seq += next
  }
  return seq
}

// the skill to level now, or null when no point is unspent, the build is unusable or the champion is irregular
export function nextSkill(order: string, priority: string, level: number, abilities: Abilities, championKey = ''): Skill | null {
  if (ODD.has(championKey) || !/^[QWER]{15}$/.test(order) || !(level >= 1 && level <= 18)) return null
  if (abilities.Q + abilities.W + abilities.E + abilities.R >= level) return null
  const seq = extend(order, priority).slice(0, level)
  const target = (k: string) => seq.split(k).length - 1
  for (const k of seq as unknown as Skill[]) {
    const have = abilities[k]
    if (have >= target(k)) continue
    const legal = k === 'R' ? level >= (R_AT[have] ?? 99) : have + 1 <= Math.ceil(level / 2) && have < 5
    if (legal) return k
  }
  return null
}

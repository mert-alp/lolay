import type { Lang } from './types.ts'

// "Vi'ye", "Ekko'ya", "Zed'e": Turkish dative of a champion name by its last written vowel; other languages keep the name
export function toward(lang: Lang, name: string): string {
  if (lang !== 'tr') return name
  const last = name.toLowerCase().replace(/[^a-zçğıöşüâîû]/g, '')
  const v = [...last].reverse().find((c) => 'aeıioöuüâîû'.includes(c)) ?? 'e'
  const buffer = 'aeıioöuüâîû'.includes(last.at(-1) ?? '') ? 'y' : ''
  return `${name}'${buffer}${'aıouâû'.includes(v) ? 'a' : 'e'}`
}

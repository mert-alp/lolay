import type { Lang, LivePlayer, LiveTag, Source, Tier } from '@shared/types'

export function fmtGames(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}
export { toward } from '@shared/text'
export const fmtPct = (n: number | null | undefined) => (n == null ? '–' : `${n.toFixed(1)}%`)
export const wrColor = (wr: number | null | undefined) => (wr == null ? 'text-fg' : wr > 50.05 ? 'text-win' : wr < 49.95 ? 'text-loss' : 'text-fg')

export const TIER_BADGE: Record<string, string> = {
  'S+': '#f0c35a', S: '#c8aa6e', A: '#4fb6b0', B: '#3b82f6', C: '#8a93a6', D: '#ef4444',
  OP: '#f0c35a', 1: '#c8aa6e', 2: '#4fb6b0', 3: '#3b82f6', 4: '#8a93a6', 5: '#ef4444' // OP.GG
}

// "A+" and "S-" fall back to the color of their letter
export const tierColor = (label: string) => TIER_BADGE[label] ?? TIER_BADGE[label.replace(/[+-]$/, '')] ?? '#8a93a6'

export const SOURCE_NAME: Record<Source, string> = { lolalytics: 'Lolalytics', opgg: 'OP.GG', ugg: 'U.GG', metasrc: 'METAsrc' }

export const RANK_COLOR: Record<string, string> = {
  IRON: '#8a8f98', BRONZE: '#b0764a', SILVER: '#a3adb8', GOLD: '#c8aa6e', PLATINUM: '#4fb6b0',
  EMERALD: '#2bbf7a', DIAMOND: '#6a8dff', MASTER: '#b765e6', GRANDMASTER: '#e0504d', CHALLENGER: '#f0c35a'
}

// Blitz palette: medal fill and the brighter text color per rank
export const RANK_FILL: Record<string, string> = {
  IRON: '#817678', BRONZE: '#9f6347', SILVER: '#80989d', GOLD: '#cd8837', PLATINUM: '#1c91b6',
  EMERALD: '#519847', DIAMOND: '#8141eb', MASTER: '#9d48e0', GRANDMASTER: '#d94444', CHALLENGER: '#f4c874'
}
export const RANK_TEXT: Record<string, string> = {
  IRON: '#a29294', BRONZE: '#b97452', SILVER: '#a2c1c7', GOLD: '#f1a64e', PLATINUM: '#14c0f5',
  EMERALD: '#56d744', DIAMOND: '#9556ff', MASTER: '#a952e5', GRANDMASTER: '#ef4f4f', CHALLENGER: '#f4c874'
}

export function tierName(tier: Tier, allLabel: string): string {
  if (tier === 'all') return allLabel
  if (tier === 'challenger') return 'Challenger'
  const base = tier.replace('_plus', '')
  return base[0].toUpperCase() + base.slice(1) + '+'
}

// lowercase + strip diacritics + dotless i, so "sion" finds "Sion" and "ahri" finds "Ahri"
export const fold = (s: string) =>
  s.toLocaleLowerCase('en').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/gi, 'i')

export const sortLocale = (lang: Lang) => (lang === 'tr' ? 'tr' : 'en')

// tags to show for a player; Riot's autofill flag is known before the summary has loaded
export const tagsOf = (p: LivePlayer): LiveTag[] => p.summary?.tags ?? (p.autofilled ? ['autofill'] : [])

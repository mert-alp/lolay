import type { Lang, Tier } from '../shared/types.ts'

const TIER_BY_RANK: Record<string, Tier> = {
  GOLD: 'gold_plus',
  PLATINUM: 'platinum_plus',
  EMERALD: 'emerald_plus',
  DIAMOND: 'diamond_plus',
  MASTER: 'master_plus',
  GRANDMASTER: 'grandmaster_plus',
  CHALLENGER: 'challenger'
}

// null / NONE / UNRANKED / IRON / BRONZE / SILVER all fall back to 'all'
export function rankToTier(soloTier: string | null): Tier {
  return TIER_BY_RANK[(soloTier ?? '').toUpperCase()] ?? 'all'
}

export function localeToLang(locale: string | null | undefined): Lang {
  return locale === 'tr_TR' ? 'tr' : 'en'
}

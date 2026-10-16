import { TIERS, type AppState, type Tier } from '@shared/types'
import { useT } from '../i18n'
import { tierName } from '../util'
import { Select } from './ui'

// Lolalytics filter -> ranked mini crest from CommunityDragon ('all' has no rank: unranked crest)
const CREST = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/'
const crestOf = (tier: Tier) => (tier === 'all' ? 'unranked' : tier.replace('_plus', ''))
export const Crest = ({ tier, size = 18 }: { tier: Tier; size?: number }) => (
  <img src={`${CREST}${crestOf(tier)}.svg`} width={size} height={size} alt="" className="shrink-0" />
)

export function TierSelect({ state, compact }: { state: AppState; compact?: boolean }) {
  const t = useT()
  const all = t('tier.all')
  const ov = state.settings.tierOverride
  const options = [
    { value: 'auto', label: ov ? t('tier.auto') : `${t('tier.auto')} (${tierName(state.tier, all)})`, icon: <Crest tier={state.tier} /> },
    ...TIERS.map((x) => ({ value: x as string, label: tierName(x, all), icon: <Crest tier={x} /> }))
  ]
  return (
    <Select
      compact={compact}
      collapse={compact}
      align="right"
      label={t('tier.filter')}
      value={ov ?? 'auto'}
      options={options}
      onChange={(v) => window.lolay.setSettings({ tierOverride: v === 'auto' ? null : (v as Tier) })}
    />
  )
}

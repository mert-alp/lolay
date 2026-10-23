import { useRef } from 'react'
import { type ApplyRequest, type Build, type ChampSelectState, type Settings, type StaticData } from '@shared/types'
import { useT } from '../i18n'
import { fmtPct, wrColor } from '../util'
import { Button, Card, Eyebrow } from './ui'
import { BuildItems, useItemAdvice } from './BuildItems'
import { Matchups } from './Matchups'
import { prefKey } from '@shared/prefs'
import { RuneSection, saveRunePref } from './RunePageCard'
import { SpellControl } from './SpellPicker'
import type { PushToast } from './Toasts'

export type ApplyFn = (req: Omit<ApplyRequest, 'championId' | 'lane'>, kind: 'runes' | 'spells' | 'items') => void

interface Props {
  build: Build
  st: StaticData
  cs: ChampSelectState
  settings: Settings
  enemyId: number | null
  vsLaner?: number // enemy champion in my lane / the enemy jungler, for the matchup rune pages
  vsJungler?: number
  enemyVs: number | null // our win rate against the likely enemy laner
  foes: string // enemy champions known so far: the item advice is asked again when it changes
  onApply: ApplyFn
  toast: PushToast
}

// the full build of the hovered/locked champion, inline in the draft
export function BuildPanel({ build, st, cs, settings, enemyId, vsLaner, vsJungler, enemyVs, foes, onApply, toast }: Props) {
  const t = useT()
  const advice = useItemAdvice(build.championId, build.lane, foes, !build.queue)
  const enemy = enemyId ? st.champions[enemyId] : undefined
  // changes in champ select go straight to the client, but only while the hovered/locked champion is the one shown
  const live = useRef(cs)
  live.current = cs
  const auto = cs.championId === build.championId
  const prefLane = build.queue ?? build.lane // ARAM keeps its own page and spells per champion
  const send = async (req: Omit<ApplyRequest, 'championId' | 'lane'>) => {
    if (live.current.championId !== build.championId) return null
    try {
      const r = await window.lolay.applyBuild({ championId: build.championId, lane: build.lane, queue: build.queue, ...req })
      return !r.error && r.runes !== 'error' && r.items !== 'error'
    } catch {
      return false
    }
  }

  return (
    <div className="space-y-4">
      <RuneSection
        key={`${build.championId}:${build.lane}`}
        pages={build.runes}
        championId={build.championId}
        lane={build.lane}
        vsLaner={vsLaner}
        vsJungler={vsJungler}
        st={st}
        editBase={`${build.championId}:${build.lane}`}
        keystone={build.runeStatsLevel === 'keystone'}
        more={!build.queue}
        saved={settings.runePrefs[prefKey(build.championId, prefLane) ?? '']}
        onSave={(perks) => { const k = prefKey(build.championId, prefLane); if (k) saveRunePref(settings, k, perks) }}
        onApply={(perks, runeIndex) => onApply({ runeIndex, perks }, 'runes')}
        auto={auto ? (perks, _i, picked) => send({ perks, ...(picked && settings.autoImport.items && { items: true }) }) : undefined}
      />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <Card className="p-4">
          <Eyebrow>{t('spells.title')}</Eyebrow>
          <SpellControl pairs={build.spells} st={st} settings={settings} cs={auto ? cs : null} championId={build.championId} toast={toast} saved={settings.spellPrefs[prefKey(build.championId, prefLane) ?? '']} />
        </Card>
      </div>

      <BuildItems
        build={build}
        st={st}
        advice={build.queue ? undefined : advice}
        onRunes={(perks) => onApply({ perks }, 'runes')}
        action={<Button variant="ghost" className="!px-3 !py-1 !text-[12px]" onClick={() => onApply({ items: true }, 'items')}>{t('items.import')}</Button>}
      />

      {!build.queue && (
        <Matchups
          build={build}
          st={st}
          enemyId={enemyId}
          limit={4}
          onApply={(perks) => onApply({ perks }, 'runes')}
          right={
            <span className="text-[11.5px] text-mute">
              {enemy ? (
                <>
                  {t('draft.vsEnemy')}: <span className="font-semibold text-fg">{enemy.name}</span>
                  {enemyVs != null && <> · {t('draft.vsWr')} <span className={`font-bold ${wrColor(enemyVs)}`}>{fmtPct(enemyVs)}</span></>}
                </>
              ) : t('draft.vsUnknown')}
            </span>
          }
        />
      )}
    </div>
  )
}

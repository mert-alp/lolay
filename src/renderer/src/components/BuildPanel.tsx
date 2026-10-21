import { useRef } from 'react'
import { champIcon, TIME_BUCKETS, type ApplyRequest, type Build, type ChampSelectState, type Matchup, type Settings, type StaticData } from '@shared/types'
import { useT } from '../i18n'
import { fmtGames, fmtPct, wrColor } from '../util'
import { Button, Card, Eyebrow } from './ui'
import { BuildItems, useItemAdvice } from './BuildItems'
import { prefKey } from '@shared/prefs'
import { RuneSection, saveRunePref } from './RunePageCard'
import { SkillOrder } from './SkillOrder'
import { SpellControl } from './SpellPicker'
import type { PushToast } from './Toasts'

export type ApplyFn = (req: Omit<ApplyRequest, 'championId' | 'lane'>, kind: 'runes' | 'spells' | 'items') => void

function Matchups({ title, list, st, enemyId }: { title: string; list: Matchup[]; st: StaticData; enemyId: number | null }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold">{title}</div>
      <div className="space-y-0.5">
        {list.slice(0, 4).map((m) => {
          const c = st.champions[m.championId]
          if (!c) return null
          return (
            <div key={m.championId} className={`flex items-center gap-2.5 rounded-lg px-2 py-1 ${m.championId === enemyId ? 'bg-gold/10 ring-1 ring-gold/40' : ''}`}>
              <img src={champIcon(st.version, c.id)} alt="" className="size-7 rounded-md border border-line" />
              <span className="flex-1 truncate text-[12.5px] font-medium">{c.name}</span>
              <span className={`text-[12.5px] font-bold ${wrColor(m.wr)}`}>{fmtPct(m.wr)}</span>
              <span className="w-12 text-right text-[10.5px] text-mute">{fmtGames(m.n)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// win rate per game length around the 50% line: up = wins more, the strongest bucket in gold
function PowerCurve({ wr }: { wr: (number | null)[] }) {
  const t = useT()
  const vals = wr.filter((v): v is number => v != null)
  if (vals.length < 3) return null
  const span = Math.max(3, ...vals.map((v) => Math.abs(v - 50)))
  const peak = wr.indexOf(Math.max(...vals))
  return (
    <Card className="p-4">
      <Eyebrow right={<span className="text-[11.5px] text-mute">{t('power.peak')}: <span className="font-semibold text-gold">{TIME_BUCKETS[peak]} {t('power.min')}</span></span>}>
        {t('power.title')}
      </Eyebrow>
      <div className="relative grid h-[104px] grid-cols-7 gap-2">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        {wr.map((v, i) => {
          const up = v != null && v >= 50
          const h = v == null ? 0 : (Math.abs(v - 50) / span) * 34 // % of the cell; leaves room for the number
          const edge = `calc(50% + ${h}% + 3px)`
          return (
            <div key={i} className="relative" title={v == null ? undefined : t('power.tip').replace('{t}', TIME_BUCKETS[i]).replace('{wr}', v.toFixed(1))}>
              <span className={`absolute inset-x-1 rounded-sm transition-[height] duration-500 ${up ? 'bottom-1/2' : 'top-1/2'} ${i === peak ? 'bg-gold shadow-[0_0_12px_-2px_rgba(200,170,110,.7)]' : up ? 'bg-win/60' : 'bg-loss/60'}`} style={{ height: `${h}%` }} />
              {v != null && <span className={`absolute inset-x-0 text-center text-[10.5px] font-bold ${i === peak ? 'text-gold' : wrColor(v)}`} style={up ? { bottom: edge } : { top: edge }}>{v.toFixed(1)}</span>}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-2 text-center text-[10.5px] text-mute">{TIME_BUCKETS.map((b) => <span key={b}>{b}</span>)}</div>
    </Card>
  )
}

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
        <Card className="p-4">
          <SkillOrder order={build.skillOrder} priority={build.skillPriority} />
        </Card>
      </div>

      <BuildItems
        build={build}
        st={st}
        advice={build.queue ? undefined : advice}
        action={<Button variant="ghost" className="!px-3 !py-1 !text-[12px]" onClick={() => onApply({ items: true }, 'items')}>{t('items.import')}</Button>}
      />

      {build.timeWr && <PowerCurve wr={build.timeWr} />}

      {!build.queue && <Card className="p-4">
        <Eyebrow
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
        >
          {t('counters.title')}
        </Eyebrow>
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
          <Matchups title={t('counters.strong')} list={build.counters.strong} st={st} enemyId={enemyId} />
          <Matchups title={t('counters.weak')} list={build.counters.weak} st={st} enemyId={enemyId} />
        </div>
      </Card>}
    </div>
  )
}

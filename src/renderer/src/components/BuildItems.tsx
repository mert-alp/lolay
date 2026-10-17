import { Fragment, type ReactNode } from 'react'
import { champIcon, type Build, type ItemStat, type StaticData } from '@shared/types'
import { buildPath, HIGH_CC, ONE_SIDED, type AdviceKind, type ItemAdvice } from '@shared/itemRules'
import { useLang, useT, type Key } from '../i18n'
import { toward } from '../util'
import { Card, Eyebrow } from './ui'
import { Arrow, ItemIcon, ItemSetRow } from './ItemIcon'

const label = 'mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute'
const ADVICE: Record<AdviceKind, Key> = { mr: 'adv.mr', armor: 'adv.armor', tenacity: 'adv.tenacity', antiheal: 'adv.antiheal' }

// the champion's own numbers for an item: the full Lolalytics list, else the 4th-6th item options
const statOf = (b: Build, id: number): ItemStat | undefined => b.items?.find((i) => i.id === id) ?? [...b.boots, ...b.item4, ...b.item5, ...b.item6].find((i) => i.id === id)

function Chip({ children, color, title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span title={title} className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-white/[.03] px-2 text-[11.5px] font-semibold" style={color ? { color } : undefined}>
      {children}
    </span>
  )
}

function Advice({ advice, st }: { advice: ItemAdvice | null; st: StaticData }) {
  const t = useT()
  const lang = useLang()
  if (!advice) return <div className="space-y-2"><div className="skeleton h-6 w-1/2" /><div className="skeleton h-[60px]" /></div>
  const { comp, rows, vs } = advice
  const names = (ids: number[]) => ids.map((id) => st.champions[id]?.name).filter(Boolean).join(', ')
  const cc = comp.cc && (comp.cc.avg >= HIGH_CC ? 'adv.cc.high' : comp.cc.avg >= 1.7 ? 'adv.cc.mid' : 'adv.cc.low')
  const vsChamp = vs ? st.champions[vs.championId] : undefined
  const icons = (list: ItemStat[]) => <div className="flex flex-wrap gap-3">{list.map((i) => <ItemIcon key={i.id} id={i.id} st={st} size={36} wr={i.wr} n={i.n} />)}</div>

  return (
    <div className="grid gap-x-8 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
      <div>
        <div className={label}>{t('adv.title')}</div>
        {advice.enemies === 0 ? (
          <p className="text-[12px] text-mute">{t('adv.wait')}</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {comp.pct && (
                <>
                  <Chip color={comp.pct.physical >= ONE_SIDED ? '#ef5350' : undefined}>AD {Math.round(comp.pct.physical)}%</Chip>
                  <Chip color={comp.pct.magic >= ONE_SIDED ? '#4aa3ff' : undefined}>AP {Math.round(comp.pct.magic)}%</Chip>
                </>
              )}
              {cc && <Chip color={cc === 'adv.cc.high' ? '#f0c35a' : undefined} title={comp.cc!.high.length ? names(comp.cc!.high) : undefined}>{t('adv.cc')}: {t(cc)}</Chip>}
              {comp.healers.length > 0 && <Chip color="#4fb6b0" title={names(comp.healers)}>{t('adv.heal')}: {names(comp.healers)}</Chip>}
            </div>
            {rows.length ? (
              <div className="space-y-3">
                {rows.map((r) => (
                  <div key={r.kind}>
                    <div className="mb-1.5 text-[12px] font-semibold">{t(ADVICE[r.kind])}</div>
                    {icons(r.items)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-mute">{t('adv.balanced')}</p>
            )}
          </>
        )}
      </div>
      {vs && vsChamp && (
        <div>
          <div className={`${label} flex items-center gap-1.5`}>
            <img src={champIcon(st.version, vsChamp.id)} alt="" className="size-4 rounded" />
            {t('adv.vs').replace('{name}', toward(lang, vsChamp.name))}
          </div>
          {vs.items.length ? icons(vs.items) : <p className="text-[12px] text-mute">{t('adv.vsSame')}</p>}
        </div>
      )}
    </div>
  )
}

// The items card: the popular build as one path, its options, and (champ select) advice against the enemy team.
// advice: undefined = no advice section, null = loading
export function BuildItems({ build, st, action, advice }: { build: Build; st: StaticData; action?: ReactNode; advice?: ItemAdvice | null }) {
  const t = useT()
  const { path, boots, options } = buildPath(build)
  const ordered = [...path.slice(0, 1), ...boots, ...path.slice(1)] // boots usually come after the first item
  return (
    <Card className="p-4">
      <Eyebrow right={action}>{t('items.title')}</Eyebrow>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <div>
          <div className={label}>{t('items.start')}</div>
          <div className="flex gap-3">{build.startItems.slice(0, 2).map((s) => <ItemSetRow key={s.ids.join()} ids={s.ids} st={st} wr={s.wr} n={s.n} size={34} />)}</div>
        </div>
        {ordered.length > 0 && (
          <div className="min-w-0">
            <div className={label}>{t('items.popular')}</div>
            <div className="flex flex-wrap items-start gap-x-2 gap-y-3">
              {ordered.map((id, i) => {
                const s = statOf(build, id)
                return (
                  <Fragment key={id}>
                    {i > 0 && <Arrow />}
                    <ItemIcon id={id} st={st} size={42} wr={s?.wr} n={s?.n} />
                  </Fragment>
                )
              })}
            </div>
          </div>
        )}
        {options.length > 0 && (
          <div>
            <div className={label}>{t('items.options')}</div>
            <div className="flex gap-2.5">{options.map((id) => { const s = statOf(build, id); return <ItemIcon key={id} id={id} st={st} size={34} wr={s?.wr} n={s?.n} /> })}</div>
          </div>
        )}
      </div>
      {advice !== undefined && <div className="mt-4 border-t border-line pt-3.5"><Advice advice={advice} st={st} /></div>}
    </Card>
  )
}

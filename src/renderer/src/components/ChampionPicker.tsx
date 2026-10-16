import { useEffect, useMemo, useRef, useState } from 'react'
import { champIcon, LANES, type Lane, type StaticData, type Tier } from '@shared/types'
import { useLang, useT, type Key } from '../i18n'
import { fold, sortLocale } from '../util'

interface Props {
  st: StaticData | null
  tier: Tier
  ban: boolean
  usable: Set<number> | null // pickable / bannable now; null = not known yet, the client decides
  canSelect: boolean // there is an open action to hover on
  selected: number
  onSelect: (id: number) => void
  onAct: (id?: number) => void // lock in / ban; no id = the current selection
}

const chipCls = (on: boolean) =>
  `no-drag h-7 shrink-0 rounded-lg border px-3 text-[12px] font-semibold transition-colors duration-150 ${
    on ? 'border-gold/60 bg-gold/10 text-gold' : 'border-line bg-[#12161d] text-mute hover:border-[#2f384c] hover:text-fg'
  }`

export function ChampionPicker({ st, tier, ban, usable, canSelect, selected, onSelect, onAct }: Props) {
  const t = useT()
  const lang = useLang()
  const [q, setQ] = useState('')
  const [lane, setLane] = useState<Lane | 'all'>('all')
  const [lanes, setLanes] = useState<Record<string, Set<number> | null>>({}) // `${tier}:${lane}` -> champions in that lane, null = failed
  const input = useRef<HTMLInputElement>(null)

  const all = useMemo(
    () => (st ? Object.values(st.champions).sort((a, b) => a.name.localeCompare(b.name, sortLocale(lang))).map((c) => ({ c, f: fold(c.name) + ' ' + fold(c.id) })) : []),
    [st, lang]
  )

  const laneKey = `${tier}:${lane}`
  useEffect(() => {
    if (lane === 'all' || laneKey in lanes) return
    let live = true
    window.lolay.getMeta({ lane, tier, compare: false })
      .then((r) => live && setLanes((m) => ({ ...m, [laneKey]: new Set(r.rows.map((x) => x.championId)) })))
      .catch(() => live && setLanes((m) => ({ ...m, [laneKey]: null })))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneKey])
  const inLane = lane === 'all' ? undefined : lanes[laneKey]

  const list = useMemo(() => {
    if (inLane === undefined && lane !== 'all') return []
    const f = fold(q.trim())
    return all.filter((x) => (!f || x.f.includes(f)) && (!inLane || inLane.has(x.c.key)))
  }, [all, q, lane, inLane])

  const off = (id: number) => !!usable && !usable.has(id)
  const only = list.length === 1 && !off(list[0].c.key) ? list[0].c.key : undefined

  // typing anywhere goes to the search box; Ctrl+Enter locks in / bans the single result, else the selection
  const onActRef = useRef(onAct)
  onActRef.current = onAct
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        return onActRef.current(only)
      }
      const el = document.activeElement
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ' || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      input.current?.focus()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [only])

  const accent = ban ? 'border-loss shadow-[0_0_14px_-4px_rgba(239,68,68,.8)]' : 'border-gold shadow-[0_0_14px_-4px_rgba(200,170,110,.7)]'

  return (
    <div className="space-y-3">
      <div className="group relative">
        <svg className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute transition-colors group-focus-within:text-gold" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>
        <input
          ref={input}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && only) onSelect(only) }}
          placeholder={t('draft.search')}
          aria-label={t('draft.search')}
          className="no-drag h-10 w-full min-w-0 rounded-xl border border-line bg-[#12161d] pr-3 pl-10 text-[14px] text-fg outline-none transition-all placeholder:text-mute focus:border-gold/50 focus:shadow-[0_0_0_4px_rgba(200,170,110,.08)] focus-visible:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setLane('all')} className={chipCls(lane === 'all')}>{t('draft.laneAll')}</button>
        {LANES.map((l) => <button key={l} onClick={() => setLane(l)} className={chipCls(lane === l)}>{t(`lane.${l}` as Key)}</button>)}
        <span className="ml-auto hidden text-[10.5px] text-mute/80 md:inline">{t(ban ? 'draft.pickerHintBan' : 'draft.pickerHint')}</span>
      </div>

      {!st ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-2">{Array.from({ length: 18 }, (_, i) => <div key={i} className="skeleton h-[84px]" />)}</div>
      ) : inLane === undefined && lane !== 'all' ? (
        <p className="py-10 text-center text-[12.5px] text-mute">{t('draft.laneLoading')}</p>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-[12.5px] text-mute">{t('draft.poolNone')}</p>
      ) : (
        <>
          {inLane === null && <p className="text-[11.5px] text-mute">{t('draft.laneErr')}</p>}
          <div className="grid max-h-[min(56vh,440px)] min-h-[200px] grid-cols-[repeat(auto-fill,minmax(68px,1fr))] content-start gap-x-1 gap-y-2 overflow-y-auto pr-1">
            {list.map(({ c }) => {
              const grey = off(c.key)
              const on = c.key === selected
              const hot = !grey && canSelect
              return (
                <button
                  key={c.key}
                  onClick={(e) => { if (e.detail < 2) onSelect(c.key) }}
                  onDoubleClick={() => onAct(c.key)}
                  disabled={grey || !canSelect}
                  title={grey ? t(ban ? 'draft.bannedTip' : 'draft.unavailable') : c.name}
                  className="no-drag group/c flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-colors duration-150 enabled:hover:bg-card"
                >
                  <img
                    src={champIcon(st.version, c.id)}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    style={{ width: 56, height: 56 }}
                    className={`rounded-xl border transition-all duration-150 ${on ? accent : 'border-line'} ${grey ? 'opacity-40 grayscale' : hot ? (ban ? 'group-hover/c:border-loss/70' : 'group-hover/c:border-gold/70') : ''}`}
                  />
                  <span className={`w-full truncate text-center text-[11.5px] ${on ? (ban ? 'font-semibold text-loss' : 'font-semibold text-gold') : grey ? 'text-mute/50' : hot ? 'text-mute group-hover/c:text-fg' : 'text-mute'}`}>{c.name}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

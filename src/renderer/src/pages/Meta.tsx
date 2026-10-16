import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { champIcon, LANES, type AppState, type Lane, type MetaResult, type MetaRow, type StaticData } from '@shared/types'
import { useLang, useT, type Key } from '../i18n'
import { TIER_BADGE, fmtGames, fmtPct, fold, sortLocale, tierName } from '../util'
import { Button, Card, Segmented } from '../components/ui'
import { Crest } from '../components/TierSelect'

type LaneSel = Lane | 'all'
type SortKey = 'rank' | 'tier' | 'name' | 'wr' | 'delta' | 'dWr' | 'pr' | 'br' | 'games'
type Dir = 'asc' | 'desc'

const TIER_ORDER = ['S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-']
const tierIdx = (t: string) => (TIER_ORDER.includes(t) ? TIER_ORDER.indexOf(t) : 99)
const DESC_FIRST: SortKey[] = ['wr', 'delta', 'dWr', 'pr', 'br', 'games']

// neutral at 0, fading into green / red; `span` is the deviation that gets the full color
const mix = (k: number, to: number[]) => `rgb(${[230, 232, 238].map((v, i) => Math.round(v + (to[i] - v) * k)).join(',')})`
const tint = (dev: number, span: number) => mix(0.2 + 0.8 * Math.min(Math.abs(dev) / span, 1), dev >= 0 ? [74, 222, 128] : [248, 113, 113])
const signed = (n: number, digits = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`

const sv = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// map square with the lane highlighted
function LaneIcon({ lane, size = 16 }: { lane: LaneSel; size?: number }) {
  return (
    <svg {...sv} width={size} height={size} aria-hidden>
      {lane === 'all' ? (
        <g strokeWidth="1.5"><rect x="3" y="3" width="5.5" height="5.5" rx="1.2" /><rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" /><rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" /><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" /></g>
      ) : (
        <>
          <path d="M3.5 3.5h13v13h-13zM3.5 16.5l13-13" strokeWidth="1" opacity=".35" />
          {lane === 'top' && <path d="M3.5 12V3.5H12" strokeWidth="2.4" />}
          {lane === 'jungle' && <path d="m10 6.2 3.8 3.8-3.8 3.8-3.8-3.8z" strokeWidth="1.6" fill="currentColor" fillOpacity=".35" />}
          {lane === 'middle' && <path d="m6.5 13.5 7-7" strokeWidth="2.4" />}
          {lane === 'bottom' && <path d="M16.5 8v8.5H8" strokeWidth="2.4" />}
          {lane === 'support' && <path d="M16.5 8v8.5H8M5.5 7.5h4M7.5 5.5v4" strokeWidth="1.8" />}
        </>
      )}
    </svg>
  )
}

function TierBadge({ label }: { label: string }) {
  if (!label) return <span className="text-mute">–</span>
  const c = TIER_BADGE[label] ?? TIER_BADGE[label[0]] ?? '#8a93a6'
  return (
    <span
      className="inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-md border px-1.5 text-[12px] font-extrabold leading-none"
      style={{ color: c, borderColor: c + '66', background: c + '1a', boxShadow: label === 'S+' ? `0 0 14px -3px ${c}aa` : undefined }}
    >
      {label}
    </span>
  )
}

const Star = ({ on, size = 16 }: { on: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
    <path d="m10 2.8 2.2 4.5 4.9.7-3.55 3.45.85 4.9L10 14l-4.4 2.35.85-4.9L2.9 8l4.9-.7z" />
  </svg>
)

function StarBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`grid size-7 place-items-center rounded-md transition-all duration-150 ${
        on ? 'text-gold drop-shadow-[0_0_6px_rgba(200,170,110,.6)]' : 'text-[#4a5266] hover:bg-white/[.06] hover:text-gold/80'
      }`}
    >
      <Star on={on} />
    </button>
  )
}

interface Cols { key: SortKey; label: Key; tip?: Key; align: 'l' | 'r' | 'c' }
const COLS: Cols[] = [
  { key: 'rank', label: 'meta.col.rank', align: 'c' },
  { key: 'tier', label: 'meta.col.tier', align: 'c' },
  { key: 'name', label: 'meta.col.champ', align: 'l' },
  { key: 'wr', label: 'meta.col.wr', align: 'r' },
  { key: 'delta', label: 'meta.col.delta', tip: 'meta.tip.delta', align: 'r' },
  { key: 'dWr', label: 'meta.col.dpatch', tip: 'meta.tip.dpatch', align: 'r' },
  { key: 'pr', label: 'stat.pr', align: 'r' },
  { key: 'br', label: 'stat.br', align: 'r' },
  { key: 'games', label: 'stat.games', align: 'r' }
]
// cells that drop out as the window narrows (grid templates live in styles.css as .mg)
const HIDE: Partial<Record<SortKey | 'role', string>> = { rank: 'max-sm:hidden', dWr: 'max-sm:hidden', br: 'max-md:hidden', role: 'max-lg:hidden', delta: 'max-lg:hidden', games: 'max-lg:hidden' }
const alignCls = { l: 'justify-start text-left', r: 'justify-end text-right', c: 'justify-center text-center' }

interface RowProps {
  r: MetaRow
  name: string
  icon: string
  role: boolean
  watched: boolean
  laneLabel: string
  watchLabel: string
  prevLabel: string
  onOpen: (id: number, lane: Lane) => void
  onWatch: (id: number) => void
}

const Row = memo(function Row({ r, name, icon, role, watched, laneLabel, watchLabel, prevLabel, onOpen, onWatch }: RowProps) {
  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onOpen(r.championId, r.lane)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.championId, r.lane) }}
      className={`mg ${role ? 'mg-role' : ''} group/r grid h-[46px] cursor-pointer items-center gap-x-2 border-b border-line/60 px-2 text-[13px] transition-colors duration-100 last:border-b-0 hover:bg-white/[.035] hover:shadow-[inset_2px_0_0_rgba(200,170,110,.85)] focus-visible:bg-white/[.035]`}
    >
      <span className="flex justify-center"><StarBtn on={watched} onClick={() => onWatch(r.championId)} label={watchLabel} /></span>
      <span className="text-center text-[12px] font-medium text-mute max-sm:hidden">{r.rank}</span>
      <span className="flex justify-center"><TierBadge label={r.tier} /></span>
      <span className="flex min-w-0 items-center gap-2 sm:gap-3">
        <img src={icon} alt="" width={30} height={30} loading="lazy" decoding="async" style={{ width: 30, height: 30 }} className="shrink-0 rounded-lg border border-line transition-colors group-hover/r:border-gold/60" />
        <span className="truncate font-medium" title={name}>{name}</span>
      </span>
      {role && (
        <span className="flex items-center gap-1.5 text-[12px] text-mute max-lg:hidden" title={laneLabel}>
          <LaneIcon lane={r.lane} />
          <span className="truncate">{laneLabel}</span>
          <span className="ml-auto text-[11px] text-[#6b7589]">{Math.round(r.pctLane)}%</span>
        </span>
      )}
      <span className="text-right font-semibold" style={{ color: tint(r.wr - 50, 4) }}>{fmtPct(r.wr)}</span>
      <span className="text-right text-[12px] max-lg:hidden" style={{ color: tint(r.delta, 3) }}>{signed(r.delta)}</span>
      <span className="text-right text-[12px] font-medium max-sm:hidden" style={{ color: r.dWr == null ? '#5a6275' : tint(r.dWr, 1) }} title={r.dWr == null ? undefined : prevLabel}>
        {r.dWr == null ? '–' : signed(r.dWr)}
      </span>
      <span className="text-right text-fg/90" title={r.dPr == null ? undefined : `${signed(r.dPr)} pp`}>{fmtPct(r.pr)}</span>
      <span className="text-right text-fg/90 max-md:hidden">{fmtPct(r.br)}</span>
      <span className="text-right text-mute max-lg:hidden">{fmtGames(r.games)}</span>
    </div>
  )
})

const Caret = ({ dir }: { dir: Dir }) => (
  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={dir === 'asc' ? 'rotate-180' : ''} aria-hidden>
    <path d="M2 3.5 5 6.5 8 3.5" />
  </svg>
)

function Mover({ r, name, icon, value, color, sub, onOpen }: { r: MetaRow; name: string; icon: string; value: string; color: string; sub: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} title={`${name} · ${sub}`} className="group/m flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-colors hover:bg-white/[.05]">
      <img src={icon} alt="" width={40} height={40} decoding="async" style={{ width: 40, height: 40 }} className="rounded-xl border border-line transition-all group-hover/m:scale-105 group-hover/m:border-gold/60" />
      <span className="w-full truncate text-center text-[11.5px] text-fg/90">{name}</span>
      <span className="text-[13px] font-bold leading-none" style={{ color }}>{value}</span>
      <span className="text-[10px] leading-none text-mute">{fmtPct(r.wr)}</span>
    </button>
  )
}

interface Props {
  state: AppState
  st: StaticData | null
  onPick: (id: number, lane?: Lane) => void
}

// lane and sort survive a trip to the champion page and back
let remembered: { lane: LaneSel; sort: { key: SortKey; dir: Dir } } = { lane: 'all', sort: { key: 'tier', dir: 'asc' } }

export function Meta({ state, st, onPick }: Props) {
  const t = useT()
  const lang = useLang()
  const [lane, setLane] = useState<LaneSel>(remembered.lane)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(remembered.sort)
  const [res, setRes] = useState<{ key: string; data: MetaResult } | null>(null)
  const [err, setErr] = useState(false)
  const [retry, setRetry] = useState(0)
  remembered = { lane, sort }
  const tier = state.tier
  const key = `${lane}:${tier}`

  useEffect(() => {
    let live = true
    setErr(false)
    window.lolay.getMeta({ lane, tier })
      .then((data) => live && setRes({ key, data }))
      .catch(() => live && setErr(true))
    return () => { live = false }
  }, [key, retry])

  const data = res?.key === key ? res.data : null
  const loading = !data && !err
  const watch = state.settings.watchlist
  const nameOf = useCallback((id: number) => st?.champions[id]?.name ?? String(id), [st])
  const iconOf = useCallback((id: number) => (st?.champions[id] ? champIcon(st.version, st.champions[id].id) : ''), [st])
  const open = useCallback((id: number, l?: Lane) => onPick(id, lane === 'all' ? undefined : l), [onPick, lane])
  const toggle = useCallback(
    (id: number) => window.lolay.setSettings({ watchlist: watch.includes(id) ? watch.filter((x) => x !== id) : [...watch, id] }),
    [watch]
  )

  const rows = useMemo(() => {
    if (!data || !st) return []
    const f = fold(q.trim())
    const list = f ? data.rows.filter((r) => fold(nameOf(r.championId) + ' ' + (st.champions[r.championId]?.id ?? '')).includes(f)) : data.rows
    const sign = sort.dir === 'asc' ? 1 : -1
    const val = (r: MetaRow): number => (sort.key === 'tier' ? tierIdx(r.tier) : sort.key === 'name' ? 0 : r[sort.key] ?? NaN)
    const col = new Intl.Collator(sortLocale(lang))
    return [...list].sort((a, b) => {
      if (sort.key === 'name') return sign * col.compare(nameOf(a.championId), nameOf(b.championId))
      const x = val(a), y = val(b)
      if (Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1 // rows without a value always last
      return sign * (x - y) || a.rank - b.rank || b.wr - a.wr
    })
  }, [data, st, q, sort, lang, nameOf])

  const byId = useMemo(() => new Map(data?.rows.map((r) => [r.championId, r])), [data])
  const patch = data?.patch ?? null
  const prevLabel = data?.previousPatch ? `${t('meta.vs')} ${data.previousPatch}` : ''
  const laneLabel = (l: Lane) => t(`lane.${l}`)

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: DESC_FIRST.includes(k) ? 'desc' : 'asc' }))

  const showRole = lane === 'all'
  const watched = watch.filter((id) => st?.champions[id])
  const laneOpts: { value: LaneSel; label: ReactNode }[] = [
    { value: 'all', title: t('tier.all'), label: <span className="flex items-center gap-1.5"><LaneIcon lane="all" /><span className="max-md:hidden">{t('tier.all')}</span></span> },
    ...LANES.map((l) => ({ value: l as LaneSel, title: laneLabel(l), label: <span className="flex items-center gap-1.5"><LaneIcon lane={l} /><span className="max-md:hidden">{laneLabel(l)}</span></span> }))
  ]

  return (
    <div className="mx-auto max-w-[1040px] pb-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold sm:text-[26px] leading-tight tracking-tight">{t('nav.meta')}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-mute">
            <span className="flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-0.5 font-medium text-fg/90">
              <Crest tier={tier} size={16} />
              {tierName(tier, t('tier.all'))}
            </span>
            {patch && <span>{t('stat.patch')} <b className="font-semibold text-fg/90">{patch}</b></span>}
            {data?.previousPatch && <span className="text-[#6b7589]">· {t('meta.vs')} {data.previousPatch}</span>}
          </div>
        </div>
        <div className="group relative w-full min-w-0 sm:w-[260px] sm:shrink-0">
          <svg className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute transition-colors group-focus-within:text-gold" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('home.search')}
            aria-label={t('home.search')}
            className="h-10 w-full rounded-xl border border-line bg-card pr-3 pl-10 text-[13.5px] text-fg outline-none transition-all placeholder:text-mute focus:border-gold/50 focus:shadow-[0_0_0_4px_rgba(200,170,110,.08)]"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Segmented<LaneSel> label={t('lane.label')} value={lane} options={laneOpts} onChange={setLane} />
        {data && <span className="text-[12px] text-mute">{t('meta.count').replace('{n}', String(rows.length))}</span>}
      </div>

      {err ? (
        <Card className="grid place-items-center px-6 py-14 text-center">
          <div>
            <p className="mb-3 font-semibold">{t('err.title')}</p>
            <Button onClick={() => setRetry((n) => n + 1)}>{t('err.retry')}</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            {(['up', 'down'] as const).map((side) => {
              const kind = data?.movers.kind
              const ids = data?.movers[side] ?? []
              const up = side === 'up'
              const title = kind === 'avg' ? t(up ? 'meta.avgUp' : 'meta.avgDown') : t(up ? 'meta.up' : 'meta.down')
              return (
                <Card key={side} className="relative min-w-0 overflow-hidden px-2.5 pt-3 pb-2 sm:px-3.5">
                  <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${up ? 'from-win/70' : 'from-loss/70'} via-transparent to-transparent`} />
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={up ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={up ? '' : 'scale-y-[-1]'} aria-hidden><path d="m2.5 11 4-4 2.5 2.5 4.5-5M10 4.5h3.5V8" /></svg>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{title}</h3>
                    <span className="ml-auto text-[10.5px] text-[#6b7589]">{kind === 'patch' ? `${data?.previousPatch} → ${patch}` : ''}</span>
                  </div>
                  {loading || !st ? (
                    <div className="grid grid-cols-5 gap-2 rounded-lg bg-[#0f1218] p-1.5">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-[96px]" />)}</div>
                  ) : ids.length === 0 ? (
                    <p className="py-8 text-center text-[12px] text-mute">{t('meta.none')}</p>
                  ) : (
                    <div className="grid grid-cols-5 gap-1 pb-1">
                      {ids.map((id) => {
                        const r = byId.get(id)!
                        const v = kind === 'patch' ? r.dWr! : r.delta
                        return (
                          <Mover
                            key={id} r={r} name={nameOf(id)} icon={iconOf(id)} value={`${signed(v)} WR`} color={tint(v, kind === 'patch' ? 1.2 : 3)}
                            sub={kind === 'patch' ? `${signed(r.dPr ?? 0)} PR · %${r.wr.toFixed(1)}` : t('meta.tip.delta')} onOpen={() => open(id, r.lane)}
                          />
                        )
                      })}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
          {data?.movers.kind === 'avg' && <p className="-mt-2 mb-4 text-[11.5px] text-mute">{t('meta.noPrev')}</p>}

          <Card className="relative mb-4 px-3.5 pt-3 pb-3.5">
            <div className="mb-2.5 flex items-center gap-2 px-1">
              <span className="text-gold"><Star on size={14} /></span>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{t('meta.watch')}</h3>
              {watched.length > 0 && <span className="rounded-full bg-white/[.06] px-1.5 text-[10.5px] font-semibold text-mute">{watched.length}</span>}
            </div>
            {watched.length === 0 ? (
              <p className="px-1 pb-0.5 text-[12.5px] text-mute">{t('meta.watchHint')}</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(236px,100%),1fr))] gap-2">
                {watched.map((id) => {
                  const r = byId.get(id)
                  return (
                    <div
                      key={id}
                      role="button"
                      tabIndex={0}
                      onClick={() => open(id, r?.lane)}
                      onKeyDown={(e) => { if (e.key === 'Enter') open(id, r?.lane) }}
                      className="group/w flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-[#12161d] py-2 pr-1.5 pl-2.5 transition-colors hover:border-gold/40 hover:bg-[#161b25]"
                    >
                      <img src={iconOf(id)} alt="" width={38} height={38} style={{ width: 38, height: 38 }} className="shrink-0 rounded-lg border border-line group-hover/w:border-gold/60" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{nameOf(id)}</div>
                        {r ? (
                          <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[12px]">
                            <span className="font-semibold" style={{ color: tint(r.wr - 50, 4) }}>{fmtPct(r.wr)}</span>
                            {r.dWr != null && <span className="text-[11px] font-medium" style={{ color: tint(r.dWr, 1) }}>{signed(r.dWr)}</span>}
                            {lane === 'all' && <span className="ml-auto flex min-w-0 items-center gap-1 text-[11px] text-mute"><LaneIcon lane={r.lane} size={13} /><span className="truncate">{laneLabel(r.lane)}</span></span>}
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11.5px] text-mute">{loading ? '…' : t('meta.noRow')}</div>
                        )}
                      </div>
                      {r && <TierBadge label={r.tier} />}
                      <StarBtn on onClick={() => toggle(id)} label={t('meta.watchDel')} />
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <div className="rounded-xl border border-line bg-card">
            <div
              role="row"
              className={`mg ${showRole ? 'mg-role' : ''} sticky top-0 z-10 grid h-9 items-center gap-x-2 rounded-t-xl border-b border-line bg-[#13171f] px-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-mute`}
            >
              <span />
              {COLS.map((c) => {
                const on = sort.key === c.key
                const el = (
                  <button
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    title={c.tip ? t(c.tip) : undefined}
                    aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`flex h-7 min-w-0 items-center gap-1 whitespace-nowrap rounded-md px-1 uppercase transition-colors hover:text-fg ${alignCls[c.align]} ${HIDE[c.key] ?? ''} ${on ? 'text-gold' : ''}`}
                  >
                    {c.key === 'rank' ? '#' : t(c.label)}
                    <span className={`w-2 ${on ? '' : 'opacity-0'}`}><Caret dir={sort.dir} /></span>
                  </button>
                )
                // the role column sits between the champion and the win rate
                return c.key === 'wr' && showRole ? [<span key="role" className="px-1 max-lg:hidden">{t('meta.col.role')}</span>, el] : el
              })}
            </div>

            {loading || !st ? (
              <div className="space-y-1.5 rounded-b-xl bg-[#0f1218] p-2">{Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton h-[38px]" style={{ opacity: 1 - i * 0.06 }} />)}</div>
            ) : rows.length === 0 ? (
              <p className="py-16 text-center text-mute">{t('home.empty')}</p>
            ) : (
              <div role="rowgroup">
                {rows.map((r) => (
                  <Row
                    key={r.championId}
                    r={r}
                    name={nameOf(r.championId)}
                    icon={iconOf(r.championId)}
                    role={showRole}
                    watched={watch.includes(r.championId)}
                    laneLabel={laneLabel(r.lane)}
                    watchLabel={t(watch.includes(r.championId) ? 'meta.watchDel' : 'meta.watchAdd')}
                    prevLabel={prevLabel}
                    onOpen={open}
                    onWatch={toggle}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

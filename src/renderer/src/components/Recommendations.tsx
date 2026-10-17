import { useState, type ReactNode } from 'react'
import { champIcon, type DraftChamp, type DraftRecommendation, type StaticData } from '@shared/types'
import { useLang, useT, type Key } from '../i18n'
import { fmtGames, fmtPct, tierColor, toward, wrColor } from '../util'

function ScoreRing({ score, size = 46 }: { score: number; size?: number }) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const col = score >= 75 ? '#f0c35a' : score >= 62 ? '#4fb6b0' : score >= 48 ? '#3b82f6' : '#8a93a6'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#232a3a" strokeWidth="4" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ filter: `drop-shadow(0 0 4px ${col}88)`, transition: 'stroke-dashoffset .5s' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[14px] font-extrabold" style={{ color: col }}>{score}</span>
    </div>
  )
}

const sectionTitle = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-mute'

// a horizontal strip of champion tiles: scroll-snap on narrow screens, wraps from sm up
function Strip({ title, right, items, empty, tile }: { title: string; right?: ReactNode; items: DraftChamp[] | undefined; empty?: string; tile: (c: DraftChamp) => ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 className={sectionTitle}>{title}</h3>
        {right}
      </div>
      {items && items.length === 0 ? (
        <p className="text-[12px] text-mute">{empty}</p>
      ) : (
        <div className="snap-row -mx-3 flex snap-x scroll-px-3 gap-2 overflow-x-auto px-3 pb-1.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {items ? items.map(tile) : Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-[100px] w-[78px] shrink-0 !rounded-xl" />)}
        </div>
      )}
    </section>
  )
}

interface TileProps {
  src: string
  name: string
  tier?: string
  active?: boolean
  dim?: boolean
  danger?: boolean // ban strip: highlight in red
  title?: string
  onClick?: () => void
  children: ReactNode
}

const FIRST = 6 // cards before "show more"

// expands a card grid past its first FIRST items
function More({ n, open, onToggle }: { n: number; open: boolean; onToggle: () => void }) {
  const t = useT()
  if (n <= FIRST) return null
  return (
    <button
      onClick={onToggle}
      className="no-drag group mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-white/[.02] py-2 text-[12px] font-semibold text-mute transition-colors hover:border-gold/50 hover:bg-gold/[.05] hover:text-gold"
    >
      {open ? t('draft.showLess') : t('draft.showMore').replace('{n}', String(n - FIRST))}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
        <path d="M2 3.5 5 6.5 8 3.5" />
      </svg>
    </button>
  )
}

function Tile({ src, name, tier, active, dim, danger, title, onClick, children }: TileProps) {
  const col = tier ? tierColor(tier) : ''
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={title ?? name}
      className={`no-drag fade-up flex h-[100px] w-[78px] shrink-0 snap-start flex-col items-center rounded-xl border bg-[#12161d] px-1 pt-1.5 text-center transition-all duration-150 enabled:hover:-translate-y-px ${
        active ? (danger ? 'border-loss shadow-[0_0_14px_-4px_rgba(239,68,68,.8)]' : 'border-gold shadow-[0_0_14px_-4px_rgba(200,170,110,.7)]') : 'border-line'
      } ${onClick ? (danger ? 'hover:border-loss/60' : 'hover:border-gold/60') : 'cursor-default'} ${dim ? 'opacity-60' : ''}`}
    >
      <div className="relative shrink-0">
        <img src={src} alt="" draggable={false} className={`size-10 rounded-lg border border-white/10 ${dim ? 'grayscale' : ''}`} />
        {tier && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded border bg-[#0b0e14] px-1 text-[9.5px] leading-[13px] font-extrabold" style={{ color: col, borderColor: col + '77' }}>{tier}</span>}
      </div>
      <div className="mt-2.5 w-full truncate text-[11px] leading-tight font-semibold">{name}</div>
      <div className="w-full truncate text-[10px] leading-tight text-mute">{children}</div>
    </button>
  )
}

interface Props {
  rec: DraftRecommendation | null
  loading: boolean
  error: boolean
  st: StaticData | null
  currentId: number
  banning: boolean // my ban turn: clicking hovers a ban instead of a pick
  banSel: number
  onChoose: (id: number) => void // hover as a pick, or as a ban while `banning`
  onBan: (id: number) => void // ban phase: hover and lock the ban in one step
}

export function Recommendations({ rec, loading, error, st, currentId, banning, banSel, onChoose, onBan }: Props) {
  const t = useT()
  const [allCounters, setAllCounters] = useState(false)
  const [allPicks, setAllPicks] = useState(false)
  const [allBans, setAllBans] = useState(false)
  const lang = useLang()
  const sel = banning ? banSel : currentId
  const icon = (id: number) => {
    const c = st?.champions[id]
    return c && st ? { c, src: champIcon(st.version, c.id) } : null
  }
  const enemy = rec?.enemyId ? icon(rec.enemyId) : null

  const tile = (kind: 'watch' | 'popular') => (c: DraftChamp) => {
    const ic = icon(c.championId)
    if (!ic) return null
    const rate = (label: string, v: number) => <><span className="text-[#6b7589]">{label}</span> {fmtPct(v)}</>
    return (
      <Tile key={c.championId} src={ic.src} name={ic.c.name} tier={c.none ? undefined : c.tier} dim={c.none} active={c.championId === sel} danger={banning} title={c.none ? `${ic.c.name} · ${t('draft.noLaneData')}` : ic.c.name} onClick={() => onChoose(c.championId)}>
        {c.none ? <span className="whitespace-normal text-[9px] leading-[11px]">{t('draft.noLaneData')}</span> : kind === 'watch' ? <span className={wrColor(c.wr)}>{fmtPct(c.wr)}</span> : <>{rate('PR', c.pr)}<br /><span className={wrColor(c.wr)}>{fmtPct(c.wr)}</span></>}
      </Tile>
    )
  }
  const counters = rec?.counters ?? []
  const counterSection = enemy && counters.length > 0 && (
    <section className="rounded-2xl border border-gold/30 bg-gradient-to-b from-gold/[.06] to-transparent p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-3">
        <img src={enemy.src} alt="" draggable={false} className="size-10 shrink-0 rounded-xl border border-gold/50" />
        <div className="min-w-0 leading-tight">
          <h3 className="truncate text-[14px] font-bold text-gold">{t('draft.counterTitle').replace('{name}', toward(lang, enemy.c.name))}</h3>
          <p className="truncate text-[11px] text-mute">{t('draft.counterSub')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 md:grid-cols-3">
        {counters.slice(0, allCounters ? undefined : FIRST).map((c, i) => {
          const ic = icon(c.championId)
          if (!ic) return null
          return (
            <button
              key={c.championId}
              onClick={() => onChoose(c.championId)}
              title={ic.c.name}
              className={`fade-up no-drag flex min-w-0 items-center gap-3 rounded-xl border bg-[#12161d] px-3 py-2.5 text-left transition-all duration-150 hover:-translate-y-px hover:border-gold/60 hover:bg-[#171c26] ${
                c.championId === sel ? (banning ? 'border-loss shadow-[0_0_0_1px_rgba(239,68,68,.35)]' : 'border-gold shadow-[0_0_0_1px_rgba(200,170,110,.35)]') : i === 0 ? 'border-gold/40' : 'border-line'
              }`}
            >
              <div className="relative shrink-0">
                <img src={ic.src} alt="" draggable={false} className="size-12 rounded-xl border border-white/10" />
                {c.tier && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded border bg-[#0b0e14] px-1 text-[9.5px] leading-[13px] font-extrabold" style={{ color: tierColor(c.tier), borderColor: tierColor(c.tier) + '77' }}>{c.tier}</span>}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13.5px] font-bold">{ic.c.name}</div>
                <div className={`text-[18px] font-extrabold ${wrColor(c.vs)}`}>{fmtPct(c.vs)}</div>
                <div className="truncate text-[10.5px] text-mute">
                  {t('draft.counterLine').replace('{name}', toward(lang, enemy.c.name)).replace('{wr}', fmtPct(c.vs)).replace('{n}', fmtGames(c.n))}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      <More n={counters.length} open={allCounters} onToggle={() => setAllCounters((v) => !v)} />
    </section>
  )

  const banMode = banning || rec?.banActionId != null // ban phase: only ban material, no picks yet
  const favSection = (
      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{t('draft.myChamps')}</h3>
        <div className="flex min-h-11 flex-wrap items-center gap-2">
          {rec ? rec.favorites.map((id) => {
            const ic = icon(id)
            const vs = rec.favoriteVs?.[id]
            return ic && (
              <button
                key={id}
                onClick={() => onChoose(id)}
                title={vs != null && enemy ? `${ic.c.name} · ${t('draft.favVs').replace('{name}', enemy.c.name).replace('{wr}', fmtPct(vs))}` : ic.c.name}
                className={`no-drag relative size-11 rounded-xl border transition-all duration-150 hover:scale-105 hover:border-gold/70 ${id === sel ? 'border-gold shadow-[0_0_14px_-2px_rgba(200,170,110,.7)]' : 'border-line'}`}
              >
                <img src={ic.src} alt={ic.c.name} draggable={false} className="size-full rounded-[11px] object-cover" />
                {vs != null && <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded border border-line bg-[#0b0e14] px-1 text-[9.5px] leading-[13px] font-extrabold ${wrColor(vs)}`}>{fmtPct(vs)}</span>}
              </button>
            )
          }) : Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton size-11 !rounded-xl" />)}
        </div>
      </section>
  )
  const strips = (
    <>
      <Strip title={t('draft.watch')} items={rec?.watch} empty={t('draft.watchHint')} tile={tile('watch')} />
      <Strip title={t('draft.popular')} items={rec?.popular} tile={tile('popular')} />
    </>
  )

  if (banMode) {
    const bans = rec?.banPicks ?? []
    const vsChamp = rec?.banVsId ? icon(rec.banVsId)?.c : undefined
    const WHY = { counter: 'border-loss/40 bg-loss/10 text-loss', strong: 'border-gold/40 bg-gold/10 text-gold', mine: 'border-blue/40 bg-blue/10 text-blue' } as const
    return (
      <section>
        <div className="mb-2.5 flex min-h-7 items-center gap-3">
          <h3 className={sectionTitle}>{t('draft.banSuggest')}</h3>
          {loading && rec && <span className="size-3 animate-spin rounded-full border-2 border-loss/30 border-t-loss" />}
        </div>
        {error && !rec ? (
          <p className="py-8 text-center text-[12.5px] text-mute">{t('draft.recErr')}</p>
        ) : rec && bans.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] text-mute">{t('draft.banNoData')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 md:grid-cols-3">
            {(rec ? bans.slice(0, allBans ? undefined : FIRST) : Array.from({ length: FIRST }, () => null)).map((b, i) => {
              const ic = b && icon(b.championId)
              if (!b || !ic) return <div key={i} className="skeleton h-[124px]" />
              const on = b.championId === banSel
              const why = b.reasons[0]
              return (
                <div
                  key={b.championId}
                  className={`fade-up flex flex-col overflow-hidden rounded-xl border bg-[#12161d] transition-all duration-150 ${
                    on ? 'border-loss bg-[#1c1216] shadow-[0_0_0_2px_rgba(239,68,68,.55),0_0_26px_-4px_rgba(239,68,68,.75)]' : 'border-line hover:border-loss/50'
                  }`}
                >
                  <button onClick={() => onChoose(b.championId)} title={ic.c.name} className="no-drag flex min-w-0 flex-1 items-center gap-3 px-3 pt-2.5 pb-2 text-left">
                    <div className="relative shrink-0">
                      <img src={ic.src} alt="" draggable={false} className={`size-[52px] rounded-xl border ${on ? 'border-loss' : 'border-white/10'}`} />
                      {b.tier && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded border bg-[#0b0e14] px-1 text-[9.5px] leading-[13px] font-extrabold" style={{ color: tierColor(b.tier), borderColor: tierColor(b.tier) + '77' }}>{b.tier}</span>}
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-[14px] font-bold">{ic.c.name}</div>
                      <span
                        title={b.vs != null && vsChamp ? t('draft.banCounterTip').replace('{name}', vsChamp.name).replace('{wr}', fmtPct(b.vs)) : undefined}
                        className={`mt-1 inline-block max-w-full truncate rounded-md border px-1.5 py-px text-[10.5px] font-semibold ${WHY[why]}`}
                      >
                        {t(`draft.banWhy.${why}` as Key)}
                      </span>
                      <div className="mt-1 truncate text-[10.5px] text-mute">
                        {b.tier ? <><span className="text-[#6b7589]">BR</span> <span className="text-loss">{fmtPct(b.br)}</span> · <span className="text-[#6b7589]">WR</span> <span className={wrColor(b.wr)}>{fmtPct(b.wr)}</span></> : t('draft.noLaneData')}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => onBan(b.championId)}
                    className="no-drag mx-2.5 mb-2.5 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-[#f0545a] to-[#c02a31] text-[12.5px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(239,68,68,.9)] transition-all duration-150 hover:brightness-110 active:scale-[.97]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
                    {t('draft.ban')}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {rec && <More n={bans.length} open={allBans} onToggle={() => setAllBans((v) => !v)} />}
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {favSection}
      {counterSection}
      {strips}

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{t('draft.recs')}</h3>
          {enemy && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white/[.03] py-0.5 pr-2 pl-0.5 text-[11px] text-mute" title={t('draft.vsEnemy')}>
              <img src={enemy.src} alt="" className="size-5 rounded" />
              {t('draft.vsEnemy')}: <span className="font-semibold text-fg">{enemy.c.name}</span>
            </span>
          )}
          {loading && rec && <span className="size-3 animate-spin rounded-full border-2 border-blue/30 border-t-blue" />}
        </div>

        {error && !rec ? (
          <p className="py-8 text-center text-[12.5px] text-mute">{t('draft.recErr')}</p>
        ) : rec && rec.picks.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] text-mute">{t('draft.recNone')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 md:grid-cols-3">
            {(rec?.picks.slice(0, allPicks ? undefined : FIRST) ?? Array.from({ length: FIRST }, () => null)).map((p, i) => {
              const ic = p && icon(p.championId)
              if (!p || !ic) return <div key={i} className="skeleton h-[88px]" />
              const col = tierColor(p.tier)
              const top = i === 0
              return (
                <button
                  key={p.championId}
                  onClick={() => onChoose(p.championId)}
                  title={t('draft.scoreTip')}
                  className={`fade-up no-drag group relative flex h-[88px] items-center gap-3 overflow-hidden rounded-xl border bg-[#12161d] px-3 text-left transition-all duration-150 hover:-translate-y-px hover:border-gold/60 hover:bg-[#171c26] ${
                    p.championId === sel ? (banning ? 'border-loss shadow-[0_0_0_1px_rgba(239,68,68,.35)]' : 'border-gold shadow-[0_0_0_1px_rgba(200,170,110,.35)]') : top ? 'border-gold/40' : 'border-line'
                  }`}
                >
                  {top && <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />}
                  <div className="relative shrink-0">
                    <img src={ic.src} alt="" draggable={false} className="size-[52px] rounded-xl border border-white/10" />
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-md border bg-[#0b0e14] px-1.5 text-[10px] leading-[15px] font-extrabold" style={{ color: col, borderColor: col + '77' }}>{p.tier}</span>
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[14px] font-bold">{ic.c.name}</div>
                    <div className={`text-[11px] font-semibold ${top ? 'text-gold' : 'text-mute'}`}>#{i + 1} {t('draft.suggest')}</div>
                    <div className="mt-0.5 truncate text-[10.5px] text-mute">
                      <span className={wrColor(p.wr)}>{fmtPct(p.wr)}</span>
                      {p.vs != null && <> · <span className={wrColor(p.vs)}>vs {fmtPct(p.vs)}</span></>}
                      {p.points > 0 && <> · M {fmtGames(p.points)}</>}
                    </div>
                    <div className="mt-0.5 text-[10px] text-mute/70 transition-colors group-hover:text-gold">{t('draft.clickHint')}</div>
                  </div>
                  <ScoreRing score={p.score} />
                </button>
              )
            })}
          </div>
        )}
        {rec && <More n={rec.picks.length} open={allPicks} onToggle={() => setAllPicks((v) => !v)} />}
        <p className="mt-2 text-[10.5px] text-mute/80">{t('draft.scoreTip')}</p>
      </section>
    </div>
  )
}

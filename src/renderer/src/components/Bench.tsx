import { champIcon, type BenchChamp, type DraftBench, type StaticData } from '@shared/types'
import { useT } from '../i18n'
import { fmtPct, tierColor, wrColor } from '../util'

function TierBadge({ tier }: { tier: string }) {
  if (!tier) return null
  const col = tierColor(tier)
  return <span className="rounded-md border px-1.5 text-[10.5px] leading-[16px] font-extrabold" style={{ color: col, borderColor: col + '77', background: col + '1f' }}>{tier}</span>
}

interface Props {
  bench: DraftBench | null
  st: StaticData | null
  onSwap: (championId: number) => void
  onReroll: () => void
}

// ARAM champ select: my champion against the bench, rated by the ARAM tier list; a click takes a bench champion
export function Bench({ bench, st, onSwap, onReroll }: Props) {
  const t = useT()
  const icon = (id: number) => {
    const c = st?.champions[id]
    return c && st ? { name: c.name, src: champIcon(st.version, c.id) } : null
  }
  if (!bench) return <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 md:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[76px]" />)}</div>

  const mine = bench.mine
  const me = mine && icon(mine.championId)
  const card = (b: BenchChamp, i: number) => {
    const ic = icon(b.championId)
    if (!ic) return null
    const diff = mine && b.tier && mine.tier ? b.wr - mine.wr : null
    const better = diff != null && diff > 0
    return (
      <button
        key={b.championId}
        onClick={() => onSwap(b.championId)}
        title={t('bench.take').replace('{name}', ic.name)}
        className={`fade-up no-drag group flex min-w-0 items-center gap-3 rounded-xl border bg-[#12161d] px-3 py-2.5 text-left transition-all duration-150 hover:-translate-y-px hover:border-gold/60 hover:bg-[#171c26] ${better && i === 0 ? 'border-gold/50' : 'border-line'}`}
      >
        <img src={ic.src} alt="" draggable={false} className="size-12 shrink-0 rounded-xl border border-white/10" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-bold">{ic.name}</span>
            <TierBadge tier={b.tier} />
          </div>
          {b.tier ? (
            <div className="mt-0.5 text-[12px]">
              <span className={`font-bold ${wrColor(b.wr)}`}>{fmtPct(b.wr)}</span>
              {diff != null && <span className={`ml-1.5 text-[11px] font-semibold ${better ? 'text-win' : 'text-loss'}`}>{better ? '+' : ''}{diff.toFixed(1)}</span>}
            </div>
          ) : (
            <div className="mt-0.5 text-[11px] text-mute">{t('bench.noData')}</div>
          )}
          <div className="mt-0.5 text-[10px] text-mute/70 transition-colors group-hover:text-gold">{t('bench.click')}</div>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold/30 bg-gradient-to-b from-gold/[.06] to-transparent p-3 sm:p-4">
        {me ? <img src={me.src} alt="" draggable={false} className="size-12 shrink-0 rounded-xl border border-gold/50" /> : <span className="size-12 shrink-0 rounded-xl border border-dashed border-line" />}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{t('bench.mine')}</div>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-gold">{me?.name ?? '—'}</span>
            {mine && <TierBadge tier={mine.tier} />}
            {mine?.tier && <span className={`text-[13px] font-bold ${wrColor(mine.wr)}`}>{fmtPct(mine.wr)}</span>}
          </div>
        </div>
        {bench.rerolls != null && (
          <button
            onClick={onReroll}
            disabled={bench.rerolls < 1}
            className="no-drag inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-[#1a2030] px-3.5 text-[12.5px] font-semibold transition-colors enabled:hover:border-gold/60 enabled:hover:text-gold disabled:text-mute"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /></svg>
            {t('bench.reroll')}
            <span className="rounded bg-black/30 px-1.5 text-[11px] text-mute">{bench.rerolls}</span>
          </button>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{t('bench.title')}</h3>
        {bench.bench.length ? (
          <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 md:grid-cols-3">{bench.bench.map(card)}</div>
        ) : (
          <p className="py-6 text-center text-[12.5px] text-mute">{t('bench.empty')}</p>
        )}
      </section>
    </div>
  )
}

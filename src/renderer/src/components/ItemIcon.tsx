import { itemIcon, type StaticData } from '@shared/types'
import { fmtGames, fmtPct, wrColor } from '../util'
import { Tip, itemTip } from './Tooltip'

export function ItemIcon({ id, st, size = 40, wr, n, count }: { id: number; st: StaticData; size?: number; wr?: number; n?: number; count?: number }) {
  const it = st.items[id]
  return (
    <Tip tip={itemTip(st, id)} className="flex-col items-center gap-1">
      <div className="relative">
        <img
          src={itemIcon(st.version, id)}
          alt={it?.name ?? ''}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          style={{ width: size, height: size }}
          className="rounded-lg border border-line bg-bg transition-transform duration-150 hover:scale-105 hover:border-gold/60"
        />
        {count && count > 1 && (
          <span className="absolute -right-1 -bottom-1 rounded bg-[#0e1015] px-1 text-[10px] font-bold leading-4 text-gold ring-1 ring-line">×{count}</span>
        )}
      </div>
      {wr != null && <span className={`text-[11px] font-semibold leading-none ${wrColor(wr)}`}>{fmtPct(wr)}</span>}
      {n != null && <span className="text-[10px] leading-none text-mute">{fmtGames(n)}</span>}
    </Tip>
  )
}

export const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#5a6275" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-[15px] shrink-0">
    <path d="m5 2.5 4.5 4.5L5 11.5" />
  </svg>
)

/** Items of a set, collapsing duplicates (2003,2003 -> one icon with x2). */
export function ItemSetRow({ ids, st, size = 38, wr, n }: { ids: number[]; st: StaticData; size?: number; wr?: number; n?: number }) {
  const counts = new Map<number, number>()
  for (const i of ids) counts.set(i, (counts.get(i) ?? 0) + 1)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1.5">
        {[...counts].map(([id, c]) => <ItemIcon key={id} id={id} st={st} size={size} count={c} />)}
      </div>
      {wr != null && <span className={`text-[11px] font-semibold leading-none ${wrColor(wr)}`}>{fmtPct(wr)}</span>}
      {n != null && <span className="text-[10px] leading-none text-mute">{fmtGames(n)}</span>}
    </div>
  )
}

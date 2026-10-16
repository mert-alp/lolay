import { useT } from '../i18n'
import { Eyebrow } from './ui'

const ROWS = ['Q', 'W', 'E', 'R']

export function SkillOrder({ order, priority }: { order: string; priority: string }) {
  const t = useT()
  const levels = Array.from({ length: 15 }, (_, i) => i)
  return (
    <div>
      <Eyebrow>{t('skills.title')}</Eyebrow>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {priority.split('').map((k, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-mute">›</span>}
            <span className="grid size-10 place-items-center rounded-xl border border-gold/40 bg-gradient-to-b from-gold/20 to-gold/5 text-[18px] font-bold text-gold shadow-[0_0_18px_-6px_rgba(200,170,110,.7)]">
              {k}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[22px_repeat(15,minmax(0,1fr))] gap-[3px]">
        <span />
        {levels.map((l) => (
          <span key={l} className="text-center text-[10px] text-mute">{l + 1}</span>
        ))}
        {ROWS.map((r) => (
          <div key={r} className="contents">
            <span className="grid place-items-center text-[11px] font-bold text-mute">{r}</span>
            {levels.map((l) => {
              const on = order[l] === r
              return (
                <span
                  key={l}
                  className={`aspect-square rounded-[5px] ${
                    on
                      ? r === 'R'
                        ? 'bg-gold shadow-[0_0_10px_-1px_rgba(200,170,110,.8)]'
                        : 'bg-blue shadow-[0_0_10px_-2px_rgba(59,130,246,.9)]'
                      : 'bg-[#1b2130]'
                  }`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

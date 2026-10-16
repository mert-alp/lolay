import type { Source } from '@shared/types'
import { useT, type Key } from '../i18n'
import { SOURCE_NAME } from '../util'
import { Card } from './ui'

const OPTIONS: { value: Source; desc: Key; badge?: Key }[] = [
  { value: 'lolalytics', desc: 'src.lolalytics.d', badge: 'src.default' },
  { value: 'opgg', desc: 'src.opgg.d' },
  { value: 'ugg', desc: 'src.ugg.d' },
  { value: 'metasrc', desc: 'src.metasrc.d', badge: 'src.approx' }
]

export function SourcePicker({ value, onChange }: { value: Source; onChange: (v: Source) => void }) {
  const t = useT()
  return (
    <Card>
      <div role="radiogroup" aria-label={t('set.source')} className="no-drag divide-y divide-line">
        {OPTIONS.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`flex w-full items-center gap-3 px-3.5 py-3.5 text-left sm:gap-4 sm:px-5 transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl hover:bg-card2 ${on ? 'bg-card2/60' : ''}`}
            >
              <span
                className={`grid size-[18px] shrink-0 place-items-center rounded-full border transition-all duration-150 ${
                  on ? 'border-gold bg-gold/15 shadow-[0_0_12px_-2px_rgba(200,170,110,.6)]' : 'border-[#2f384c]'
                }`}
              >
                <span className={`size-2 rounded-full bg-gold transition-transform duration-150 ${on ? 'scale-100' : 'scale-0'}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] font-medium ${on ? 'text-gold' : ''}`}>{SOURCE_NAME[o.value]}</span>
                <span className="mt-0.5 block text-[12px] text-mute">{t(o.desc)}</span>
              </span>
              {o.badge && (
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${o.value === 'lolalytics' ? 'border-gold/40 bg-gold/10 text-gold' : 'border-line bg-white/5 text-mute'}`}>
                  {t(o.badge)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

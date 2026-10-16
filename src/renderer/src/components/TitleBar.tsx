import type { AppState } from '@shared/types'
import { useT } from '../i18n'
import { RANK_COLOR } from '../util'
import { Segmented } from './ui'
import { FlagGB, FlagTR } from './Flags'

const CREST = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/'
import { TierSelect } from './TierSelect'
import { PlayerSearch } from './PlayerSearch'

function Logo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d89a" />
          <stop offset="1" stopColor="#a8864a" />
        </linearGradient>
      </defs>
      <path d="M8 .8 15.2 8 8 15.2.8 8Z" fill="url(#lg)" />
      <path d="M8 4.6 11.4 8 8 11.4 4.6 8Z" fill="#0e1015" />
    </svg>
  )
}

const iconBtn =
  'no-drag grid h-7 w-8 shrink-0 place-items-center rounded-lg text-mute transition-colors duration-150 hover:bg-white/[.07] hover:text-fg active:bg-white/10'

export function TitleBar({ state }: { state: AppState }) {
  const t = useT()
  const on = state.lcu === 'connected'
  const s = state.summoner
  const rank = s?.soloTier ? s.soloTier.toUpperCase() : null
  const rc = rank ? RANK_COLOR[rank] ?? '#8a93a6' : null
  const full = s ? `${s.name}${rank ? ` · ${rank[0] + rank.slice(1).toLowerCase()} ${s.soloDivision ?? ''}` : ''}` : ''
  return (
    <header className="drag relative z-30 flex h-10 shrink-0 items-center gap-2 border-b border-line bg-gradient-to-b from-[#141821] to-[#0f1218] pl-3 pr-1.5 sm:gap-3 sm:pl-3.5 sm:pr-2">
      <div className="flex shrink-0 items-center gap-2">
        <Logo />
        <span className="hidden text-[13px] font-semibold tracking-[0.2em] text-fg/90 sm:inline">LOLAY</span>
      </div>

      <div className="flex min-w-0 items-center gap-2 text-[12px] sm:ml-3 lg:ml-4">
        <span className="relative flex size-2 shrink-0" title={on ? t('conn.on') : t('conn.off')}>
          {on && <span className="absolute inset-0 animate-ping rounded-full bg-win/60" />}
          <span className={`relative size-2 rounded-full ${on ? 'bg-win shadow-[0_0_8px_rgba(34,197,94,.9)]' : 'bg-[#5a6275]'}`} />
        </span>
        <span className={`hidden whitespace-nowrap md:inline ${on ? 'text-fg/90' : 'text-mute'}`}>{on ? t('conn.on') : t('conn.off')}</span>
        {s && (
          <>
            {/* compact chip below lg: crest (or initial) in a ring, full name/rank in the tooltip */}
            <span
              title={full}
              className="grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold lg:hidden"
              style={{ color: rc ?? '#8a93a6', borderColor: (rc ?? '#8a93a6') + '66', background: (rc ?? '#8a93a6') + '14' }}
            >
              {rank ? <img src={`${CREST}${rank.toLowerCase()}.svg`} width={16} height={16} alt={full} /> : s.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="mx-1 hidden h-3.5 w-px shrink-0 bg-line lg:block" />
            <span className="hidden min-w-0 truncate font-medium text-fg lg:inline" title={s.name}>{s.name}</span>
            {rank && rc && (
              <span
                className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-md border py-px pl-1 pr-1.5 text-[10px] font-bold tracking-wide lg:flex"
                style={{ color: rc, borderColor: rc + '55', background: rc + '14' }}
              >
                <img src={`${CREST}${rank.toLowerCase()}.svg`} width={14} height={14} alt="" />
                {rank[0] + rank.slice(1).toLowerCase()} {s.soloDivision ?? ''}
              </span>
            )}
          </>
        )}
      </div>

      <PlayerSearch version={state.dataVersion} />

      <TierSelect state={state} compact />
      <Segmented
        size="sm"
        label={t('set.lang')}
        value={state.lang}
        options={[
          { value: 'tr', title: 'Türkçe', label: <span className="flex items-center gap-1.5"><FlagTR /><span className="hidden md:inline">TR</span></span> },
          { value: 'en', title: 'English', label: <span className="flex items-center gap-1.5"><FlagGB /><span className="hidden md:inline">EN</span></span> }
        ]}
        onChange={(lang) => window.lolay.setSettings({ lang })}
      />
      <span className="mx-0.5 hidden h-4 w-px shrink-0 bg-line sm:block" />
      <button className={iconBtn} aria-label={t('win.min')} title={t('win.min')} onClick={() => window.lolay.windowControl('minimize')}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M2.5 6h7" /></svg>
      </button>
      <button className={iconBtn} aria-label={t('win.max')} title={t('win.max')} onClick={() => window.lolay.windowControl('maximize')}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2.5" y="2.5" width="7" height="7" rx="1.5" /></svg>
      </button>
      <button
        className={`${iconBtn} hover:!bg-loss/15 hover:!text-[#ff6b6b]`}
        aria-label={t('win.close')}
        title={t('win.close')}
        onClick={() => window.lolay.windowControl('hide')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="m2.8 2.8 6.4 6.4M9.2 2.8 2.8 9.2" /></svg>
      </button>
    </header>
  )
}

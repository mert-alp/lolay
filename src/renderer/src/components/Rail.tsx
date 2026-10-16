import type { ReactNode } from 'react'
import { useT, type Key } from '../i18n'

export type Page = 'home' | 'champion' | 'meta' | 'live' | 'profile' | 'settings'

const sv = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ITEMS: { page: Page; key: Key; icon: ReactNode }[] = [
  { page: 'home', key: 'nav.home', icon: <svg {...sv}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></svg> },
  { page: 'meta', key: 'nav.meta', icon: <svg {...sv}><path d="M4 20V10M10 20V5M16 20v-7M22 20H2" /><path d="m13.5 4.5 3 3 4-4" /></svg> },
  { page: 'live', key: 'nav.live', icon: <svg {...sv}><path d="M3 12h3.5l2.3-6 4.4 12 2.3-6H21" /></svg> },
  { page: 'profile', key: 'nav.profile', icon: <svg {...sv}><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20.5c.6-3.9 3.6-6 7.5-6s6.9 2.1 7.5 6" /></svg> },
  { page: 'settings', key: 'nav.settings', icon: <svg {...sv}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" /></svg> }
]

export function Rail({ page, onNav, liveOn }: { page: Page; onNav: (p: Page) => void; liveOn: boolean }) {
  const t = useT()
  return (
    <nav className="order-last flex shrink-0 items-stretch justify-around gap-1 border-t border-line bg-[#0f1218] px-2 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))] sm:order-none sm:w-14 sm:flex-col sm:items-center sm:justify-start sm:gap-1.5 sm:border-t-0 sm:border-r sm:px-0 sm:py-3">
      {ITEMS.map((i) => {
        const on = page === i.page || (page === 'champion' && i.page === 'home')
        return (
          <button
            key={i.page}
            onClick={() => onNav(i.page)}
            aria-label={t(i.key)}
            title={t(i.key)}
            aria-current={on ? 'page' : undefined}
            className={`relative flex h-[46px] min-w-0 max-w-[96px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-150 sm:size-10 sm:max-w-none sm:flex-none ${
              on ? 'bg-gold/10 text-gold shadow-[inset_0_0_0_1px_rgba(200,170,110,.25)]' : 'text-mute hover:bg-white/[.05] hover:text-fg'
            } ${i.page === 'settings' ? 'sm:mt-auto' : ''}`}
          >
            {on && <span className="absolute -top-[7px] h-[3px] w-6 rounded-b bg-gold shadow-[0_0_10px_rgba(200,170,110,.8)] sm:top-auto sm:-left-[9px] sm:h-5 sm:w-[3px] sm:rounded-b-none sm:rounded-r" />}
            {i.icon}
            <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none sm:hidden">{t(i.key)}</span>
            {i.page === 'live' && liveOn && <span className="absolute top-1.5 right-[calc(50%-18px)] size-2 sm:right-1.5 rounded-full bg-loss shadow-[0_0_8px_rgba(239,68,68,.9)] animate-pulse" />}
          </button>
        )
      })}
    </nav>
  )
}

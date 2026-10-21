import { useState } from 'react'
import type { AppState } from '@shared/types'
import { useT } from '../i18n'
import { Button } from './ui'

// a newer LoLo was downloaded in the background: restart into it now, or later (quitting LoLo installs it too)
export function UpdatePrompt({ update }: { update: AppState['update'] }) {
  const t = useT()
  const [later, setLater] = useState<string | null>(null)
  if (!update?.ready || later === update.version) return null
  return (
    <div className="fade-up fixed right-3 bottom-[76px] left-3 z-[70] sm:right-4 sm:bottom-4 sm:left-auto sm:w-[340px]" role="dialog" aria-label={t('upd.title')}>
      <div className="rounded-2xl border border-gold/40 bg-[#141924]/95 p-4 shadow-[0_18px_40px_-12px_rgba(0,0,0,.9)] backdrop-blur">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold/40 bg-gold/10 text-gold">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14" /></svg>
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">{t('upd.title')}</div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-mute">{t('upd.body').replace('{v}', update.version)}</p>
          </div>
        </div>
        <div className="mt-3.5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setLater(update.version)}>{t('upd.later')}</Button>
          <Button className="flex-1" onClick={() => window.lolay.installUpdate()}>{t('upd.now')}</Button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { ReadyCheckState } from '@shared/types'
import { useT } from '../i18n'
import { Button, Toggle } from './ui'

const TOTAL = 10
const R = 72
const C = 2 * Math.PI * R

export function ReadyCheck({ rc, autoAccept }: { rc: ReadyCheckState; autoAccept: boolean }) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let id = requestAnimationFrame(function loop() {
      setNow(Date.now())
      id = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(id)
  }, [])
  // modal: keyboard focus starts on Accept
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => box.current?.querySelector('button')?.focus(), [])
  // LCU timer ticks ~1/s; interpolate between ticks
  const stamp = useRef({ timer: rc.timer, at: Date.now() })
  if (stamp.current.timer !== rc.timer) stamp.current = { timer: rc.timer, at: Date.now() }
  const left = Math.max(0, TOTAL - (rc.timer + (now - stamp.current.at) / 1000))
  const auto = rc.autoAcceptAt != null ? Math.max(0, (rc.autoAcceptAt - now) / 1000) : null
  const accepted = rc.playerResponse === 'Accepted'
  const urgent = left < 3
  const color = accepted ? '#22c55e' : urgent ? '#ef4444' : '#c8aa6e'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#07090d]/75 p-4 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-label={t('rc.title')}>
      <div ref={box} className="fade-up relative flex w-[400px] max-w-[calc(100vw-32px)] flex-col items-center rounded-3xl border border-line bg-gradient-to-b from-[#1a2030] to-[#12161d] px-5 pt-6 pb-5 sm:px-8 sm:pt-8 sm:pb-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,.9)]">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
        <h2 className="mb-4 text-[19px] sm:mb-5 sm:text-[22px] font-bold tracking-tight">{t('rc.title')}</h2>
        <div className="relative grid size-[128px] place-items-center sm:size-[170px]">
          <svg viewBox="0 0 170 170" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="85" cy="85" r={R} fill="none" stroke="#232a3a" strokeWidth="7" />
            <circle
              cx="85" cy="85" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - left / TOTAL)}
              style={{ filter: `drop-shadow(0 0 8px ${color}99)`, transition: 'stroke .3s' }}
            />
          </svg>
          <span className="text-[40px] font-bold leading-none sm:text-[52px]" style={{ color }}>{Math.ceil(left)}</span>
        </div>

        {accepted ? (
          <p className="mt-5 text-center text-[13px] text-mute">{t('rc.accepted')}</p>
        ) : (
          <div className="mt-5 flex w-full gap-3 sm:mt-6">
            <Button variant="success" className="h-12 min-w-0 flex-[2] !text-[15px]" onClick={() => window.lolay.readyCheck('accept')}>{t('rc.accept')}</Button>
            <Button variant="danger" className="h-12 min-w-0 flex-1 !px-2 !text-[14px]" onClick={() => window.lolay.readyCheck('decline')}>{t('rc.decline')}</Button>
          </div>
        )}

        {auto != null && !accepted && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-mute">
            <span>{t('rc.auto')}: <b className="font-semibold text-fg">{auto.toFixed(1)} {t('rc.sec')}</b></span>
            <button
              onClick={() => window.lolay.readyCheck('cancelAuto')}
              className="rounded-md border border-line px-2.5 py-0.5 text-[12px] text-fg transition-colors hover:border-[#2f384c] hover:bg-white/5"
            >
              {t('rc.cancel')}
            </button>
          </div>
        )}

        <label className="mt-5 flex w-full items-center justify-between gap-3 border-t border-line pt-4 text-[13px] text-mute">
          {t('rc.always')}
          <Toggle checked={autoAccept} label={t('rc.always')} onChange={(v) => {
            void window.lolay.setSettings({ autoAccept: v })
            if (!v) void window.lolay.readyCheck('cancelAuto') // stop an already scheduled accept
          }} />
        </label>
      </div>
    </div>
  )
}

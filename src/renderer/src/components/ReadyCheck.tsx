import { useEffect, useRef, useState } from 'react'
import { DDRAGON, type ReadyCheckState } from '@shared/types'
import { useStatic } from '../hooks'
import { useLang, useT } from '../i18n'
import { Toggle } from './ui'

const TOTAL = 12 // LCU ready checks last ~12 s

export function ReadyCheck({ rc, autoAccept }: { rc: ReadyCheckState; autoAccept: boolean }) {
  const t = useT()
  const { data: st } = useStatic(useLang(), null)
  const [now, setNow] = useState(() => Date.now())
  const [shown, setShown] = useState(false)
  useEffect(() => {
    setShown(true)
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
  const bg = rc.bgChampionId && st?.champions[rc.bgChampionId]?.id

  useEffect(() => {
    if (accepted) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (e.key === 'Escape') void window.lolay.readyCheck('decline')
      else if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'INPUT') void window.lolay.readyCheck('accept') // a focused button handles Enter itself
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [accepted])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#07090d]/80 p-4 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-label={t('rc.title')}>
      <div
        ref={box}
        className={`relative w-[500px] max-w-[calc(100vw-32px)] overflow-hidden rounded-3xl border bg-[#10141b] shadow-[0_30px_90px_-20px_rgba(0,0,0,.95)] transition-all duration-300 ease-out ${shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        style={{ borderColor: `${color}55` }}
      >
        {bg && <img src={`${DDRAGON}/img/champion/splash/${bg}_0.jpg`} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full scale-110 object-cover object-top opacity-40 blur-[3px]" />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#10141b]/70 via-[#10141b]/85 to-[#10141b]" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />

        <div className="relative flex flex-col items-center px-5 pt-8 pb-5 sm:px-10 sm:pt-10 sm:pb-6">
          <div className="text-[12px] font-bold uppercase tracking-[.32em] text-gold">{t('rc.found')}</div>
          {rc.queue && <div className="mt-1.5 text-[15px] font-medium text-fg/80">{rc.queue}</div>}

          <div className="my-5 text-[72px] font-bold leading-none tabular-nums transition-colors duration-300 sm:my-6 sm:text-[96px]" style={{ color, textShadow: `0 0 36px ${color}66` }} aria-live="off">
            {Math.ceil(left)}
          </div>

          {accepted ? (
            <p className="flex h-14 items-center gap-2 text-[15px] font-medium text-win">
              <svg width="18" height="18" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m2.5 6.2 2.4 2.3 4.6-5" /></svg>
              {t('rc.accepted')}
            </p>
          ) : (
            <>
              <div className="relative w-full">
                <span className="pointer-events-none absolute -inset-1 animate-pulse rounded-[18px] bg-gold/30 blur-md [animation-duration:1.6s]" aria-hidden />
                <button
                  type="button"
                  onClick={() => window.lolay.readyCheck('accept')}
                  style={{ outline: 'none' }} // the global blue :focus-visible outline; the gold ring below replaces it
                  className="no-drag relative flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-b from-[#e3c585] to-[#b8964f] text-[17px] font-bold text-[#1a1408] shadow-[0_8px_24px_-8px_rgba(200,170,110,.7)] transition-all duration-150 hover:-translate-y-px hover:shadow-[0_12px_36px_-6px_rgba(224,190,120,.95)] hover:brightness-110 active:translate-y-0 active:scale-[.97] focus-visible:ring-2 focus-visible:ring-[#f0d9a8]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10141b]"
                >
                  {t('rc.accept')}
                  <kbd className="rounded-md border border-black/25 bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">{t('rc.enter')}</kbd>
                </button>
              </div>
              <button
                type="button"
                onClick={() => window.lolay.readyCheck('decline')}
                className="no-drag mt-3 rounded-lg px-4 py-1.5 text-[13px] font-medium text-mute transition-colors hover:bg-loss/10 hover:text-loss active:scale-95"
              >
                {t('rc.decline')}
              </button>
            </>
          )}

          {auto != null && !accepted && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-mute">
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

        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/5">
          <div className="h-full origin-left" style={{ transform: `scaleX(${left / TOTAL})`, background: color, boxShadow: `0 0 12px ${color}`, transition: 'background .3s' }} />
        </div>
      </div>
    </div>
  )
}

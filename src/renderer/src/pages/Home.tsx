import { useMemo, useState } from 'react'
import { champIcon, type AppState, type StaticData } from '@shared/types'
import { useLang, useT, type Key } from '../i18n'
import { fold, sortLocale } from '../util'
import { Card } from '../components/ui'

export function Home({ state, st, onPick }: { state: AppState; st: StaticData | null; onPick: (id: number) => void }) {
  const t = useT()
  const lang = useLang()
  const [q, setQ] = useState('')
  const all = useMemo(
    () => (st ? Object.values(st.champions).sort((a, b) => a.name.localeCompare(b.name, sortLocale(lang))).map((c) => ({ c, f: fold(c.name) + ' ' + fold(c.id) })) : []),
    [st, lang]
  )
  const list = useMemo(() => {
    const f = fold(q.trim())
    return f ? all.filter((x) => x.f.includes(f)) : all
  }, [all, q])
  const on = state.lcu === 'connected'
  const phaseKey = `phase.${state.phase}` as Key
  const phase = t(phaseKey) === phaseKey ? state.phase : t(phaseKey)

  return (
    <div className="mx-auto max-w-[1000px] lg:py-1">
      <Card className="mb-4 grid grid-cols-3 divide-x divide-line sm:mb-5">
        <Stat label={t('home.conn')}>
          <span className={`mr-2 inline-block size-2 rounded-full ${on ? 'bg-win shadow-[0_0_8px_rgba(34,197,94,.9)]' : 'bg-[#5a6275]'}`} />
          {on ? t('conn.on') : t('conn.off')}
        </Stat>
        <Stat label={t('home.phase')}>{phase}</Stat>
        <Stat label={t('home.patch')}>{state.dataVersion ?? '–'}</Stat>
      </Card>

      <div className="group relative mb-4 sm:mb-5">
        <svg className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 sm:left-5 text-mute transition-colors group-focus-within:text-gold" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) onPick(list[0].c.key) }}
          placeholder={t('home.search')}
          aria-label={t('home.search')}
          className="h-12 w-full min-w-0 rounded-2xl border border-line bg-card pr-4 pl-12 text-[15px] sm:h-14 sm:pr-5 sm:pl-13 sm:text-[17px] text-fg outline-none focus-visible:outline-none transition-all placeholder:text-mute focus:border-gold/50 focus:shadow-[0_0_0_4px_rgba(200,170,110,.08)]"
        />
      </div>

      {!st ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(84px,1fr))]">
          {Array.from({ length: 24 }, (_, i) => <div key={i} className="skeleton h-[96px]" />)}
        </div>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-mute">{t('home.empty')}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-x-1 gap-y-2 sm:grid-cols-[repeat(auto-fill,minmax(84px,1fr))] sm:gap-x-2 sm:gap-y-2.5">
          {list.map(({ c }) => (
            <button
              key={c.key}
              onClick={() => onPick(c.key)}
              className="group/c flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors duration-150 hover:bg-card"
            >
              <img
                src={champIcon(st.version, c.id)}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                decoding="async"
                style={{ width: 56, height: 56 }}
                className="rounded-xl border border-line transition-all duration-150 group-hover/c:scale-105 group-hover/c:border-gold/70 group-hover/c:shadow-[0_0_18px_-4px_rgba(200,170,110,.7)]"
              />
              <span className="w-full truncate text-center text-[12px] text-mute transition-colors group-hover/c:text-fg">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-3.5">
      <div className="mb-1 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-mute sm:text-[11px] sm:tracking-[0.14em]">{label}</div>
      <div className="flex min-w-0 items-center text-[13px] font-medium sm:text-[15px]"><span className="min-w-0 truncate">{children}</span></div>
    </div>
  )
}

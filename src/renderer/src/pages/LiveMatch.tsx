import type { AppState, LivePlayer, StaticData } from '@shared/types'
import { useT, type Key } from '../i18n'
import { PlayerCard } from '../components/PlayerCard'
import { Card } from '../components/ui'

function Column({ title, players, st, enemy }: { title: string; players: LivePlayer[]; st: StaticData | null; enemy: boolean }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2 px-0.5">
        <span className={`size-2 shrink-0 rounded-full ${enemy ? 'bg-loss shadow-[0_0_10px_rgba(239,68,68,.8)]' : 'bg-blue shadow-[0_0_10px_rgba(59,130,246,.8)]'}`} />
        <h3 className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{title}</h3>
      </div>
      <div className="space-y-2.5">
        {players.map((p) => <PlayerCard key={p.key} p={p} st={st} enemy={enemy} />)}
      </div>
    </section>
  )
}

export function LiveMatch({ state, st }: { state: AppState; st: StaticData | null }) {
  const t = useT()
  const live = state.live
  const phaseKey = `phase.${state.phase}` as Key
  const phase = t(phaseKey) === phaseKey ? state.phase : t(phaseKey)

  if (!live) {
    return (
      <div className="grid min-h-full place-items-center py-6">
        <Card className="relative w-full max-w-[460px] overflow-hidden px-5 py-8 text-center sm:px-8 sm:py-9">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
          <div className="relative mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-line bg-card2 text-gold">
            <span className="absolute inset-0 animate-ping rounded-2xl border border-gold/20 [animation-duration:2.4s]" />
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h3.5l2.3-6 4.4 12 2.3-6H21" /></svg>
          </div>
          <h2 className="text-[18px] font-semibold">{t('live.waitTitle')}</h2>
          <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-mute">{t('live.waitBody')}</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-[#12161d] px-3 py-1 text-[12px] text-mute">
            <span className="size-1.5 rounded-full bg-mute" />
            {t('live.phase')}: <span className="font-medium text-fg">{phase}</span>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="text-[17px] sm:text-[18px] font-semibold">{t('live.title')}</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11.5px] font-medium text-gold">
          <span className="size-1.5 rounded-full bg-gold" />
          {phase}
        </span>
        {live.loading && (
          <span className="ml-auto inline-flex items-center gap-2 text-[12px] text-mute">
            <span className="size-3 animate-spin rounded-full border-2 border-line border-t-gold" />
            {t('live.loading')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 md:gap-4">
        <Column title={t('live.ally')} players={live.myTeam} st={st} enemy={false} />
        <Column title={t('live.enemy')} players={live.enemyTeam} st={st} enemy />
      </div>
    </div>
  )
}

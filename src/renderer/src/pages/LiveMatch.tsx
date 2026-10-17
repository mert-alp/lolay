import type { AppState, LivePlayer, StaticData } from '@shared/types'
import { useT, type Key } from '../i18n'
import { PlayerRow, ROW_GRID } from '../components/PlayerCard'
import { Card } from '../components/ui'
import { PostGame } from '../components/PostGame'
import { useState } from 'react'

function Team({ title, players, st, enemy, onPick }: { title: string; players: LivePlayer[]; st: StaticData | null; enemy: boolean; onPick: (championId: number) => void }) {
  const t = useT()
  return (
    <Card className="overflow-hidden">
      <div className={`flex items-center gap-2 border-b border-line px-3 py-2 ${enemy ? 'bg-loss/[.06]' : 'bg-blue/[.06]'}`}>
        <span className={`size-2 shrink-0 rounded-full ${enemy ? 'bg-loss shadow-[0_0_10px_rgba(239,68,68,.8)]' : 'bg-blue shadow-[0_0_10px_rgba(59,130,246,.8)]'}`} />
        <h3 className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-fg/90">{title}</h3>
      </div>
      <div className={`hidden border-b border-line/70 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-mute ${ROW_GRID}`}>
        <span>{t('live.colPlayer')}</span><span>{t('live.colRank')}</span><span>{t('live.colSeason')}</span><span>{t('live.colChamp')}</span><span>{t('live.colRecent')}</span>
      </div>
      <div className="divide-y divide-line/60">
        {players.map((p) => <PlayerRow key={p.key} p={p} st={st} enemy={enemy} onPick={onPick} />)}
      </div>
    </Card>
  )
}

export function LiveMatch({ state, st, onPick }: { state: AppState; st: StaticData | null; onPick: (championId: number) => void }) {
  const t = useT()
  const live = state.live
  const phaseKey = `phase.${state.phase}` as Key
  const phase = t(phaseKey) === phaseKey ? state.phase : t(phaseKey)

  const [closed, setClosed] = useState<string | null>(null)
  if (!live && state.postGame && closed !== state.postGame.id) return <PostGame pg={state.postGame} st={st} onClose={() => setClosed(state.postGame!.id)} />

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
    <div className="mx-auto max-w-[1180px]">
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
      <div className="space-y-4">
        <Team title={t('live.ally')} players={live.myTeam} st={st} enemy={false} onPick={onPick} />
        <Team title={t('live.enemy')} players={live.enemyTeam} st={st} enemy onPick={onPick} />
      </div>
    </div>
  )
}

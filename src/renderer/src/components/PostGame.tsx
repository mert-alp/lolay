import { DDRAGON, type PostGame as PostGameState, type StaticData } from '@shared/types'
import { fmtDuration, timeAgo } from '../../../main/profileStats.ts'
import { useLang, useT } from '../i18n'
import { useOpenProfile } from '../profileNav'
import { fmtGames } from '../util'
import { Card } from './ui'
import { MatchRow, kdaColor, kdaOf, queueLabel } from './MatchRow'

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{label}</div>
      <div className="text-[17px] font-bold leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-mute">{sub}</div>}
    </div>
  )
}

// End of game, Blitz style: the result and my numbers up top, the whole match table below (opened)
export function PostGame({ pg, st, onClose }: { pg: PostGameState; st: StaticData | null; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const openProfile = useOpenProfile()
  const m = pg.entry
  if (!m || !st) {
    return (
      <Card className="flex items-center gap-3 px-5 py-6">
        <span className="size-4 animate-spin rounded-full border-2 border-line border-t-gold" />
        <span className="text-[13px] text-mute">{t('pg.loading')}</span>
      </Card>
    )
  }
  const me = m.me
  const champ = st.champions[me.championId]
  const min = m.duration / 60
  const kda = kdaOf(me)
  const kp = m.teamKills ? Math.round(((me.kills + me.assists) / m.teamKills) * 100) : null
  const tone = m.remake ? 'text-mute' : m.win ? 'text-win' : 'text-loss'

  return (
    <div className="mx-auto max-w-[1180px] space-y-3">
      <Card className="relative overflow-hidden">
        {champ && (
          <img
            src={`${DDRAGON}/img/champion/splash/${champ.id}_0.jpg`}
            alt=""
            className="pointer-events-none absolute inset-y-0 right-0 h-full w-[60%] object-cover object-[50%_20%] opacity-30"
            style={{ maskImage: 'linear-gradient(to left, #000 10%, transparent 95%)', WebkitMaskImage: 'linear-gradient(to left, #000 10%, transparent 95%)' }}
          />
        )}
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${m.win ? 'via-win/70' : 'via-loss/70'} to-transparent`} />
        <button onClick={onClose} title={t('pg.close')} className="no-drag absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-lg border border-line bg-black/30 text-mute transition-colors hover:border-gold/60 hover:text-fg">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="m2 2 8 8M10 2l-8 8" /></svg>
        </button>
        <div className="relative flex flex-wrap items-end gap-x-10 gap-y-4 p-5 sm:p-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{t('pg.title')}</div>
            <div className={`text-[34px] font-black uppercase leading-none tracking-wide ${tone}`}>{t(m.remake ? 'pg.remake' : m.win ? 'pg.win' : 'pg.loss')}</div>
            <div className="mt-1.5 text-[12px] text-mute">{queueLabel(t, m.queueId)} · {fmtDuration(m.duration)} · {timeAgo(m.at, lang)}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-5">
            <Stat label="KDA" value={`${me.kills} / ${me.deaths} / ${me.assists}`} sub={`${kda.toFixed(2)} KDA`} />
            <Stat label={t('pg.cs')} value={String(me.cs)} sub={`${(me.cs / Math.max(min, 1)).toFixed(1)} / ${t('pg.min')}`} />
            <Stat label={t('pg.dmg')} value={fmtGames(me.damage)} />
            <Stat label={t('pg.gold')} value={fmtGames(me.gold)} />
            {kp != null && <Stat label={t('pg.kp')} value={`${kp}%`} />}
          </div>
        </div>
        <div className="relative border-t border-line/70 px-5 py-2 text-[11px] text-mute sm:px-6">
          <span className={kdaColor(kda)}>●</span> {t(pg.src === 'blitz' ? 'pg.src.blitz' : 'pg.src.lcu')}
        </div>
      </Card>
      <MatchRow m={m} st={st} open onToggle={() => {}} onOpenProfile={openProfile} />
    </div>
  )
}

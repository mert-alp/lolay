import { useId, type CSSProperties, type ReactNode } from 'react'
import { champIcon, spellIcon, type LivePlayer, type LiveTag, type StaticData } from '@shared/types'
import { useT, type Key } from '../i18n'
import { useOpenProfile } from '../profileNav'
import { RANK_FILL, RANK_TEXT, tagsOf, wrColor } from '../util'

const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER'])
const APEX_SHORT: Record<string, string> = { MASTER: 'M', GRANDMASTER: 'GM', CHALLENGER: 'C' }
export const TAG_STYLE: Record<LiveTag, string> = {
  autofill: 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#fbbf24]',
  offrole: 'border-[#fcd600]/25 bg-[#fcd600]/[.07] text-[#e5c84a]',
  otp: 'border-[#ac5dff]/40 bg-[#ac5dff]/10 text-[#c490ff]'
}

export const kdaColor = (k: number) => (k >= 5 ? 'text-[#ff8a3d]' : k >= 4 ? 'text-blue' : k >= 3 ? 'text-win' : 'text-fg')

export function Sk({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  // brighter than the card so the shimmer reads on it
  const style: CSSProperties = { width: w, height: h, borderRadius: r, backgroundImage: 'linear-gradient(100deg, #1f2533 30%, #2b3347 50%, #1f2533 70%)', backgroundSize: '200% 100%' }
  return <span className="skeleton block shrink-0" style={style} />
}

export function Chip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex h-[18px] items-center rounded-md border px-1.5 text-[10.5px] font-semibold leading-none ${className}`}>{children}</span>
}

export function Medal({ tier, division, size = 44 }: { tier: string | null; division: string; size?: number }) {
  const id = useId()
  const fill = tier ? RANK_FILL[tier] ?? '#6b7280' : '#2a3040'
  const text = tier ? RANK_TEXT[tier] ?? '#9aa3b5' : '#5b6477'
  const label = !tier ? '–' : APEX.has(tier) ? APEX_SHORT[tier] : division
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size, filter: tier ? `drop-shadow(0 0 7px ${text}59)` : undefined }}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={text} stopOpacity=".95" />
            <stop offset="1" stopColor={fill} stopOpacity=".55" />
          </linearGradient>
        </defs>
        <path d="M20 2.5 35.5 11v18L20 37.5 4.5 29V11z" fill={`url(#${id})`} stroke={text} strokeOpacity=".75" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M20 6.5 32 13.2v13.6L20 33.5 8 26.8V13.2z" fill="#0e1015" fillOpacity=".55" />
      </svg>
      <span className="relative font-bold" style={{ color: text, fontSize: Math.round(size * (label.length > 2 ? 0.25 : 0.3)) }}>{label}</span>
    </span>
  )
}

export function Dots({ recent }: { recent: boolean[] }) {
  return (
    <div className="flex h-[14px] items-end gap-[2px]" aria-hidden>
      {recent.map((w, i) => (
        <span key={i} className={`h-full w-[5px] rounded-[2px] ${w ? 'bg-win' : 'bg-loss/80'}`} style={{ opacity: 1 - i * 0.02 }} />
      ))}
    </div>
  )
}

// shared by the column header and the rows: who, rank, season, this champion, last games
export const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,.9fr)_minmax(0,1.1fr)_minmax(0,.9fr)] md:items-center md:gap-3'

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <div className="mb-0.5 text-[10px] font-medium tracking-wide text-mute md:hidden">{label}</div>
    {children}
  </div>
)

// One player as a table row, OP.GG / Blitz style. The name opens the player's profile, the champion icon its build page.
export function PlayerRow({ p, st, enemy, onPick }: { p: LivePlayer; st: StaticData | null; enemy: boolean; onPick: (championId: number) => void }) {
  const t = useT()
  const openProfile = useOpenProfile()
  const champ = p.championId ? st?.champions[p.championId] : undefined
  const s = p.summary
  const anonymous = !p.puuid && !p.name && !p.bot
  const name = p.bot ? champ?.name ?? '…' : p.name ?? (anonymous ? (enemy ? t('live.opponent') : t('live.hidden')) : '…')
  const tier = s?.rank?.tier ?? null
  const games = s ? s.wins + s.losses : 0
  const wr = games ? (s!.wins / games) * 100 : null
  const cwr = s && s.champ.games ? (s.champ.wins / s.champ.games) * 100 : null
  const loading = !!p.puuid && !s

  return (
    <div className={`fade-up relative grid grid-cols-2 gap-x-4 gap-y-2.5 px-3 py-2.5 transition-colors hover:bg-white/[.025] ${ROW_GRID} ${p.me ? 'bg-gold/[.06]' : ''}`}>
      {p.me && <span className="absolute inset-y-0 left-0 w-[3px] bg-gold" />}
      <div className="col-span-2 flex min-w-0 items-center gap-2.5 md:col-span-1">
        <button
          onClick={() => champ && onPick(p.championId)}
          disabled={!champ}
          title={champ?.name}
          className="no-drag relative size-10 shrink-0 overflow-hidden rounded-lg bg-[#10131a] ring-1 ring-white/10 transition enabled:hover:ring-gold/70"
        >
          {champ && st ? <img src={champIcon(st.version, champ.id)} alt={champ.name} className="size-full scale-[1.08] object-cover" /> : <span className="grid size-full place-items-center text-mute/60">?</span>}
        </button>
        {!p.bot && p.spells.length > 0 && (
          <div className="flex shrink-0 flex-col gap-0.5">
            {p.spells.slice(0, 2).map((id) => {
              const sp = st?.spells[id]
              return sp && st ? <img key={id} src={spellIcon(st.version, sp.id)} alt={sp.name} title={sp.name} className="size-[18px] rounded-[4px] ring-1 ring-white/10" /> : <span key={id} className="size-[18px] rounded-[4px] bg-[#10131a]" />
            })}
          </div>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex min-w-0 items-baseline gap-1">
            {p.name && p.tag && !p.bot ? (
              <button
                onClick={() => openProfile(`${p.name}#${p.tag}`)}
                title={`${p.name}#${p.tag}`}
                className={`no-drag min-w-0 truncate text-left text-[13.5px] font-semibold underline-offset-2 transition-colors hover:text-gold hover:underline ${p.me ? 'text-gold' : ''}`}
              >
                {name}
              </button>
            ) : (
              <span className={`min-w-0 truncate text-[13.5px] font-semibold ${anonymous ? 'text-mute' : ''}`}>{name}</span>
            )}
            {p.tag && <span className="shrink-0 truncate text-[11px] text-mute">#{p.tag}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {p.bot && <Chip className="border-line bg-white/[.06] text-mute">{t('live.bot')}</Chip>}
            {p.position && <span className="text-[11px] text-mute">{t(`lane.${p.position}` as Key)}</span>}
            {tagsOf(p).map((g) => <Chip key={g} className={TAG_STYLE[g]}>{t(`live.tag.${g}` as Key)}</Chip>)}
            {s && s.streak !== 0 && (
              <Chip className={s.streak > 0 ? 'border-win/40 bg-win/10 text-win' : 'border-loss/40 bg-loss/10 text-loss'}>{Math.abs(s.streak)}{t(s.streak > 0 ? 'live.w' : 'live.l')}</Chip>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <>
          <Sk w="80%" h={22} /><Sk w="70%" h={22} /><Sk w="80%" h={22} /><Sk w="70%" h={22} />
        </>
      ) : !s ? (
        <div className="col-span-2 self-center text-[12px] text-mute md:col-span-4">{p.bot ? t('draft.botNote') : anonymous ? t('live.hiddenNote') : t('live.noData')}</div>
      ) : (
        <>
          <Cell label={t('live.colRank')}>
            <div className="flex items-center gap-2">
              <Medal tier={tier} division={s.rank?.division ?? ''} size={30} />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[12.5px] font-semibold" style={{ color: tier ? RANK_TEXT[tier] : undefined }}>
                  {tier ? <>{t(`rank.${tier}` as Key)}{!APEX.has(tier) && ` ${s.rank!.division}`}</> : <span className="text-mute">{t('live.unranked')}</span>}
                </div>
                {tier && <div className="text-[11px] text-mute">{s.rank!.lp} {t('live.lp')}</div>}
              </div>
            </div>
          </Cell>
          <Cell label={t('live.colSeason')}>
            {wr == null ? <span className="text-[12px] text-mute">–</span> : (
              <div className="leading-tight">
                <div className="text-[12.5px]">
                  <span className={`font-bold ${wrColor(wr)}`}>{Math.round(wr)}%</span>{' '}
                  <span className="text-[11px] text-mute">{s.wins}{t('live.w')} {s.losses}{t('live.l')}</span>
                </div>
                <div className="mt-1 flex h-1 w-full max-w-[110px] overflow-hidden rounded-full bg-loss/50"><span className="h-full bg-win" style={{ width: `${wr}%` }} /></div>
              </div>
            )}
          </Cell>
          <Cell label={t('live.colChamp')}>
            {cwr == null ? <span className="text-[12px] text-mute">{t('live.firstGame')}</span> : (
              <div className="leading-tight">
                <div className="text-[12.5px]">
                  <span className={`font-bold ${wrColor(cwr)}`}>{Math.round(cwr)}%</span>{' '}
                  <span className="text-[11px] text-mute">{s.champ.games} {t('live.games')}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-mute">
                  {s.champ.kda != null && <span className={`font-semibold ${kdaColor(s.champ.kda)}`}>{s.champ.kda.toFixed(2)} KDA</span>}
                  {s.champ.kda != null && s.mastery && ' · '}
                  {s.mastery && <span className="text-gold/90">M{s.mastery.level}</span>}
                  {!s.champ.season && <span> · {t('live.last20')}</span>}
                </div>
              </div>
            )}
          </Cell>
          <Cell label={t('live.colRecent')}>
            {s.recent.length ? (
              <div className="leading-tight">
                <Dots recent={s.recent.slice(0, 10)} />
                <div className="mt-1 text-[11px] text-mute">{s.kda != null && <span className={`font-semibold ${kdaColor(s.kda)}`}>{s.kda.toFixed(2)}</span>} KDA</div>
              </div>
            ) : <span className="text-[12px] text-mute">–</span>}
          </Cell>
        </>
      )}
    </div>
  )
}

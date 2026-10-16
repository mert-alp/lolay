import { useId, type CSSProperties, type ReactNode } from 'react'
import { champIcon, spellIcon, type LivePlayer, type LiveTag, type PlayerSummary, type StaticData } from '@shared/types'
import { useT, type Key } from '../i18n'
import { useOpenProfile } from '../profileNav'
import { RANK_FILL, RANK_TEXT, fmtGames, tagsOf, wrColor } from '../util'

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

function Medal({ tier, division }: { tier: string | null; division: string }) {
  const id = useId()
  const fill = tier ? RANK_FILL[tier] ?? '#6b7280' : '#2a3040'
  const text = tier ? RANK_TEXT[tier] ?? '#9aa3b5' : '#5b6477'
  const label = !tier ? '–' : APEX.has(tier) ? APEX_SHORT[tier] : division
  return (
    <span className="relative grid size-11 shrink-0 place-items-center" style={{ filter: tier ? `drop-shadow(0 0 7px ${text}59)` : undefined }}>
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
      <span className={`relative font-bold ${label.length > 2 ? 'text-[11px]' : 'text-[13px]'}`} style={{ color: text }}>{label}</span>
    </span>
  )
}

function Dots({ recent }: { recent: boolean[] }) {
  return (
    <div className="flex h-[14px] items-end gap-[2px]" aria-hidden>
      {recent.map((w, i) => (
        <span key={i} className={`h-full w-[5px] rounded-[2px] ${w ? 'bg-win' : 'bg-loss/80'}`} style={{ opacity: 1 - i * 0.02 }} />
      ))}
    </div>
  )
}

const Label = ({ children }: { children: ReactNode }) => <div className="mb-1 text-[10px] font-medium tracking-wide text-mute">{children}</div>

function Rank({ s }: { s: PlayerSummary }) {
  const t = useT()
  const games = s.wins + s.losses
  const wr = games ? (s.wins / games) * 100 : null
  const tier = s.rank?.tier ?? null
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2.5">
      <div className="min-w-0 text-right leading-tight">
        <div className="truncate text-[13px] font-semibold" style={{ color: tier ? RANK_TEXT[tier] : undefined }}>
          {tier ? (
            <>
              {t(`rank.${tier}` as Key)}
              {!APEX.has(tier) && ` ${s.rank!.division}`}
            </>
          ) : (
            <span className="text-mute">{t('live.unranked')}</span>
          )}
        </div>
        <div className="text-[11px] text-mute">{tier ? `${s.rank!.lp} ${t('live.lp')}` : ' '}</div>
        <div className="text-[11px]">
          {games ? (
            <>
              <span className="text-mute">{s.wins}{t('live.w')} {s.losses}{t('live.l')} · </span>
              <span className={wr! >= 60 ? 'font-semibold text-gold' : wrColor(wr!)}>{Math.round(wr!)}%</span>
            </>
          ) : (
            <span className="text-mute">{' '}</span>
          )}
        </div>
      </div>
      <Medal tier={tier} division={s.rank?.division ?? ''} />
    </div>
  )
}

function Stats({ s, t }: { s: PlayerSummary; t: ReturnType<typeof useT> }) {
  if (!s.recent.length) return <div className="col-span-full py-1.5 text-[12px] text-mute">{t('live.noData')}</div>
  const champWr = s.champ.games ? Math.round((s.champ.wins / s.champ.games) * 100) : null
  return (
    <>
      <div>
        <Label>{t('live.last')}</Label>
        <Dots recent={s.recent} />
        <div className="mt-1 text-[11px]">
          <span className="text-mute">{s.avg!.map((v) => v.toFixed(1)).join(' / ')} · </span>
          <span className={`font-semibold ${kdaColor(s.kda!)}`}>{s.kda!.toFixed(2)}</span>
        </div>
      </div>
      <div>
        <Label>{t('live.champ')}</Label>
        <div className="text-[12px] font-medium leading-[14px]">
          {champWr == null ? <span className="text-mute">0 {t('live.games')}</span> : (
            <>
              <span className={wrColor(champWr)}>{champWr}%</span>
              <span className="text-mute"> · {s.champ.games} {t('live.games')}</span>
            </>
          )}
        </div>
        <div className="mt-1 text-[11px] text-mute">
          {s.mastery ? <><span className="font-semibold text-gold">M{s.mastery.level}</span> · {fmtGames(s.mastery.points)} {t('live.pts')}</> : '–'}
        </div>
      </div>
      <div className="col-span-2 @md:col-span-1">
        <Label>{t('live.roles')}</Label>
        <div className="space-y-0.5 text-[11px] leading-[14px] @max-md:flex @max-md:flex-wrap @max-md:gap-x-4 @max-md:space-y-0">
          {s.roles.slice(0, 2).map((r) => (
            <div key={r.lane} className="flex justify-between gap-2 @max-md:gap-1.5">
              <span>{t(`lane.${r.lane}` as Key)}</span>
              <span className="text-mute">{r.pct}%</span>
            </div>
          ))}
          {!s.roles.length && <span className="text-mute">–</span>}
        </div>
      </div>
    </>
  )
}

export function PlayerCard({ p, st, enemy }: { p: LivePlayer; st: StaticData | null; enemy: boolean }) {
  const t = useT()
  const champ = p.championId ? st?.champions[p.championId] : undefined
  const s = p.summary
  const openProfile = useOpenProfile()
  const anonymous = !p.puuid && !p.name && !p.bot
  const lookedUp = !!p.puuid
  const name = p.bot ? champ?.name ?? '…' : p.name ?? (anonymous ? (enemy ? t('live.opponent') : t('live.hidden')) : '…')
  const icon = p.bot ? 'size-10' : 'size-[50px]'
  const accent = enemy ? 'bg-loss' : 'bg-blue'

  return (
    <article
      className={`@container fade-up group relative min-w-0 overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#191e29] hover:shadow-[0_12px_28px_-14px_rgba(0,0,0,.9)] ${
        p.me ? 'border-gold/60 shadow-[0_0_0_1px_rgba(200,170,110,.28),0_10px_30px_-14px_rgba(200,170,110,.45)]' : 'border-line hover:border-[#2f384c]'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${accent} ${p.me ? 'opacity-0' : 'opacity-70'}`} />
      {p.me && <span className="absolute inset-y-0 left-0 w-[3px] bg-gold" />}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent ${p.me ? 'from-gold/[.07]' : enemy ? 'from-loss/[.05]' : 'from-blue/[.05]'}`} />

      <div className={`relative px-3.5 ${p.bot ? 'py-2' : 'py-3'}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex shrink-0 items-center gap-1">
            <div className={`relative ${icon} overflow-hidden rounded-lg bg-[#10131a] ring-1 ring-white/10`}>
              {champ && st ? (
                <img src={champIcon(st.version, champ.id)} alt={champ.name} title={champ.name} className="size-full scale-[1.08] object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-[18px] font-semibold text-mute/60">?</span>
              )}
            </div>
            {!p.bot && p.spells.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {p.spells.slice(0, 2).map((id) => {
                  const sp = st?.spells[id]
                  return sp && st ? <img key={id} src={spellIcon(st.version, sp.id)} alt={sp.name} title={sp.name} className="size-6 rounded-[5px] ring-1 ring-white/10" /> : <span key={id} className="size-6 rounded-[5px] bg-[#10131a]" />
                })}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 basis-[120px]">
            <div className="flex items-baseline gap-1.5">
              {p.name && p.tag && !p.bot ? (
                <button
                  onClick={() => openProfile(`${p.name}#${p.tag}`)}
                  title={`${p.name}#${p.tag}`}
                  className="no-drag min-w-0 truncate rounded text-left text-[14px] font-semibold underline-offset-2 transition-colors hover:text-gold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                >
                  {name}
                </button>
              ) : (
                <span title={name} className={`min-w-0 truncate text-[14px] font-semibold ${anonymous ? 'text-mute' : ''}`}>{name}</span>
              )}
              {p.tag && <span className="max-w-[40%] shrink-0 truncate text-[11px] text-mute">#{p.tag}</span>}
              {s?.source && <span title={t(`live.src.${s.source}`)} className={`size-1.5 shrink-0 self-center rounded-full ${s.source === 'riot' ? 'bg-gold' : 'bg-blue/70'}`} />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {p.bot && <Chip className="border-line bg-white/[.06] text-mute">{t('live.bot')}</Chip>}
              {p.position && <Chip className="border-line bg-white/[.04] text-mute">{t(`lane.${p.position}` as Key)}</Chip>}
              {p.me && <Chip className="border-gold/40 bg-gold/10 text-gold">{t('live.me')}</Chip>}
              {tagsOf(p).map((g) => <Chip key={g} className={TAG_STYLE[g]}>{t(`live.tag.${g}` as Key)}</Chip>)}
              {s && s.streak !== 0 && (
                <Chip className={s.streak > 0 ? 'border-win/40 bg-win/10 text-win' : 'border-loss/40 bg-loss/10 text-loss'}>
                  {t('live.streak')}: {Math.abs(s.streak)}{t(s.streak > 0 ? 'live.w' : 'live.l')}
                </Chip>
              )}
              {!lookedUp && !p.championId && <span className="text-[11px] text-mute">{t('live.pending')}</span>}
              {!lookedUp && !p.bot && p.championId > 0 && champ && <span className="text-[11px] text-mute">{champ.name}</span>}
            </div>
          </div>

          {lookedUp && (s ? <Rank s={s} /> : (
            <div className="ml-auto flex items-center gap-2.5">
              <div className="space-y-1.5"><Sk w={74} h={11} /><Sk w={44} h={9} /><Sk w={62} h={9} /></div>
              <Sk w={44} h={44} r={12} />
            </div>
          ))}
        </div>

        {lookedUp && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line/80 pt-2.5 @md:grid-cols-[1.25fr_1fr_.8fr]">
            {s ? <Stats s={s} t={t} /> : (
              <>
                <div className="space-y-1.5"><Sk w={60} h={8} /><Sk w="90%" h={14} /><Sk w={90} h={9} /></div>
                <div className="space-y-1.5"><Sk w={54} h={8} /><Sk w={70} h={12} /><Sk w={80} h={9} /></div>
                <div className="space-y-1.5"><Sk w={34} h={8} /><Sk w={56} h={10} /><Sk w={56} h={10} /></div>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

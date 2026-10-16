import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DDRAGON, type Lane, type MatchEntry, type MatchFilter, type Profile as Prof, type ProfileErrorCode, type ProfileRank, type ProfileResult, type StaticData, type Tier } from '@shared/types'
import { parseRiotId, regionLabel, REGIONS, summarizeMatches, type ProfileStats } from '../../../main/profileStats.ts'
import { useT, type Key } from '../i18n'
import { OpenProfileCtx, splitPlatform, useOpenProfile, withPlatform } from '../profileNav'
import { RANK_TEXT, wrColor } from '../util'
import { Card, Eyebrow } from '../components/ui'
import { ChampIcon, MatchRow, kdaColor } from '../components/MatchRow'
import { SearchResults } from '../components/SearchResults'
import { Sk } from '../components/PlayerCard'
import { Crest } from '../components/TierSelect'

export { OpenProfileCtx, useOpenProfile }

const FILTERS: MatchFilter[] = ['all', 'solo', 'flex', 'normal', 'aram']
const FIRST = 20
const PAGE = 10
const ME_KEY = 'lolay.me'
const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER'])
const LANE_COLOR: Record<Lane, string> = { top: '#e2724a', jungle: '#2bbf7a', middle: '#6a8dff', bottom: '#f0c35a', support: '#b765e6' }

interface Page {
  rows: MatchEntry[]
  next: number // start of the next page
  more: boolean
  busy: boolean
  error?: ProfileErrorCode
}
const EMPTY: Page = { rows: [], next: 0, more: false, busy: false }

const readMe = () => { try { return localStorage.getItem(ME_KEY) } catch { return null } }
const saveMe = (id: string) => { try { localStorage.setItem(ME_KEY, id) } catch {} }

async function fetchProfile(target: string): Promise<ProfileResult<Prof>> {
  const parse = (s: string) => parseRiotId(s, 'TR1')
  const { id: plain, platform } = splitPlatform(target, REGIONS.map((r) => r.platform))
  const id = target === 'me' ? null : parse(plain)
  if (target !== 'me' && !id) return { ok: false, error: 'not_found' }
  let r = await window.lolay.profileGet(id ? { ...id, platform } : 'me')
  // League is closed: fall back to the account that was signed in last time
  if (!r.ok && !id && r.error === 'lcu_off') {
    const last = parse(readMe() ?? '')
    if (last) r = await window.lolay.profileGet(last)
  }
  if (r.ok && r.data.me) saveMe(`${r.data.gameName}#${r.data.tagLine}`)
  return r
}

const Icon = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)

function Tile({ label, value, sub, className = '' }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium tracking-wide text-mute">{label}</div>
      <div className={`mt-0.5 truncate text-[17px] leading-tight font-semibold ${className}`}>{value}</div>
      {sub && <div className="truncate text-[10.5px] text-mute">{sub}</div>}
    </div>
  )
}

function RankCard({ label, r }: { label: string; r: ProfileRank | null }) {
  const t = useT()
  const games = r ? r.wins + r.losses : 0
  const wr = games ? (r!.wins / games) * 100 : null
  const color = r ? RANK_TEXT[r.tier] ?? '#9aa3b5' : '#5b6477'
  const apex = r ? APEX.has(r.tier) : false
  return (
    <Card className="relative overflow-hidden p-3.5">
      <div className="pointer-events-none absolute inset-0 opacity-[.09]" style={{ background: `radial-gradient(120% 90% at 0% 0%, ${color}, transparent 60%)` }} />
      <div className="relative">
        <div className="text-[10.5px] font-semibold tracking-[0.14em] text-mute uppercase">{label}</div>
        <div className="mt-2.5 flex items-center gap-3">
          <span style={{ filter: r ? `drop-shadow(0 0 8px ${color}55)` : undefined }}>
            <Crest tier={(r ? r.tier.toLowerCase() : 'all') as Tier} size={52} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] leading-tight font-bold" style={{ color: r ? color : undefined }}>
              {r ? `${t(`rank.${r.tier}` as Key)}${apex ? '' : ` ${r.division}`}` : <span className="text-mute">{t('live.unranked')}</span>}
            </div>
            <div className="mt-0.5 text-[12px] text-mute">{r ? <><span className="font-semibold text-fg">{r.lp}</span> {t('live.lp')}</> : '–'}</div>
          </div>
          {r && (
            <div className="shrink-0 text-right text-[11.5px] leading-tight">
              <div className="text-mute">{r.wins}{t('live.w')} {r.losses}{t('live.l')}</div>
              <div className={wr! >= 60 ? 'font-semibold text-gold' : `font-semibold ${wrColor(wr)}`}>{Math.round(wr!)}%</div>
            </div>
          )}
        </div>
        {r && !apex && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#232a3a]" role="progressbar" aria-valuenow={r.lp} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.lp)}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
          </div>
        )}
      </div>
    </Card>
  )
}

function Ring({ pct, size = 72 }: { pct: number; size?: number }) {
  const r = (size - 9) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className={`-rotate-90 ${pct >= 50 ? 'text-win' : 'text-loss'}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#232a3a" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[15px] font-bold">{Math.round(pct)}%</div>
    </div>
  )
}

function SummaryCard({ s, loading }: { s: ProfileStats | null; loading: boolean }) {
  const t = useT()
  return (
    <Card className="p-3.5">
      <Eyebrow right={s && <span className="text-[11px] text-mute">{s.wins}{t('live.w')} {s.games - s.wins}{t('live.l')}</span>}>{t('pf.recentN').replace('{n}', String(s?.games ?? FIRST))}</Eyebrow>
      {s ? (
        <div className="flex items-center gap-4">
          <Ring pct={s.wr} />
          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2.5">
            <Tile label="KDA" value={s.kda.toFixed(2)} className={kdaColor(s.kda)} sub={s.avg.map((v) => v.toFixed(1)).join(' / ')} />
            <Tile label={t('pf.csMin')} value={s.csPerMin.toFixed(1)} />
            <Tile label={t('pf.kp')} value={s.kp == null ? '–' : `${Math.round(s.kp)}%`} />
            <Tile label={t('stat.games')} value={s.games} />
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-4"><Sk w={72} h={72} r={36} /><div className="grid flex-1 grid-cols-2 gap-3"><Sk w="80%" h={34} /><Sk w="60%" h={34} /><Sk w="70%" h={34} /><Sk w="50%" h={34} /></div></div>
      ) : (
        <div className="py-4 text-center text-[12.5px] text-mute">{t('live.noData')}</div>
      )}
    </Card>
  )
}

function ChampsCard({ s, st }: { s: ProfileStats | null; st: StaticData }) {
  const t = useT()
  return (
    <Card className="p-3.5">
      <Eyebrow>{t('pf.champs')}</Eyebrow>
      <div className="space-y-1.5">
        {s?.champs.slice(0, 5).map((c) => {
          const wr = (c.wins / c.games) * 100
          return (
            <div key={c.championId} className="flex items-center gap-3">
              <ChampIcon id={c.championId} st={st} size={30} className="rounded-lg ring-1 ring-white/10" />
              <div className="min-w-0 flex-1 basis-[90px]">
                <div className="truncate text-[12.5px] font-medium">{st.champions[c.championId]?.name ?? '…'}</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#232a3a]"><div className={`h-full rounded-full ${wr >= 50 ? 'bg-win' : 'bg-loss'}`} style={{ width: `${wr}%` }} /></div>
              </div>
              <div className="w-[64px] shrink-0 text-right leading-tight">
                <div className={`text-[12px] font-semibold ${wrColor(wr)}`}>{Math.round(wr)}%</div>
                <div className="text-[10.5px] text-mute">{c.games} {t('live.games')}</div>
              </div>
              <div className={`hidden w-[44px] shrink-0 text-right text-[12px] font-semibold min-[420px]:block ${kdaColor(c.kda)}`}>{c.kda.toFixed(1)}</div>
            </div>
          )
        })}
        {!s && <div className="py-3 text-center text-[12.5px] text-mute">–</div>}
      </div>
    </Card>
  )
}

function RolesCard({ s }: { s: ProfileStats | null }) {
  const t = useT()
  const total = s?.roles.reduce((n, r) => n + r.games, 0) ?? 0
  return (
    <Card className="p-3.5">
      <Eyebrow>{t('live.roles')}</Eyebrow>
      {total ? (
        <>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {s!.roles.map((r) => <span key={r.lane} title={t(`lane.${r.lane}` as Key)} style={{ width: `${(r.games / total) * 100}%`, background: LANE_COLOR[r.lane] }} className="first:rounded-l-full last:rounded-r-full" />)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {s!.roles.map((r) => (
              <span key={r.lane} className="inline-flex items-center gap-1.5 text-[12px]">
                <span className="size-2 rounded-full" style={{ background: LANE_COLOR[r.lane] }} />
                {t(`lane.${r.lane}` as Key)}
                <span className="text-mute">{Math.round((r.games / total) * 100)}%</span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="py-3 text-center text-[12.5px] text-mute">–</div>
      )}
    </Card>
  )
}

function Header({ p, st, children }: { p: Prof | null; st: StaticData; children: ReactNode }) {
  const t = useT()
  const [iconOk, setIconOk] = useState(true)
  useEffect(() => setIconOk(true), [p?.iconId])
  return (
    <Card className="relative overflow-visible p-3.5 sm:p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5">
        {p ? (
          <div className="flex min-w-0 flex-1 basis-[240px] items-center gap-4">
            <div className="relative shrink-0 pb-2">
              {iconOk && p.iconId ? (
                <img src={`${DDRAGON}/${st.version}/img/profileicon/${p.iconId}.png`} alt="" width={68} height={68} onError={() => setIconOk(false)} className="size-[68px] rounded-2xl object-cover ring-2 ring-gold/40 shadow-[0_8px_24px_-8px_rgba(200,170,110,.5)]" />
              ) : (
                <span className="grid size-[68px] place-items-center rounded-2xl bg-card2 text-mute ring-2 ring-line"><Icon size={26}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></Icon></span>
              )}
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-[#0e1015] px-2 text-[11px] leading-[18px] font-semibold text-gold ring-1 ring-gold/40" title={t('pf.level')}>{p.level || '–'}</span>
            </div>
            <div className="min-w-0">
              <h1 className="flex min-w-0 items-baseline gap-1.5 leading-tight">
                <span className="truncate text-[20px] font-semibold sm:text-[22px]">{p.gameName}</span>
                <span className="shrink-0 text-[14px] text-mute">#{p.tagLine}</span>
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex h-[18px] items-center rounded-md border border-line bg-white/[.04] px-1.5 text-[10.5px] font-semibold text-mute">{regionLabel(p.platform)}</span>
                {p.me && <span className="inline-flex h-[18px] items-center rounded-md border border-gold/40 bg-gold/10 px-1.5 text-[10.5px] font-semibold text-gold">{t('live.me')}</span>}
                <span title={t(`live.src.${p.src}` as Key)} className="inline-flex h-[18px] items-center gap-1 rounded-md border border-line px-1.5 text-[10px] font-semibold text-mute"><span className={`size-1.5 rounded-full ${p.src === 'lcu' ? 'bg-blue/70' : 'bg-gold'}`} />{{ blitz: 'Blitz', opgg: 'OP.GG', riot: 'Riot', lcu: 'Client' }[p.src]}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1 basis-[240px] text-[15px] font-semibold text-mute">{t('nav.profile')}</div>
        )}
        {children}
      </div>
    </Card>
  )
}

function Notice({ tone = 'warn', children, action }: { tone?: 'warn' | 'err'; children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3.5 py-2.5 text-[12.5px] ${tone === 'warn' ? 'border-[#f59e0b]/30 bg-[#f59e0b]/[.07] text-[#fbbf24]' : 'border-loss/30 bg-loss/[.07] text-[#fca5a5]'}`}>
      <Icon size={15}><path d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></Icon>
      <span className="min-w-0 flex-1 basis-[200px]">{children}</span>
      {action}
    </div>
  )
}

const RetryButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button onClick={onClick} className="no-drag rounded-lg border border-line bg-[#12161d] px-3 py-1 text-[12px] font-semibold text-fg transition-colors hover:border-[#2f384c]">{label}</button>
)

// target: 'me', "Name#TAG", or "search:fragment" for the results view
export function Profile({ target, st }: { target: string; st: StaticData | null }) {
  const open = useOpenProfile()
  return target.startsWith('search:') ? <SearchResults query={target.slice(7)} version={st?.version ?? null} onOpen={open} /> : <ProfilePage target={target} st={st} />
}

function ProfilePage({ target, st }: { target: string; st: StaticData | null }) {
  const t = useT()
  const open = useOpenProfile()
  const [res, setRes] = useState<ProfileResult<Prof> | null>(null)
  const [nonce, setNonce] = useState(0)
  const [spin, setSpin] = useState(false)
  const [filter, setFilter] = useState<MatchFilter>('all')
  const [pages, setPages] = useState<Partial<Record<MatchFilter, Page>>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [trail, setTrail] = useState<string[]>([])
  const gen = useRef(0)

  const loadPage = useCallback(async (p: Prof, f: MatchFilter, start: number, fresh: boolean, g: number) => {
    const count = start ? PAGE : FIRST
    setPages((all) => ({ ...all, [f]: { ...(all[f] ?? EMPTY), busy: true, error: undefined } }))
    const r = await window.lolay.profileMatches({ puuid: p.puuid, gameName: p.gameName, tagLine: p.tagLine, platform: p.platform, src: p.src, filter: f, start, count, fresh }).catch((): ProfileResult<MatchEntry[]> => ({ ok: false, error: 'server' }))
    if (g !== gen.current) return
    setPages((all) => {
      const cur = all[f] ?? EMPTY
      if (!r.ok) return { ...all, [f]: { ...cur, busy: false, error: r.error } }
      const seen = new Set(start ? cur.rows.map((m) => m.id) : [])
      const rows = [...(start ? cur.rows : []), ...r.data.filter((m) => !seen.has(m.id))]
      // a match Riot no longer serves can shorten a page: still "more" above 80% of it
      return { ...all, [f]: { rows, next: start + count, more: r.data.length >= count * 0.8, busy: false } }
    })
  }, [])

  useEffect(() => {
    const g = ++gen.current
    const refresh = nonce > 0
    if (refresh) { setSpin(true); setFilter('all') }
    else {
      setRes(null)
      setPages({})
      setFilter('all')
      setOpenId(null)
    }
    void fetchProfile(target).then((r) => {
      if (g !== gen.current) return
      setSpin(false)
      setRes(r)
      if (r.ok) {
        void loadPage(r.data, 'all', 0, refresh, g)
        if (refresh) setPages((all) => (all.all ? { all: all.all } : {}))
      }
    })
  }, [target, nonce, loadPage])

  const prof = res?.ok ? res.data : null
  const pick = (f: MatchFilter) => {
    setFilter(f)
    if (prof && !pages[f]) void loadPage(prof, f, 0, false, gen.current)
  }
  const go = (id: string) => {
    setTrail((x) => [...x, target].slice(-10))
    open(withPlatform(id, prof?.platform)) // a participant is usually on the same shard
  }
  const back = () => {
    const prev = trail[trail.length - 1]
    if (!prev) return
    setTrail((x) => x.slice(0, -1))
    open(prev)
  }

  if (!st) return <div className="grid min-h-[40vh] place-items-center text-[12.5px] text-mute">{t('load.static')}</div>

  const all = pages.all
  const stats = all ? summarizeMatches(all.rows, FIRST) : null
  const cur = pages[filter] ?? EMPTY
  const first = !pages[filter] || (cur.busy && !cur.rows.length)

  return (
    <div className="mx-auto max-w-[1100px] space-y-3 sm:space-y-4">
      <Header p={prof} st={st}>
        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          {trail.length > 0 && (
            <button onClick={back} aria-label={t('nav.back')} title={t('nav.back')} className="no-drag grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-[#12161d] text-mute transition-colors hover:border-[#2f384c] hover:text-fg"><Icon><path d="m15 18-6-6 6-6" /></Icon></button>
          )}
          <button
            onClick={() => setNonce((n) => n + 1)}
            disabled={!res || spin}
            aria-label={t('pf.refresh')}
            title={t('pf.refresh')}
            className="no-drag inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-[#12161d] px-2.5 text-[13px] font-semibold transition-colors enabled:hover:border-[#2f384c] enabled:hover:bg-[#1a2030] disabled:opacity-50 sm:px-3"
          >
            <span className={spin ? 'animate-spin' : ''}><Icon size={15}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></Icon></span>
            <span className="hidden sm:inline">{t('pf.refresh')}</span>
          </button>
        </div>
      </Header>

      {!res ? (
        <div className="space-y-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))] gap-3">{[0, 1, 2].map((i) => <Sk key={i} w="100%" h={118} r={12} />)}</div>
          {[0, 1, 2, 3].map((i) => <Sk key={i} w="100%" h={76} r={12} />)}
        </div>
      ) : !res.ok ? (
        <Card className="relative overflow-hidden px-5 py-9 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-line bg-card2 text-gold"><Icon size={22}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8.5 11h5" /></Icon></div>
          <p className="mx-auto max-w-[420px] text-[13.5px] leading-relaxed text-fg">{t(`pf.err.${res.error}` as Key)}</p>
          <div className="mt-4"><RetryButton onClick={() => setNonce((n) => n + 1)} label={t('err.retry')} /></div>
        </Card>
      ) : (
        <>
          {prof!.degraded && <Notice>{t('pf.degraded')}</Notice>}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))] gap-3">
            <RankCard label={t('pf.solo')} r={prof!.solo} />
            <RankCard label={t('pf.flex')} r={prof!.flex} />
            <SummaryCard s={stats} loading={!all || all.busy} />
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <ChampsCard s={stats} st={st} />
            <RolesCard s={stats} />
          </div>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
              <h2 className="text-[11px] font-semibold tracking-[0.14em] text-mute uppercase">{t('pf.history')}</h2>
              <div role="radiogroup" aria-label={t('pf.history')} className="no-drag flex flex-wrap gap-1.5">
                {FILTERS.map((f) => {
                  const on = f === filter
                  return (
                    <button
                      key={f}
                      role="radio"
                      aria-checked={on}
                      onClick={() => pick(f)}
                      className={`h-7 rounded-full border px-3 text-[12px] font-medium transition-all duration-150 ${on ? 'border-gold/40 bg-gold/10 text-gold shadow-[0_0_14px_-4px_rgba(200,170,110,.5)]' : 'border-line bg-[#12161d] text-mute hover:border-[#2f384c] hover:text-fg'}`}
                    >
                      {t(`pf.f.${f}` as Key)}
                    </button>
                  )
                })}
              </div>
            </div>

            {cur.error && !cur.rows.length ? (
              <Notice tone="err" action={<RetryButton onClick={() => void loadPage(prof!, filter, cur.next, false, gen.current)} label={t('err.retry')} />}>{t(`pf.err.${cur.error}` as Key)}</Notice>
            ) : first ? (
              <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Sk key={i} w="100%" h={76} r={12} />)}</div>
            ) : !cur.rows.length ? (
              <Card className="px-5 py-9 text-center text-[13px] text-mute">{t('pf.noMatches')}</Card>
            ) : (
              <div className="space-y-2">
                {cur.rows.map((m) => (
                  <MatchRow key={m.id} m={m} st={st} open={openId === m.id} onToggle={() => setOpenId((x) => (x === m.id ? null : m.id))} onOpenProfile={go} />
                ))}
                {cur.error && <Notice tone="err" action={<RetryButton onClick={() => void loadPage(prof!, filter, cur.next, false, gen.current)} label={t('err.retry')} />}>{t(`pf.err.${cur.error}` as Key)}</Notice>}
                {cur.more && (
                  <button
                    onClick={() => void loadPage(prof!, filter, cur.next, false, gen.current)}
                    disabled={cur.busy}
                    className="no-drag mx-auto flex h-10 w-full max-w-[320px] items-center justify-center gap-2 rounded-xl border border-line bg-[#12161d] text-[13px] font-semibold text-fg transition-colors enabled:hover:border-[#2f384c] enabled:hover:bg-[#1a2030] disabled:opacity-60"
                  >
                    {cur.busy && <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-gold" />}
                    {t('pf.more')}
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

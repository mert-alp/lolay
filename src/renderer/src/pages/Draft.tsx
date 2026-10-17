import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { champIcon, DDRAGON, spellIcon, type AppState, type MetaResult, type MetaRow, type Tier, type ApplyRequest, type Build, type Damage, type DraftPool, type DraftRecommendation, type LivePlayer, type StaticData } from '@shared/types'
import { damagePct, teamDamage } from '@shared/damage'
import { useT, type Key } from '../i18n'
import { RANK_TEXT, fmtGames, tagsOf, tierColor, wrColor } from '../util'
import { Card } from '../components/ui'
import { BuildPanel } from '../components/BuildPanel'
import { Recommendations } from '../components/Recommendations'
import { ChampionPicker } from '../components/ChampionPicker'
import { ImportChip, PARTS, partStates } from '../components/ImportRow'
import { Chip, Sk, TAG_STYLE, kdaColor } from '../components/PlayerCard'
import type { PushToast } from '../components/Toasts'

const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER'])
const DMG = { physical: '#ef5350', magic: '#4aa3ff', true: '#aab2c5' } as const
const ONE_SIDED = 70

const bkey = (id: number, lane?: string | null) => `${id}:${lane ?? ''}`

// each build is requested once (main caches them); null = failed, stays out of the damage numbers
function useBuilds(wanted: { championId: number; lane?: LivePlayer['position'] }[], scope: string) {
  const [map, setMap] = useState<Record<string, Build | null>>({})
  const sig = scope + wanted.map((w) => bkey(w.championId, w.lane)).join()
  useEffect(() => {
    const asked = new Set<string>()
    for (const w of wanted) {
      const k = scope + bkey(w.championId, w.lane)
      if (!w.championId || asked.has(k) || k in map) continue
      asked.add(k)
      window.lolay.getBuild({ championId: w.championId, lane: w.lane ?? undefined })
        .then((b) => setMap((m) => ({ ...m, [k]: b })))
        .catch(() => setMap((m) => ({ ...m, [k]: null })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  return (id: number, lane?: string | null) => map[scope + bkey(id, lane)] ?? null
}

// ranked hides teammates, so a hidden ally gets the champion's own lane stats; one request per lane+tier
const metaCache = new Map<string, Promise<MetaResult>>()
function useChampMeta(championId: number, lane: LivePlayer['position'], tier: Tier, on: boolean) {
  const [row, setRow] = useState<MetaRow | null | undefined>(undefined)
  useEffect(() => {
    if (!on) return
    let live = true
    const k = `${lane ?? 'all'}:${tier}`
    let p = metaCache.get(k)
    if (!p) metaCache.set(k, (p = window.lolay.getMeta({ lane: lane ?? 'all', tier, compare: false })))
    setRow(undefined)
    p.then((r) => live && setRow(r.rows.find((x) => x.championId === championId) ?? null))
      .catch(() => { metaCache.delete(k); if (live) setRow(null) })
    return () => { live = false }
  }, [on, championId, lane, tier])
  return row
}

function Silhouette() {
  return (
    <svg viewBox="0 0 100 120" className="absolute inset-x-0 top-6 mx-auto w-[58%] text-[#1d2330]" fill="currentColor" aria-hidden>
      <circle cx="50" cy="38" r="22" />
      <path d="M8 118c0-28 18-44 42-44s42 16 42 44z" />
    </svg>
  )
}

function DamageChips({ d }: { d: Damage | null | undefined }) {
  const t = useT()
  const p = damagePct(d)
  if (!p) return null
  const rows: [keyof Damage, string, Key][] = [['physical', 'AD', 'draft.ad'], ['magic', 'AP', 'draft.ap'], ['true', 'T', 'draft.true']]
  return (
    <div className="flex gap-1">
      {rows.map(([k, short, long]) => (
        <span key={k} title={t(long)} className="inline-flex h-[17px] items-center gap-1 rounded-md bg-black/35 px-1.5 text-[10px] font-bold leading-none" style={{ color: DMG[k] }}>
          {short}
          <span className="font-semibold text-fg/90">{Math.round(p[k])}</span>
        </span>
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11.5px] leading-[16px]">
      <span className="shrink-0 text-[10.5px] text-mute">{label}</span>
      <span className="truncate text-right font-medium">{children}</span>
    </div>
  )
}

function AllyCard({ p, st, build, tier: appTier }: { p: LivePlayer; st: StaticData | null; build: Build | null; tier: Tier }) {
  const t = useT()
  const champ = p.championId ? st?.champions[p.championId] : undefined
  const cd = !!p.hidden && !p.bot && !!champ
  const meta = useChampMeta(p.championId, p.position, appTier, cd)
  const s = p.summary
  const loading = !!p.puuid && !s
  const tier = s?.rank?.tier
  const games = s ? s.wins + s.losses : 0
  const wr = games ? Math.round((s!.wins / games) * 100) : null
  const cwr = s && s.champ.games ? Math.round((s.champ.wins / s.champ.games) * 100) : null
  const name = p.bot ? champ?.name ?? t('live.bot') : p.name ?? (p.puuid ? '…' : t('live.hidden'))
  const tags = tagsOf(p)
  const streak = s?.streak ?? 0

  return (
    <article
      className={`fade-up relative h-[262px] w-[160px] shrink-0 snap-start overflow-hidden rounded-xl border bg-[#12161d] min-[900px]:w-auto min-[900px]:min-w-0 min-[900px]:flex-1 min-[900px]:basis-0 ${
        p.me ? 'border-gold/70 shadow-[0_0_0_1px_rgba(200,170,110,.3),0_12px_34px_-14px_rgba(200,170,110,.55)]' : 'border-line'
      }`}
    >
      {champ ? (
        <img src={`${DDRAGON}/img/champion/loading/${champ.id}_0.jpg`} alt={champ.name} decoding="async" className="absolute inset-0 size-full object-cover object-top" />
      ) : (
        <Silhouette />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0e14] via-[#0b0e14]/90 via-[48%] to-[#0b0e14]/5" />
      {p.me && <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />}

      <div className="relative flex h-full flex-col p-2.5">
        <div className="flex items-start justify-between gap-1">
          {p.position ? (
            <Chip className="border-white/15 bg-black/45 text-fg/90 backdrop-blur-sm">{t(`lane.${p.position}` as Key)}</Chip>
          ) : <span />}
          <div className="flex flex-col items-end gap-1">
            {tags.map((g) => <Chip key={g} className={`bg-black/50 backdrop-blur-sm ${TAG_STYLE[g]}`}>{t(`live.tag.${g}` as Key)}</Chip>)}
            {streak !== 0 && (
              <Chip className={`bg-black/50 backdrop-blur-sm ${streak > 0 ? 'border-win/40 text-win' : 'border-loss/40 text-loss'}`}>
                {Math.abs(streak)}{t(streak > 0 ? 'live.w' : 'live.l')}
              </Chip>
            )}
          </div>
        </div>

        <div className="mt-auto space-y-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className={`truncate text-[15px] font-bold leading-tight ${p.me ? 'text-gold' : p.bot || !p.name ? 'text-fg/80' : ''}`}>{name}</span>
              {p.tag && <span className="shrink-0 text-[10.5px] text-mute">#{p.tag}</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-mute">
              {p.bot && <Chip className="border-white/15 bg-white/[.06] text-mute">{t('live.bot')}</Chip>}
              {p.me && <Chip className="border-gold/40 bg-gold/10 text-gold">{t('live.me')}</Chip>}
              {!p.bot && <span className="truncate">{champ?.name ?? t('live.pending')}</span>}
            </div>
          </div>

          {loading && (
            <div className="space-y-2 border-t border-white/10 pt-2">
              <Sk w="70%" h={12} /><Sk w="50%" h={10} /><Sk w="90%" h={10} /><Sk w="80%" h={10} /><Sk w="60%" h={10} />
            </div>
          )}

          {s && (
            <div className="space-y-1 border-t border-white/10 pt-2">
              <div className="leading-tight">
                <div className="text-[13px] font-bold" style={{ color: tier ? RANK_TEXT[tier] : undefined }}>
                  {tier ? (
                    <>
                      {t(`rank.${tier}` as Key)}
                      {!APEX.has(tier) && ` ${s.rank!.division}`}
                      <span className="ml-1.5 text-[11px] font-medium text-mute">{s.rank!.lp} {t('live.lp')}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-mute">{t('live.unranked')}</span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px]">
                  {wr == null ? <span className="text-mute">–</span> : (
                    <>
                      <span className={wr >= 60 ? 'font-semibold text-gold' : `font-semibold ${wrColor(wr)}`}>{wr}%</span>
                      <span className="text-mute"> · {s.wins}{t('live.w')} {s.losses}{t('live.l')}</span>
                    </>
                  )}
                </div>
              </div>
              <Row label={t('draft.mastery')}>
                {s.mastery ? <><span className="font-bold text-gold">M{s.mastery.level}</span><span className="text-mute"> · {fmtGames(s.mastery.points)}</span></> : <span className="text-mute">–</span>}
              </Row>
              <Row label={t('live.champ')}>
                {cwr == null ? <span className="text-mute">0 {t('live.games')}</span> : <><span className={wrColor(cwr)}>{cwr}%</span><span className="text-mute"> · {s.champ.games} {t('live.games')}</span></>}
              </Row>
              <Row label="KDA">
                {s.kda == null ? <span className="text-mute">–</span> : <span className={`font-bold ${kdaColor(s.kda)}`}>{s.kda.toFixed(2)}</span>}
              </Row>
            </div>
          )}

          {cd && (
            <div className="space-y-1 border-t border-white/10 pt-2">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-mute">{t('draft.champData')}</div>
              {meta === undefined ? (
                <div className="space-y-2 pt-0.5"><Sk w="70%" h={12} /><Sk w="90%" h={10} /><Sk w="80%" h={10} /></div>
              ) : meta === null ? (
                <span className="text-[11.5px] text-mute">–</span>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 leading-tight">
                    {meta.tier && <span className="rounded-md border px-1.5 text-[11px] font-extrabold" style={{ color: tierColor(meta.tier), borderColor: tierColor(meta.tier) + '77', background: tierColor(meta.tier) + '1f' }}>{meta.tier}</span>}
                    <span className={`text-[15px] font-bold ${wrColor(meta.wr)}`}>{meta.wr.toFixed(1)}%</span>
                    <span className={`text-[10.5px] font-semibold ${meta.delta >= 0 ? 'text-win' : 'text-loss'}`}>{meta.delta >= 0 ? '+' : ''}{meta.delta.toFixed(1)}</span>
                  </div>
                  <Row label={t('draft.laneRank')}>{meta.rank ? `#${meta.rank}` : <span className="text-mute">–</span>}</Row>
                  <Row label={t('draft.pickBan')}>{meta.pr.toFixed(1)}% <span className="text-mute">·</span> {meta.br.toFixed(1)}%</Row>
                </>
              )}
            </div>
          )}

          {p.bot && <div className="border-t border-white/10 pt-2 text-[11px] text-mute">{t('draft.botNote')}</div>}
          <div className="h-[17px]">{!p.bot && <DamageChips d={build?.damage} />}</div>
        </div>
      </div>
    </article>
  )
}

// enemy champion with its own lane stats (ranked hides who plays it); the likely laner / jungler is marked
function EnemyCard({ p, st, tier, role, damage }: { p: LivePlayer; st: StaticData | null; tier: Tier; role: Key | null; damage: Damage | null | undefined }) {
  const t = useT()
  const c = p.championId ? st?.champions[p.championId] : undefined
  const meta = useChampMeta(p.championId, p.position, tier, !!c)
  return (
    <div className={`fade-up relative flex min-w-[150px] flex-1 basis-[150px] flex-col gap-1.5 rounded-xl border bg-card px-2.5 py-2 ${role ? 'border-loss/45' : 'border-line'}`}>
      {role && <Chip className="absolute -top-2 right-2 border-loss/40 bg-[#1a1216] text-loss">{t(role)}</Chip>}
      <div className="flex items-center gap-2.5">
        {c && st ? (
          <div className="relative shrink-0">
            <img src={champIcon(st.version, c.id)} alt={c.name} className="size-9 rounded-lg ring-1 ring-loss/40" />
            {meta?.tier && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded border bg-[#0b0e14] px-1 text-[9px] leading-[12px] font-extrabold" style={{ color: tierColor(meta.tier), borderColor: tierColor(meta.tier) + '77' }}>{meta.tier}</span>}
          </div>
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-dashed border-line text-mute/60">—</span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <div className={`truncate text-[12.5px] font-semibold ${c ? '' : 'text-mute'}`}>{c?.name ?? '—'}</div>
          <div className="truncate text-[10.5px] text-mute">
            {!c ? t('live.pending') : meta === undefined ? <Sk w="60%" h={9} /> : meta ? (
              <><span className={`font-semibold ${wrColor(meta.wr)}`}>{meta.wr.toFixed(1)}%</span> {t('power.wr')}{p.position && <> · {t(`lane.${p.position}` as Key)}</>}</>
            ) : '–'}
          </div>
        </div>
      </div>
      {c && <div className="h-[17px]"><DamageChips d={damage} /></div>}
    </div>
  )
}

function TeamDamage({ dmg, label, hint = true }: { dmg: ReturnType<typeof teamDamage>; label: string; hint?: boolean }) {
  const t = useT()
  const rows: [keyof Damage, Key][] = [['physical', 'draft.ad'], ['magic', 'draft.ap'], ['true', 'draft.true']]
  const heavy = dmg && hint ? rows.find(([k]) => k !== 'true' && dmg.pct[k] >= ONE_SIDED) : undefined
  return (
    <Card className="flex min-h-[64px] flex-col justify-center gap-2 px-3.5 py-2.5 sm:px-4">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{label}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {dmg ? (
        <>
          <div className="flex h-2.5 min-w-[140px] flex-1 basis-[140px] overflow-hidden rounded-full bg-[#10131a] ring-1 ring-white/5">
            {rows.map(([k]) => (
              <span key={k} className="h-full transition-[width] duration-500" style={{ width: `${dmg.pct[k]}%`, background: DMG[k] }} />
            ))}
          </div>
          <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[12px] font-bold">
            {rows.map(([k, label]) => (
              <span key={k} className="inline-flex items-center gap-1.5" style={{ color: DMG[k] }}>
                <span className="size-2 rounded-full" style={{ background: DMG[k] }} />
                <span className="text-[10.5px] font-medium text-mute">{t(label)}</span>
                {Math.round(dmg.pct[k])}%
              </span>
            ))}
          </div>
          {heavy && (
            <span className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-300">
              {t(heavy[0] === 'physical' ? 'draft.hintAd' : 'draft.hintAp')}
            </span>
          )}
        </>
      ) : (
        <span className="text-[12px] text-mute">{t('draft.noDamage')}</span>
      )}
      </div>
    </Card>
  )
}

function BanList({ label, ids, st }: { label: string; ids: number[]; st: StaticData | null }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{label}</span>
      <div className="flex flex-wrap gap-1">
        {ids.map((id, i) => {
          const c = st?.champions[id]
          return c && st ? <img key={`${id}-${i}`} src={champIcon(st.version, c.id)} alt={c.name} title={c.name} className="size-6 rounded-md opacity-55 ring-1 ring-white/10 grayscale" /> : null
        })}
      </div>
    </div>
  )
}

// read-only D/F indicator: the full control lives in the build panel
function SpellBadge({ ids, st }: { ids: number[]; st: StaticData }) {
  return (
    <div className="flex items-center gap-1.5">
      {ids.map((id, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5" title={st.spells[id]?.name}>
          {st.spells[id] ? <img src={spellIcon(st.version, st.spells[id].id)} alt={st.spells[id].name} draggable={false} style={{ width: 22, height: 22 }} className="rounded-md border border-line" /> : <span className="size-[22px] rounded-md border border-dashed border-line" />}
          <span className="text-[9px] leading-none font-bold text-mute">{'DF'[i]}</span>
        </div>
      ))}
    </div>
  )
}

function Tip({ label, show, children, className = '' }: { label: string; show: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`group relative ${className}`}>
      {children}
      {show && (
        <span className="pointer-events-none absolute top-full right-0 z-30 mt-2 whitespace-nowrap rounded-lg border border-line bg-[#171c26] px-2.5 py-1.5 text-[11.5px] text-fg opacity-0 shadow-[0_10px_28px_-8px_rgba(0,0,0,.8)] transition-opacity duration-150 group-hover:opacity-100">
          {label}
        </span>
      )}
    </div>
  )
}

// whole seconds left until endsAt, ticking locally between session updates; null = no countdown
function useCountdown(endsAt: number | null) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!endsAt) return
    setNow(Date.now())
    const i = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(i)
  }, [endsAt])
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null
}

type Tab = 'recs' | 'all' | 'build'

const PHASE_STYLE = {
  ban: 'border-loss/40 bg-loss/10 text-loss',
  pick: 'border-gold/40 bg-gold/10 text-gold',
  waiting: 'border-line bg-white/[.03] text-mute',
  done: 'border-win/30 bg-win/10 text-win'
} as const

// latest answer wins; the previous suggestions stay on screen while new ones load
function useRecommend(sig: string, enabled: boolean) {
  const [s, setS] = useState<{ rec: DraftRecommendation | null; loading: boolean; error: boolean }>({ rec: null, loading: false, error: false })
  // my ban turn starts without any change the page can see: ask again every few seconds until my ban is made
  const [tick, setTick] = useState(0)
  const seen = useRef(0)
  const banning = s.rec?.banActionId != null
  useEffect(() => {
    if (!banning) return
    const i = setInterval(() => setTick((n) => n + 1), 3000)
    return () => clearInterval(i)
  }, [banning])
  useEffect(() => {
    if (!enabled) return
    let live = true
    const quiet = seen.current !== tick
    seen.current = tick
    if (!quiet) setS((p) => ({ ...p, loading: true, error: false }))
    window.lolay.draftRecommend()
      .then((rec) => live && setS({ rec, loading: false, error: false }))
      .catch(() => live && setS((p) => ({ ...p, loading: false, error: true })))
    return () => { live = false }
  }, [sig, enabled, tick])
  return s
}

export function Draft({ state, st, onDetails, toast }: { state: AppState; st: StaticData | null; onDetails: () => void; toast: PushToast }) {
  const t = useT()
  const live = state.live
  const cs = state.champSelect
  const myId = cs?.championId ?? 0
  const myLane = cs?.lane ?? undefined
  const allies = live?.myTeam ?? []
  const enemies = live?.enemyTeam ?? []

  const wanted = useMemo(
    () => [
      { championId: myId, lane: myLane },
      ...allies.filter((p) => !p.bot).map((p) => ({ championId: p.championId, lane: p.position })),
      ...enemies.map((p) => ({ championId: p.championId, lane: p.position }))
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myId, myLane, allies.map((p) => `${p.championId}:${p.position}:${p.bot}`).join(), enemies.map((p) => `${p.championId}:${p.position}`).join()]
  )
  const build = useBuilds(wanted, `${state.tier}:${state.settings.source}:`)
  const mine = myId ? build(myId, myLane) : null
  const mineOk = mine && !mine.insufficient ? mine : null
  const allyBuild = (p: LivePlayer) => (p.bot || !p.championId ? null : build(p.championId, p.position))
  const dmg = teamDamage(allies.map((p) => allyBuild(p)?.damage))
  const foeDmg = teamDamage(enemies.map((p) => (p.championId ? build(p.championId, p.position)?.damage : null)))

  // the suggestions depend on the lane, the rank filter and who is banned or picked by others
  const sig = [state.tier, myLane, live?.bans?.my.length, live?.bans?.their.length, ...allies.filter((p) => !p.me).map((p) => p.championId), ...enemies.map((p) => p.championId)].join()
  const { rec, loading: recLoading, error: recError } = useRecommend(sig, !!cs && !!myLane)

  const [tab, setTab] = useState<Tab>('recs')
  // a hovered champion opens its build, except while choosing in the picker
  const toBuild = (cur: Tab): Tab => (cur === 'all' ? cur : 'build')
  useEffect(() => { if (myId > 0) setTab(toBuild) }, [myId])

  const phase = cs?.phase ?? 'done'
  const banning = phase === 'ban'
  const myTurn = phase === 'ban' || phase === 'pick'
  const left = useCountdown(cs?.endsAt ?? null)
  const [banSel, setBanSel] = useState(0)
  useEffect(() => { if (!banning) setBanSel(0) }, [banning])

  // what can be chosen right now; asked again whenever someone bans / picks
  const [pool, setPool] = useState<DraftPool | null>(null)
  useEffect(() => {
    if (!cs || tab !== 'all') return
    let alive = true
    window.lolay.draftPool().then((p) => alive && setPool(p)).catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!cs, tab, phase, sig])
  const usable = useMemo(() => {
    if (!pool) return null
    const taken = new Set([...(live?.bans?.my ?? []), ...(live?.bans?.their ?? []), ...allies.filter((p) => !p.me).map((p) => p.championId), ...enemies.map((p) => p.championId)])
    return new Set((banning ? pool.bannable : pool.pickable).filter((id) => !taken.has(id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, banning, sig])

  const champ = myId ? st?.champions[myId] : undefined
  const tierCol = mineOk ? tierColor(mineOk.tierLabel) : '#8a93a6'
  const states = cs ? partStates(cs, state.settings) : []

  async function apply(req: Omit<ApplyRequest, 'championId' | 'lane'>, kind: 'runes' | 'spells' | 'items') {
    if (!mineOk) return
    try {
      const r = await window.lolay.applyBuild({ championId: mineOk.championId, lane: mineOk.lane, ...req })
      const v = r[kind]
      if (v === 'ok') toast(t(`apply.${kind}`), 'ok')
      else if (v === 'skipped') toast(t('apply.skipped'), 'info')
      else toast(t(r.error === 'client' ? 'apply.err.client' : r.error === 'runes' ? 'apply.err.runes' : 'apply.error'), 'err')
    } catch {
      toast(t('apply.error'), 'err')
    }
  }

  async function pick(id: number) {
    try {
      if (await window.lolay.draftHover(id)) setTab(toBuild)
      else toast(t('draft.hoverFail'), 'err')
    } catch {
      toast(t('draft.hoverFail'), 'err')
    }
  }
  async function ban(id: number, complete: boolean) {
    try {
      if (await window.lolay.draftBan(id, complete)) return true
    } catch { /* toast below */ }
    toast(t('draft.banFail'), 'err')
    return false
  }
  async function hoverBan(id: number) {
    setBanSel(id)
    if (!(await ban(id, false))) setBanSel(0)
  }
  const choose = (id: number) => (banning ? hoverBan(id) : pick(id))
  async function lock(id: number) {
    try {
      if (!(await window.lolay.draftLock(id))) toast(t('draft.lockFail'), 'err')
    } catch {
      toast(t('draft.lockFail'), 'err')
    }
  }
  // lock in the pick / complete the ban, for the given champion or else the current selection
  async function act(id?: number) {
    if (banning) {
      const target = id ?? banSel
      if (target > 0 && (await ban(target, true))) setBanSel(0)
      return
    }
    const target = id ?? myId
    if (target > 0 && phase === 'pick' && !cs?.locked) await lock(target)
    else toast(t('draft.lockWait'), 'info')
  }

  const canLock = !!cs && myId > 0 && !cs.locked && cs.myTurn && cs.pickActionId != null
  const lockTip = !myId ? t('draft.lockNone') : cs?.locked ? '' : t('draft.lockWait')
  const banChamp = banSel ? st?.champions[banSel] : undefined
  const canAct = banning ? banSel > 0 : canLock
  const actTip = banning ? (banSel ? '' : t('draft.banNone')) : lockTip
  const shown = banning ? banChamp : champ
  const bans = live?.bans
  const hasBans = !!bans && (bans.my.length > 0 || bans.their.length > 0)

  // our win rate against the likely enemy laner: the build's matchup lists first, else the suggestion's own number
  const enemyId = rec?.enemyId ?? null
  const foeAt = (lane: string) => enemies.find((p) => p.position === lane && p.championId > 0)?.championId
  const vsLaner = (myLane ? foeAt(myLane) : undefined) ?? rec?.enemyId ?? undefined // as the jungler this is the enemy jungler; ranked draft hides positions, the suggestion guesses them
  const vsJungler = myLane && myLane !== 'jungle' ? foeAt('jungle') ?? rec?.enemyJungleId ?? undefined : undefined
  const enemyVs = enemyId
    ? [...(mineOk?.counters.strong ?? []), ...(mineOk?.counters.weak ?? [])].find((m) => m.championId === enemyId)?.wr ?? rec?.picks.find((p) => p.championId === myId)?.vs ?? null
    : null

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`no-drag relative h-9 px-4 text-[13px] font-semibold transition-colors ${tab === id ? 'text-fg' : 'text-mute hover:text-fg'}`}
    >
      <span className={id === 'all' && myTurn ? 'animate-pulse' : ''}>{label}</span>
      {id === 'all' && myTurn && <span className={`ml-1.5 inline-block size-1.5 animate-pulse rounded-full align-middle ${banning ? 'bg-loss' : 'bg-gold'}`} />}
      {tab === id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gold shadow-[0_0_10px_rgba(200,170,110,.8)]" />}
    </button>
  )

  return (
    <div className="mx-auto max-w-[1060px] space-y-3">
      <Card className="relative overflow-hidden">
        {champ && tab === 'build' && (
          <img
            src={`${DDRAGON}/img/champion/splash/${champ.id}_0.jpg`}
            alt=""
            decoding="async"
            className="pointer-events-none absolute inset-y-0 right-0 h-[130px] w-[55%] object-cover object-[50%_20%] opacity-25"
            style={{ maskImage: 'linear-gradient(to left, #000 5%, transparent 90%)', WebkitMaskImage: 'linear-gradient(to left, #000 5%, transparent 90%)' }}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-gold/70 via-gold/20 to-transparent" />

        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2.5 p-3 sm:gap-x-4 sm:p-4 sm:py-3.5">
          {shown && st ? (
            <img src={champIcon(st.version, shown.id)} alt={shown.name} style={{ width: 48, height: 48 }} className={`rounded-xl border ${banning ? 'border-loss/60 shadow-[0_0_22px_-6px_rgba(239,68,68,.6)]' : 'border-gold/50 shadow-[0_0_22px_-6px_rgba(200,170,110,.6)]'}`} />
          ) : (
            <div className="grid size-12 place-items-center rounded-xl border border-dashed border-line bg-[#12161d] text-[20px] font-semibold text-mute/60">?</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{t(banning ? 'draft.banTarget' : 'draft.yourBuild')}</div>
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 truncate text-[17px] sm:text-[19px] font-bold leading-tight tracking-tight">{banning ? banChamp?.name ?? t('draft.banNone') : champ?.name ?? t('draft.pickChamp')}</h1>
              {!banning && mineOk?.tierLabel && <span className="rounded-md border px-1.5 text-[12px] font-extrabold" style={{ color: tierCol, borderColor: tierCol + '77', background: tierCol + '1f' }}>{mineOk.tierLabel}</span>}
              {(myLane ?? mineOk?.lane) && <Chip className="border-line bg-white/[.04] text-mute">{t(`lane.${myLane ?? mineOk!.lane}` as Key)}</Chip>}
            </div>
          </div>
          {cs && st && (
            <div className="flex items-center gap-2">
              <SpellBadge ids={[cs.spell1Id, cs.spell2Id]} st={st} />
            </div>
          )}
          <Tip label={actTip} show={!canAct && !!actTip} className="max-sm:w-full">
            <button
              onClick={() => act()}
              disabled={!canAct}
              className={`no-drag inline-flex h-10 w-full items-center justify-center sm:w-auto sm:min-w-[150px] gap-2 rounded-lg px-5 text-[13.5px] font-bold transition-all duration-150 active:scale-[.97] ${
                !canAct
                  ? 'border border-line bg-[#1a2030] text-mute'
                  : banning
                    ? 'bg-gradient-to-b from-[#f0545a] to-[#c02a31] text-white shadow-[0_8px_24px_-8px_rgba(239,68,68,.9)] hover:brightness-110'
                    : 'bg-gradient-to-b from-[#e8c77e] to-[#b48a3e] text-[#1a1408] shadow-[0_8px_24px_-8px_rgba(200,170,110,.9)] hover:brightness-110'
              }`}
            >
              {banning ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              )}
              {banning ? (banChamp ? t('draft.banName').replace('{name}', banChamp.name) : t('draft.ban')) : cs?.locked ? t('draft.locked') : champ ? t('draft.lock').replace('{name}', champ.name) : t('draft.lockGeneric')}
            </button>
          </Tip>

          {cs && (
            <div role="status" className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold ${PHASE_STYLE[phase]}`}>
              <span className={`size-2 rounded-full bg-current ${myTurn ? 'animate-pulse' : 'opacity-60'}`} />
              {t(`draft.phase.${phase}` as Key)}
              {left != null && (
                <span className={`ml-auto text-[13px] font-bold tabular-nums ${myTurn && left <= 10 ? 'animate-pulse text-loss' : ''}`}>
                  {left}<span className="ml-0.5 text-[11px] font-semibold opacity-70">{t('draft.secs')}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* who plays what: right under the lock button, before the long build */}
      <div className="snap-row -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 px-3 pb-2 sm:-mx-5 sm:scroll-px-5 sm:px-5 min-[900px]:mx-0 min-[900px]:snap-none min-[900px]:overflow-visible min-[900px]:px-0 min-[900px]:pb-0">
        {allies.slice(0, 5).map((p) => <AllyCard key={p.key} p={p} st={st} build={allyBuild(p)} tier={state.tier} />)}
      </div>

      <div className="flex flex-wrap gap-2 sm:gap-3">
        {enemies.slice(0, 5).map((p) => {
          // as the jungler the suggestion's enemyId is the enemy jungler
          const role: Key | null = !p.championId ? null : p.championId === rec?.enemyJungleId || (p.championId === rec?.enemyId && myLane === 'jungle') ? 'draft.jungler' : p.championId === rec?.enemyId ? 'draft.laner' : null
          return <EnemyCard key={p.key} p={p} st={st} tier={state.tier} role={role} damage={p.championId ? build(p.championId, p.position)?.damage : null} />
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TeamDamage dmg={dmg} label={t('draft.teamDamage')} />
        <TeamDamage dmg={foeDmg} label={t('draft.enemyDamage')} hint={false} />
      </div>

      <Card className="relative overflow-hidden">
        <div className="relative flex flex-wrap items-center border-b border-line px-2 sm:px-3">
          <div className="flex gap-1 max-sm:w-full max-sm:border-b max-sm:border-line/60">
            {tabBtn('recs', t('draft.tabRecs'))}
            {tabBtn('all', t('draft.tabAll'))}
            {tabBtn('build', t('draft.tabBuild'))}
          </div>
          {cs && (
            <div className="flex flex-wrap items-center gap-1.5 py-1.5 pr-1 max-sm:w-full sm:ml-auto sm:py-0">
              {cs.autoImportAllowed ? PARTS.map((part, i) => <ImportChip key={part} part={part} state={states[i]} />) : <span className="text-[12px] text-mute">{t('pill.disabled')}</span>}
              {myId > 0 && <button onClick={onDetails} className="no-drag ml-2 text-[11.5px] text-mute underline-offset-2 transition-colors hover:text-gold hover:underline">{t('draft.details2')} ›</button>}
            </div>
          )}
        </div>

        <div className="relative bg-[#0f1218] p-3 sm:p-4">
          {tab === 'recs' ? (
            myLane ? (
              <Recommendations rec={rec} loading={recLoading} error={recError} st={st} currentId={myId} banning={banning} banSel={banSel} onChoose={choose} />
            ) : (
              <p className="py-10 text-center text-[12.5px] text-mute">{t('draft.noLane')}</p>
            )
          ) : tab === 'all' ? (
            <ChampionPicker
              st={st}
              tier={state.tier}
              ban={banning}
              usable={usable}
              canSelect={banning || (!!cs && cs.pickActionId != null && !cs.locked)}
              selected={banning ? banSel : myId}
              onSelect={choose}
              onAct={act}
            />
          ) : !myId ? (
            <p className="py-10 text-center text-[12.5px] text-mute">{t('draft.pickHint')}</p>
          ) : mine?.insufficient ? (
            <p className="py-10 text-center text-[13px] font-semibold">{t('err.insufficient')}</p>
          ) : mineOk && st && cs ? (
            <BuildPanel build={mineOk} st={st} cs={cs} settings={state.settings} enemyId={enemyId} vsLaner={vsLaner} vsJungler={vsJungler} enemyVs={enemyVs} onApply={apply} toast={toast} />
          ) : (
            <div className="space-y-3" aria-busy>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="skeleton h-[250px]" /><div className="skeleton h-[250px]" /></div>
              <div className="skeleton h-[150px]" />
            </div>
          )}
        </div>
      </Card>

      {hasBans && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
          <BanList label={t('draft.bansMine')} ids={bans!.my} st={st} />
          <BanList label={t('draft.bansTheirs')} ids={bans!.their} st={st} />
        </div>
      )}
    </div>
  )
}

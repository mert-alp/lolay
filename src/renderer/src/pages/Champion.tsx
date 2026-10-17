import { useEffect, useRef, useState } from 'react'
import {
  champIcon, BUILD_TTL, DDRAGON, LANES,
  type AppState, type ApplyRequest, type Build, type Lane, type Matchup, type StaticData
} from '@shared/types'
import { useT } from '../i18n'
import { SOURCE_NAME, fmtGames, fmtPct, tierColor as tierColorOf, wrColor } from '../util'
import { Button, Card, Eyebrow, Segmented } from '../components/ui'
import { prefKey } from '@shared/prefs'
import { RuneSection, saveRunePref } from '../components/RunePageCard'
import { BuildItems } from '../components/BuildItems'
import { SkillOrder } from '../components/SkillOrder'
import { SpellControl } from '../components/SpellPicker'
import { ImportRow } from '../components/ImportRow'
import type { PushToast } from '../components/Toasts'

interface Props {
  state: AppState
  st: StaticData | null
  champId: number | null
  followLane: Lane | undefined
  onPick: (id: number) => void
  onHome: () => void
  toast: PushToast
}

export function Champion({ state, st, champId, followLane, onPick, onHome, toast }: Props) {
  const t = useT()
  // champion and lane live in one state: a new champion never fetches with the previous lane
  const follow = `${champId}:${followLane}`
  const [lanePick, setLanePick] = useState<{ follow: string; lane: Lane | undefined }>({ follow, lane: followLane })
  if (lanePick.follow !== follow) setLanePick({ follow, lane: followLane })
  const laneSel = lanePick.lane
  const [build, setBuild] = useState<Build | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!champId) return
    let live = true
    setLoading(true)
    setErr(false)
    window.lolay.getBuild({ championId: champId, lane: laneSel })
      .then((b) => live && setBuild(b))
      .catch(() => live && setErr(true))
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [champId, laneSel, state.tier, state.settings.source, retry])

  const csRef = useRef(state.champSelect)
  csRef.current = state.champSelect

  // back: Alt+Left and the mouse's back button
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); onHome() } }
    const mouse = (e: MouseEvent) => { if (e.button === 3) { e.preventDefault(); onHome() } }
    addEventListener('keydown', key)
    addEventListener('mouseup', mouse)
    return () => { removeEventListener('keydown', key); removeEventListener('mouseup', mouse) }
  }, [onHome])

  // silent background refresh from main
  const source = state.settings.source
  const cur = useRef({ champId, lane: laneSel ?? build?.lane, tier: state.tier, source })
  cur.current = { champId, lane: laneSel ?? build?.lane, tier: state.tier, source }
  useEffect(
    () => window.lolay.onBuildRefreshed((b) => {
      const c = cur.current
      if (b.championId === c.champId && b.lane === c.lane && b.source === c.source && (b.source === 'metasrc' || b.tier === c.tier)) setBuild(b)
    }),
    []
  )

  if (!champId) {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div>
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-line bg-card text-gold">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6z" /></svg>
          </div>
          <h2 className="text-[18px] font-semibold">{t('champ.pick')}</h2>
          <p className="mt-1 mb-5 text-[13px] text-mute">{t('champ.pickHint')}</p>
          <Button onClick={onHome}>{t('champ.goHome')}</Button>
        </div>
      </div>
    )
  }

  const champ = st?.champions[champId]
  // only a build for exactly what is selected counts; a leftover from another lane or rank is never shown or applied
  const fresh =
    build && build.championId === champId && build.source === source && (!laneSel || build.lane === laneSel) && (source === 'metasrc' || build.tier === state.tier)
      ? build
      : null
  const data = fresh?.insufficient ? null : fresh
  const lane = laneSel ?? fresh?.lane
  const age = data ? Date.now() - data.fetchedAt : 0
  const cs = state.champSelect
  const following = cs && cs.championId === champId && champId > 0

  async function apply(req: Omit<ApplyRequest, 'championId' | 'lane'>, kind: 'runes' | 'spells' | 'items') {
    if (!fresh) return
    try {
      const r = await window.lolay.applyBuild({ championId: fresh.championId, lane: fresh.lane, ...req })
      const v = r[kind]
      if (v === 'ok') toast(t(`apply.${kind}`), 'ok')
      else if (v === 'skipped') toast(t('apply.skipped'), 'info')
      else toast(t(r.error === 'client' ? 'apply.err.client' : r.error === 'runes' ? 'apply.err.runes' : 'apply.error'), 'err')
    } catch {
      toast(t('apply.error'), 'err')
    }
  }

  // in champ select, changes to the shown champion go straight to the client
  async function send(b: Build, req: Omit<ApplyRequest, 'championId' | 'lane'>) {
    if (csRef.current?.championId !== b.championId) return null
    try {
      const r = await window.lolay.applyBuild({ championId: b.championId, lane: b.lane, ...req })
      return !r.error && r.runes !== 'error' && r.items !== 'error'
    } catch {
      return false
    }
  }

  const showImport = !!following && !fresh?.insufficient

  // Lolalytics ranks a lane only against itself: a rare off-role pick can show S+ from a tiny specialist pool
  const offRole = !!data && data.pr != null && data.pr < 0.5
  const tierColor = data ? tierColorOf(data.tierLabel) : '#8a93a6'

  return (
    <div className="mx-auto max-w-[1000px] space-y-4 px-4 py-5 sm:px-7 sm:py-6">
      <button
        type="button"
        onClick={onHome}
        className="no-drag group inline-flex h-8 items-center gap-1.5 !rounded-full border border-line bg-[#12161d] pr-3.5 pl-2.5 text-[12.5px] font-medium text-mute transition-all duration-150 hover:border-gold/50 hover:bg-[#1a2030] hover:text-fg active:scale-[.97]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform duration-150 group-hover:-translate-x-0.5"><path d="M8.5 2.5 4 7l4.5 4.5" /></svg>
        {t('nav.back')}
      </button>
      {/* header */}
      <Card className="relative overflow-hidden">
        {champ && (
          <img
            src={`${DDRAGON}/img/champion/splash/${champ.id}_0.jpg`}
            alt=""
            decoding="async"
            className="pointer-events-none absolute inset-y-0 right-0 h-full w-[70%] object-cover object-[50%_20%] opacity-40"
            style={{ maskImage: 'linear-gradient(to left, #000 10%, transparent 95%)', WebkitMaskImage: 'linear-gradient(to left, #000 10%, transparent 95%)' }}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-gold/70 via-gold/20 to-transparent" />
        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3 p-4 sm:p-5">
          {champ && st && (
            <img
              src={champIcon(st.version, champ.id)}
              alt={champ.name}
              width={76}
              height={76}
              style={{ width: 76, height: 76 }}
              className="rounded-2xl border border-gold/50 shadow-[0_0_28px_-6px_rgba(200,170,110,.6)]"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight sm:text-[28px]">{champ?.name ?? '…'}</h1>
              {data?.tierLabel && (
                <span
                  className={`rounded-lg border px-2.5 py-0.5 text-[15px] font-extrabold ${offRole ? 'opacity-45' : ''}`}
                  style={{ color: tierColor, borderColor: tierColor + '77', background: tierColor + '1f', boxShadow: offRole ? undefined : `0 0 22px -4px ${tierColor}aa` }}
                  title={offRole ? t('tier.offRole') : undefined}
                >
                  {data.tierLabel}
                </span>
              )}
              {offRole && <span className="rounded-full border border-line bg-white/5 px-2 py-0.5 text-[11px] font-medium text-mute">{t('tier.offRole')}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {data && (
                <span className="rounded-full border border-line bg-white/5 px-2.5 py-0.5 text-[12px] font-medium text-mute">
                  {SOURCE_NAME[data.source]}{data.patch && ` · ${data.patch}`}
                </span>
              )}
              {age > BUILD_TTL && <span className="text-[12px] text-mute">{t('stale').replace('{h}', String(Math.floor(age / 3.6e6)))}</span>}
            </div>
          </div>
          <div className="flex-1" />
          {data && (
            <div className="relative hidden gap-7 sm:flex">
              <Stat label={t('stat.wr')} value={fmtPct(data.wr)} cls={wrColor(data.wr)} big />
              <Stat label={t('stat.pr')} value={fmtPct(data.pr)} />
              <Stat label={t('stat.br')} value={fmtPct(data.br)} />
              <Stat label={t('stat.games')} value={fmtGames(data.games)} />
            </div>
          )}
        </div>
      </Card>

      {showImport && <ImportRow cs={cs!} settings={state.settings} build={fresh} st={st} />}

      <Segmented<Lane>
        label={t('lane.label')}
        value={(lane ?? 'middle') as Lane}
        options={LANES.map((l) => ({ value: l, label: t(`lane.${l}`) }))}
        onChange={(lane) => setLanePick({ follow, lane })}
      />

      {data?.source === 'metasrc' && <p className="px-1 text-[12px] text-mute">{t('banner.noTier')}</p>}
      {data && !data.insufficient && data.games > 0 && data.games < 1000 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-[13px] text-yellow-300">
          {t('banner.lowSample').replace('{n}', String(data.games))}
        </div>
      )}

      {data?.partial && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-[13px] text-yellow-300">{t('banner.partial')}</div>
      )}

      {err && !fresh ? (
        <Card className="grid place-items-center gap-3 py-16 text-center">
          <div className="text-[15px] font-semibold">{t('err.title')}</div>
          <Button onClick={() => setRetry((n) => n + 1)}>{t('err.retry')}</Button>
        </Card>
      ) : fresh?.insufficient ? (
        <Card className="grid place-items-center py-16 text-center text-[15px] font-semibold">{t('err.insufficient')}</Card>
      ) : !fresh || !st ? (
        <Skeleton />
      ) : (
        <div className={`space-y-4 transition-opacity duration-200 ${loading ? 'opacity-50' : 'fade-up'}`}>
          {err && (
            <div className="flex items-center justify-between rounded-xl border border-loss/30 bg-loss/10 px-4 py-2.5 text-[13px] text-loss">
              {t('err.title')}
              <button className="font-semibold underline" onClick={() => setRetry((n) => n + 1)}>{t('err.retry')}</button>
            </div>
          )}
          <RuneSection
            key={`${fresh.championId}:${fresh.lane}`}
            pages={fresh.runes}
            championId={fresh.championId}
            lane={fresh.lane}
            st={st}
            editBase={`${fresh.championId}:${fresh.lane}`}
            keystone={fresh.runeStatsLevel === 'keystone'}
            saved={state.settings.runePrefs[prefKey(fresh.championId, fresh.lane) ?? '']}
            onSave={(perks) => { const k = prefKey(fresh.championId, fresh.lane); if (k) saveRunePref(state.settings, k, perks) }}
            onApply={following ? (perks, runeIndex) => apply({ runeIndex, perks }, 'runes') : undefined}
            auto={following ? (perks, _i, picked) => send(fresh, { perks, ...(picked && state.settings.autoImport.items && { items: true }) }) : undefined}
          />

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
            <Card className="p-4">
              <Eyebrow>{t('spells.title')}</Eyebrow>
              <SpellControl pairs={fresh.spells} st={st} settings={state.settings} cs={following ? cs : null} championId={fresh.championId} toast={toast} saved={state.settings.spellPrefs[prefKey(fresh.championId, fresh.lane) ?? '']} />
            </Card>
            <Card className="p-4">
              <SkillOrder order={fresh.skillOrder} priority={fresh.skillPriority} />
            </Card>
          </div>

          <BuildItems build={fresh} st={st} action={following ? <Button variant="ghost" className="!px-3 !py-1.5 !text-[12px]" onClick={() => apply({ items: true }, 'items')}>{t('items.import')}</Button> : undefined} />

          <Card className="p-4">
            <Eyebrow>{t('counters.title')}</Eyebrow>
            <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
              <CounterList title={t('counters.strong')} list={fresh.counters.strong} st={st} onPick={onPick} />
              <CounterList title={t('counters.weak')} list={fresh.counters.weak} st={st} onPick={onPick} />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, cls = '', big }: { label: string; value: string; cls?: string; big?: boolean }) {
  return (
    <div className="text-right">
      <div className={`font-bold leading-none ${big ? 'text-[26px]' : 'text-[20px]'} ${cls}`}>{value}</div>
      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{label}</div>
    </div>
  )
}

function CounterList({ title, list, st, onPick }: { title: string; list: Matchup[]; st: StaticData; onPick: (id: number) => void }) {
  const t = useT()
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold text-fg">{title}</div>
      <div className="space-y-1">
        {list.map((m) => {
          const c = st.champions[m.championId]
          if (!c) return null
          return (
            <button key={m.championId} onClick={() => onPick(m.championId)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-card2">
              <img src={champIcon(st.version, c.id)} alt="" width={34} height={34} loading="lazy" decoding="async" style={{ width: 34, height: 34 }} className="rounded-lg border border-line" />
              <span className="flex-1 truncate text-[13px] font-medium">{c.name}</span>
              <span className={`text-[13px] font-bold ${wrColor(m.wr)}`}>{fmtPct(m.wr)}</span>
              <span className="w-16 text-right text-[11px] text-mute">{fmtGames(m.n)} {t('counters.games')}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))]"><div className="skeleton h-[360px]" /><div className="skeleton h-[360px]" /></div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]"><div className="skeleton h-[170px]" /><div className="skeleton h-[170px]" /></div>
      <div className="skeleton h-[230px]" />
    </div>
  )
}

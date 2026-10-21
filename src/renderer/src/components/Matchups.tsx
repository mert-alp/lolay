import { useEffect, useState, type ReactNode } from 'react'
import { champIcon, type Build, type Matchup, type MatchupDetail, type StaticData } from '@shared/types'
import { useT } from '../i18n'
import { fmtGames, fmtPct, wrColor } from '../util'
import { Button, Card, Eyebrow } from './ui'
import { ItemIcon } from './ItemIcon'
import { RunePageCard } from './RunePageCard'

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`
const SPAN = 5 // a win-rate difference this large fills the bar

// win rate against one enemy and how far it is from the champion's own average, as a bar around the middle
function Row({ m, st, base, active, current, onOpen }: { m: Matchup; st: StaticData; base: number | null; active: boolean; current: boolean; onOpen: () => void }) {
  const t = useT()
  const c = st.champions[m.championId]
  if (!c) return null
  const d = base == null ? null : m.wr - base
  const w = d == null ? 0 : Math.min(Math.abs(d) / SPAN, 1) * 50
  return (
    <button
      onClick={onOpen}
      title={t('mu.open').replace('{name}', c.name)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-card2 ${active ? 'bg-gold/10 ring-1 ring-gold/50' : current ? 'ring-1 ring-gold/30' : ''}`}
    >
      <img src={champIcon(st.version, c.id)} alt="" width={30} height={30} loading="lazy" decoding="async" style={{ width: 30, height: 30 }} className="rounded-lg border border-line" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.name}</span>
      {d != null && (
        <span className="relative hidden h-1.5 w-16 shrink-0 rounded-full bg-white/[.06] sm:block" aria-hidden>
          <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
          <span className={`absolute inset-y-0 rounded-full ${d >= 0 ? 'left-1/2 bg-win/70' : 'right-1/2 bg-loss/70'}`} style={{ width: `${w}%` }} />
        </span>
      )}
      <span className={`w-12 text-right text-[12.5px] font-bold ${wrColor(m.wr)}`}>{fmtPct(m.wr)}</span>
      {d != null && <span className={`w-10 text-right text-[11px] font-semibold ${d >= 0 ? 'text-win' : 'text-loss'}`} title={t('mu.deltaTip')}>{signed(d)}</span>}
      <span className="w-11 text-right text-[10.5px] text-mute">{fmtGames(m.n)}</span>
    </button>
  )
}

// the opened matchup: its rune page and the finished items bought against that enemy
function Detail({ build, vsId, st, onApply, onPick, onClose }: { build: Build; vsId: number; st: StaticData; onApply?: (perks: number[]) => void; onPick?: (id: number) => void; onClose: () => void }) {
  const t = useT()
  const [res, setRes] = useState<{ key: string; v: MatchupDetail | null } | null>(null)
  const key = `${build.championId}:${build.lane}:${vsId}`
  useEffect(() => {
    let live = true
    window.lolay.matchupDetail(build.championId, build.lane, vsId).then((v) => live && setRes({ key, v }), () => live && setRes({ key, v: null }))
    return () => { live = false }
  }, [key])
  const d = res?.key === key ? res.v : undefined
  const vs = st.champions[vsId]
  const page = d?.pages[0]
  return (
    <div className="mt-4 rounded-xl border border-line bg-[#0f1218] p-3.5">
      <div className="mb-3 flex items-center gap-2">
        {vs && <img src={champIcon(st.version, vs.id)} alt="" className="size-6 rounded-md border border-line" />}
        <span className="text-[13px] font-semibold">{t('mu.vs').replace('{name}', vs?.name ?? '')}</span>
        <span className="ml-auto flex items-center gap-1">
          {onPick && <Button variant="ghost" className="!px-2.5 !py-1 !text-[11.5px]" onClick={() => onPick(vsId)}>{t('mu.page')}</Button>}
          <Button variant="ghost" className="!px-2.5 !py-1 !text-[11.5px]" onClick={onClose}>{t('mu.close')}</Button>
        </span>
      </div>
      {d === undefined ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]"><div className="skeleton h-[260px]" /><div className="skeleton h-[120px]" /></div>
      ) : !d || (!page && !d.items.length) ? (
        <p className="py-6 text-center text-[12px] text-mute">{t('mu.none')}</p>
      ) : (
        <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          {page && <RunePageCard title={t('mu.runes')} page={page} championId={build.championId} st={st} editKey={`mu:${key}`} onApply={onApply} onEdit={() => {}} />}
          <Card className="p-4">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{t('mu.items')}</div>
            {d.items.length ? (
              <div className="flex flex-wrap gap-3">{d.items.map((i) => <ItemIcon key={i.id} id={i.id} st={st} size={38} wr={i.wr} n={i.n} />)}</div>
            ) : (
              <p className="text-[12px] text-mute">{t('mu.none')}</p>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

// strong / weak matchups with the difference to the champion's average; a click opens that matchup
export function Matchups({ build, st, enemyId, limit, right, onApply, onPick }: {
  build: Build
  st: StaticData
  enemyId?: number | null // the enemy laner in champ select: marked, and opened first
  limit?: number
  right?: ReactNode
  onApply?: (perks: number[]) => void // runes straight to the client (champ select only)
  onPick?: (id: number) => void // open the enemy's own champion page
}) {
  const t = useT()
  const [open, setOpen] = useState<number | null>(null)
  const base = build.wr ?? null
  const list = (title: string, ms: Matchup[]) => (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2 text-[12px] font-semibold">
        {title}
        {base != null && <span className="text-[10.5px] font-normal text-mute">{t('mu.base').replace('{wr}', fmtPct(base))}</span>}
      </div>
      <div className="space-y-0.5">
        {ms.slice(0, limit).map((m) => (
          <Row key={m.championId} m={m} st={st} base={base} active={open === m.championId} current={m.championId === enemyId} onOpen={() => setOpen(open === m.championId ? null : m.championId)} />
        ))}
      </div>
    </div>
  )
  return (
    <Card className="p-4">
      <Eyebrow right={right}>{t('counters.title')}</Eyebrow>
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        {list(t('counters.strong'), build.counters.strong)}
        {list(t('counters.weak'), build.counters.weak)}
      </div>
      {enemyId && open == null && ![...build.counters.strong, ...build.counters.weak].some((m) => m.championId === enemyId) && (
        <button onClick={() => setOpen(enemyId)} className="mt-3 text-[12px] font-medium text-gold underline-offset-2 hover:underline">
          {t('mu.vs').replace('{name}', st.champions[enemyId]?.name ?? '')} →
        </button>
      )}
      {open != null && <Detail key={open} build={build} vsId={open} st={st} onApply={onApply} onPick={onPick} onClose={() => setOpen(null)} />}
    </Card>
  )
}

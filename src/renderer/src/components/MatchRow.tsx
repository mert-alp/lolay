import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { champIcon, spellIcon, type MatchEntry, type MatchPlayer, type StaticData } from '@shared/types'
import { fmtDuration, timeAgo } from '../../../main/profileStats.ts'
import { useLang, useT, type Key, type TFn } from '../i18n'
import { ItemIcon } from './ItemIcon'
import { Tip, TextTip, runeTip, spellTip } from './Tooltip'
import { MatchDetail } from './MatchDetail'

export const kdaColor = (k: number) => (k >= 5 ? 'text-[#ff8a3d]' : k >= 4 ? 'text-blue' : k >= 3 ? 'text-win' : 'text-fg')
export const kdaOf = (p: Pick<MatchPlayer, 'kills' | 'deaths' | 'assists'>) => (p.kills + p.assists) / Math.max(p.deaths, 1)

// app label first, then the client's own name for newer modes, else "Diğer"
export function queueLabel(t: TFn, id: number, client: Record<number, string> = {}): string {
  const k = `q.${id}` as Key
  const v = t(k)
  return v !== k ? v : client[id] ?? t('q.other')
}

let clientQueues: Promise<Record<number, string>> | null = null
const loadQueues = () =>
  (clientQueues ??= window.lolay.queueNames().then((q) => {
    if (!Object.keys(q).length) clientQueues = null // client closed: ask again next time
    return q
  }, () => ((clientQueues = null), {})))

// asks the client only for a queue the app has no label for
function useQueueName(t: TFn, id: number) {
  const [client, setClient] = useState<Record<number, string>>({})
  const known = t(`q.${id}` as Key) !== `q.${id}`
  useEffect(() => {
    if (known) return
    let live = true
    void loadQueues().then((q) => live && setClient(q))
    return () => { live = false }
  }, [known])
  return queueLabel(t, id, client)
}

export const riotIdOf = (p: { name: string; tag: string }) => (p.name && p.tag ? `${p.name}#${p.tag}` : null)

export function ChampIcon({ id, st, size, className = '' }: { id: number; st: StaticData; size: number; className?: string }) {
  const c = st.champions[id]
  return c ? (
    <img src={champIcon(st.version, c.id)} alt={c.name} title={c.name} width={size} height={size} loading="lazy" decoding="async" style={{ width: size, height: size }} className={`shrink-0 object-cover ${className}`} />
  ) : (
    <span style={{ width: size, height: size }} className={`grid shrink-0 place-items-center bg-[#10131a] text-mute/60 ${className}`}>?</span>
  )
}

function Runes({ p, st }: { p: MatchPlayer; st: StaticData }) {
  const key = st.runes[p.keystone]
  const tree = st.trees.find((x) => x.id === p.tree)
  return (
    <div className="flex flex-col gap-0.5">
      <Tip tip={runeTip(st, p.keystone)} className="rounded-full">
        {key ? <img src={key.icon} alt={key.name} width={24} height={24} className="size-6 rounded-full bg-black/50 p-px" /> : <span className="size-6 rounded-full bg-black/40" />}
      </Tip>
      <Tip tip={tree ? <TextTip icon={tree.icon} title={tree.name} /> : null} className="rounded-full">
        {tree ? <img src={tree.icon} alt={tree.name} width={24} height={24} className="size-6 rounded-full bg-black/40 p-[5px] opacity-80" /> : <span className="size-6 rounded-full bg-black/40" />}
      </Tip>
    </div>
  )
}

export function Spells({ ids, st }: { ids: number[]; st: StaticData }) {
  return (
    <div className="flex flex-col gap-0.5">
      {ids.slice(0, 2).map((id, i) => {
        const sp = st.spells[id]
        return (
          <Tip key={i} tip={spellTip(st, id)} className="rounded-[5px]">
            {sp ? <img src={spellIcon(st.version, sp.id)} alt={sp.name} width={24} height={24} className="size-6 rounded-[5px] ring-1 ring-white/10" /> : <span className="size-6 rounded-[5px] bg-[#10131a]" />}
          </Tip>
        )
      })}
    </div>
  )
}

export function Items({ ids, st, size }: { ids: number[]; st: StaticData; size: number }) {
  return (
    <div className="flex gap-[3px]">
      {ids.slice(0, 7).map((id, i) =>
        id ? (
          <ItemIcon key={i} id={id} st={st} size={size} />
        ) : (
          <span key={i} style={{ width: size, height: size }} className={`shrink-0 border border-line/70 bg-white/[.03] ${i === 6 ? 'rounded-full' : 'rounded-lg'}`} />
        )
      )}
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
}

interface Props {
  m: MatchEntry
  st: StaticData
  open: boolean
  onToggle: () => void
  onOpenProfile: (riotId: string) => void
}

export function MatchRow({ m, st, open, onToggle, onOpenProfile }: Props) {
  const t = useT()
  const lang = useLang()
  const queue = useQueueName(t, m.queueId)
  const me = m.me
  const tone = m.remake ? 'mute' : m.win ? 'win' : 'loss'
  const tint = { win: 'text-win', loss: 'text-loss', mute: 'text-mute' }[tone]
  const bar = { win: 'bg-win', loss: 'bg-loss', mute: 'bg-mute' }[tone]
  const wash = { win: 'from-win/[.07]', loss: 'from-loss/[.06]', mute: 'from-white/[.03]' }[tone]
  const ratio = kdaOf(me)
  const kp = m.teamKills ? Math.round(((me.kills + me.assists) / m.teamKills) * 100) : null
  const min = m.duration / 60
  const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation()

  const team = (id: number) => m.players.filter((p) => p.teamId === id)
  return (
    <article className={`@container fade-up relative overflow-hidden rounded-xl border bg-card transition-colors duration-150 ${open ? 'border-[#2f384c]' : 'border-line hover:border-[#2a3244]'}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${bar} ${m.remake ? 'opacity-50' : ''}`} />
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent ${wash}`} />
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onToggle() } }}
        className="relative flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2.5 py-2.5 pr-3 pl-[18px]"
      >
        <div className="w-[92px] shrink-0 leading-tight">
          <div className={`text-[12.5px] leading-[1.15] font-bold ${tint}`}>{queue}</div>
          <div className="mt-0.5 truncate text-[11px] text-mute">{timeAgo(m.at, lang)}</div>
          <div className="my-1.5 h-px w-6 bg-line" />
          <div className="truncate text-[11px]">
            <span className={`font-semibold ${tint}`}>{t(m.remake ? 'pf.remake' : m.win ? 'pf.win' : 'pf.loss')}</span>
            <span className="text-mute"> · {fmtDuration(m.duration)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="relative">
            <ChampIcon id={me.championId} st={st} size={52} className="rounded-xl ring-1 ring-white/10" />
            <span className="absolute -right-1 -bottom-1 rounded-full bg-[#0e1015] px-1 text-[10px] leading-4 font-bold text-fg ring-1 ring-line">{me.level}</span>
          </div>
          <Spells ids={me.spells} st={st} />
          <Runes p={me} st={st} />
        </div>

        <div className="w-[100px] shrink-0 text-center leading-tight">
          <div className="text-[15px] font-bold tracking-tight">
            {me.kills}<span className="px-[3px] font-normal text-mute">/</span><span className="text-loss">{me.deaths}</span><span className="px-[3px] font-normal text-mute">/</span>{me.assists}
          </div>
          <div className={`mt-0.5 text-[12px] font-semibold ${kdaColor(ratio)}`}>{me.deaths ? ratio.toFixed(2) : 'Perfect'} {me.deaths ? 'KDA' : ''}</div>
          {kp != null && <div className="mt-0.5 text-[10.5px] text-mute">{t('pf.kp')} {kp}%</div>}
        </div>

        <div className="w-[84px] shrink-0 text-[11.5px] leading-tight">
          <div><span className="font-semibold">{me.cs}</span> <span className="text-mute">CS ({(me.cs / Math.max(min, 1)).toFixed(1)})</span></div>
          <div className="mt-0.5 text-mute">{t('pf.vision')} <span className="text-fg">{me.vision}</span></div>
        </div>

        <Items ids={me.items} st={st} size={28} />

        <div className="ml-auto grid min-w-0 flex-1 basis-[210px] grid-cols-2 gap-x-3 @4xl:max-w-[250px]">
          {[100, 200].map((id) => (
            <div key={id} className="min-w-0 space-y-px">
              {team(id).map((p, i) => {
                const rid = riotIdOf(p)
                const isMe = p.puuid === me.puuid
                return (
                  <button
                    key={i}
                    disabled={!rid}
                    onClick={(e) => { stop(e); if (rid) onOpenProfile(rid) }}
                    onKeyDown={stop}
                    title={rid ?? st.champions[p.championId]?.name}
                    className={`flex w-full min-w-0 items-center gap-1 rounded px-0.5 text-left text-[11px] leading-[17px] transition-colors enabled:hover:bg-white/[.07] enabled:hover:text-fg ${isMe ? 'font-semibold text-fg' : 'text-mute'}`}
                  >
                    <ChampIcon id={p.championId} st={st} size={16} className="rounded-[4px]" />
                    <span className="truncate">{p.name || st.champions[p.championId]?.name || '…'}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <button
          aria-label={t('pf.detail')}
          aria-expanded={open}
          tabIndex={-1}
          onClick={(e) => { stop(e); onToggle() }}
          className={`grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-[#12161d] transition-colors hover:border-[#2f384c] ${open ? 'text-gold' : 'text-mute'}`}
        >
          <Chevron open={open} />
        </button>
      </div>
      {open && <MatchDetail m={m} st={st} onOpenProfile={onOpenProfile} />}
    </article>
  )
}

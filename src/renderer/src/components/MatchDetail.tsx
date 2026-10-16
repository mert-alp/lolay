import { useEffect, useState } from 'react'
import type { MatchDetail as Detail, MatchEntry, MatchPlayer, MatchTeam, ProfileResult, StaticData } from '@shared/types'
import { useT, type Key } from '../i18n'
import { fmtGames } from '../util'
import { ChampIcon, Items, kdaColor, kdaOf, riotIdOf } from './MatchRow'
import { Sk } from './PlayerCard'

const OBJ = ['baron', 'dragon', 'herald', 'tower', 'inhibitor'] as const

function Objective({ id, n }: { id: (typeof OBJ)[number]; n: number }) {
  const t = useT()
  return (
    <span className={`inline-flex h-[22px] items-center gap-1.5 rounded-md border px-2 text-[11px] ${n ? 'border-line bg-white/[.04] text-fg' : 'border-line/60 text-mute/60'}`}>
      <span className="text-mute">{t(`pf.o.${id}` as Key)}</span>
      <span className="font-semibold">{n}</span>
    </span>
  )
}

function PlayerLine({ p, st, max, blue, me, onOpenProfile }: { p: MatchPlayer; st: StaticData; max: number; blue: boolean; me: boolean; onOpenProfile: (id: string) => void }) {
  const t = useT()
  const rid = riotIdOf(p)
  const ratio = kdaOf(p)
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 ${me ? 'bg-gold/[.07] ring-1 ring-gold/25' : 'hover:bg-white/[.03]'}`}>
      <div className="flex min-w-0 flex-1 basis-[150px] items-center gap-2">
        <div className="relative shrink-0">
          <ChampIcon id={p.championId} st={st} size={32} className="rounded-lg ring-1 ring-white/10" />
          <span className="absolute -right-1 -bottom-1 rounded-full bg-[#0e1015] px-[3px] text-[9px] leading-[14px] font-bold ring-1 ring-line">{p.level}</span>
        </div>
        <button disabled={!rid} onClick={() => rid && onOpenProfile(rid)} className="min-w-0 text-left leading-tight enabled:hover:text-gold">
          <div className={`truncate text-[12.5px] ${me ? 'font-bold' : 'font-medium'}`}>{p.name || st.champions[p.championId]?.name || '…'}</div>
          <div className="truncate text-[10.5px] text-mute">{p.tag ? `#${p.tag}` : st.champions[p.championId]?.name}</div>
        </button>
      </div>
      <div className="w-[84px] shrink-0 text-center leading-tight">
        <div className="text-[12.5px] font-semibold">{p.kills}<span className="text-mute"> / </span><span className="text-loss">{p.deaths}</span><span className="text-mute"> / </span>{p.assists}</div>
        <div className={`text-[10.5px] font-semibold ${kdaColor(ratio)}`}>{p.deaths ? ratio.toFixed(2) : 'Perfect'}</div>
      </div>
      <div className="w-[104px] shrink-0">
        <div className="text-[11px] leading-none text-mute"><span className="font-semibold text-fg">{p.damage.toLocaleString('en')}</span></div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#232a3a]">
          <div className={`h-full rounded-full ${blue ? 'bg-blue' : 'bg-loss'}`} style={{ width: `${Math.max(2, (p.damage / max) * 100)}%` }} />
        </div>
      </div>
      <div className="w-[118px] shrink-0 text-[11px] leading-tight text-mute">
        <div><span className="font-semibold text-[#f0b232]">{(p.gold / 1000).toFixed(1)}k</span> · {p.cs} CS</div>
        <div>{t('pf.wards')} {p.wards} · {t('pf.vision')} {p.vision}</div>
      </div>
      <Items ids={p.items} st={st} size={24} />
    </div>
  )
}

function Team({ team, players, st, max, mePuuid, onOpenProfile }: { team: MatchTeam; players: MatchPlayer[]; st: StaticData; max: number; mePuuid: string; onOpenProfile: (id: string) => void }) {
  const t = useT()
  const blue = team.teamId === 100
  return (
    <section>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2">
        <span className={`size-2 rounded-full ${blue ? 'bg-blue shadow-[0_0_10px_rgba(59,130,246,.8)]' : 'bg-loss shadow-[0_0_10px_rgba(239,68,68,.8)]'}`} />
        <h4 className="text-[11px] font-semibold tracking-[0.14em] text-mute uppercase">{t(blue ? 'pf.team1' : 'pf.team2')}</h4>
        <span className={`text-[11.5px] font-bold ${team.win ? 'text-win' : 'text-loss'}`}>{t(team.win ? 'pf.win' : 'pf.loss')}</span>
        <span className="text-[11px] text-mute">{team.kills} {t('pf.kills')} · <span className="text-[#f0b232]">{fmtGames(team.gold)}</span></span>
        <div className="flex flex-wrap gap-1 sm:ml-auto">{OBJ.map((o) => <Objective key={o} id={o} n={team.objectives[o]} />)}</div>
      </div>
      <div className="space-y-px">
        {players.map((p, i) => <PlayerLine key={i} p={p} st={st} max={max} blue={blue} me={p.puuid === mePuuid} onOpenProfile={onOpenProfile} />)}
      </div>
    </section>
  )
}

export function MatchDetail({ m, st, onOpenProfile }: { m: MatchEntry; st: StaticData; onOpenProfile: (id: string) => void }) {
  const t = useT()
  const [res, setRes] = useState<ProfileResult<Detail> | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    setRes(null)
    window.lolay.profileMatch(m.id).then((r) => live && setRes(r), () => live && setRes({ ok: false, error: 'server' }))
    return () => { live = false }
  }, [m.id, n])

  return (
    <div className="fade-up relative border-t border-line/80 bg-[#10141b]/70 px-1.5 py-3 sm:px-3">
      {!res ? (
        <div className="space-y-2 px-2">{[0, 1, 2, 3].map((i) => <Sk key={i} w="100%" h={34} r={8} />)}</div>
      ) : !res.ok ? (
        <div className="flex flex-wrap items-center gap-3 px-2 text-[12.5px] text-mute">
          {t(`pf.err.${res.error}` as Key)}
          <button onClick={() => setN((x) => x + 1)} className="rounded-lg border border-line bg-[#12161d] px-3 py-1 font-semibold text-fg hover:border-[#2f384c]">{t('err.retry')}</button>
        </div>
      ) : (
        <div className="space-y-4">
          {[...res.data.teams].sort((a, b) => a.teamId - b.teamId).map((team) => {
            const players = res.data.players.filter((p) => p.teamId === team.teamId)
            return <Team key={team.teamId} team={team} players={players} st={st} max={Math.max(1, ...res.data.players.map((p) => p.damage))} mePuuid={m.me.puuid} onOpenProfile={onOpenProfile} />
          })}
        </div>
      )}
    </div>
  )
}

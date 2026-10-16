import { useEffect, useState } from 'react'
import type { SearchResult } from '@shared/types'
import { useT, type Key } from '../i18n'
import { Sk } from './PlayerCard'
import { PlayerIcon, RankBadge, readRegion, RegionSelect } from './PlayerSearch'
import { withPlatform } from '../profileNav'
import { Card } from './ui'

// every profile matching a typed name; pick one to open it
export function SearchResults({ query, version, onOpen }: { query: string; version: string | null; onOpen: (riotId: string) => void }) {
  const t = useT()
  const [res, setRes] = useState<SearchResult[] | null>(null)
  const [n, setN] = useState(0)
  const [region, setRegion] = useState(readRegion)
  useEffect(() => {
    let live = true
    setRes(null)
    window.lolay.searchPlayers({ query, deep: true, region }).then((r) => live && setRes(r.results), () => live && setRes([]))
    return () => { live = false }
  }, [query, region, n])

  return (
    <div className="mx-auto max-w-[1100px] space-y-3 sm:space-y-4">
      <Card className="relative overflow-hidden p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold sm:text-[19px]">{t('pf.resultsFor').replace('{q}', query)}</h1>
            <p className="mt-0.5 text-[12px] text-mute">{res ? t('pf.resultCount').replace('{n}', String(res.length)) : t('common.loading')}</p>
          </div>
          <RegionSelect value={region} onChange={setRegion} />
        </div>
      </Card>

      {!res ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Sk key={i} w="100%" h={74} r={12} />)}</div>
      ) : !res.length ? (
        <Card className="px-5 py-10 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-line bg-card2 text-gold">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8.5 11h5" /></svg>
          </div>
          <p className="text-[14px] font-semibold">{t('pf.noResults')}</p>
          <p className="mx-auto mt-1 max-w-[380px] text-[12.5px] leading-relaxed text-mute">{t('pf.noResultsHint')}</p>
          <button onClick={() => setN((x) => x + 1)} className="no-drag mt-4 rounded-lg border border-line bg-[#12161d] px-3.5 py-1.5 text-[12.5px] font-semibold hover:border-[#2f384c]">{t('err.retry')}</button>
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">
          {res.map((r) => (
            <button
              key={`${r.gameName}#${r.tagLine}`}
              onClick={() => onOpen(withPlatform(`${r.gameName}#${r.tagLine}`, r.platform))}
              className="no-drag fade-up group flex min-w-0 items-center gap-3.5 rounded-xl border border-line bg-card p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#2f384c] hover:bg-[#191e29] hover:shadow-[0_12px_28px_-14px_rgba(0,0,0,.9)]"
            >
              <div className="relative shrink-0 pb-1.5">
                <PlayerIcon version={version} id={r.iconId} name={r.gameName} size={52} />
                {r.level ? <span className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-[#0e1015] px-1.5 text-[10px] leading-4 font-semibold text-gold ring-1 ring-gold/40">{r.level}</span> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1">
                  <span className="truncate text-[14.5px] font-semibold">{r.gameName}</span>
                  <span className="shrink-0 text-[12px] text-mute">#{r.tagLine}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <RankBadge rank={r.rank} size={18} />
                  {r.region && <span className="inline-flex h-[18px] items-center rounded-md border border-line bg-white/[.04] px-1.5 text-[10.5px] font-semibold text-mute">{r.region}</span>}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-mute transition-transform group-hover:translate-x-0.5 group-hover:text-gold"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

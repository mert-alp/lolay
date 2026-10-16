import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DDRAGON, type SearchResult, type Tier } from '@shared/types'
import { REGIONS, splitQuery } from '../../../main/profileStats.ts'
import { useT, type Key } from '../i18n'
import { RANK_TEXT } from '../util'
import { useOpenProfile, withPlatform } from '../profileNav'
import { Crest } from './TierSelect'
import { Select } from './ui'

const KEY = 'lolay.recentPlayers'
const MAX = 10
const SHOWN = 6
const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER'])

const REGION_KEY = 'lolay.searchRegion'
export function readRegion(): string {
  try {
    const v = localStorage.getItem(REGION_KEY)
    return v && REGIONS.some((r) => r.platform === v) ? v : 'all'
  } catch {
    return 'all'
  }
}

// "all" or a platform id; remembered between searches
export function RegionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT()
  const options = [{ value: 'all', label: t('pf.regionAll') }, ...REGIONS.map((r) => ({ value: r.platform as string, label: r.label }))]
  return (
    <Select
      compact
      align="right"
      label={t('pf.region')}
      value={value}
      options={options}
      onChange={(v) => { try { localStorage.setItem(REGION_KEY, v) } catch {}; onChange(v) }}
    />
  )
}

function readRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}
function writeRecents(list: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch {}
}

export function RankBadge({ rank, size = 16 }: { rank?: SearchResult['rank']; size?: number }) {
  const t = useT()
  if (!rank) return <span className="text-[11px] text-mute">{t('live.unranked')}</span>
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold whitespace-nowrap" style={{ color: RANK_TEXT[rank.tier] ?? '#9aa3b5' }}>
      <Crest tier={rank.tier.toLowerCase() as Tier} size={size} />
      {t(`rank.${rank.tier}` as Key)}{!APEX.has(rank.tier) && rank.division ? ` ${rank.division}` : ''}
    </span>
  )
}

export function PlayerIcon({ version, id, name, size }: { version: string | null; id?: number; name: string; size: number }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [id])
  const style = { width: size, height: size }
  return version && id && !bad ? (
    <img src={`${DDRAGON}/${version}/img/profileicon/${id}.png`} alt="" loading="lazy" onError={() => setBad(true)} style={style} className="shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
  ) : (
    <span style={style} className="grid shrink-0 place-items-center rounded-lg bg-card2 text-[12px] font-semibold text-mute ring-1 ring-white/10">{name.slice(0, 1).toUpperCase()}</span>
  )
}

function useWide() {
  const q = '(min-width: 768px)'
  const [wide, setWide] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

type Row = { kind: 'player'; r: SearchResult } | { kind: 'recent'; id: string } | { kind: 'all' }

// title-bar search: live suggestions (250 ms debounce), Enter opens a profile ("Name#TAG") or the results view
export function PlayerSearch({ version }: { version: string | null }) {
  const t = useT()
  const open = useOpenProfile()
  const wide = useWide()
  const [value, setValue] = useState('')
  const [shown, setShown] = useState(false) // dropdown (wide) / overlay (narrow)
  const [items, setItems] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [recents, setRecents] = useState(readRecents)
  const [hi, setHi] = useState(-1)
  const [region, setRegion] = useState(readRegion)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const req = useRef(0)

  const q = value.trim()
  const { name, tag } = splitQuery(q)

  // suggestions as you type
  useEffect(() => {
    const id = ++req.current
    if (!q) { setItems([]); setBusy(false); return }
    setBusy(true)
    const h = setTimeout(() => {
      window.lolay.searchPlayers({ query: q, region }).then(
        (r) => { if (id === req.current) { setItems(r.results.slice(0, SHOWN)); setBusy(false) } },
        () => { if (id === req.current) { setItems([]); setBusy(false) } }
      )
    }, 250)
    return () => clearTimeout(h)
  }, [q, region])

  const rows: Row[] = q
    ? [...items.map((r): Row => ({ kind: 'player', r })), { kind: 'all' }]
    : recents.slice(0, SHOWN).map((id): Row => ({ kind: 'recent', id }))

  const close = () => { setShown(false); setHi(-1); input.current?.blur() }
  const remember = (id: string) => {
    const next = [id, ...recents.filter((x) => x.toLowerCase() !== id.toLowerCase())].slice(0, MAX)
    setRecents(next)
    writeRecents(next)
  }
  const openId = (id: string, platform?: string) => { remember(id); setValue(''); close(); open(withPlatform(id, platform)) }
  const submit = () => {
    if (!q) return
    if (name && tag) return openId(`${name}#${tag}`)
    setValue(''); close(); open(`search:${q}`) // the results view reads the remembered region
  }
  const choose = (row: Row) => {
    if (row.kind === 'player') openId(`${row.r.gameName}#${row.r.tagLine}`, row.r.platform)
    else if (row.kind === 'recent') openId(row.id)
    else submit()
  }

  // Ctrl+K from anywhere
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShown(true); setTimeout(() => input.current?.focus(), 0) }
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [])
  useEffect(() => {
    if (!shown || !wide) return
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setShown(false) }
    addEventListener('pointerdown', down)
    return () => removeEventListener('pointerdown', down)
  }, [shown, wide])
  useEffect(() => { if (shown && !wide) setTimeout(() => input.current?.focus(), 0) }, [shown, wide])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setShown(true); setHi((h) => (rows.length ? (h + 1) % rows.length : -1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (rows.length ? (h <= 0 ? rows.length - 1 : h - 1) : -1)) }
    else if (e.key === 'Enter') { e.preventDefault(); const row = rows[hi]; if (row && row.kind !== 'all') choose(row); else submit() }
  }

  const field = (
    <div className={`flex h-[30px] w-full items-center gap-2 rounded-lg border bg-[#0b0e13]/80 pr-1.5 pl-2.5 transition-all duration-150 ${shown ? 'border-gold/50 shadow-[0_0_0_3px_rgba(200,170,110,.12)]' : 'border-line hover:border-[#2f384c]'}`}>
      {busy ? (
        <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-gold" />
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-mute"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      )}
      <input
        ref={input}
        value={value}
        onChange={(e) => { setValue(e.target.value); setShown(true); setHi(-1) }}
        onFocus={() => setShown(true)}
        onKeyDown={onKey}
        placeholder={t('pf.search')}
        aria-label={t('pf.search')}
        role="combobox"
        aria-expanded={shown}
        style={{ outline: 'none' }}
        spellCheck={false}
        autoComplete="off"
        className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-mute/70 focus-visible:outline-none"
      />
      <RegionSelect value={region} onChange={setRegion} />
      {value ? (
        <button aria-label={t('pf.clear')} onClick={() => { setValue(''); input.current?.focus() }} className="grid size-5 shrink-0 place-items-center rounded text-mute hover:bg-white/[.08] hover:text-fg">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m2.5 2.5 7 7M9.5 2.5l-7 7" /></svg>
        </button>
      ) : (
        <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-px text-[10px] font-medium text-mute xl:block">Ctrl K</kbd>
      )}
    </div>
  )

  const panel: ReactNode = shown && rows.length > 0 && (
    <div role="listbox" className={`fade-up z-50 overflow-hidden rounded-xl border border-line bg-[#171c26] p-1 shadow-[0_16px_40px_-8px_rgba(0,0,0,.8)] ${wide ? 'absolute inset-x-0 top-full mt-1.5' : 'mt-1.5'}`}>
      {!q && (
        <div className="flex items-center justify-between px-2.5 pt-1 pb-1.5">
          <span className="text-[10.5px] font-semibold tracking-[0.14em] text-mute uppercase">{t('pf.recent')}</span>
          <button onClick={() => { setRecents([]); writeRecents([]) }} className="text-[11px] text-mute hover:text-loss">{t('pf.clear')}</button>
        </div>
      )}
      {rows.map((row, i) => {
        const on = i === hi
        const cls = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${on ? 'bg-[#232a3a]' : 'hover:bg-[#232a3a]'}`
        if (row.kind === 'player') {
          const { r } = row
          return (
            <button key={`${r.gameName}#${r.tagLine}`} role="option" aria-selected={on} onMouseEnter={() => setHi(i)} onClick={() => choose(row)} className={cls}>
              <PlayerIcon version={version} id={r.iconId} name={r.gameName} size={30} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="flex items-baseline gap-1"><span className="truncate text-[13px] font-semibold">{r.gameName}</span><span className="shrink-0 text-[11.5px] text-mute">#{r.tagLine}</span></span>
                <span className="text-[10.5px] text-mute">{r.level ? `${t('pf.level')} ${r.level}` : r.region ?? ' '}</span>
              </span>
              <RankBadge rank={r.rank} />
            </button>
          )
        }
        if (row.kind === 'recent') {
          const [n, ...tg] = row.id.split('#')
          return (
            <button key={row.id} role="option" aria-selected={on} onMouseEnter={() => setHi(i)} onClick={() => choose(row)} className={`${cls} text-[13px]`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-mute"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              <span className="min-w-0 truncate font-medium">{n}</span>
              <span className="shrink-0 text-[11.5px] text-mute">#{tg.join('#')}</span>
            </button>
          )
        }
        return (
          <button key="all" role="option" aria-selected={on} onMouseEnter={() => setHi(i)} onClick={() => choose(row)} className={`${cls} border-t border-line/70 ${items.length ? 'mt-1' : ''} text-[12.5px] text-gold`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <span className="min-w-0 truncate">{tag && name ? t('pf.openId').replace('{id}', `${name}#${tag}`) : t('pf.allResults').replace('{q}', q)}</span>
            {!busy && !items.length && !tag && <span className="ml-auto shrink-0 text-[11px] text-mute">{t('pf.noSuggest')}</span>}
          </button>
        )
      })}
    </div>
  )

  if (wide) {
    return (
      <div className="flex min-w-2 flex-1 justify-center px-2">
        <div ref={box} className="no-drag relative w-full max-w-[460px]">
          {field}
          {panel}
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-w-2 flex-1 justify-end">
      <button onClick={() => setShown(true)} aria-label={t('pf.search')} title={t('pf.search')} className="no-drag grid h-7 w-8 shrink-0 place-items-center rounded-lg text-mute transition-colors hover:bg-white/[.07] hover:text-fg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </button>
      {shown && createPortal(
        <div className="fixed inset-x-0 top-10 bottom-0 z-50 bg-black/60 backdrop-blur-[2px]" onPointerDown={close}>
          <div className="p-2" onPointerDown={(e) => e.stopPropagation()}>
            {field}
            {panel}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

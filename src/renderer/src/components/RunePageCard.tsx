import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lane, RunePage, Settings, StaticData } from '@shared/types'
import { isComplete, pageTitle, perksOf } from '@shared/runes'
import { useLang, useT, type Key, type TFn } from '../i18n'
import { fmtGames, fmtPct, wrColor } from '../util'
import { Button, Card, Eyebrow } from './ui'
import { RuneBoard, clearEdit, pagePerks, useRuneEdit } from './RuneEditor'
import { Tip, runeTip } from './Tooltip'

export type Status = '' | 'saving' | 'ok' | 'err'

// remember (or forget) the user's own rune page for a champion + lane
export function saveRunePref(settings: Settings, key: string, perks: number[] | null) {
  const { [key]: _old, ...rest } = settings.runePrefs
  void window.lolay.setSettings({ runePrefs: perks ? { ...rest, [key]: perks } : rest })
}

function Result({ wr }: { wr: number }) {
  const t = useT()
  const win = wr >= 50
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${win ? 'border-win/40 bg-win/10 text-win' : 'border-loss/40 bg-loss/10 text-loss'}`}>
      {t(win ? 'runes.win' : 'runes.loss')}
    </span>
  )
}

function StatusText({ status }: { status: Status }) {
  const t = useT()
  if (!status) return null
  const cls = status === 'err' ? 'text-loss' : status === 'ok' ? 'text-win' : 'text-mute'
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${cls}`} aria-live="polite">
      {status === 'ok' && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m2.5 6.2 2.4 2.3 4.6-5" /></svg>}
      {t(status === 'saving' ? 'common.saving' : status === 'ok' ? 'common.applied' : 'common.applyFail')}
    </span>
  )
}

interface CardProps {
  title: string
  page: RunePage
  st: StaticData
  editKey: string // champion + lane + page index: where the edited page is remembered
  onApply?: (perks: number[]) => void // no button outside champ select
  onEdit: (perks: number[] | null) => void // null = the edit is not a valid page yet
  status?: Status // set in champ select: no Apply button, the owner sends changes by itself
  revert?: () => void // the user's own page: Reset means back to the recommended one
  caption?: string // what the numbers measure, e.g. keystone win rate
  hideStats?: boolean // numbers would repeat another page's
}

export function RunePageCard({ title, page, st, editKey, onApply, onEdit, status, revert, caption, hideStats }: CardProps) {
  const t = useT()
  const ed = useRuneEdit(editKey, page.perks, st)
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex min-w-0 items-center gap-2 text-[14px] font-semibold"><span className="truncate">{title}</span>{page.low && <Low />}</h3>
        {ed.edited ? (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-gold">{t('runes.edited')}</span>
        ) : hideStats || !page.n ? (
          <span className="text-[15px] font-bold text-mute">—</span>
        ) : page.player ? (
          <Result wr={page.wr} />
        ) : (
          <div className="text-right leading-tight">
            <div className="flex items-baseline justify-end gap-2 text-[12px]">
              <span className={`text-[16px] font-bold ${wrColor(page.wr)}`}>{fmtPct(page.wr)}</span>
              <span className="text-mute">{fmtGames(page.n)}</span>
            </div>
            {caption && <div className="text-[10px] text-mute">{caption}</div>}
          </div>
        )}
      </div>

      <RuneBoard
        draft={ed.draft}
        st={st}
        onChange={(d) => { ed.set(d); onEdit(isComplete(d) ? perksOf(d, st.trees) : null) }}
      />

      {!ed.complete && <p className="mt-3 text-[12px] leading-snug text-yellow-300/90">{t('runes.incomplete')}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(ed.edited || revert) && (
          <button
            type="button"
            onClick={() => { ed.reset(); if (revert) revert(); else onEdit(page.perks) }}
            className="no-drag text-[12px] font-medium text-mute underline-offset-2 transition-colors hover:text-gold hover:underline"
          >
            {t('runes.revert')}
          </button>
        )}
        {status !== undefined ? (
          <span className="ml-auto"><StatusText status={status} /></span>
        ) : onApply ? (
          <Button onClick={() => onApply(ed.perks)} disabled={!ed.complete} className="min-w-[120px] flex-1">{t('runes.apply')}</Button>
        ) : null}
      </div>
    </Card>
  )
}

// the build's own pages first, replaced by the richer list (matchup, variants, pro games) once it arrives
export function useRunePages(base: RunePage[], championId: number, lane: Lane, vsLaner?: number, vsJungler?: number): RunePage[] {
  const key = `${championId}:${lane}:${vsLaner ?? ''}:${vsJungler ?? ''}`
  const [more, setMore] = useState<{ key: string; pages: RunePage[] } | null>(null)
  useEffect(() => {
    let live = true
    window.lolay.getRunePages({ championId, lane, vsLaner, vsJungler }).then((pages) => live && pages.length > 0 && setMore({ key, pages })).catch(() => {})
    return () => { live = false }
  }, [key])
  return more?.key === key ? more.pages : base
}

type Sort = 'best' | 'wr' | 'common' | 'pro'
const SORTS: [Sort, Key][] = [['best', 'draft.sortBest'], ['wr', 'draft.sortWr'], ['common', 'draft.sortCommon'], ['pro', 'runes.sortPro']]
const isPro = (p: RunePage) => p.source === 'pro' || !!p.player

const pageName = (p: RunePage, i: number, keystone: boolean, t: TFn, st: StaticData) =>
  pageTitle(p, i === 0 ? t('runes.most') : i === 1 ? t(keystone ? 'runes.focus' : 'runes.best') : undefined, st.runes)

function Low() {
  const t = useT()
  return <span className="shrink-0 rounded border border-yellow-300/40 px-1 text-[9px] font-bold tracking-wide text-yellow-300/90">{t('runes.low')}</span>
}

function ago(when: number, lang: string) {
  const days = Math.round((when - Date.now()) / 864e5)
  const f = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'narrow' })
  return Math.abs(days) < 1 ? f.format(Math.round((when - Date.now()) / 36e5), 'hour') : f.format(days, 'day')
}

function PageItem({ p, name, on, st, hideStats, pick }: { p: RunePage; name: string; on: boolean; st: StaticData; hideStats: boolean; pick: () => void }) {
  const t = useT()
  const lang = useLang()
  const ks = st.runes[p.perks[0]]
  const sub = st.trees.find((tr) => tr.slots.some((r) => r.includes(p.perks[4])))
  const line = p.player ? [p.player.team, p.player.region, p.player.when && ago(p.player.when, lang)].filter(Boolean).join(' · ') : p.n ? `${fmtGames(p.n)} ${t('runes.games')}` : ''
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={pick}
      className={`no-drag flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-150 ${
        on ? 'border-gold/70 bg-gold/[.07] shadow-[0_0_0_1px_rgba(200,170,110,.3)]' : 'border-line bg-[#12161d] hover:border-[#2f384c] hover:bg-[#161c27]'
      }`}
    >
      <Tip tip={runeTip(st, p.perks[0])} native className="!rounded-full">
        <span className="relative shrink-0">
          <span className={`grid size-10 place-items-center rounded-full bg-black/40 ${on ? 'shadow-[0_0_0_1.5px_rgba(200,170,110,.9)]' : 'shadow-[0_0_0_1px_#2a3142]'}`}>
            {ks?.icon && <img src={ks.icon} alt="" draggable={false} className="size-9" />}
          </span>
          {sub?.icon && <img src={sub.icon} alt={sub.name} draggable={false} className="absolute -right-1 -bottom-1 size-[18px] rounded-full bg-[#0e1015] p-px ring-1 ring-line" />}
        </span>
      </Tip>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1.5">
          <span className={`truncate text-[13px] font-semibold ${on ? 'text-fg' : 'text-fg/90'}`}>{name}</span>
          {isPro(p) && <span className="shrink-0 rounded border border-gold/40 px-1 text-[9px] font-bold tracking-wider text-gold">{t('runes.pro')}</span>}
          {p.low && <Low />}
        </span>
        <span className="block truncate text-[11px] text-mute">
          {line}
        </span>
      </span>
      {p.player ? <Result wr={p.wr} /> : !hideStats && p.n > 0 && <span className={`shrink-0 text-[13px] font-bold ${wrColor(p.wr)}`}>{fmtPct(p.wr)}</span>}
    </button>
  )
}

interface SectionProps {
  pages: RunePage[] // the build's own pages; the richer list for championId + lane (+ vsLaner) replaces them once fetched
  championId: number
  lane: Lane
  vsLaner?: number
  vsJungler?: number
  st: StaticData
  editBase: string // champion + lane
  keystone: boolean // wr/n are the keystone's, not the page's
  saved?: number[] // the user's own page for this champion + lane
  onSave: (perks: number[] | null) => void // remember (or forget) the user's own page
  onApply?: (perks: number[], index: number) => void // explicit Apply button (champ select only)
  // champ select: choosing a page or finishing an edit goes to the client by itself; resolves true = ok, null = skipped
  auto?: (perks: number[], index: number, picked: boolean) => Promise<boolean | null>
}

interface Entry { key: string; page: RunePage; orig: number; mine?: true }

// All rune pages of a build: a selectable list and the chosen page large, with the editor.
export function RuneSection({ pages: base, championId, lane, vsLaner, vsJungler, st, editBase, keystone, saved, onSave, onApply, auto }: SectionProps) {
  const t = useT()
  const pages = useRunePages(base, championId, lane, vsLaner, vsJungler)
  const entries = useMemo<Entry[]>(() => {
    const list = pages.map((page, orig) => ({ key: String(orig), page, orig }))
    return saved ? [{ key: 'mine', orig: -1, mine: true as const, page: { wr: 0, n: 0, perks: saved, label: t('runes.mine') } }, ...list] : list
  }, [pages, saved, t])
  const [selKey, setSelKey] = useState(entries[0]?.key ?? '0')
  const [sort, setSort] = useState<Sort>('best')
  const [status, setStatus] = useState<Status>('')
  const timer = useRef(0)
  const fade = useRef(0)
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(fade.current) }, [])

  const cur = entries.find((e) => e.key === selKey) ?? entries[0]
  const keyOf = (e: Entry) => `${editBase}:${e.key}`
  const order = useMemo(() => {
    const real = entries.filter((e) => !e.mine)
    const mine = entries.filter((e) => e.mine)
    if (sort === 'wr') return [...mine, ...real.sort((a, b) => b.page.wr - a.page.wr)]
    if (sort === 'common') return [...mine, ...real.sort((a, b) => b.page.n - a.page.n)]
    if (sort === 'pro') return real.filter((e) => isPro(e.page))
    return entries
  }, [entries, sort])
  const sorts = SORTS.filter(([k]) => k !== 'pro' || pages.some(isPro))

  function push(perks: number[] | null, e: Entry, picked: boolean, delay: number) {
    if (!auto || !perks) return
    clearTimeout(timer.current)
    setStatus('saving')
    timer.current = window.setTimeout(async () => {
      const ok = await auto(perks, e.orig, picked).catch(() => false)
      clearTimeout(fade.current)
      setStatus(ok === null ? '' : ok ? 'ok' : 'err')
      fade.current = window.setTimeout(() => setStatus(''), 2500)
    }, delay)
  }
  // the user's own page is stored apart from the edit buffers, so a stale buffer never shadows it
  const save = (perks: number[] | null) => {
    clearEdit(`${editBase}:mine`)
    onSave(perks)
  }
  function select(e: Entry) {
    setSelKey(e.key)
    const perks = pagePerks(keyOf(e), e.page.perks, st)
    if (!e.mine) {
      if (e.orig === 0) { if (saved) save(null) } else if (perks) save(perks)
    }
    push(perks, e, true, 200)
  }
  function revert() {
    const first = entries.find((e) => !e.mine)
    save(null)
    if (first) {
      setSelKey(first.key)
      push(first.page.perks, first, true, 200)
    }
  }
  if (!cur) return null
  // an edit of any page becomes the user's own page (back to the recommended one forgets it)
  const edited = (perks: number[] | null) => {
    if (perks) save(cur.orig === 0 && JSON.stringify(perks) === JSON.stringify(cur.page.perks) ? null : perks)
    push(perks, cur, false, 700)
  }

  const hide = (e: Entry) => keystone && e.orig === 1 && pages[1].perks[0] === pages[0].perks[0] // its numbers would repeat page 1's
  const pick = (k: Sort) => {
    setSort(k)
    const real = entries.filter((e) => !e.mine)
    const best = (f: (e: Entry) => number) => real.reduce((b, e) => (f(e) > f(b) ? e : b), real[0])
    const first = k === 'best' ? real[0] : k === 'wr' ? best((e) => e.page.wr) : k === 'common' ? best((e) => e.page.n) : real.find((e) => isPro(e.page))
    if (first && first !== cur) select(first)
  }
  return (
    <div>
      <Eyebrow
        right={
          sorts.length > 2 && (
            <div role="radiogroup" aria-label={t('runes.pages')} className="no-drag inline-flex rounded-lg border border-line bg-[#12161d] p-0.5">
              {sorts.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={k === sort}
                  onClick={() => pick(k)}
                  className={`h-6 rounded-md px-2.5 text-[11px] font-medium transition-all ${k === sort ? 'bg-[#232a3a] text-fg shadow-[inset_0_0_0_1px_rgba(200,170,110,.35)]' : 'text-mute hover:text-fg'}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          )
        }
      >
        {t('imp.runes')}
      </Eyebrow>
      <div className="flex flex-wrap gap-4">
        {entries.length > 1 && (
          <div
            role="radiogroup"
            aria-label={t('runes.pages')}
            className="grid max-h-[420px] min-w-0 flex-[1_1_230px] content-start gap-2 overflow-y-auto pr-1 [grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))]"
          >
            {order.map((e) => (
              <PageItem key={e.key} p={e.page} name={pageName(e.page, e.orig, keystone, t, st)} on={e === cur} st={st} hideStats={hide(e)} pick={() => select(e)} />
            ))}
          </div>
        )}
        <div className="min-w-0 flex-[3_1_460px]">
          <RunePageCard
            key={cur.key}
            title={pageName(cur.page, cur.orig, keystone, t, st)}
            page={cur.page}
            st={st}
            editKey={keyOf(cur)}
            caption={keystone ? t('runes.keystoneWr') : undefined}
            hideStats={hide(cur)}
            onApply={onApply && ((perks) => onApply(perks, cur.orig))}
            revert={cur.mine ? revert : undefined}
            onEdit={edited}
            status={auto ? status : undefined}
          />
        </div>
      </div>
    </div>
  )
}

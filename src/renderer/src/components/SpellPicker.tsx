import { useEffect, useRef, useState } from 'react'
import { spellIcon, type ChampSelectState, type SetStat, type Settings, type StaticData } from '@shared/types'
import { useT } from '../i18n'
import { fmtGames, fmtPct, wrColor } from '../util'
import { spellOrder } from './ImportRow'
import { TextTip, Tip, spellTip } from './Tooltip'
import type { PushToast } from './Toasts'

// summoner spells that exist on Summoner's Rift, in the order the client lists them
const RIFT_SPELLS = [4, 14, 12, 7, 3, 21, 1, 6, 11]

interface Props {
  cs: ChampSelectState
  st: StaticData
  settings: Settings
  recommended?: number[] // spell keys of the build's best pair
  toast: PushToast
  size?: number
  caption?: boolean // key letter under the icon instead of on its corner
}

export function SpellSlots({ cs, st, settings, recommended = [], toast, size = 36, caption }: Props) {
  const t = useT()
  const [open, setOpen] = useState<0 | 1 | 2>(0) // slot whose popover is open: 1 = D, 2 = F
  const [drag, setDrag] = useState<1 | 2 | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const slots = [cs.spell1Id, cs.spell2Id]

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(0) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(0) }
    addEventListener('pointerdown', down)
    addEventListener('keydown', key)
    return () => { removeEventListener('pointerdown', down); removeEventListener('keydown', key) }
  }, [open])

  async function set(a: number, b: number) {
    if (!a || !b || a === b) return
    try {
      if (!(await window.lolay.draftSetSpells(a, b))) toast(t('spell.fail'), 'err')
    } catch {
      toast(t('spell.fail'), 'err')
    }
  }
  const swap = () => set(slots[1], slots[0])
  // choosing the spell that sits in the other slot swaps them
  const choose = (slot: 1 | 2, id: number) => {
    setOpen(0)
    if (id === slots[slot - 1]) return
    const other = slots[2 - slot]
    if (id === other) return swap()
    return slot === 1 ? set(id, other) : set(other, id)
  }

  const recPair = recommended.length === 2 ? spellOrder(recommended, settings.flashOn) : []
  const keys = ['D', 'F']

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {([1, 2] as const).map((slot) => {
        const id = slots[slot - 1]
        const sp = id ? st.spells[id] : undefined
        return (
          <div key={slot} className="contents">
            {slot === 2 && (
              <Tip tip={<TextTip title={t('spell.swap')} />} native>
                <button
                  onClick={swap}
                  disabled={!slots[0] || !slots[1]}
                  aria-label={t('spell.swap')}
                  className="no-drag grid size-6 place-items-center rounded-md border border-line bg-[#12161d] text-mute transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-40"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>
                </button>
              </Tip>
            )}
            <div
              draggable={!!id}
              onDragStart={(e) => { setDrag(slot); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(slot)) }}
              onDragEnd={() => setDrag(null)}
              onDragOver={(e) => { if (drag && drag !== slot) e.preventDefault() }}
              onDrop={(e) => { e.preventDefault(); if (drag && drag !== slot) void swap(); setDrag(null) }}
              className={`flex flex-col items-center gap-1 ${drag === slot ? 'opacity-40' : ''}`}
            >
              <Tip tip={(id && spellTip(st, id)) || <TextTip title={t('spell.pick')} />} native>
              <button
                onClick={() => setOpen(open === slot ? 0 : slot)}
                aria-label={`${t('spell.slot')} ${keys[slot - 1]}`}
                aria-haspopup="listbox"
                aria-expanded={open === slot}
                style={{ width: size, height: size }}
                className={`no-drag relative overflow-hidden rounded-lg border bg-[#10131a] transition-all duration-150 hover:border-gold/60 ${open === slot ? 'border-gold/70 shadow-[0_0_0_2px_rgba(200,170,110,.25)]' : 'border-line'} ${drag && drag !== slot ? 'border-dashed border-gold/60' : ''}`}
              >
                {sp && <img src={spellIcon(st.version, sp.id)} alt={sp.name} draggable={false} className="size-full object-cover" />}
                {!caption && <span className="absolute right-0 bottom-0 rounded-tl-md bg-black/70 px-1 text-[9.5px] leading-[14px] font-bold text-gold">{keys[slot - 1]}</span>}
              </button>
              </Tip>
              {caption && <span className="text-[10px] font-bold leading-none text-mute">{keys[slot - 1]}</span>}
            </div>
          </div>
        )
      })}

      {open > 0 && (
        <div role="listbox" className={`fade-up absolute z-40 w-[232px] rounded-xl border border-line bg-[#171c26] p-2.5 shadow-[0_16px_40px_-8px_rgba(0,0,0,.8)] ${caption ? 'bottom-full mb-2 left-0' : 'top-full mt-2 right-0'}`}>
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{t('spell.pick')} · {keys[open - 1]}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-gold"><span className="size-1.5 rounded-full bg-gold" />{t('spell.rec')}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {RIFT_SPELLS.map((id) => {
              const sp = st.spells[id]
              if (!sp) return null
              const on = slots[open - 1] === id
              const rec = recPair.includes(id)
              return (
                <Tip key={id} tip={spellTip(st, id)} native className="w-full">
                <button
                  role="option"
                  aria-selected={on}
                  onClick={() => choose(open as 1 | 2, id)}
                  className={`flex w-full flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition-colors hover:bg-[#232a3a] ${on ? 'border-gold/60 bg-[#232a3a]' : 'border-transparent'}`}
                >
                  <span className="relative">
                    <img src={spellIcon(st.version, sp.id)} alt="" draggable={false} className={`size-9 rounded-md ring-1 ${rec ? 'ring-gold/80' : 'ring-white/10'}`} />
                    {rec && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-gold ring-2 ring-[#171c26]" />}
                  </span>
                  <span className="w-full truncate text-center text-[10.5px] leading-tight text-fg/90">{sp.name}</span>
                </button>
                </Tip>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

interface ControlProps {
  pairs: SetStat[] // the build's spell pairs, best first
  st: StaticData
  settings: Settings
  cs: ChampSelectState | null // null = outside champ select: read-only
  championId: number // the build's champion: nothing is sent once another one is hovered or locked
  toast: PushToast
  saved?: number[] // the user's own pair for this champion + lane
}

// D/F slots plus the recommended pairs. In champ select every change lands in the client at once.
export function SpellControl({ pairs, st, settings, cs, championId, toast, saved }: ControlProps) {
  const t = useT()
  const [done, setDone] = useState(false)
  const live = useRef(cs)
  live.current = cs
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const list = pairs.slice(0, 3).filter((p) => p.ids.length === 2)
  const shown = cs ? [cs.spell1Id, cs.spell2Id] : list[0] ? spellOrder(list[0].ids, settings.flashOn) : []
  const same = (a: number[], b: number[]) => a.length === 2 && b.length === 2 && a.every((x) => b.includes(x))

  async function pick(ids: number[]) {
    if (live.current?.championId !== championId) return
    const [a, b] = spellOrder(ids, settings.flashOn)
    try {
      if (!(await window.lolay.draftSetSpells(a, b))) return void toast(t('spell.fail'), 'err')
    } catch {
      return void toast(t('spell.fail'), 'err')
    }
    setDone(true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDone(false), 2200)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {cs ? (
          <SpellSlots cs={cs} st={st} settings={settings} recommended={list[0]?.ids} toast={toast} size={48} caption />
        ) : (
          <div className="flex items-start gap-3">
            {shown.map((id, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <Tip tip={spellTip(st, id)}>
                  <img src={st.spells[id] ? spellIcon(st.version, st.spells[id].id) : ''} alt={st.spells[id]?.name ?? ''} draggable={false} style={{ width: 48, height: 48 }} className="rounded-lg border border-line" />
                </Tip>
                <span className="text-[10px] font-bold leading-none text-mute">{'DF'[i]}</span>
              </div>
            ))}
          </div>
        )}
        <span className="min-h-4 text-[11.5px]" aria-live="polite">
          {cs ? done ? <span className="inline-flex items-center gap-1 text-win"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m2.5 6.2 2.4 2.3 4.6-5" /></svg>{t('common.applied')}</span> : saved && same(saved, shown) ? <span className="text-gold">{t('spell.mine')}</span> : null : <span className="text-mute">{t('spells.csOnly')}</span>}
        </span>
      </div>

      {list.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">{t('spell.rec')}</div>
          <div role="group" aria-label={t('spell.rec')} className="flex flex-wrap gap-2">
            {list.map((p) => {
              const on = !!cs && same(p.ids, shown)
              return (
                <button
                  key={p.ids.join()}
                  type="button"
                  disabled={!cs}
                  aria-pressed={on}
                  onClick={() => void pick(p.ids)}
                  className={`no-drag inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5 transition-all duration-150 disabled:opacity-100 ${
                    on ? 'border-gold/70 bg-gold/[.09] shadow-[0_0_0_1px_rgba(200,170,110,.3)]' : `border-line bg-[#12161d] ${cs ? 'hover:border-[#2f384c] hover:bg-[#1a2030]' : ''}`
                  }`}
                >
                  <span className="flex gap-1">
                    {p.ids.map((id) => st.spells[id] && <img key={id} src={spellIcon(st.version, st.spells[id].id)} alt={st.spells[id].name} width={22} height={22} draggable={false} style={{ width: 22, height: 22 }} className="rounded-md" />)}
                  </span>
                  <span className={`text-[12px] font-bold ${wrColor(p.wr)}`}>{fmtPct(p.wr)}</span>
                  <span className="text-[10.5px] text-mute">{fmtGames(p.n)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

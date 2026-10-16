import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { itemIcon, spellIcon, type StaticData } from '@shared/types'
import { parseRich, type RichNode } from '@shared/richText'
import { useT } from '../i18n'

function Nodes({ nodes }: { nodes: RichNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (typeof n === 'string') return n
        if (n.t === 'br') return <br key={i} />
        if (n.t === 'hr') return <hr key={i} className="my-2 border-0 border-t border-[#463714]/70" />
        const style: CSSProperties = { color: n.color, fontWeight: n.b ? 600 : undefined, fontStyle: n.i ? 'italic' : undefined }
        return <span key={i} style={style}><Nodes nodes={n.ch} /></span>
      })}
    </>
  )
}

export function RichText({ html }: { html: string }) {
  const nodes = useMemo(() => parseRich(html), [html])
  return <Nodes nodes={nodes} />
}

const GAP = 8
const DELAY = 120

interface TipProps {
  tip: ReactNode // null/false = no tooltip
  children: ReactNode
  className?: string
  native?: boolean // the child is already focusable (button): the wrapper stays out of the tab order
}

// Hover/focus tooltip: portal to body, flips at the viewport edges, never takes pointer events.
export function Tip({ tip, children, className = '', native }: TipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const id = useId()
  const has = !!tip

  const show = () => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), DELAY)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setOpen(false)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  useLayoutEffect(() => {
    if (!open || !anchor.current || !panel.current) return setPos(null)
    const a = anchor.current.getBoundingClientRect()
    const w = panel.current.offsetWidth
    const h = panel.current.offsetHeight
    const x = Math.min(Math.max(a.left + a.width / 2 - w / 2, GAP), Math.max(GAP, innerWidth - w - GAP))
    const below = a.bottom + GAP
    const above = a.top - GAP - h
    const y = below + h <= innerHeight - GAP || above < GAP ? Math.min(below, Math.max(GAP, innerHeight - h - GAP)) : above
    setPos({ x, y })
  }, [open, tip])

  useEffect(() => {
    if (!open) return
    const off = () => hide()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    addEventListener('scroll', off, true)
    addEventListener('resize', off)
    addEventListener('keydown', key)
    return () => { removeEventListener('scroll', off, true); removeEventListener('resize', off); removeEventListener('keydown', key) }
  }, [open])

  if (!has) return <>{children}</>
  return (
    <span
      ref={anchor}
      tabIndex={native ? undefined : 0}
      aria-describedby={open ? id : undefined}
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') show() }}
      onPointerLeave={hide}
      onPointerDown={(e) => (e.pointerType === 'touch' ? show() : hide())}
      onFocus={(e) => { if (e.target.matches(':focus-visible')) show() }}
      onBlur={hide}
      className={`inline-flex rounded-md ${className}`}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="tooltip"
            style={{ position: 'fixed', left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden', zIndex: 1000 }}
            className="pointer-events-none w-max max-w-[min(330px,calc(100vw-16px))] select-none rounded-md border border-[#5b4a22] bg-[#010a13]/[.97] px-3.5 py-3 text-left text-[12.5px] leading-[1.5] font-normal normal-case tracking-normal text-[#a9a490] shadow-[0_0_0_1px_#0b1a2b_inset,0_14px_36px_-6px_rgba(0,0,0,.9)]"
          >
            {tip}
          </div>,
          document.body
        )}
    </span>
  )
}

function Head({ icon, title, sub, right, round }: { icon?: string; title: string; sub?: string; right?: ReactNode; round?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon && <img src={icon} alt="" width={36} height={36} style={{ width: 36, height: 36 }} className={`shrink-0 border border-[#5b4a22] bg-black/40 ${round ? 'rounded-full p-0.5' : 'rounded'}`} />}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-tight font-semibold text-gold">{title}</div>
        {sub && <div className="text-[11px] leading-tight text-[#7d8597]">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

const Body = ({ html }: { html: string }) => (html.trim() ? <div className="mt-2 border-t border-[#463714]/60 pt-2"><RichText html={html} /></div> : null)

export function RuneTip({ id, st }: { id: number; st: StaticData }) {
  const r = st.runes[id]
  if (!r) return null
  const tree = st.trees.find((t) => t.id === r.styleId)
  return (
    <>
      <Head icon={r.icon} title={r.name} sub={tree?.name} round />
      <Body html={r.desc} />
    </>
  )
}

export function ItemTip({ id, st }: { id: number; st: StaticData }) {
  const it = st.items[id]
  if (!it) return null
  return (
    <>
      <Head
        icon={itemIcon(st.version, id)}
        title={it.name}
        right={it.gold > 0 && <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#f0b232]"><span className="size-2.5 rounded-full bg-[#f0b232] shadow-[0_0_6px_#f0b232aa]" />{it.gold}</span>}
      />
      <Body html={it.desc} />
    </>
  )
}

export function SpellTip({ id, st }: { id: number; st: StaticData }) {
  const t = useT()
  const sp = st.spells[id]
  if (!sp) return null
  return (
    <>
      <Head icon={spellIcon(st.version, sp.id)} title={sp.name} sub={sp.cd ? `${t('tip.cooldown')}: ${sp.cd}s` : undefined} />
      <Body html={sp.desc} />
    </>
  )
}

export function TextTip({ icon, title }: { icon?: string; title: string }) {
  return <Head icon={icon} title={title} round />
}

// tooltip content for an id, or null (no tooltip) when static data does not know it
export const runeTip = (st: StaticData, id: number) => (st.runes[id] ? <RuneTip id={id} st={st} /> : null)
export const itemTip = (st: StaticData, id: number) => (st.items[id] ? <ItemTip id={id} st={st} /> : null)
export const spellTip = (st: StaticData, id: number) => (st.spells[id] ? <SpellTip id={id} st={st} /> : null)

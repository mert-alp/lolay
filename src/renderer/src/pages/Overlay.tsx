import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { champIcon, type OverlayPanel } from '@shared/types'
import { LangCtx, makeT, useT, type Key } from '../i18n'
import { useAppState, useStatic } from '../hooks'

const ROUTE_UNTIL = 240 // seconds: the first clear is over by then
const MAP = 280 // px, about the in-game minimap at default scale so camps read at the same spacing
const WORLD = 14870 // game units per map axis
// camp positions in game units for the BLUE side (y up); RED side is point-mirrored
// Gromp nudged slightly toward the wall so its icon clears the blue buff on a ~230 px map
const CAMPS: Record<string, [number, number]> = { BLUE: [3800, 7900], GROMP: [1750, 8650], WOLVES: [3800, 6500], RAPTORS: [6950, 5450], RED: [7800, 4000], KRUG: [8400, 2700] }
const CD = 'https://raw.communitydragon.org/latest/game/assets/characters/'
const CAMP_ICON: Record<string, string> = {
  BLUE: 'sru_blue/hud/bluesentinel_circle.png',
  RED: 'sru_red/hud/brambleback_circle.png',
  GROMP: 'sru_gromp/hud/gromp_circle.png',
  WOLVES: 'sru_murkwolf/hud/greatermurkwolf_circle.png',
  RAPTORS: 'sru_razorbeak/hud/razorbeak_circle.png',
  KRUG: 'sru_krug/hud/ancientkrug_circle.png'
}
const CAMP_RING: Record<string, string> = { BLUE: 'ring-sky-400', RED: 'ring-red-500' }

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className="grid size-[18px] place-items-center rounded text-mute transition-colors hover:bg-white/10 hover:text-fg">
      {children}
    </button>
  )
}

// glass shell with a drag/collapse/close header; only the header catches the mouse, the body stays click-through
function Panel({ id, saved, onSave, anchor, border, width, title, mini, folded, onFold, onClose, children }: {
  id: OverlayPanel
  saved?: [number, number]
  onSave: (p: [number, number]) => void
  anchor: CSSProperties
  border: string
  width?: number
  title: ReactNode
  mini?: ReactNode // shown in the header instead of the title while folded
  folded: boolean
  onFold: () => void
  onClose: () => void
  children: ReactNode
}) {
  const t = useT()
  const el = useRef<HTMLDivElement>(null)
  const hover = useRef(false)
  const drag = useRef<[number, number] | null>(null)
  const [pos, setPos] = useState<[number, number] | null>(null)
  const mouse = (on: boolean) => window.lolay.overlayMouse(on)
  useEffect(() => () => { if (hover.current) mouse(false) }, [])
  const at = pos ?? saved
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !el.current) return
    const r = el.current.getBoundingClientRect()
    setPos([Math.max(0, Math.min(window.innerWidth - r.width, e.clientX - drag.current[0])), Math.max(0, Math.min(window.innerHeight - r.height, e.clientY - drag.current[1]))])
  }
  return (
    <div ref={el} className={`absolute rounded-2xl border bg-bg/80 shadow-[0_8px_30px_-8px_rgba(0,0,0,.8)] backdrop-blur-md ${border}`} style={{ ...(at ? { left: at[0], top: at[1] } : anchor), width: folded ? undefined : width }}>
      <div
        title={t('overlay.drag')}
        className="pointer-events-auto flex h-[22px] cursor-grab items-center gap-1.5 px-2 active:cursor-grabbing"
        onMouseEnter={() => { hover.current = true; mouse(true) }}
        onMouseLeave={() => { hover.current = false; if (!drag.current) mouse(false) }}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest('button') || !el.current) return
          const r = el.current.getBoundingClientRect()
          drag.current = [e.clientX - r.left, e.clientY - r.top]
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={move}
        onPointerUp={(e) => {
          if (!drag.current) return
          drag.current = null
          e.currentTarget.releasePointerCapture(e.pointerId)
          if (pos) onSave(pos)
          if (!hover.current) mouse(false)
        }}
      >
        <svg width="8" height="12" viewBox="0 0 8 12" className="shrink-0 fill-mute">
          {[1.5, 6, 10.5].flatMap((y) => [1.5, 6.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1" />))}
        </svg>
        <div className="flex min-w-0 flex-1 items-center gap-2">{folded && mini ? mini : title}</div>
        <IconBtn title={t(folded ? 'overlay.expand' : 'overlay.collapse')} onClick={onFold}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${folded ? '' : 'rotate-180'}`}>
            <path d="M2 3.5 5 6.5 8 3.5" />
          </svg>
        </IconBtn>
        <IconBtn title={t('overlay.close')} onClick={onClose}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 2 8 8M8 2 2 8" />
          </svg>
        </IconBtn>
      </div>
      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ${folded ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
        <div className={`min-h-0 overflow-hidden ${folded ? 'w-0' : ''}`}>{children}</div>
      </div>
    </div>
  )
}

// transparent, click-through window over the game: skill reminder above the ability bar, jungle path left of the minimap
export function Overlay() {
  const state = useAppState()
  const { data: st } = useStatic(state?.lang, state?.dataVersion)
  const lang = state?.lang ?? 'tr'
  const ctx = useMemo(() => ({ lang, t: makeT(lang) }), [lang])
  const [closed, setClosed] = useState<Partial<Record<OverlayPanel, boolean>>>({})
  const [folded, setFolded] = useState<Partial<Record<OverlayPanel, boolean>>>({})
  const o = state?.overlay
  useEffect(() => {
    if (!o) { setClosed({}); setFolded({}) } // game over: panels come back next game
  }, [!o])
  if (!o) return null
  const t = ctx.t
  const cfg = state.settings
  const icon = st && st.champions[o.championId] ? champIcon(st.version, st.champions[o.championId].id) : null
  const route = o.route && o.gameTime < ROUTE_UNTIL ? o.route : null
  const pts = (route ?? []).filter((c) => CAMPS[c]).map((camp) => {
    const [x, y] = o.side === 'BLUE' ? CAMPS[camp] : [WORLD - CAMPS[camp][0], WORLD - CAMPS[camp][1]]
    return { camp, x: (x / WORLD) * MAP, y: (1 - y / WORLD) * MAP }
  })
  const common = (id: OverlayPanel) => ({
    id,
    saved: cfg.overlayPos[id],
    onSave: (p: [number, number]) => window.lolay.setSettings({ overlayPos: { ...cfg.overlayPos, [id]: p } }),
    folded: !!folded[id],
    onFold: () => setFolded((f) => ({ ...f, [id]: !f[id] })),
    onClose: () => setClosed((c) => ({ ...c, [id]: true }))
  })
  const label = (txt: string) => <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-mute">{txt}</span>

  return (
    <LangCtx value={ctx}>
      <div className="pointer-events-none fixed inset-0 select-none overflow-hidden text-fg">
        {o.skill && cfg.overlaySkill && !closed.skill && (
          <Panel
            {...common('skill')}
            anchor={{ bottom: 215, left: '50%', transform: 'translateX(-50%)' }}
            border="border-gold/40"
            title={label(t('overlay.skill'))}
            mini={<span className="grid h-4 min-w-4 place-items-center rounded border border-gold/70 bg-gold/20 px-1 text-[11px] font-extrabold leading-none text-gold">{o.skill}</span>}
          >
            <div className="flex items-center gap-3 py-2 pl-2 pr-3">
              {icon && <img src={icon} alt="" className="size-10 rounded-xl ring-1 ring-white/15" />}
              <span className="text-[13px] font-semibold uppercase tracking-wider text-gold">{t('overlay.levelUp')}</span>
              <span className="animate-pulse grid size-12 place-items-center rounded-xl border border-gold/70 bg-gradient-to-b from-gold/35 to-gold/10 text-[28px] font-extrabold leading-none text-gold shadow-[0_0_26px_-2px_rgba(200,170,110,.8)]">
                {o.skill}
              </span>
            </div>
          </Panel>
        )}
        {route && cfg.overlayRoute && !closed.route && (
          <Panel
            {...common('route')}
            anchor={{ bottom: 8, right: cfg.overlayMap + 12 }}
            border="border-line"
            width={MAP + 20}
            title={
              <>
                {label(t('overlay.route'))}
                <span className={`rounded-md px-1.5 py-px text-[10px] font-bold ${o.side === 'BLUE' ? 'bg-blue-500/20 text-blue-300' : 'bg-red-500/20 text-red-300'}`}>{t(`camp.${o.side}` as Key)}</span>
              </>
            }
          >
            <div className="p-2.5 pt-1">
            <style>{'@keyframes lolay-flow{to{stroke-dashoffset:-16}}'}</style>
            <div className="relative overflow-hidden rounded-xl bg-[#0b0f14] ring-1 ring-white/10" style={{ width: MAP, height: MAP }}>
              {st && <img src={`https://ddragon.leagueoflegends.com/cdn/${st.version}/img/map/map11.png`} alt="" className="absolute inset-0 size-full brightness-75 saturate-50" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              <svg className="absolute inset-0" width={MAP} height={MAP} viewBox={`0 0 ${MAP} ${MAP}`} style={{ filter: 'drop-shadow(0 0 3px rgba(200,170,110,.7))' }}>
                <defs>
                  <marker id="lolay-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M0 0L10 5L0 10z" fill="#c8aa6e" />
                  </marker>
                </defs>
                {pts.slice(1).map((b, i) => {
                  const a = pts[i]
                  const d = Math.hypot(b.x - a.x, b.y - a.y)
                  const r0 = (i === 0 ? 14 : 11) + 2
                  const r1 = 11 + 4
                  if (d < r0 + r1 + 4) return null
                  const [ux, uy] = [(b.x - a.x) / d, (b.y - a.y) / d]
                  return (
                    <line key={i} x1={a.x + ux * r0} y1={a.y + uy * r0} x2={b.x - ux * r1} y2={b.y - uy * r1} stroke="#c8aa6e" strokeWidth={2} strokeLinecap="round" strokeDasharray="5 3" markerEnd="url(#lolay-arrow)" style={{ animation: 'lolay-flow 0.9s linear infinite' }} />
                  )
                })}
              </svg>
              {pts.map((p, i) => (
                <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }}>
                  {i === 0 && <span className="absolute inset-0 animate-ping rounded-full bg-gold/50" />}
                  <img
                    src={CD + CAMP_ICON[p.camp]}
                    alt=""
                    className={`relative rounded-full bg-bg object-cover ring-2 ${CAMP_RING[p.camp] ?? 'ring-gold/60'} ${i === 0 ? 'size-7 shadow-[0_0_16px_2px_rgba(200,170,110,.8)]' : 'size-[22px] shadow-[0_2px_8px_rgba(0,0,0,.7)]'}`}
                  />
                  <span className={`absolute -bottom-1 -right-1 grid size-3.5 place-items-center rounded-full text-[9px] font-bold leading-none ring-1 ring-black/60 ${i === 0 ? 'bg-gold text-bg' : 'bg-bg text-fg'}`}>{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-1 text-[10px] leading-4 text-mute">
              {pts.map((p, i) => (
                <span key={i} className={i === 0 ? 'font-semibold text-gold' : ''}>
                  {i > 0 && <span className="mr-1">›</span>}
                  {t(`camp.${p.camp}` as Key)}
                </span>
              ))}
            </div>
            </div>
          </Panel>
        )}
      </div>
    </LangCtx>
  )
}

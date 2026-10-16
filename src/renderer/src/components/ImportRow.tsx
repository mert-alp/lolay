import { spellIcon, type Build, type ChampSelectState, type Settings, type StaticData } from '@shared/types'
import { useT, type Key } from '../i18n'

export type Part = 'runes' | 'spells' | 'items'
export type PartState = 'pending' | 'running' | 'ok' | 'skipped' | 'off' | 'error'

export const PARTS: Part[] = ['runes', 'spells', 'items']
const FLASH = 4
const TONE: Record<PartState, string> = {
  pending: 'border-gold/35 bg-gold/[.07] text-gold',
  running: 'border-blue/40 bg-blue/10 text-blue',
  ok: 'border-win/40 bg-win/10 text-win',
  error: 'border-loss/40 bg-loss/10 text-loss',
  skipped: 'border-line bg-white/[.04] text-mute',
  off: 'border-line bg-white/[.04] text-mute'
}
const svg = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function StateIcon({ state }: { state: PartState }) {
  if (state === 'pending') return <span className="size-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(200,170,110,.9)]" />
  if (state === 'running') return <span className="size-3 animate-spin rounded-full border-2 border-blue/30 border-t-blue" />
  if (state === 'ok') return <svg {...svg}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
  if (state === 'error') return <svg {...svg}><path d="M6 6l12 12M18 6 6 18" /></svg>
  return <svg {...svg}><path d="M7 12h10" /></svg>
}

// same order as main/apply.ts, so the preview matches what lands in the client
export function spellOrder(ids: number[], flashOn: 'D' | 'F'): number[] {
  if (!ids.includes(FLASH)) return ids
  const other = ids.find((id) => id !== FLASH) ?? FLASH
  return flashOn === 'D' ? [FLASH, other] : [other, FLASH]
}

export function partStates(cs: ChampSelectState, settings: Settings): PartState[] {
  return PARTS.map((part) => {
    if (!settings.autoImport[part]) return 'off'
    const r = cs.importResult?.[part]
    if (r) return r
    if (cs.importing) return 'running'
    if (cs.importFailed) return 'error'
    return cs.importResult ? 'skipped' : 'pending' // a finished import that never ran this part has nothing to write
  })
}

export function ImportChip({ part, state }: { part: Part; state: PartState }) {
  const t = useT()
  const tip = t(state === 'pending' ? 'imp.pendingTip' : state === 'running' ? 'imp.running' : state === 'ok' ? 'imp.ok' : state === 'error' ? 'pill.failed' : state === 'off' ? 'imp.skipOff' : 'imp.skip')
  const suffix = state === 'pending' ? t('imp.pending') : state === 'error' ? t('imp.fail') : null
  return (
    <span title={tip} className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-medium transition-colors duration-200 ${TONE[state]}`}>
      <StateIcon state={state} />
      {t(`imp.${part}` as Key)}
      {suffix && <span className="text-[10.5px] font-normal opacity-70">{suffix}</span>}
    </span>
  )
}

interface Props {
  cs: ChampSelectState
  settings: Settings
  build: Build | null
  st: StaticData | null
}

export function ImportRow({ cs, settings, build, st }: Props) {
  const t = useT()
  const shell = 'flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl py-1.5 border border-line bg-card px-3'
  if (!cs.autoImportAllowed) {
    return (
      <div className={shell}>
        <span className="size-1.5 rounded-full bg-mute" />
        <span className="text-[12px] text-mute">{t('pill.disabled')}</span>
      </div>
    )
  }

  const states = partStates(cs, settings)
  const spellIds = settings.autoImport.spells && build?.spells[0] ? spellOrder(build.spells[0].ids, settings.flashOn) : []
  const keystone = settings.autoImport.runes ? st?.runes[build?.runes[0]?.perks[0] ?? 0] : undefined

  return (
    <div className={shell}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">{t('imp.title')}</span>
      {PARTS.map((part, i) => <ImportChip key={part} part={part} state={states[i]} />)}
      <span className="flex-1" />
      {(keystone?.icon || spellIds.length > 0) && (
        <div className="flex items-center gap-1.5">
          {keystone?.icon && <img src={keystone.icon} alt={keystone.name} title={keystone.name} className={`size-6 rounded-full bg-[#10131a] ring-1 transition-opacity duration-200 ${states[0] === 'ok' ? 'ring-win/60' : 'opacity-50 ring-white/10'}`} />}
          {spellIds.map((id) => {
            const sp = st?.spells[id]
            return sp && st ? <img key={id} src={spellIcon(st.version, sp.id)} alt={sp.name} title={sp.name} className={`size-6 rounded-[5px] ring-1 transition-opacity duration-200 ${states[1] === 'ok' ? 'ring-win/60' : 'opacity-50 ring-white/10'}`} /> : null
          })}
        </div>
      )}
    </div>
  )
}

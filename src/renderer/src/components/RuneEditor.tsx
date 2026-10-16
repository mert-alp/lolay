import { useReducer, type ReactNode } from 'react'
import type { StaticData, StaticRuneTree } from '@shared/types'
import { SHARD_ROWS, draftOf, isComplete, perksOf, pickRune, pickShard, pickTree, progress, type RuneDraft } from '@shared/runes'
import { useT, type Key } from '../i18n'
import { Tip, TextTip, runeTip } from './Tooltip'

// Edited pages live here so they survive leaving the page and coming back (per champion + lane + page).
const edits = new Map<string, RuneDraft>()

export const clearEdit = (key: string) => void edits.delete(key)

// the page as it should be applied: the edited one if there is one (null while an edit is incomplete)
export function pagePerks(key: string, base: number[], st: StaticData): number[] | null {
  const d = edits.get(key)
  return d ? (isComplete(d) ? perksOf(d, st.trees) : null) : base
}

export function useRuneEdit(key: string, base: number[], st: StaticData) {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const stored = edits.get(key)
  const draft = stored ?? draftOf(base, st.trees)
  return {
    draft,
    edited: !!stored,
    complete: isComplete(draft),
    perks: perksOf(draft, st.trees),
    set(d: RuneDraft) {
      if (JSON.stringify(d) === JSON.stringify(draftOf(base, st.trees))) edits.delete(key)
      else edits.set(key, d)
      bump()
    },
    reset() {
      edits.delete(key)
      bump()
    }
  }
}

const RING = 'shadow-[0_0_0_2px_rgba(200,170,110,.95),0_0_16px_-2px_rgba(200,170,110,.6)]'

function RuneBtn({ id, st, on, size, pick }: { id: number; st: StaticData; on: boolean; size: number; pick?: () => void }) {
  const r = st.runes[id]
  const look = `grid shrink-0 place-items-center !rounded-full transition-all duration-150 ${
    on ? `bg-black/50 ${RING}` : `opacity-[.42] grayscale ${pick ? 'cursor-pointer hover:opacity-100 hover:grayscale-0 hover:shadow-[0_0_0_1.5px_rgba(200,170,110,.55)]' : ''}`
  }`
  const img = r?.icon ? (
    <img src={r.icon} alt={r.name} draggable={false} loading="lazy" decoding="async" style={{ width: size - 4, height: size - 4 }} />
  ) : (
    <span className="size-2 rounded-full bg-gold/70" />
  )
  return (
    <Tip tip={runeTip(st, id)} native={!!pick} className="!rounded-full">
      {pick ? (
        <button type="button" role="checkbox" aria-checked={on} aria-label={r?.name} onClick={pick} style={{ width: size, height: size }} className={`no-drag ${look}`}>
          {img}
        </button>
      ) : (
        <span style={{ width: size, height: size }} className={look}>{img}</span>
      )}
    </Tip>
  )
}

function Row({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`flex flex-wrap items-center ${wide ? 'gap-x-5' : 'gap-x-3.5'} gap-y-2 rounded-xl bg-white/[.025] px-3 py-2`}>{children}</div>
}

function TreeHead({ tree, label }: { tree?: StaticRuneTree; label?: string }) {
  if (!tree) return <div className="mb-2.5 h-5" />
  return (
    <div className="mb-2.5 flex items-center gap-2">
      {tree.icon && <img src={tree.icon} alt="" width={20} height={20} style={{ width: 20, height: 20 }} />}
      <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-gold">{tree.name}</span>
      {label && <span className="text-[10.5px] text-mute">· {label}</span>}
    </div>
  )
}

function TreePicker({ trees, value, onPick }: { trees: StaticRuneTree[]; value: number; onPick: (id: number) => void }) {
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t('runes.tree')} className="mb-3 flex flex-wrap gap-2">
      {trees.map((tr) => {
        const on = tr.id === value
        return (
          <Tip key={tr.id} tip={<TextTip icon={tr.icon} title={tr.name} />} native className="!rounded-full">
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={tr.name}
              onClick={() => onPick(tr.id)}
              className={`no-drag grid size-10 place-items-center !rounded-full transition-all duration-150 ${on ? `bg-black/50 ${RING}` : 'cursor-pointer opacity-45 grayscale hover:opacity-100 hover:grayscale-0 hover:shadow-[0_0_0_1.5px_rgba(200,170,110,.55)]'}`}
            >
              <img src={tr.icon} alt="" draggable={false} className="size-6" />
            </button>
          </Tip>
        )
      })}
    </div>
  )
}

function Chip({ label, n, of }: { label: string; n: number; of: number }) {
  const ok = n === of
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${ok ? 'border-win/40 bg-win/10 text-win' : 'border-yellow-500/35 bg-yellow-500/10 text-yellow-300'}`}>
      {ok ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m2.5 6.2 2.4 2.3 4.6-5" /></svg>
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {label} {n}/{of}
    </span>
  )
}

const SHARD_LABEL: Key[] = ['runes.offense', 'runes.flex', 'runes.defense']

// The rune page, large. Without onChange it is a read-only view; with it every rune is a button following the client's rules.
export function RuneBoard({ draft, st, onChange }: { draft: RuneDraft; st: StaticData; onChange?: (d: RuneDraft) => void }) {
  const t = useT()
  const sel = new Set(draft.perks)
  const primary = st.trees.find((x) => x.id === draft.primary)
  const secondary = st.trees.find((x) => x.id === draft.secondary)
  const go = (fn: (d: RuneDraft) => RuneDraft) => (onChange ? () => onChange(fn(draft)) : undefined)
  const prog = progress(draft)
  return (
    <div>
      <div className="flex flex-wrap gap-x-9 gap-y-6">
        <section className="min-w-0 flex-[1_1_270px]">
          {onChange ? <TreePicker trees={st.trees} value={draft.primary} onPick={(id) => onChange(pickTree(draft, 'primary', id))} /> : null}
          <TreeHead tree={primary} label={t('runes.primary')} />
          <div className="flex flex-col gap-2">
            {primary?.slots.slice(0, 4).map((row, i) => (
              <Row key={i} wide={i === 0}>
                {row.map((id) => (
                  <RuneBtn key={id} id={id} st={st} on={sel.has(id)} size={i === 0 ? 52 : 40} pick={go((d) => pickRune(d, st.trees, id))} />
                ))}
              </Row>
            ))}
          </div>
        </section>

        <section className="min-w-0 flex-[1_1_230px]">
          {onChange ? <TreePicker trees={st.trees.filter((x) => x.id !== draft.primary)} value={draft.secondary} onPick={(id) => onChange(pickTree(draft, 'secondary', id))} /> : null}
          <TreeHead tree={secondary} label={t('runes.secondary')} />
          <div className="flex flex-col gap-2">
            {secondary?.slots.slice(1, 4).map((row, i) => (
              <Row key={i}>
                {row.map((id) => (
                  <RuneBtn key={id} id={id} st={st} on={sel.has(id)} size={40} pick={go((d) => pickRune(d, st.trees, id))} />
                ))}
              </Row>
            ))}
          </div>

          <div className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{t('runes.shards')}</div>
          <div className="flex flex-col gap-2">
            {SHARD_ROWS.map((row, r) => (
              <Row key={r}>
                <span className="w-[62px] shrink-0 text-[10.5px] font-medium text-mute">{t(SHARD_LABEL[r])}</span>
                {row.map((id) => (
                  <RuneBtn key={id} id={id} st={st} on={draft.perks[6 + r] === id} size={34} pick={go((d) => pickShard(d, r, id))} />
                ))}
              </Row>
            ))}
          </div>
        </section>
      </div>

      {onChange && !isComplete(draft) && (
        <div className="mt-4 flex flex-wrap items-center gap-2" aria-live="polite">
          <Chip label={t('runes.primary')} n={prog.primary} of={4} />
          <Chip label={t('runes.secondary')} n={prog.secondary} of={2} />
          <Chip label={t('runes.shards')} n={prog.shards} of={3} />
        </div>
      )}
    </div>
  )
}

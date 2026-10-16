import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`no-drag relative h-[26px] w-[46px] shrink-0 rounded-full border transition-all duration-200 ${
        checked
          ? 'border-blue/60 bg-gradient-to-b from-[#4b8ff7] to-[#2f6fe0] shadow-[0_0_14px_-2px_rgba(59,130,246,.55)]'
          : 'border-line bg-[#1c2230] hover:border-[#2f384c]'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] size-5 rounded-full shadow-md transition-all duration-200 ease-out ${
          checked ? 'translate-x-5 bg-white' : 'bg-[#8a93a6]'
        }`}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value, options, onChange, size = 'md', label
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  label?: string
}) {
  const pad = size === 'sm' ? 'h-6 px-2 text-[11px] md:px-2.5' : 'h-8 px-2.5 text-[13px] sm:px-3.5'
  return (
    <div role="radiogroup" aria-label={label} className="no-drag inline-flex rounded-lg border border-line bg-[#12161d] p-0.5">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            title={o.title}
            aria-label={o.title}
            onClick={() => onChange(o.value)}
            className={`${pad} rounded-md font-medium transition-all duration-150 ${
              on ? 'bg-[#232a3a] text-fg shadow-[inset_0_0_0_1px_rgba(200,170,110,.35)]' : 'text-mute hover:text-fg'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Select<T extends string>({
  value, options, onChange, label, align = 'left', compact, collapse
}: {
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  label: string
  align?: 'left' | 'right'
  compact?: boolean
  collapse?: boolean // icon-only below md
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('pointerdown', down)
    addEventListener('keydown', key)
    return () => { removeEventListener('pointerdown', down); removeEventListener('keydown', key) }
  }, [open])
  const cur = options.find((o) => o.value === value)
  return (
    <div ref={ref} className="no-drag relative">
      <button
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg border bg-[#12161d] font-medium max-w-full transition-colors duration-150 hover:border-[#2f384c] ${
          open ? 'border-gold/50' : 'border-line'
        } ${compact ? `h-7 text-[12px] ${collapse ? 'gap-1.5 pl-2 pr-1.5 md:gap-2 md:pl-2.5 md:pr-2' : 'pl-2.5 pr-2'}` : 'h-9 pl-3 pr-2.5 text-[13px]'}`}
      >
        {cur?.icon}
        <span className={`truncate ${collapse ? 'hidden md:inline' : ''}`}>{cur?.label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" className={`shrink-0 text-mute transition-transform duration-150 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3.75 5 6.75 8 3.75" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className={`fade-up absolute z-40 mt-1.5 max-h-[60vh] min-w-full max-w-[calc(100vw-16px)] overflow-y-auto whitespace-nowrap rounded-xl border border-line bg-[#171c26] p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,.7)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {options.map((o) => (
            <button
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`flex w-full items-center justify-between gap-4 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-[#232a3a] ${
                o.value === value ? 'text-gold' : 'text-fg'
              }`}
            >
              <span className="flex items-center gap-2">{o.icon}{o.label}</span>
              {o.value === value && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m2.5 6.2 2.4 2.3 4.6-5" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Slider({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="lolay-range no-drag w-32 sm:w-44"
      style={{ ['--p' as string]: `${pct}%` }}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-card ${className}`}>{children}</section>
}

export function Eyebrow({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{children}</h3>
      {right}
    </div>
  )
}

export function Button({ children, onClick, variant = 'primary', className = '', disabled }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'success'; className?: string; disabled?: boolean }) {
  const v = {
    primary: 'bg-gradient-to-b from-[#4b8ff7] to-[#2f6fe0] text-white shadow-[0_6px_18px_-8px_rgba(59,130,246,.9)] hover:brightness-110',
    success: 'bg-gradient-to-b from-[#2fd16b] to-[#16a34a] text-[#04180b] shadow-[0_8px_26px_-8px_rgba(34,197,94,.8)] hover:brightness-110',
    danger: 'border border-loss/60 text-loss hover:bg-loss/10',
    ghost: 'border border-line bg-[#12161d] text-fg hover:border-[#2f384c] hover:bg-[#1a2030]'
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`no-drag inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-150 active:scale-[.97] disabled:opacity-50 ${v} ${className}`}
    >
      {children}
    </button>
  )
}

import { useCallback, useRef, useState } from 'react'

export type ToastKind = 'ok' | 'err' | 'info'
export interface ToastItem { id: number; msg: string; kind: ToastKind }
export type PushToast = (msg: string, kind?: ToastKind) => void

export function useToasts(): [ToastItem[], PushToast] {
  const [list, setList] = useState<ToastItem[]>([])
  const id = useRef(0)
  const push = useCallback<PushToast>((msg, kind = 'info') => {
    const n = ++id.current
    setList((l) => [...l.slice(-3), { id: n, msg, kind }])
    setTimeout(() => setList((l) => l.filter((x) => x.id !== n)), 2500)
  }, [])
  return [list, push]
}

const dot = { ok: 'bg-win', err: 'bg-loss', info: 'bg-blue' }

export function Toasts({ list }: { list: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed right-3 bottom-[76px] left-3 z-[60] flex flex-col items-end gap-2 sm:right-4 sm:bottom-4 sm:left-auto" role="status" aria-live="polite">
      {list.map((x) => (
        <div key={x.id} className="fade-up flex max-w-full items-center gap-2.5 rounded-xl border border-line bg-[#1a2030]/95 px-3.5 py-2.5 text-[13px] shadow-[0_12px_30px_-10px_rgba(0,0,0,.8)] backdrop-blur">
          <span className={`size-2 shrink-0 rounded-full ${dot[x.kind]}`} />
          {x.msg}
        </div>
      ))}
    </div>
  )
}

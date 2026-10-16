import { useCallback, useEffect, useState } from 'react'
import type { AppState, StaticData } from '@shared/types'

export function useAppState(): AppState | null {
  const [s, setS] = useState<AppState | null>(null)
  useEffect(() => {
    let live = true
    window.lolay.getState().then((v) => live && setS((cur) => cur ?? v))
    const off = window.lolay.onState((v) => live && setS(v))
    return () => { live = false; off() }
  }, [])
  return s
}

export function useStatic(lang: string | undefined, version: string | null | undefined) {
  const [data, setData] = useState<StaticData | null>(null)
  const [error, setError] = useState(false)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!lang) return
    let live = true
    setError(false)
    window.lolay.getStatic().then((d) => live && setData(d)).catch(() => live && setError(true))
    return () => { live = false }
  }, [lang, version, n])
  return { data, error, reload: useCallback(() => setN((x) => x + 1), []) }
}

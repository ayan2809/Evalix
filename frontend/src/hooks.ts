import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

export interface Async<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

/** Fetch once (and again when deps change). Keeps old data while reloading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let alive = true
    setLoading(true)
    fnRef
      .current()
      .then((d) => {
        if (!alive) return
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof ApiError ? e : new ApiError(String(e), false))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

/** Fetch now and every `ms` while `active(data)` is true. */
export function usePolling<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  ms: number,
  active: (d: T | null) => boolean,
): Async<T> {
  const state = useAsync(fn, deps)
  const { reload, data } = state
  const isActive = active(data)
  useEffect(() => {
    if (!isActive) return
    const t = setInterval(reload, ms)
    return () => clearInterval(t)
  }, [isActive, ms, reload])
  return state
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Evalix`
  }, [title])
}

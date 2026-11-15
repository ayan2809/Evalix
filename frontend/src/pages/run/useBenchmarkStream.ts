import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type BenchmarkDetail, type Ending } from '../../api'
import { usePolling, type Async } from '../../hooks'

/** One run as the live page sees it: what the server saved, plus what the stream said since. */
export interface LiveRun {
  id: string
  agentId: number
  taskId: string
  faultId: string
  trial: number
  /** null while the run is still going */
  ending: Ending
  faultFired: boolean
  /** The newest step the stream told us about. */
  lastStep: { kind: string; name: string } | null
  /** Order in which we first heard of it. */
  order: number
}

interface FromStream {
  agentId?: number
  taskId?: string
  faultId?: string
  trial?: number
  ending?: Ending
  faultFired?: boolean
  lastStep?: { kind: string; name: string; position: number }
  order: number
}

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const numOf = (v: unknown) => (typeof v === 'number' ? v : undefined)

function parse(e: Event): Data {
  try {
    const d = JSON.parse((e as MessageEvent).data)
    return d && typeof d === 'object' ? (d as Data) : {}
  } catch {
    return {}
  }
}

/**
 * The benchmark as saved (polled while it runs) plus the live stream of events, merged by run id.
 * A reload is safe: the saved copy has every finished run, and the stream replays its history.
 */
export function useBenchmarkStream(benchmarkId: string): {
  bench: Async<BenchmarkDetail>
  runs: LiveRun[]
} {
  const bench = usePolling<BenchmarkDetail>(
    () => api.getBenchmark(benchmarkId),
    [benchmarkId],
    3000,
    (d) => !d || d.status === 'running',
  )
  const store = useRef(new Map<string, FromStream>())
  const counter = useRef(0)
  const [version, setVersion] = useState(0)
  const reloadRef = useRef(bench.reload)
  reloadRef.current = bench.reload
  const loaded = bench.data !== null

  useEffect(() => {
    store.current = new Map()
    counter.current = 0
    setVersion((v) => v + 1)
  }, [benchmarkId])

  useEffect(() => {
    if (!loaded) return
    let timer: number | undefined
    // Many events can arrive at once (the history replay), so draw at most every 80 ms.
    const flush = () => {
      if (timer !== undefined) return
      timer = window.setTimeout(() => {
        timer = undefined
        setVersion((v) => v + 1)
      }, 80)
    }
    const touch = (id: string, fn: (r: FromStream) => void) => {
      if (!id) return
      let r = store.current.get(id)
      if (!r) {
        r = { order: counter.current++ }
        store.current.set(id, r)
      }
      fn(r)
      flush()
    }

    // Ask the server for its own count at most once in a while, however many events arrive.
    let reloadTimer: number | undefined
    const reloadSoon = () => {
      window.clearTimeout(reloadTimer)
      reloadTimer = window.setTimeout(() => reloadRef.current(), 500)
    }

    const es = new EventSource(api.eventsUrl(benchmarkId))
    es.addEventListener('run_started', (e) => {
      const d = parse(e)
      touch(str(d.run_id), (r) => {
        r.agentId = numOf(d.agent_id)
        r.taskId = str(d.task_id)
        r.faultId = str(d.fault_id)
        r.trial = numOf(d.trial)
      })
    })
    es.addEventListener('step', (e) => {
      const d = parse(e)
      const position = numOf(d.position) ?? 0
      touch(str(d.run_id), (r) => {
        if (!r.lastStep || position >= r.lastStep.position)
          r.lastStep = { kind: str(d.kind), name: str(d.name), position }
      })
    })
    es.addEventListener('fault_fired', (e) => {
      const d = parse(e)
      touch(str(d.run_id), (r) => {
        r.faultFired = true
      })
    })
    es.addEventListener('run_finished', (e) => {
      const d = parse(e)
      touch(str(d.run_id), (r) => {
        r.agentId = numOf(d.agent_id) ?? r.agentId
        r.taskId = str(d.task_id) || r.taskId
        r.faultId = d.fault_id === undefined ? r.faultId : str(d.fault_id)
        r.trial = numOf(d.trial) ?? r.trial
        r.ending = (str(d.ending) as Ending) || 'crashed'
        if (d.fault_fired === true) r.faultFired = true
      })
      reloadSoon()
    })
    es.addEventListener('benchmark_finished', () => {
      es.close()
      reloadSoon()
    })
    return () => {
      es.close()
      window.clearTimeout(timer)
      window.clearTimeout(reloadTimer)
    }
  }, [benchmarkId, loaded])

  const runs = useMemo<LiveRun[]>(() => {
    const out = new Map<string, LiveRun>()
    const saved = bench.data?.runs ?? []
    saved.forEach((row, i) => {
      out.set(row.id, {
        id: row.id,
        agentId: row.agent_id,
        taskId: row.task_id,
        faultId: row.fault_id,
        trial: row.trial,
        ending: row.ending,
        faultFired: row.fault_fired,
        lastStep: null,
        order: i,
      })
    })
    for (const [id, s] of store.current) {
      const base = out.get(id)
      if (!base && (s.agentId === undefined || s.taskId === undefined)) continue
      out.set(id, {
        id,
        agentId: s.agentId ?? base!.agentId,
        taskId: s.taskId ?? base!.taskId,
        faultId: s.faultId ?? base?.faultId ?? '',
        trial: s.trial ?? base?.trial ?? 1,
        ending: s.ending ?? base?.ending ?? null,
        faultFired: s.faultFired === true || base?.faultFired === true,
        lastStep: s.lastStep ? { kind: s.lastStep.kind, name: s.lastStep.name } : null,
        order: base ? base.order : 100000 + s.order,
      })
    }
    return [...out.values()].sort((a, b) => a.order - b.order)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bench.data, version])

  return { bench, runs }
}

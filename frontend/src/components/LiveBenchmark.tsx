import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type BenchmarkDetail, type Ending } from '../api'
import { badgeFor } from '../format'
import { Badge } from './Badge'
import { ErrorBox, Loading } from './States'
import { usePolling } from '../hooks'

const NEAR_MODEL_CALLS = 12
const NEAR_TOOL_CALLS = 16
const REPEAT_LIMIT = 3
const PAGE = 50

interface LiveStep {
  kind: string
  name: string
  input?: string
}

interface LiveRun {
  id: string
  agent: string
  task: string
  fault: string
  trial: number | null
  steps: Map<number, LiveStep>
  faultFired: string
  ending: Ending | undefined // undefined = still running
  seconds: number | null
}

type Data = Record<string, unknown>

const asStr = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const asNum = (v: unknown): number | null => (typeof v === 'number' ? v : null)

function warningFor(run: LiveRun): string {
  if (run.ending !== undefined) return ''
  const list = [...run.steps.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])
  const models = list.filter((s) => s.kind === 'model_call').length
  const tools = list.filter((s) => s.kind === 'tool_call')
  if (models >= NEAR_MODEL_CALLS) return `Close to the model call limit (${models} of 15)`
  if (tools.length >= NEAR_TOOL_CALLS) return `Close to the tool call limit (${tools.length} of 20)`
  // Same tool (and same input, when the event carries it) several times in a row.
  let streak = 1
  for (let i = tools.length - 1; i > 0; i--) {
    if (tools[i].name === tools[i - 1].name && tools[i].input === tools[i - 1].input) streak++
    else break
  }
  if (tools.length >= REPEAT_LIMIT && streak >= REPEAT_LIMIT) return `Calling the same tool again and again (${tools[tools.length - 1].name})`
  return ''
}

export function LiveBenchmark({ benchmarkId }: { benchmarkId: string }) {
  const bench = usePolling<BenchmarkDetail>(() => api.getBenchmark(benchmarkId), [benchmarkId], 3000, (d) => !d || d.status === 'running')
  const [runs, setRuns] = useState<Map<string, LiveRun>>(new Map())
  const [finishedByStream, setFinishedByStream] = useState(0)
  const [streamDone, setStreamDone] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [stopping, setStopping] = useState(false)
  const [stopError, setStopError] = useState('')
  const lookups = useRef<{ agents: Map<number, string>; tasks: Map<string, string>; faults: Map<string, string> }>({
    agents: new Map(),
    tasks: new Map(),
    faults: new Map(),
  })

  // Keep id -> name lookups fresh so events can carry ids or names.
  useEffect(() => {
    const d = bench.data
    if (!d) return
    lookups.current = {
      agents: new Map(d.agents.map((a) => [a.id, a.name])),
      tasks: new Map(d.tasks.map((t) => [t.id, t.title])),
      faults: new Map(d.faults.map((f) => [f.id, f.label])),
    }
  }, [bench.data])

  useEffect(() => {
    setRuns(new Map())
    setFinishedByStream(0)
    setStreamDone(false)
    const es = new EventSource(api.eventsUrl(benchmarkId))

    const parse = (e: MessageEvent): Data => {
      try {
        const d = JSON.parse(e.data)
        return d && typeof d === 'object' ? (d as Data) : {}
      } catch {
        return {}
      }
    }
    const update = (id: string, fn: (r: LiveRun) => void) =>
      setRuns((prev) => {
        const next = new Map(prev)
        const cur = next.get(id) ?? {
          id,
          agent: '',
          task: '',
          fault: '',
          trial: null,
          steps: new Map<number, LiveStep>(),
          faultFired: '',
          ending: undefined,
          seconds: null,
        }
        const copy: LiveRun = { ...cur, steps: new Map(cur.steps) }
        fn(copy)
        next.set(id, copy)
        return next
      })

    es.addEventListener('run_started', (e) => {
      const d = parse(e as MessageEvent)
      const id = asStr(d.run_id)
      if (!id) return
      const L = lookups.current
      const agentRaw = d.agent_name ?? d.agent
      const taskRaw = d.task_title ?? d.task ?? d.task_id
      const faultRaw = d.fault_label ?? d.fault ?? d.fault_id
      update(id, (r) => {
        r.agent = typeof agentRaw === 'number' ? (L.agents.get(agentRaw) ?? `Agent ${agentRaw}`) : asStr(agentRaw)
        r.task = L.tasks.get(asStr(taskRaw)) ?? asStr(taskRaw)
        r.fault = L.faults.get(asStr(faultRaw)) ?? asStr(faultRaw)
        r.trial = asNum(d.trial)
      })
    })
    es.addEventListener('step', (e) => {
      const d = parse(e as MessageEvent)
      const id = asStr(d.run_id)
      const pos = asNum(d.position)
      if (!id || pos === null) return
      update(id, (r) => {
        r.steps.set(pos, { kind: asStr(d.kind), name: asStr(d.name), input: d.input === undefined ? undefined : JSON.stringify(d.input) })
      })
    })
    es.addEventListener('fault_fired', (e) => {
      const d = parse(e as MessageEvent)
      const id = asStr(d.run_id)
      if (id) update(id, (r) => { r.faultFired = asStr(d.fault_label ?? d.fault ?? d.label) || 'fault' })
    })
    es.addEventListener('run_finished', (e) => {
      const d = parse(e as MessageEvent)
      const id = asStr(d.run_id)
      if (!id) return
      update(id, (r) => {
        r.ending = (asStr(d.ending) as Ending) || 'crashed'
        r.seconds = asNum(d.seconds)
        if (d.fault_fired === true && !r.faultFired) r.faultFired = r.fault || 'fault'
      })
      if (asStr(d.ending) !== 'setup_problem') setFinishedByStream((n) => n + 1)
    })
    es.addEventListener('benchmark_finished', () => {
      setStreamDone(true)
      es.close()
      bench.reload()
    })
    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkId])

  const list = useMemo(() => [...runs.values()].reverse(), [runs]) // newest first
  const d = bench.data
  const total = d?.total_runs ?? 0
  const done = Math.min(total || Infinity, Math.max(d?.done_runs ?? 0, finishedByStream))
  const finished = streamDone || (d !== null && d.status !== 'running')
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  async function stop() {
    setStopping(true)
    setStopError('')
    try {
      await api.cancelBenchmark(benchmarkId)
      bench.reload()
    } catch (e) {
      setStopError(e instanceof Error ? e.message : 'Could not stop')
      setStopping(false)
    }
  }

  if (bench.error && !d) return <div className="page"><ErrorBox error={bench.error} onRetry={bench.reload} /></div>
  if (!d) return <div className="page"><Loading /></div>

  const statusText =
    d.status === 'cancelled' ? 'Stopped' : finished ? 'Finished' : stopping ? 'Stopping… runs in progress will finish first' : 'Running'

  return (
    <div className="page">
      <h1>Benchmark #{d.id}</h1>
      <p className="lead">{statusText}</p>

      <div className="progress-wrap">
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-text">
          <span>{done} of {total} runs done</span>
          <span className="muted">{pct}%</span>
        </div>
      </div>

      <div className="actions">
        {!finished && (
          <button className="btn" onClick={stop} disabled={stopping}>
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
        {finished && (
          <Link className="btn primary" to={`/scoreboard?b=${d.id}`}>
            See the scoreboard
          </Link>
        )}
        {d.live_mode && <span className="muted small">Live web search is on, so this benchmark is left out of the scoreboard.</span>}
      </div>
      {stopError && <p className="small bad-text">{stopError}</p>}

      <h2>Runs</h2>
      {list.length === 0 ? (
        <p className="muted">{finished ? 'No runs were recorded.' : 'Waiting for the first run to start…'}</p>
      ) : (
        <ul className="runs">
          {list.slice(0, limit).map((r) => {
            const warn = warningFor(r)
            const stepCount = [...r.steps.values()].filter((s) => s.kind === 'model_call').length
            return (
              <li key={r.id} className="run-row">
                <div className="run-main">
                  <span className="strong">{r.agent || '…'}</span>
                  <span className="muted"> · </span>
                  <span>{r.fault ? `Fault: ${r.fault}` : r.task}</span>
                  {r.trial !== null && <span className="muted"> · try {r.trial}</span>}
                </div>
                <div className="run-side">
                  <span className="muted small">{stepCount} step{stepCount === 1 ? '' : 's'}</span>
                  {r.faultFired && <span className="tag fault-tag">Fault hit</span>}
                  {r.ending === undefined ? <Badge name="Running" /> : (
                    <Link to={`/runs/${r.id}`} className="plain">
                      <Badge name={badgeFor(r.ending, !!r.faultFired)} />
                    </Link>
                  )}
                </div>
                {warn && <div className="warn small">{warn}</div>}
              </li>
            )
          })}
        </ul>
      )}
      {list.length > limit && (
        <button className="link" onClick={() => setLimit(limit + PAGE)}>
          Show more ({list.length - limit} more runs)
        </button>
      )}
    </div>
  )
}

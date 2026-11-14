import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { shortDate } from '../format'
import { useAsync } from '../hooks'

interface Props {
  label: string
  value: string
  onChange: (runId: string) => void
}

/** Choose a run by benchmark, agent, task or fault, and try. Or paste a run id. */
export function RunPicker({ label, value, onChange }: Props) {
  const benches = useAsync(() => api.listBenchmarks(), [])
  const [bid, setBid] = useState('')
  const [agent, setAgent] = useState('')
  const [col, setCol] = useState('')
  const [trial, setTrial] = useState('')
  const [text, setText] = useState(value)
  const detail = useAsync(() => (bid ? api.getBenchmark(bid) : Promise.resolve(null)), [bid])

  // Reflect an externally set run id (URL, presets) in the dropdowns.
  useEffect(() => {
    setText(value)
    if (!value) return
    let alive = true
    api
      .getRun(value)
      .then((r) => {
        if (!alive) return
        setBid(String(r.benchmark_id))
        setAgent(String(r.agent_id))
        setCol(r.fault_id || r.task_id)
        setTrial(String(r.trial))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [value])

  const d = detail.data
  const columns = useMemo(() => {
    if (!d || !agent) return []
    const seen = new Map<string, string>()
    for (const r of d.runs) {
      if (String(r.agent_id) !== agent) continue
      const id = r.fault_id || r.task_id
      if (seen.has(id)) continue
      if (r.fault_id) seen.set(id, `Fault: ${d.faults.find((f) => f.id === r.fault_id)?.label ?? r.fault_id}`)
      else seen.set(id, d.tasks.find((t) => t.id === r.task_id)?.title ?? r.task_id)
    }
    return [...seen.entries()]
  }, [d, agent])
  const trials = useMemo(
    () => (d && agent && col ? d.runs.filter((r) => String(r.agent_id) === agent && (r.fault_id || r.task_id) === col).map((r) => r.trial).sort() : []),
    [d, agent, col],
  )

  function pick(next: { agent?: string; col?: string; trial?: string }) {
    const a = next.agent ?? agent
    const c = next.col ?? col
    const t = next.trial ?? trial
    if (next.agent !== undefined) { setAgent(a); setCol(''); setTrial('') }
    if (next.col !== undefined) { setCol(c); setTrial('') }
    if (next.trial !== undefined) setTrial(t)
    if (!d || !a || !c || !t) return
    const run = d.runs.find((r) => String(r.agent_id) === a && (r.fault_id || r.task_id) === c && String(r.trial) === t)
    if (run) onChange(run.id)
  }

  return (
    <div className="picker-card">
      <div className="strong">{label}</div>
      <div className="picker-grid">
        <label>
          <span className="muted small">Benchmark</span>
          <select value={bid} onChange={(e) => { setBid(e.target.value); setAgent(''); setCol(''); setTrial('') }}>
            <option value="">Choose…</option>
            {benches.data?.map((b) => (
              <option key={b.id} value={b.id}>#{b.id} · {shortDate(b.created_at)}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Agent</span>
          <select value={agent} disabled={!d} onChange={(e) => pick({ agent: e.target.value })}>
            <option value="">Choose…</option>
            {d?.agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Task or fault</span>
          <select value={col} disabled={!agent} onChange={(e) => pick({ col: e.target.value })}>
            <option value="">Choose…</option>
            {columns.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Try</span>
          <select value={trial} disabled={!col} onChange={(e) => pick({ trial: e.target.value })}>
            <option value="">Choose…</option>
            {trials.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <form
        className="paste"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) onChange(text.trim())
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="or paste a run id, e.g. r_ab12cd34" aria-label={`${label} run id`} />
        <button className="btn" disabled={!text.trim() || text.trim() === value}>Use</button>
      </form>
    </div>
  )
}

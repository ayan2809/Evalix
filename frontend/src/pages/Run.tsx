import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { LiveBenchmark } from '../components/LiveBenchmark'
import { Tooltip } from '../components/Tooltip'
import { ErrorBox, Loading } from '../components/States'
import { useAsync, useTitle } from '../hooks'

export default function Run() {
  const { benchmarkId } = useParams()
  useTitle('Run')
  if (benchmarkId) return <LiveBenchmark benchmarkId={benchmarkId} />
  return <RunForm />
}

function RunForm() {
  const navigate = useNavigate()
  const agents = useAsync(() => api.listAgents(), [])
  const tasks = useAsync(() => api.listTasks(), [])
  const faults = useAsync(() => api.listFaults(), [])

  const [picked, setPicked] = useState<Record<number, boolean>>({})
  const [normal, setNormal] = useState(true)
  const [withFaults, setWithFaults] = useState(true)
  const [trials, setTrials] = useState(3)
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState('')

  const error = agents.error ?? tasks.error ?? faults.error
  const ready = agents.data && tasks.data && faults.data

  // Online agents are pre-checked until the person touches a checkbox.
  const isChecked = (id: number, online: boolean) => picked[id] ?? online
  const agentIds = useMemo(
    () => (agents.data ?? []).filter((a) => isChecked(a.id, a.online)).map((a) => a.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agents.data, picked],
  )

  const taskCount = normal ? (tasks.data?.length ?? 0) : 0
  const faultCount = withFaults ? (faults.data?.length ?? 0) : 0
  const total = agentIds.length * (taskCount + faultCount) * trials

  async function start() {
    setBusy(true)
    setStartError('')
    try {
      const res = await api.startBenchmark({
        agent_ids: agentIds,
        task_ids: normal ? (tasks.data ?? []).map((t) => t.id) : [],
        fault_ids: withFaults ? (faults.data ?? []).map((f) => f.id) : [],
        trials,
        live_mode: live,
      })
      navigate(`/run/${res.id}`)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Could not start the benchmark')
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Run a benchmark</h1>
      <p className="lead">Pick the agents to test and what to test them on.</p>

      {error && <ErrorBox error={error} onRetry={() => { agents.reload(); tasks.reload(); faults.reload() }} />}
      {!error && !ready && <Loading />}

      {ready && (
        <>
          <section className="section">
            <h2>Agents</h2>
            {agents.data!.length === 0 ? (
              <p className="muted">
                No agents yet. <Link to="/agents">Add one first.</Link>
              </p>
            ) : (
              <div className="checklist">
                {agents.data!.map((a) => (
                  <label key={a.id} className="check">
                    <input
                      type="checkbox"
                      checked={isChecked(a.id, a.online)}
                      onChange={(e) => setPicked({ ...picked, [a.id]: e.target.checked })}
                    />
                    <span className="strong">{a.name}</span>
                    <span className={`dot ${a.online ? 'on' : 'off'}`} aria-hidden />
                    <span className="muted small">{a.online ? 'online' : 'offline'}</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h2>What to test</h2>
            <div className="checklist">
              <label className="check">
                <input type="checkbox" checked={normal} onChange={(e) => setNormal(e.target.checked)} />
                <span className="strong">Normal tasks</span>
                <span className="muted small">{tasks.data!.length} tasks</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={withFaults} onChange={(e) => setWithFaults(e.target.checked)} />
                <span className="strong">With faults</span>
                <span className="muted small">{faults.data!.length} things that break on purpose</span>
              </label>
            </div>
          </section>

          <section className="section">
            <h2>
              Tries per task <Tooltip text="Each task is run several times, because one run can be luck. 3 gives a fairer picture." />
            </h2>
            <div className="segmented" role="radiogroup" aria-label="Tries per task">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={trials === n}
                  className={trials === n ? 'active' : ''}
                  onClick={() => setTrials(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          <section className="section">
            <label className="check">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              <span className="strong">Use live web search</span>
              <Tooltip text="Searches the real web instead of the saved results. Live runs are left out of the scoreboard." />
            </label>
          </section>

          <div className="actions">
            <button className="btn primary large" disabled={busy || total === 0} onClick={start}>
              {busy ? 'Starting…' : 'Run'}
            </button>
            <span className="muted">
              {total === 0
                ? 'Pick at least one agent and one kind of test.'
                : `This will start ${total} run${total === 1 ? '' : 's'} (${agentIds.length} agent${agentIds.length === 1 ? '' : 's'} × ${taskCount + faultCount} test${taskCount + faultCount === 1 ? '' : 's'} × ${trials} ${trials === 1 ? 'try' : 'tries'}).`}
            </span>
          </div>
          {startError && <p className="small bad-text">{startError}</p>}
        </>
      )}
    </div>
  )
}

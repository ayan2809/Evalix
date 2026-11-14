import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, extras } from '../api'
import { MiniBadge } from '../components/Badge'
import { Grid } from '../components/Grid'
import { SummaryTable } from '../components/SummaryTable'
import { Empty, ErrorBox, Loading } from '../components/States'
import { shortDate } from '../format'
import { useAsync, usePolling, useTitle } from '../hooks'

export default function Scoreboard() {
  useTitle('Scoreboard')
  const [params, setParams] = useSearchParams()
  const list = useAsync(() => api.listBenchmarks(), [])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')
  const chosen = params.get('b') ?? (list.data && list.data.length > 0 ? String(list.data[0].id) : null)

  const bench = usePolling(
    () => (chosen ? api.getBenchmark(chosen) : Promise.resolve(null)),
    [chosen],
    3000,
    (d) => d?.status === 'running',
  )

  if (list.error) return <div className="page"><ErrorBox error={list.error} onRetry={list.reload} /></div>
  if (!list.data) return <div className="page"><Loading /></div>
  if (list.data.length === 0) {
    return (
      <div className="page">
        <h1>Scoreboard</h1>
        <Empty>
          No benchmarks yet. <Link to="/run">Start one on the Run page.</Link>
        </Empty>
      </div>
    )
  }

  const d = bench.data

  async function sendToMaxim() {
    if (!chosen) return
    setSending(true)
    try {
      const r = await extras.exportToMaxim(chosen)
      setSent(r.ok ? `Sent ${r.traces_sent} runs to Maxim` : r.note)
    } catch (e) {
      setSent(e instanceof Error ? e.message : 'Could not send to Maxim')
    } finally {
      setSending(false)
    }
  }
  const nameOf = (id: number) => d?.agents.find((a) => a.id === id)?.name ?? `Agent ${id}`

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Scoreboard</h1>
        <div className="head-actions">
        <label className="picker">
          <span className="muted small">Benchmark</span>
          <select
            value={chosen ?? ''}
            onChange={(e) => { setSent(''); setParams({ b: e.target.value }) }}
            aria-label="Choose a benchmark"
          >
            {list.data.map((b) => (
              <option key={b.id} value={b.id}>
                #{b.id} · {shortDate(b.created_at)} · {b.status} · {b.done_runs}/{b.total_runs} runs{b.live_mode ? ' · live' : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={sendToMaxim} disabled={sending || d?.status === 'running'}>
          {sending ? 'Sending…' : 'Send to Maxim'}
        </button>
        </div>
      </div>
      {sent && <p className="muted small" role="status">{sent}</p>}

      {bench.error && !d && <ErrorBox error={bench.error} onRetry={bench.reload} />}
      {!d && !bench.error && <Loading />}
      {d && (
        <>
          <p className="lead">
            {d.status === 'running' ? (
              <>Running: {d.done_runs} of {d.total_runs} runs done. Updating every few seconds. <Link to={`/run/${d.id}`}>Watch live</Link></>
            ) : d.status === 'cancelled' ? (
              <>Stopped after {d.done_runs} of {d.total_runs} runs.</>
            ) : (
              <>{d.done_runs} runs, {d.trials} {d.trials === 1 ? 'try' : 'tries'} per task.</>
            )}
            {d.live_mode && <> Live web search was on, so these are not comparable with saved-search runs.</>}
          </p>

          {d.summary.length === 0 ? (
            <Empty>No finished runs yet.</Empty>
          ) : (
            <section className="section">
              <SummaryTable summary={d.summary} agentName={nameOf} />
              <p className="muted small note">
                Three tries is a small sample, so every percentage is shown next to the plain count.
              </p>
            </section>
          )}

          <section className="section">
            <h2>Every run</h2>
            <p className="legend small muted">
              <span><MiniBadge name="Pass" title="Pass" /> Pass</span>
              <span><MiniBadge name="Fail" title="Fail" /> Fail</span>
              <span><MiniBadge name="Recovered" title="Recovered" /> Recovered (passed after a fault)</span>
              <span><MiniBadge name="Setup problem" title="Setup problem" /> Setup problem</span>
              <span><MiniBadge name="Running" title="Running" /> Running</span>
              <span>One badge per try. Click one to open it.</span>
            </p>
            {d.grid.length === 0 ? <Empty>No runs yet.</Empty> : <Grid d={d} />}
          </section>
        </>
      )}
    </div>
  )
}

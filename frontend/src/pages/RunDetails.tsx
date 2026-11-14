import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { Badge } from '../components/Badge'
import { ReviewCard } from '../components/ReviewCard'
import { StatChip } from '../components/StatChip'
import { StepList } from '../components/StepList'
import { ErrorBox, Loading } from '../components/States'
import { badgeFor, money, num, plainResult, secs, stepCount } from '../format'
import { useAsync, useTitle } from '../hooks'

export default function RunDetails() {
  const { id = '' } = useParams()
  useTitle('Run details')
  const run = useAsync(() => api.getRun(id), [id])

  if (run.error) return <div className="page"><ErrorBox error={run.error} onRetry={run.reload} /></div>
  const r = run.data
  if (!r) return <div className="page"><Loading /></div>

  const steps = Array.isArray(r.steps) ? r.steps : []
  const ans = r.answer_json
  const sources = ans?.sources ?? []
  const answerEntries = ans?.answer ? Object.entries(ans.answer) : []

  return (
    <div className="page">
      <p className="crumbs small muted">
        <Link to={`/scoreboard?b=${r.benchmark_id}`}>Scoreboard</Link> / {r.agent_name} / {r.fault_label ? `Fault: ${r.fault_label}` : r.task_title}
      </p>
      <div className="result-line">
        <Badge name={badgeFor(r.ending, r.fault_fired)} />
        <span className="result-text">{plainResult(r)}</span>
      </div>
      <h1 className="subtle-title">
        {r.agent_name} · {r.task_title}
        {r.fault_label && <> · <span className="fault-text">Fault: {r.fault_label}</span></>}
        <span className="muted"> · try {r.trial}</span>
      </h1>

      <div className="chips">
        <StatChip label="Steps" value={num(stepCount(r))} title="Number of model calls the agent made" />
        <StatChip label="Tool calls" value={num(r.tool_calls)} />
        <StatChip label="Tokens" value={num(r.tokens_in + r.tokens_out)} title={`${num(r.tokens_in)} in, ${num(r.tokens_out)} out`} />
        <StatChip label="Cost" value={money(r.cost_usd)} />
        <StatChip label="Time" value={secs(r.seconds)} />
        <StatChip label="Fault" value={r.fault_label ? (r.fault_fired ? `${r.fault_label} (hit)` : `${r.fault_label} (not hit)`) : 'None'} />
        {r.looped && <StatChip label="Looped" value="Same tool, same input, 3+ times" />}
      </div>

      <div className="actions">
        <Link className="btn" to={`/compare?a=${encodeURIComponent(r.id)}`}>Compare with…</Link>
      </div>

      <section className="section">
        <h2>Agent's answer</h2>
        {!ans ? (
          <p className="muted">The agent gave no answer.</p>
        ) : (
          <div className="card flat">
            <p className="small muted">
              {ans.status === 'blocked' ? 'The agent stopped instead of answering.' : 'The agent answered:'}
            </p>
            {answerEntries.length > 0 && (
              <dl className="kv">
                {answerEntries.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {ans.reason && <p>Reason given: {ans.reason}</p>}
            {sources.length > 0 && (
              <>
                <p className="small muted">Sources</p>
                <ul className="sources">
                  {sources.slice(0, 20).map((s) => (
                    <li key={s} className="mono small">{s}</li>
                  ))}
                </ul>
                {sources.length > 20 && <p className="muted small">and {sources.length - 20} more</p>}
              </>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <h2>Steps <span className="muted small">({steps.length})</span></h2>
        <StepList steps={steps} faultLabel={r.fault_label} />
      </section>

      <ReviewCard key={r.id} runId={r.id} review={r.review_json} finished={r.ending !== null} />
    </div>
  )
}

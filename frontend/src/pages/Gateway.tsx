import { useState } from 'react'
import { ApiError, extras, type GatewayTestResult } from '../api'
import { ErrorBox } from '../components/States'
import { useTitle } from '../hooks'

export default function Gateway() {
  useTitle('Gateway')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GatewayTestResult | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      setResult(await extras.gatewayTest())
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(String(e), false))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Gateway test</h1>
      <p className="lead">
        Bifrost switches to a backup model when the main one is down. Agents notice nothing.
      </p>
      <button className="btn primary" onClick={run} disabled={busy}>
        {busy ? 'Running…' : 'Run gateway test'}
      </button>
      <p className="muted small note">This sends one tiny request and is not part of any agent's score.</p>

      {error && <ErrorBox error={error} onRetry={run} />}
      {result && (
        <section className="section">
          <h2>{result.ok ? 'The backup model took over' : 'No switch was seen'}</h2>
          <dl className="facts">
            <dt>Main model</dt>
            <dd>{result.main_model} (asked {result.main_model_hits} {result.main_model_hits === 1 ? 'time' : 'times'}, always down)</dd>
            <dt>Answered by</dt>
            <dd>{result.answered_by || 'nobody'}</dd>
            <dt>Reply</dt>
            <dd>{result.reply_text || 'none'}</dd>
            <dt>Time</dt>
            <dd>{result.seconds} seconds</dd>
          </dl>
          <p className="muted small note">{result.note}</p>
        </section>
      )}
    </div>
  )
}

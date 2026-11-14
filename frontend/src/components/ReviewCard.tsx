import { useState } from 'react'
import { api, type Review } from '../api'

const GROUND: Record<string, string> = {
  grounded: 'Grounded in what it read',
  partly: 'Partly grounded',
  not_grounded: 'Not grounded in what it read',
}
const FAULT: Record<string, string> = {
  handled: 'Handled the fault',
  partly: 'Partly handled the fault',
  poorly: 'Handled the fault poorly',
  no_fault: 'No fault in this run',
}

interface Props {
  runId: string
  review: Review | null
  finished: boolean
}

export function ReviewCard({ runId, review: initial, finished }: Props) {
  const [review, setReview] = useState<Review | null>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function run() {
    setBusy(true)
    setErr('')
    try {
      setReview(await api.reviewRun(runId))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not run the review')
    } finally {
      setBusy(false)
    }
  }

  const valid =
    review &&
    typeof review.reasoning_score === 'number' &&
    review.groundedness &&
    review.fault_handling &&
    typeof review.critique === 'string'

  return (
    <section className="card">
      <h2>Review</h2>
      <p className="muted small">A second opinion from an AI reviewer. It never changes the score.</p>
      {valid && review ? (
        <>
          <div className="chips">
            <span className="chip"><span className="chip-label">Reasoning</span><span className="chip-value">{review.reasoning_score}/5</span></span>
            <span className="chip"><span className="chip-value">{GROUND[review.groundedness!] ?? review.groundedness}</span></span>
            {review.fault_handling !== 'no_fault' && (
              <span className="chip"><span className="chip-value">{FAULT[review.fault_handling!] ?? review.fault_handling}</span></span>
            )}
          </div>
          {review.critique && <p>{review.critique}</p>}
        </>
      ) : review?.error ? (
        <p className="muted">Review not available.</p>
      ) : (
        <p className="muted">No review yet.</p>
      )}
      {!valid && (
        <button className="btn" onClick={run} disabled={busy || !finished}>
          {busy ? 'Reviewing…' : review?.error ? 'Try the review again' : 'Review this run'}
        </button>
      )}
      {err && <p className="small bad-text">{err}</p>}
    </section>
  )
}

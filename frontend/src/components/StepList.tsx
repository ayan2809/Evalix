import { useState } from 'react'
import type { Step } from '../api'
import { StepRow } from './StepRow'

const PAGE = 50

export function StepList({ steps, faultLabel }: { steps: Step[]; faultLabel?: string }) {
  const [limit, setLimit] = useState(PAGE)
  if (steps.length === 0) return <p className="muted">No steps were recorded.</p>
  return (
    <div className="steps">
      {steps.slice(0, limit).map((s) => (
        <StepRow key={s.id} step={s} faultLabel={faultLabel} />
      ))}
      {steps.length > limit && (
        <button className="link" onClick={() => setLimit(limit + PAGE)}>
          Show more ({steps.length - limit} more steps)
        </button>
      )}
    </div>
  )
}

import { useState } from 'react'
import { api, type Step } from '../api'
import { prettyText } from '../format'

const MAX_CHARS = 20000

export function kindLabel(step: Pick<Step, 'kind' | 'name'>): string {
  if (step.kind === 'model_call') return 'Model call'
  if (step.kind === 'final_answer') return 'Final answer'
  return `Tool: ${step.name}`
}

const KIND_GLYPH: Record<string, string> = { model_call: '◇', tool_call: '▸', final_answer: '■' }

function Block({ title, text }: { title: string; text: string }) {
  if (!text) return null
  const cut = text.length > MAX_CHARS
  return (
    <div className="block">
      <div className="block-title">{title}</div>
      <pre>{cut ? text.slice(0, MAX_CHARS) + '\n… (cut for display)' : text}</pre>
    </div>
  )
}

interface Props {
  step: Step
  faultLabel?: string
  differs?: boolean
}

/** One step: a single line, collapsed by default. Full text is fetched only on request. */
export function StepRow({ step, faultLabel, differs }: Props) {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState<Step | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [fullError, setFullError] = useState('')

  const shown = full ?? step
  const isFault = !!step.fault
  const failed = step.status_code >= 400

  async function showFull() {
    setLoadingFull(true)
    setFullError('')
    try {
      setFull(await api.getStep(step.id))
    } catch (e) {
      setFullError(e instanceof Error ? e.message : 'Could not load the full step')
    } finally {
      setLoadingFull(false)
    }
  }

  return (
    <div className={`step${isFault ? ' fault' : ''}${differs ? ' differs' : ''}`}>
      <button className="step-line" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="step-caret">{open ? '▾' : '▸'}</span>
        <span className="step-pos">#{step.position}</span>
        <span className="step-kind">
          <span className="kind-glyph" aria-hidden>
            {KIND_GLYPH[step.kind] ?? '·'}
          </span>
          {kindLabel(step)}
        </span>
        {isFault && <span className="tag fault-tag">Fault: {faultLabel || step.fault}</span>}
        <span className={`step-status${failed ? ' bad' : ''}`}>{failed ? `Error ${step.status_code}` : 'OK'}</span>
        <span className="step-ms">{step.ms} ms</span>
      </button>
      {open && (
        <div className="step-body">
          <Block title="Input" text={prettyText(shown.input_json)} />
          <Block title="Output" text={prettyText(shown.output_json)} />
          {!prettyText(shown.input_json) && !prettyText(shown.output_json) && <p className="muted small">Nothing recorded.</p>}
          {step.truncated && !full && (
            <button className="link" onClick={showFull} disabled={loadingFull}>
              {loadingFull ? 'Loading…' : 'Show full'}
            </button>
          )}
          {fullError && <p className="small bad-text">{fullError}</p>}
        </div>
      )}
    </div>
  )
}

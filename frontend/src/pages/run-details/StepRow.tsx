import { useEffect, useRef } from 'react'
import { api, type Step } from '../../api'
import { prettyText } from '../../format'
import { useAsync } from '../../hooks'
import { Chip } from '../../ui'
import { duration } from '../results/words'
import { faultMarker, type StepTone, type StepWords } from './steps'

/** The raw request and response of one step. Fetched when the step is opened. */
function Raw({ step }: { step: Step }) {
  const full = useAsync(() => api.getStep(step.id), [step.id])
  const s = full.data ?? step
  const input = prettyText(s.input_json)
  const output = prettyText(s.output_json)
  return (
    <div className="rd-raw">
      {full.loading && !full.data && <p className="tag">Loading the full text…</p>}
      {full.error && <p className="tag">Couldn't load the full text, so this is the short version.</p>}
      <div>
        <span className="tag">What it sent</span>
        <pre className="raw">{input || 'Nothing'}</pre>
      </div>
      <div>
        <span className="tag">What came back</span>
        <pre className="raw">{output || 'Nothing'}</pre>
      </div>
    </div>
  )
}

/** "0.0 s" for the moment a step starts, or a dash when the run has no clock for it. */
function startsAt(step: Step): string {
  return step.at_ms === null || step.at_ms === undefined ? '–' : `${(step.at_ms / 1000).toFixed(1)} s`
}

/**
 * One step in the table: a row you can unfold to read the raw request and response.
 * `open` is controlled so the timing diagram can open a step; `focus` scrolls it into view once.
 */
export function StepRow({
  step,
  words,
  tone,
  faultLabel,
  open,
  focus,
  onToggle,
}: {
  step: Step
  words: StepWords
  tone: StepTone
  faultLabel: string
  open: boolean
  focus: boolean
  onToggle: () => void
}) {
  const ref = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [focus])

  const showTime = step.kind !== 'final_answer' && step.ms >= 100
  return (
    <>
      <tr ref={ref} id={`step-${step.id}`} className={`rd-step ${tone}${open ? ' open' : ''}${focus ? ' picked' : ''}`}>
        <td className="rd-n">{step.position}</td>
        <td className="rd-at">{startsAt(step)}</td>
        <td className="rd-what">
          <button
            type="button"
            className="rd-step-btn"
            aria-expanded={open}
            aria-label={`Step ${step.position}: ${words.title}. ${open ? 'Hide' : 'Show'} the raw request and response`}
            onClick={onToggle}
          >
            <span className="rd-step-title">
              <span>{words.title}</span>
              {tone === 'fault' && <Chip tone="warn" sm>{faultMarker(faultLabel)}</Chip>}
              {tone === 'back' && (
                <Chip tone="recovered" sm>
                  Back on track
                </Chip>
              )}
            </span>
            {words.query && <span className="rd-step-line">“{words.query}”</span>}
            {words.line && <span className="rd-step-line">{words.line}</span>}
          </button>
        </td>
        <td className="rd-status">
          <span className={words.failed ? 'bad' : undefined}>{words.status}</span>
          {showTime && <span className="rd-took">{duration(step.ms / 1000)}</span>}
        </td>
      </tr>
      {open && (
        <tr className="rd-rawrow">
          <td colSpan={4}>
            <Raw step={step} />
          </td>
        </tr>
      )}
    </>
  )
}

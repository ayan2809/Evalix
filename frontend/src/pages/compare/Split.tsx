import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { appPath, type ComparePair, type RunDetail, type Step } from '../../api'
import { money } from '../../format'
import { Chip, Mark } from '../../ui'
import { endingMark } from '../results/ending'
import { duration, lowerFirst } from '../results/words'
import { describeStep, faultMarker, secondsWords, sentenceOfSteps, waitBetween, waitSentence } from '../run-details/steps'

/** How a run ended: its mark and its plain word. */
export function EndMark({ run, ink }: { run: RunDetail; ink?: boolean }) {
  const e = endingMark(run)
  return (
    <span className="cp-end-mark">
      <Mark state={e.state} ink={ink} label="" />
      {e.word}
    </span>
  )
}

/** What one side did at a step, as a clause after its name: "waited 2 seconds and asked again". */
export function splitPhrase(run: RunDetail, step: Step | null, prev: Step | undefined, next: Step | undefined): string {
  if (!step) return 'had already stopped'
  if (prev) {
    const gap = waitBetween(prev, step)
    if (gap > 0) return lowerFirst(waitSentence('', prev, step, gap)).trim()
  }
  return describeStep(step, prev, next, run.answer_json).short
}

interface SideSteps {
  run: RunDetail
  steps: (Step | null)[]
}

function neighbours(side: SideSteps, i: number): { prev: Step | undefined; next: Step | undefined } {
  const real = side.steps
  let prev: Step | undefined
  let next: Step | undefined
  for (let k = i - 1; k >= 0; k--) {
    const s = real[k]
    if (s) {
      prev = s
      break
    }
  }
  for (let k = i + 1; k < real.length; k++) {
    const s = real[k]
    if (s) {
      next = s
      break
    }
  }
  return { prev, next }
}

function Side({ side, index, last, stoppedNote }: { side: SideSteps; index: number; last: boolean; stoppedNote: boolean }) {
  const step = side.steps[index]
  const who = <span className="cp-who">{side.run.agent_name}</span>
  if (!step) {
    return (
      <div className="cp-step empty">
        {who}
        {stoppedNote ? <span>Nothing more. It had already stopped.</span> : null}
      </div>
    )
  }
  const { prev, next } = neighbours(side, index)
  const words = describeStep(step, prev, next, side.run.answer_json)
  const gap = prev ? waitBetween(prev, step) : 0
  const fault = !!step.fault
  const back = !fault && !!prev?.fault && !words.failed && step.kind !== 'final_answer'
  const lines: ReactNode[] = []
  if (gap > 0) lines.push(`Waited ${secondsWords(gap)} first.`)
  if (words.query) lines.push(`“${words.query}”`)
  if (words.line) lines.push(words.line)
  return (
    <div className={`cp-step${fault ? ' fault' : ''}`}>
      {who}
      <div className="cp-step-text">
        <span className="cp-step-title">
          <span>{words.title}</span>
          {fault && <Chip tone="warn" sm>{faultMarker(side.run.fault_label)}</Chip>}
          {back && <Chip tone="recovered" sm>Back on track</Chip>}
        </span>
        {lines.map((l, i) => (
          <span key={i} className="cp-step-line">
            {l}
          </span>
        ))}
        {last && <EndMark run={side.run} />}
      </div>
      <span className={`cp-step-meta${words.failed ? ' bad' : ''}`}>{words.failed ? step.status_code : 'OK'}</span>
    </div>
  )
}

function lastIndex(side: SideSteps): number {
  for (let i = side.steps.length - 1; i >= 0; i--) if (side.steps[i]) return i
  return -1
}

/** The folded steps, the split, and everything after it, as a table with a column per agent. */
export function Split({ a, b, pairs, firstDifference }: { a: RunDetail; b: RunDetail; pairs: ComparePair[]; firstDifference: number | null }) {
  const [showSame, setShowSame] = useState(false)
  const sideA: SideSteps = { run: a, steps: pairs.map((p) => p.a) }
  const sideB: SideSteps = { run: b, steps: pairs.map((p) => p.b) }
  const lastA = lastIndex(sideA)
  const lastB = lastIndex(sideB)
  const splitIndex = firstDifference === null ? pairs.length : pairs.findIndex((p) => p.position === firstDifference)
  const cut = splitIndex < 0 ? pairs.length : splitIndex
  const same = pairs.slice(0, cut)

  // The "nothing more" note shows once per side, at the first empty step.
  const firstEmptyA = pairs.findIndex((p) => !p.a)
  const firstEmptyB = pairs.findIndex((p) => !p.b)

  const row = (i: number, isSplit: boolean) => {
    const p = pairs[i]
    return (
      <tr key={p.position} className={`cp-row${isSplit ? ' split' : ''}`}>
        <th scope="row" className="cp-pos">
          {p.position}
          {isSplit && <span className="cp-splitnote">They split here</span>}
        </th>
        <td>
          <Side side={sideA} index={i} last={i === lastA} stoppedNote={i === firstEmptyA} />
        </td>
        <td>
          <Side side={sideB} index={i} last={i === lastB} stoppedNote={i === firstEmptyB} />
        </td>
      </tr>
    )
  }

  const summary = sentenceOfSteps(
    same
      .map((p, i) => {
        const { prev, next } = neighbours(sideA, i)
        return p.a ? describeStep(p.a, prev, next, a.answer_json).short : ''
      })
      .filter(Boolean),
  )
  const range = same.length === 1 ? 'Step 1 was' : `Steps 1–${same.length} were`

  return (
    <div className="scroll-x">
      <table className="tbl cp-table" aria-label="Step by step, side by side">
        <thead>
          <tr>
            <th>Step</th>
            <th>{a.agent_name}</th>
            <th>{b.agent_name}</th>
          </tr>
        </thead>
        <tbody>
          {same.length > 0 && (
            <tr className="cp-fold">
              <td colSpan={3}>
                <span>
                  <strong>{range} the same for both:</strong> {summary}.
                </span>
                <button type="button" className="link-btn" aria-expanded={showSame} onClick={() => setShowSame(!showSame)}>
                  {showSame ? 'Hide them' : 'Show them'}
                </button>
              </td>
            </tr>
          )}
          {showSame && same.map((_, i) => row(i, false))}
          {pairs.slice(cut).map((_, k) => row(cut + k, firstDifference !== null && k === 0))}
        </tbody>
      </table>
    </div>
  )
}

/** How each run ended: a mark and a word per agent, with the numbers. */
export function EndTable({ a, b }: { a: RunDetail; b: RunDetail }) {
  const calls = (r: RunDetail) => r.steps.filter((s) => s.kind === 'model_call').length
  return (
    <div className="scroll-x">
      <table className="tbl cp-ends" aria-label="How each run ended">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Ending</th>
            <th>Model calls</th>
            <th>Time</th>
            <th>Cost</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[a, b].map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.agent_name}</th>
              <td>
                <EndMark run={r} ink />
              </td>
              <td>{calls(r)}</td>
              <td>{duration(r.seconds)}</td>
              <td>{money(r.cost_usd)}</td>
              <td>
                <Link to={appPath(`/runs/${r.id}`)}>Open this run</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, appPath, type CompareResult } from '../api'
import { CopyLink } from './CopyLink'
import { useAsync, useTitle } from '../hooks'
import { Button, EmptyState, ErrorState, Loading, LinkButton, Notice, PageHeader, SectionBar, TimingDiagram, TitleBlock } from '../ui'
import { PickerDialog } from './compare/PickerDialog'
import { EndTable, Split, splitPhrase } from './compare/Split'
import { defaultPair, partnerFor, type Pair } from './compare/defaults'
import { buildLane, hasTimes } from './run-details/timing'
import { lowerFirst, reasonShort } from './results/words'
import './compare/compare.css'

export default function Compare() {
  const [params] = useSearchParams()
  const a = params.get('a') ?? ''
  const b = params.get('b') ?? ''
  if (a && b) return <Compared a={a} b={b} />
  return <Choose a={a} />
}

/** No two runs in the address yet: work out a good pair and move there. */
function Choose({ a }: { a: string }) {
  useTitle('Compare')
  const pair = useAsync<Pair | null>(() => (a ? partnerFor(a) : defaultPair()), [a])
  if (pair.error) {
    return (
      <div className="wrap sheet">
        <ErrorState error={pair.error} onRetry={pair.reload} />
      </div>
    )
  }
  if (pair.loading && !pair.data) {
    return (
      <div className="wrap sheet">
        <Loading text="Finding a good pair to compare…" />
      </div>
    )
  }
  if (!pair.data) {
    return (
      <div className="wrap sheet">
        <PageHeader title="Where did two agents split?" />
        <EmptyState title="Nothing to compare yet.">
          {a
            ? "This run has no other agent to compare with."
            : 'Compare needs a finished run with at least two agents. Start one and come back.'}
        </EmptyState>
        <div>
          <LinkButton to="/run" variant="primary">
            Start a run
          </LinkButton>
        </div>
      </div>
    )
  }
  return <Navigate to={appPath(`/compare?a=${encodeURIComponent(pair.data.a)}&b=${encodeURIComponent(pair.data.b)}`)} replace />
}

function endingPhrase(run: CompareResult['a']): string {
  switch (run.ending) {
    case 'passed':
      return 'got through'
    case 'wrong':
      return `slipped${run.fail_reason ? `: ${lowerFirst(reasonShort(run.fail_reason))}` : ''}`
    case 'crashed':
      return `crashed${run.fail_reason ? `: ${lowerFirst(reasonShort(run.fail_reason))}` : ''}`
    case 'setup_problem':
      return 'hit a setup problem'
    default:
      return 'is still running'
  }
}

function Compared({ a, b }: { a: string; b: string }) {
  const navigate = useNavigate()
  const result = useAsync(() => api.compare(a, b), [a, b])
  const [picking, setPicking] = useState(false)
  const r = result.data && result.data.a.id === a && result.data.b.id === b ? result.data : null
  useTitle(r ? `${r.a.agent_name} and ${r.b.agent_name}` : 'Compare')

  if (result.error && !r) {
    return (
      <div className="wrap sheet">
        <ErrorState error={result.error} onRetry={result.reload} />
        <div>
          <LinkButton to={appPath('/compare')}>Pick a different pair</LinkButton>
        </div>
      </div>
    )
  }
  if (!r) {
    return (
      <div className="wrap sheet">
        <Loading text="Lining the two runs up…" />
      </div>
    )
  }

  const { a: ra, b: rb, pairs, first_difference: first } = r
  const sameProblem = ra.task_id === rb.task_id && ra.fault_id === rb.fault_id
  const topicA = ra.fault_label || ra.task_title
  const topicB = rb.fault_label || rb.task_title

  let answer: string
  if (first === null && ra.ending === rb.ending) answer = 'They never split. Both took the same steps and ended the same way.'
  else if (ra.ending === 'passed' && rb.ending === 'passed') answer = `Both got through, but they took different steps from step ${first}.`
  else answer = `${ra.agent_name} ${endingPhrase(ra)}. ${rb.agent_name} ${endingPhrase(rb)}.`

  const facts = [
    sameProblem
      ? 'Both got the same question and hit the same problem at the same moment.'
      : 'These two runs were on different problems, so they may split early.',
    first !== null ? `They split at step ${first}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const splitPair = first === null ? undefined : pairs.find((p) => p.position === first)
  const at = splitPair ? pairs.indexOf(splitPair) : -1
  const stepsOf = (side: 'a' | 'b') => pairs.map((p) => p[side])
  const phrase = (side: 'a' | 'b') => {
    const steps = stepsOf(side)
    const run = side === 'a' ? ra : rb
    const prev = steps.slice(0, at).reverse().find(Boolean) ?? undefined
    const next = steps.slice(at + 1).find(Boolean) ?? undefined
    return `${run.agent_name} ${splitPhrase(run, steps[at] ?? null, prev, next)}`
  }

  // The timing diagram: one lane per run on one shared scale, with a split line at the first different step.
  const laneA = buildLane(ra, { label: ra.agent_name })
  const laneB = buildLane(rb, { label: rb.agent_name })
  const bothTimed = hasTimes(ra) && hasTimes(rb) && laneA && laneB
  let splitAtMs: number | undefined
  if (splitPair) {
    const at = [splitPair.a?.at_ms, splitPair.b?.at_ms].filter((v): v is number => typeof v === 'number')
    if (at.length > 0) splitAtMs = Math.min(...at)
  }
  if (bothTimed && splitAtMs !== undefined) laneA.lane.marks = [...(laneA.lane.marks ?? []), { atMs: splitAtMs, label: 'They split here', tone: 'split' }]
  const totalMs = bothTimed ? Math.max(laneA.endMs, laneB.endMs, ra.seconds * 1000, rb.seconds * 1000) : 0

  return (
    <div className="wrap sheet cp">
      <TitleBlock
        label="What is compared"
        cells={[
          { label: 'Compared', value: `${ra.agent_name} vs ${rb.agent_name}`, wide: true },
          { label: sameProblem ? (ra.fault_id ? 'Problem' : 'Question') : 'Problems', value: sameProblem ? topicA : `${topicA} and ${topicB}`, wide: true },
          { label: 'Benchmark', value: ra.benchmark_id === rb.benchmark_id ? `#${ra.benchmark_id}` : `#${ra.benchmark_id} and #${rb.benchmark_id}` },
        ]}
        action={
          <>
            <Button small onClick={() => setPicking(true)}>
              Change
            </Button>
            <CopyLink benchmarkId={ra.benchmark_id} />
          </>
        }
      />

      <PageHeader title={`Where did ${ra.agent_name} and ${rb.agent_name} split?`} answer={answer} facts={facts} />

      {bothTimed && (
        <section className="cp-block">
          <SectionBar title="Timing diagram" />
          <TimingDiagram
            label={`When each step of ${ra.agent_name} and ${rb.agent_name} started, on one shared time scale`}
            lanes={[laneA.lane, laneB.lane]}
            totalMs={totalMs}
            splitAtMs={splitAtMs}
          />
          <p className="tag">Both lanes use the same time scale, so a longer run really is longer.</p>
        </section>
      )}

      <section className="cp-block">
        <SectionBar title="How each ended" />
        <EndTable a={ra} b={rb} />
      </section>

      {first !== null && at >= 0 ? (
        <p className="cp-banner" role="note">
          <strong>Step {first}: this is where they split.</strong> {phrase('a')}. {phrase('b')}.
        </p>
      ) : (
        <Notice>These two took the same steps from start to finish.</Notice>
      )}

      <section className="cp-block">
        <SectionBar title="Step by step, side by side" />
        <Split a={ra} b={rb} pairs={pairs} firstDifference={first} />
      </section>

      <PickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        current={r}
        onPick={(p) => {
          setPicking(false)
          navigate(appPath(`/compare?a=${encodeURIComponent(p.a)}&b=${encodeURIComponent(p.b)}`))
        }}
      />
    </div>
  )
}

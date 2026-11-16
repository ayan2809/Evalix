import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, appPath, asApiError, currentShareToken, type AnswerJson, type Check, type Review, type RunDetail, type Task } from '../api'
import { money } from '../format'
import { useAsync, useTitle } from '../hooks'
import {
  Button,
  ErrorState,
  Icon,
  Loading,
  LinkButton,
  Mark,
  Notice,
  PageHeader,
  Plate,
  SectionBar,
  TimingDiagram,
  TitleBlock,
} from '../ui'
import { StepRow } from './run-details/StepRow'
import { buildLane } from './run-details/timing'
import { endingMark } from './results/ending'
import { describeStep, waitBetween, waitSentence, type StepTone } from './run-details/steps'
import { duration, lowerFirst, reasonShort, upperFirst } from './results/words'
import { CopyLink } from './CopyLink'
import './run-details/run-details.css'

export default function RunDetails() {
  const { id = '' } = useParams()
  const run = useAsync(() => api.getRun(id), [id])
  const tasks = useAsync(() => api.listTasks().catch(() => [] as Task[]), [])
  useTitle(run.data ? `${run.data.agent_name} on ${run.data.fault_label || run.data.task_title}` : 'Run details')

  if (run.error && (!run.data || run.data.id !== id)) {
    return (
      <div className="wrap sheet">
        <ErrorState error={run.error} onRetry={run.reload} />
        <div>
          <LinkButton to={appPath('/')}>Back to the results</LinkButton>
        </div>
      </div>
    )
  }
  if (!run.data || run.data.id !== id) {
    return (
      <div className="wrap sheet">
        <Loading text="Loading the run…" />
      </div>
    )
  }
  return <Details run={run.data} task={tasks.data?.find((t) => t.id === run.data!.task_id)} />
}

/** The one-sentence answer under the question. */
function outcomeSentence(run: RunDetail): string {
  switch (run.ending) {
    case 'passed':
      return 'It got through.'
    case 'wrong':
      return `It slipped${run.fail_reason ? `: ${lowerFirst(reasonShort(run.fail_reason))}` : ''}.`
    case 'crashed':
      return `It crashed${run.fail_reason ? `: ${lowerFirst(reasonShort(run.fail_reason))}` : ''}.`
    case 'setup_problem':
      return `Something in our setup went wrong, so this doesn't count against ${run.agent_name}.`
    default:
      return 'It is still running.'
  }
}

function Details({ run, task }: { run: RunDetail; task: Task | undefined }) {
  const modelCalls = run.steps.filter((s) => s.kind === 'model_call').length
  const topic = run.fault_label || run.task_title
  const end = endingMark(run)
  const agent = useAsync(
    () =>
      api
        .getBenchmark(run.benchmark_id)
        .then((b) => b.agents.find((a) => a.id === run.agent_id) ?? null)
        .catch(() => null),
    [run.benchmark_id, run.agent_id],
  )
  const [openIds, setOpenIds] = useState<ReadonlySet<number>>(new Set())
  const [picked, setPicked] = useState<number | null>(null)

  function toggle(id: number) {
    setOpenIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function pick(id: number) {
    setPicked(id)
    setOpenIds((cur) => new Set(cur).add(id))
  }

  const built = useMemo(() => buildLane(run, { label: run.agent_name, onSelect: pick, selectedId: picked }), [run, picked])

  const facts = (
    <div className="stack" style={{ gap: 6 }}>
      {run.fault_id && (
        <span>
          We broke something on purpose: {lowerFirst(run.fault_short || run.fault_label)}.
        </span>
      )}
      {run.task_text && <span className="rd-question">The question it was asked: {run.task_text}</span>}
      <span>
        <Link to={currentShareToken() ? appPath('/') : `/?b=${run.benchmark_id}`}>Back to the results</Link>
      </span>
    </div>
  )

  return (
    <div className="wrap sheet rd">
      <TitleBlock
        className="rd-tb"
        label="This run"
        cells={[
          {
            label: 'Agent',
            value: <Plate name={run.agent_name} tag={agent.data?.tag} description={agent.data?.description} />,
          },
          { label: run.fault_id ? 'Problem' : 'Question', value: topic },
          {
            label: 'Ending',
            value: (
              <span className="rd-ending">
                <Mark state={end.state} ink index={0} label="" />
                {end.word}
              </span>
            ),
          },
          { label: 'Time', value: duration(run.seconds) },
          { label: 'Cost', value: money(run.cost_usd) },
          { label: 'Model calls', value: modelCalls },
        ]}
        action={
          <>
            <LinkButton to={appPath(`/compare?a=${encodeURIComponent(run.id)}`)}>Compare with another agent</LinkButton>
            <CopyLink benchmarkId={run.benchmark_id} />
          </>
        }
      />

      <PageHeader
        title={`How did ${run.agent_name} handle “${topic}”?`}
        answer={outcomeSentence(run)}
        facts={facts}
      />

      <div className="rd-cols">
        <div className="rd-main">
          {built && (
            <section className="rd-block">
              <SectionBar title="Timing diagram" />
              <TimingDiagram
                label={`When each step of ${run.agent_name}'s run started and how long it took`}
                lanes={[built.lane]}
                totalMs={Math.max(built.endMs, run.seconds * 1000)}
              />
              <ul className="td-legend" aria-label="What the shapes mean">
                <li>
                  <span className="td-sw model" /> Model call
                </li>
                <li>
                  <span className="td-sw tool" /> Tool call
                </li>
                <li>
                  <span className="td-sw answer" /> Answer
                </li>
                <li>
                  <span className="td-sw hit" /> We broke this
                </li>
                <li>
                  <span className="td-sw failed" /> Failed
                </li>
                <li>
                  <span className="td-sw wait" /> Waiting
                </li>
              </ul>
              <p className="tag">Click a step in the diagram to open it in the table.</p>
            </section>
          )}

          <section className="rd-block">
            <SectionBar title="Step by step" />
            <StepTable run={run} openIds={openIds} picked={picked} onToggle={toggle} />
          </section>
        </div>

        <aside className="rd-side" aria-label="Checks, answer and second opinion">
          <Checks run={run} />
          <AnswerBlock run={run} task={task} />
          <SecondOpinion run={run} />
        </aside>
      </div>
    </div>
  )
}

function StepTable({
  run,
  openIds,
  picked,
  onToggle,
}: {
  run: RunDetail
  openIds: ReadonlySet<number>
  picked: number | null
  onToggle: (id: number) => void
}) {
  const steps = run.steps
  if (steps.length === 0) return <p className="muted">No steps were recorded for this run.</p>
  return (
    <div className="scroll-x">
      <table className="tbl rd-table" aria-label="Step by step">
        <thead>
          <tr>
            <th>#</th>
            <th>Starts at</th>
            <th>What happened</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {steps.flatMap((s, i) => {
            const prev = steps[i - 1]
            const next = steps[i + 1]
            const words = describeStep(s, prev, next, run.answer_json)
            let tone: StepTone = 'plain'
            if (s.fault) tone = 'fault'
            else if (s.kind === 'final_answer' && !words.failed) tone = 'final'
            else if (prev?.fault && !words.failed) tone = 'back'
            const gap = prev ? waitBetween(prev, s) : 0
            const rows = []
            if (gap > 0) {
              rows.push(
                <tr key={`w${s.id}`} className="rd-wait">
                  <td colSpan={4}>
                    <Icon name="clock" size={14} />
                    {waitSentence(run.agent_name, prev, s, gap)}
                  </td>
                </tr>,
              )
            }
            rows.push(
              <StepRow
                key={s.id}
                step={s}
                words={words}
                tone={tone}
                faultLabel={run.fault_label}
                open={openIds.has(s.id)}
                focus={picked === s.id}
                onToggle={() => onToggle(s.id)}
              />,
            )
            return rows
          })}
        </tbody>
      </table>
    </div>
  )
}

function Checks({ run }: { run: RunDetail }) {
  if (!run.checks || run.checks.length === 0) return null
  return (
    <section className="rd-block">
      <SectionBar title="Checks" />
      <ul className="rd-checks">
        {run.checks.map((c: Check, i) => (
          <li key={i} className={c.ok ? 'ok' : 'no'}>
            <Mark state={c.ok ? 'through' : 'slipped'} ink index={i + 1} label={c.ok ? 'Passed' : 'Failed'} />
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function humanize(key: string): string {
  return upperFirst(key.replace(/_/g, ' '))
}

function fieldLabel(key: string, task: Task | undefined): string {
  const about = task?.answer_format[key]?.about
  return about && about.length <= 40 ? upperFirst(about) : humanize(key)
}

function showValue(v: unknown): string {
  if (v === null || v === undefined) return 'Nothing'
  if (typeof v === 'number') return v.toLocaleString()
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function AnswerBlock({ run, task }: { run: RunDetail; task: Task | undefined }) {
  const a: AnswerJson | null = run.answer_json
  let body
  if (!a) {
    body = <p className="muted">It didn't hand in an answer.</p>
  } else if (a.status === 'blocked') {
    body = (
      <p>
        It stopped instead of answering.
        {a.reason ? ` Its reason: ${a.reason}` : ''}
      </p>
    )
  } else {
    const fields = Object.entries(a.answer ?? {})
    body = (
      <>
        {fields.length === 0 && <p className="muted">The answer was empty.</p>}
        {fields.length > 0 && (
          <dl className="spec rd-answer">
            {fields.map(([k, v]) => (
              <div key={k}>
                <dt>{fieldLabel(k, task)}</dt>
                <dd>{showValue(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        {a.sources && a.sources.length > 0 && (
          <div className="rd-sources">
            <span className="tag">Where it found this</span>
            {a.sources.map((u) => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer" title={u}>
                {hostOf(u)}
              </a>
            ))}
          </div>
        )}
      </>
    )
  }
  return (
    <section className="rd-block">
      <SectionBar title="Its answer" />
      {body}
    </section>
  )
}

const GROUNDED = {
  grounded: 'Its answer is backed by what it read.',
  partly: 'Its answer is only partly backed by what it read.',
  not_grounded: "Its answer isn't backed by what it read.",
} as const
const HANDLED = {
  handled: 'It handled the problem well.',
  partly: 'It handled the problem, but not cleanly.',
  poorly: 'It handled the problem badly.',
  no_fault: 'We broke nothing in this run.',
} as const

function SecondOpinion({ run }: { run: RunDetail }) {
  const [review, setReview] = useState<Review | null>(run.review_json)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function ask() {
    setBusy(true)
    setError('')
    try {
      setReview(await api.reviewRun(run.id))
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const shown = review && !review.error ? review : null
  return (
    <section className="rd-opinion" aria-label="Second opinion">
      <div className="stack">
        <h2>Want a second opinion?</h2>
        {!shown && <p className="muted">An AI reviewer can read the steps and say whether they made sense. It won't change the result.</p>}
        {shown && (
          <div className="rd-review">
            {shown.reasoning_score !== undefined && <p>Reasoning: {shown.reasoning_score} out of 5.</p>}
            {shown.groundedness && <p>{GROUNDED[shown.groundedness]}</p>}
            {shown.fault_handling && <p>{HANDLED[shown.fault_handling]}</p>}
            {shown.critique && <p className="muted">{shown.critique}</p>}
          </div>
        )}
        {review?.error && <Notice tone="warn">The reviewer couldn't finish: {review.error}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <div>
          <Button needsSignIn onClick={ask} disabled={busy}>
            {busy ? 'Reading the steps…' : shown ? 'Ask again' : 'Ask for a second opinion'}
          </Button>
        </div>
      </div>
    </section>
  )
}

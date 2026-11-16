import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, asApiError, type Agent, type Fault, type RunDetail } from '../../api'
import { useAsync } from '../../hooks'
import { Button, Notice, SectionBar, Select } from '../../ui'
import { describeStep } from '../run-details/steps'
import { duration } from '../results/words'
import './playground.css'

/** Problems that make sense for any question (the lying ones need a prepared question with a planted page). */
const ANY_QUESTION = ['broken_tool', 'slow_tool', 'empty_result', 'model_busy', 'tool_gone']
const NOTHING = 'none'

/**
 * Talk to an agent before benchmarking it: type a question, optionally break one thing, and watch every step
 * it takes. Same tools, same model and the same gateway as a real run, with live web search.
 */
export function Playground({ agents, pick }: { agents: Agent[]; pick?: number }) {
  const faults = useAsync(() => api.listFaults(), [])
  const [agentId, setAgentId] = useState<number | ''>(pick ?? agents[0]?.id ?? '')
  const [question, setQuestion] = useState('')
  const [fault, setFault] = useState<string>(NOTHING)
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<RunDetail | null>(null)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState(false)
  const history = useAsync(
    () => (agentId === '' ? Promise.resolve([]) : api.agentTries(agentId)),
    [agentId, run?.ending ?? ''],
  )

  // A newly made agent becomes the one you are talking to.
  useEffect(() => {
    if (pick !== undefined) setAgentId(pick)
  }, [pick])

  // Watch the run until it ends: steps appear as the agent takes them.
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!runId) return
    let stop = false
    const look = async () => {
      try {
        const r = await api.getRun(runId)
        if (stop) return
        setRun(r)
        if (r.ending === null) timer.current = window.setTimeout(look, 900)
      } catch (e) {
        if (!stop) setError(asApiError(e).message)
      }
    }
    void look()
    return () => {
      stop = true
      window.clearTimeout(timer.current)
    }
  }, [runId])

  const agent = agents.find((a) => a.id === agentId)
  const choices = (faults.data ?? []).filter((f: Fault) => ANY_QUESTION.includes(f.id))
  const going = asking || (run !== null && run.ending === null)

  async function ask(e: FormEvent) {
    e.preventDefault()
    if (agentId === '' || !question.trim() || going) return
    setAsking(true)
    setError('')
    setRun(null)
    try {
      const { run_id } = await api.tryAgent(agentId, question.trim(), fault === NOTHING ? null : fault)
      setRunId(run_id)
    } catch (err) {
      setError(asApiError(err).message)
    } finally {
      setAsking(false)
    }
  }

  if (agents.length === 0) return null
  return (
    <section className="ds-block pg" aria-label="Playground">
      <SectionBar title="Playground: talk to it before you test it" />
      <form className="ds-sheet pg-form" onSubmit={ask}>
        <div className="pg-row">
          <label className="lbl-field">
            <span className="ds-lbl">Agent</span>
            <Select
              ariaLabel="Agent to talk to"
              value={agentId}
              onChange={(v: number) => {
                setAgentId(v)
                setRun(null)
                setRunId(null)
              }}
              options={agents.map((a) => ({ value: a.id, label: a.name }))}
            />
          </label>
          <label className="lbl-field">
            <span className="ds-lbl">Break something (optional)</span>
            <Select
              ariaLabel="Problem to cause"
              value={fault}
              onChange={(v: string) => setFault(v)}
              options={[{ value: NOTHING, label: 'Nothing, ask normally' }, ...choices.map((f) => ({ value: f.id, label: `${f.label}: ${f.short}` }))]}
            />
          </label>
        </div>
        <label className="lbl-field">
          <span className="ds-lbl">Ask it something</span>
          <textarea
            className="textarea"
            value={question}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(e as unknown as FormEvent)
            }}
            placeholder={agent?.description ? `Something it should handle. It was made to: ${agent.description}` : 'A question it should be able to answer.'}
          />
        </label>
        <div className="ds-actions">
          <Button type="submit" variant="primary" needsSignIn disabled={going} disabledReason={question.trim() ? undefined : 'Type a question first.'}>
            {going ? 'Working on it…' : 'Ask'}
          </Button>
          <span className="tag">Uses live web search, the same tools and the same model as a run. It isn't graded.</span>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </form>

      {run && <Conversation run={run} />}

      {(history.data ?? []).filter((t) => t.id !== run?.id).length > 0 && (
        <details className="pg-history">
          <summary>Earlier questions to {agent?.name}</summary>
          <ul>
            {(history.data ?? [])
              .filter((t) => t.id !== run?.id)
              .map((t) => (
                <li key={t.id}>
                  <Link to={`/runs/${t.id}`}>{t.prompt}</Link>
                  <span className="tag">
                    {t.ending === 'passed' ? 'answered' : t.ending === null ? 'still going' : t.ending === 'crashed' ? 'broke' : 'setup problem'}
                    {t.fault_id ? `, with a problem caused` : ''}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/** The question, each step as it happens, and the answer. */
function Conversation({ run }: { run: RunDetail }) {
  const answer = run.answer_json
  const done = run.ending !== null
  const said = answer?.answer ? Object.values(answer.answer).map(String).join(' ') : ''
  return (
    <div className="pg-talk" aria-live="polite">
      <p className="pg-you">
        <b>You</b> {run.task_text}
        {run.fault_label && <span className="pg-broke">We broke this on purpose: {run.fault_short || run.fault_label}</span>}
      </p>
      <ol className="pg-steps">
        {run.steps
          .filter((s) => s.kind !== 'final_answer')
          .map((s, i, all) => {
            const w = describeStep(s, all[i - 1], all[i + 1], answer)
            return (
              <li key={s.id} className={w.failed ? 'bad' : ''}>
                <span className="pg-step">{w.title}</span>
                {w.query && <span className="pg-query">“{w.query}”</span>}
                <span className="pg-status">{s.fault ? `${w.status}, we broke this` : w.status}</span>
              </li>
            )
          })}
        {!done && <li className="pg-wait">Working…</li>}
      </ol>
      {done && (
        <div className={`pg-agent ${run.ending === 'passed' ? '' : 'bad'}`}>
          <b>{run.agent_name}</b>{' '}
          {run.ending === 'crashed'
            ? `Broke: ${run.fail_reason}.`
            : run.ending === 'setup_problem'
              ? `Something outside the agent failed: ${run.fail_reason}.`
              : answer?.status === 'blocked'
                ? `Stopped and said why: ${answer.reason || 'no reason given'}`
                : said || 'Answered, but left the answer empty.'}
          {answer?.sources && answer.sources.length > 0 && (
            <ul className="pg-sources">
              {answer.sources.map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noreferrer">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <span className="tag">
            {duration(run.seconds)}, {toolCalls(run)}.{' '}
            <Link to={`/runs/${run.id}`}>Open every step</Link>
          </span>
        </div>
      )}
    </div>
  )
}

function toolCalls(run: RunDetail): string {
  const n = run.steps.filter((s) => s.kind === 'tool_call').length
  return n === 1 ? '1 tool call' : `${n} tool calls`
}

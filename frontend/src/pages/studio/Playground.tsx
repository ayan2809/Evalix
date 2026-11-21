import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, asApiError, type Agent, type Fault, type RunDetail, type TryItem } from '../../api'
import { useAsync } from '../../hooks'
import { Button, Notice, SectionBar, Select } from '../../ui'
import { describeStep } from '../run-details/steps'
import { duration } from '../results/words'
import './playground.css'

/** Problems that make sense for any question (the lying ones need a prepared question with a planted page). */
const ANY_QUESTION = ['broken_tool', 'slow_tool', 'empty_result', 'model_busy', 'tool_gone']
const NOTHING = 'none'
/** How far back "Continue" reads an earlier conversation (the server reminds the agent of the last 5). */
const LONGEST = 20

/**
 * Talk to an agent before benchmarking it: type a question, optionally break one thing, and watch every step
 * it takes. Once it answers, the next question is a follow-up: the agent is reminded of the conversation so far.
 * Same tools, same model and the same gateway as a real run, with live web search.
 */
export function Playground({ agents, pick }: { agents: Agent[]; pick?: number }) {
  const faults = useAsync(() => api.listFaults(), [])
  const [agentId, setAgentId] = useState<number | ''>(pick ?? agents[0]?.id ?? '')
  const [question, setQuestion] = useState('')
  const [fault, setFault] = useState<string>(NOTHING)
  // The conversation on screen, oldest question first. The last one may still be going.
  const [thread, setThread] = useState<RunDetail[]>([])
  const [watching, setWatching] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const last = thread[thread.length - 1]
  const history = useAsync(
    () => (agentId === '' ? Promise.resolve([] as TryItem[]) : api.agentTries(agentId)),
    [agentId, last?.id ?? '', last?.ending ?? ''],
  )

  function startOver() {
    setThread([])
    setWatching(null)
    setError('')
  }

  // A newly made agent (or one picked with "Try it") becomes the one you are talking to, in a new conversation.
  useEffect(() => {
    if (pick !== undefined) {
      setAgentId(pick)
      startOver()
    }
  }, [pick])

  // Watch the newest question until it ends: steps appear as the agent takes them.
  useEffect(() => {
    if (!watching) return
    let stop = false
    let timer: number | undefined
    const look = async () => {
      try {
        const r = await api.getRun(watching)
        if (stop) return
        setThread((t) => (t.some((x) => x.id === r.id) ? t.map((x) => (x.id === r.id ? r : x)) : [...t, r]))
        if (r.ending === null) timer = window.setTimeout(look, 900)
        else {
          setWatching(null)
          box.current?.focus({ preventScroll: true })
        }
      } catch (e) {
        if (!stop) {
          setError(asApiError(e).message)
          setWatching(null)
        }
      }
    }
    void look()
    return () => {
      stop = true
      window.clearTimeout(timer)
    }
  }, [watching])

  const agent = agents.find((a) => a.id === agentId)
  const choices = (faults.data ?? []).filter((f: Fault) => ANY_QUESTION.includes(f.id))
  const going = asking || watching !== null
  const followUp = last !== undefined && last.ending !== null

  async function ask(e: FormEvent) {
    e.preventDefault()
    if (agentId === '' || !question.trim() || going) return
    setAsking(true)
    setError('')
    try {
      const { run_id } = await api.tryAgent(agentId, question.trim(), fault === NOTHING ? null : fault, followUp ? last.id : null)
      setQuestion('')
      setWatching(run_id)
    } catch (err) {
      setError(asApiError(err).message)
    } finally {
      setAsking(false)
    }
  }

  /** Pick up an earlier conversation where it stopped: read it back question by question. */
  async function resume(item: TryItem) {
    if (going) return
    setError('')
    try {
      const turns: RunDetail[] = []
      let id: string | undefined = item.id
      while (id && turns.length < LONGEST) {
        const r: RunDetail = await api.getRun(id)
        turns.unshift(r)
        id = r.follows || undefined
      }
      setThread(turns)
      setWatching(turns[turns.length - 1]?.ending === null ? item.id : null)
      document.querySelector('.pg')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      box.current?.focus({ preventScroll: true })
    } catch (err) {
      setError(asApiError(err).message)
    }
  }

  if (agents.length === 0) return null
  const shown = new Set(thread.map((t) => t.id))
  const earlier = (history.data ?? []).filter((t) => !shown.has(t.id))
  return (
    <section className="ds-block pg" aria-label="Playground">
      <SectionBar title="Playground: talk to it before you test it" />
      <div className="ds-sheet">
        <div className="pg-row">
          <label className="lbl-field">
            <span className="ds-lbl">Agent</span>
            <Select
              ariaLabel="Agent to talk to"
              value={agentId}
              onChange={(v: number) => {
                setAgentId(v)
                startOver()
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

        {thread.length > 0 && (
          <div className="pg-talk" aria-live="polite">
            {thread.map((t) => (
              <Turn key={t.id} run={t} />
            ))}
          </div>
        )}

        <form className="pg-form" onSubmit={ask}>
          <label className="lbl-field">
            <span className="ds-lbl">{followUp ? `Ask ${last.agent_name} a follow-up` : 'Ask it something'}</span>
            <textarea
              ref={box}
              className="textarea"
              value={question}
              maxLength={500}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(e as unknown as FormEvent)
              }}
              placeholder={
                followUp
                  ? 'It remembers this conversation. Try "Why?", "What changed since last year?" or "Check that on the official page."'
                  : agent?.description
                    ? `Something it should handle. It was made to: ${agent.description}`
                    : 'A question it should be able to answer.'
              }
            />
          </label>
          <div className="ds-actions">
            <Button type="submit" variant="primary" needsSignIn disabled={going} disabledReason={question.trim() ? undefined : 'Type a question first.'}>
              {going ? 'Working on it…' : followUp ? 'Ask follow-up' : 'Ask'}
            </Button>
            {thread.length > 0 && (
              <Button onClick={startOver} disabledReason={going ? 'Wait for the answer first.' : undefined}>
                New conversation
              </Button>
            )}
            <span className="tag">
              {followUp
                ? `It's reminded of the last ${Math.min(thread.length, 5)} question${thread.length === 1 ? '' : 's'} and answer${thread.length === 1 ? '' : 's'}. Not graded.`
                : "Uses live web search, the same tools and the same model as a run. It isn't graded."}
            </span>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
        </form>
      </div>

      {earlier.length > 0 && (
        <details className="pg-history">
          <summary>Earlier conversations with {agent?.name}</summary>
          <ul>
            {earlier.map((t) => (
              <li key={t.id}>
                <Link to={`/runs/${t.id}`}>{t.first || t.prompt}</Link>
                <span className="tag">
                  {t.turns > 1 ? `${t.turns} questions, last one ` : ''}
                  {t.ending === 'passed' ? 'answered' : t.ending === null ? 'still going' : t.ending === 'crashed' ? 'broke' : 'setup problem'}
                </span>
                <button type="button" className="link-btn" onClick={() => void resume(t)} disabled={going}>
                  Continue
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/** One question, each step as it happens, and the answer. */
function Turn({ run }: { run: RunDetail }) {
  const answer = run.answer_json
  const done = run.ending !== null
  const said = answer?.answer ? Object.values(answer.answer).map(String).join(' ') : ''
  return (
    <div className="pg-turn">
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

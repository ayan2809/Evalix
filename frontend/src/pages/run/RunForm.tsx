import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { agentSource } from '../../agentSource'
import { api, asApiError, type Agent, type BenchmarkListItem } from '../../api'
import { useAsync } from '../../hooks'
import { useModelLabel, useShell } from '../../shell/ShellContext'
import { Button, EmptyState, ErrorState, Loading, Notice, PageHeader, Segmented, SectionBar, Switch, TitleBlock } from '../../ui'
import { OnlineStatus } from '../agents/OnlineStatus'
import { EngineNotice } from './EngineNotice'
import '../sheet.css'
import './run.css'


const OFFLINE_REASON = 'Not answering. Start it, then reload this page.'

/** What one run has cost on average in the last finished benchmark, or null when there is nothing to go on. */
function costPerRun(list: BenchmarkListItem[] | null): number | null {
  const last = (list ?? []).find((b) => b.status === 'done' && b.done_runs > 0 && b.total_cost > 0)
  return last ? last.total_cost / last.done_runs : null
}

function roughMoney(v: number): string {
  if (v >= 0.1) return '$' + v.toFixed(2)
  if (v >= 0.01) return '$' + v.toFixed(3)
  return 'a cent or less'
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

function Chevron() {
  return (
    <svg className="ds-chev" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 4.5 L6 8.5 L10 4.5" />
    </svg>
  )
}

export default function RunForm() {
  const navigate = useNavigate()
  const { health } = useShell()
  const label = useModelLabel()
  const agents = useAsync(() => api.listAgents(), [])
  const tasks = useAsync(() => api.listTasks(), [])
  const faults = useAsync(() => api.listFaults(), [])
  const past = useAsync(() => api.listBenchmarks(), [])

  // null means "not touched yet", so the page can start with everything on.
  const [pickedAgents, setPickedAgents] = useState<Set<number> | null>(null)
  const [pickedTasks, setPickedTasks] = useState<Set<string> | null>(null)
  const [pickedFaults, setPickedFaults] = useState<Set<string> | null>(null)
  const [trials, setTrials] = useState(1)
  const [liveChoice, setLiveChoice] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState('')

  const agentList = agents.data
  const taskList = tasks.data
  const faultList = faults.data

  const agentSet = useMemo(
    () => pickedAgents ?? new Set((agentList ?? []).filter((a) => a.online).map((a) => a.id)),
    [pickedAgents, agentList],
  )
  const taskSet = useMemo(() => pickedTasks ?? new Set((taskList ?? []).map((t) => t.id)), [pickedTasks, taskList])
  const faultSet = useMemo(() => pickedFaults ?? new Set((faultList ?? []).map((f) => f.id)), [pickedFaults, faultList])
  const live = liveChoice ?? health?.search_mode === 'live'

  const error = agents.error ?? tasks.error ?? faults.error
  if (error) {
    return (
      <div className="wrap">
        <PageHeader title="Who do you want to put to the test?" />
        <ErrorState
          error={error}
          onRetry={() => {
            agents.reload()
            tasks.reload()
            faults.reload()
          }}
        />
      </div>
    )
  }
  if (!agentList || !taskList || !faultList) {
    return (
      <div className="wrap">
        <PageHeader title="Who do you want to put to the test?" />
        <Loading />
      </div>
    )
  }

  const pickedAgentCount = agentList.filter((a) => a.online && agentSet.has(a.id)).length
  const items = taskSet.size + faultSet.size
  const total = pickedAgentCount * items * trials
  const perRun = costPerRun(past.data)

  const toggle = <T,>(set: Set<T>, set_: (s: Set<T>) => void, v: T, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(v)
    else next.delete(v)
    set_(next)
  }

  const blocked =
    agentList.length === 0
      ? 'There are no agents to test yet.'
      : pickedAgentCount === 0
        ? 'Pick at least one agent.'
        : items === 0
          ? 'Pick at least one question or problem.'
          : undefined

  async function start() {
    setBusy(true)
    setStartError('')
    try {
      const res = await api.startBenchmark({
        agent_ids: agentList!.filter((a) => a.online && agentSet.has(a.id)).map((a) => a.id),
        task_ids: taskList!.filter((t) => taskSet.has(t.id)).map((t) => t.id),
        fault_ids: faultList!.filter((f) => faultSet.has(f.id)).map((f) => f.id),
        trials,
        live_mode: live,
      })
      navigate(`/run/${res.id}`)
    } catch (e) {
      setStartError(asApiError(e).message)
      setBusy(false)
    }
  }

  const modelName = health ? (health.mock ? 'Test model' : label(health.agent_model)) : '…'
  const sentence =
    blocked ??
    `${plural(pickedAgentCount, 'agent')}, ${plural(items, 'question or problem', 'questions and problems')}, ${plural(trials, 'try', 'tries')} each.`
  const guess =
    perRun !== null && total > 0
      ? `Rough guess: about ${roughMoney(perRun * total)}, going by your last run. The real number can differ.`
      : 'No cost guess yet. Your first run will give us one.'

  const allNone = (all: () => void, none: () => void) => (
    <>
      <Button small variant="quiet" onClick={all}>
        All
      </Button>
      <Button small variant="quiet" onClick={none}>
        None
      </Button>
    </>
  )

  return (
    <div className="wrap ds rf">
      <PageHeader
        title="Who do you want to put to the test?"
        answer="Same questions for everyone, then we break things."
      />

      <EngineNotice onReady={agents.reload} />

      <section className="ds-block" aria-label="Who's being tested">
        <SectionBar title="Agents" hint={`${pickedAgentCount} of ${agentList.length} picked`} />
        {agentList.length === 0 ? (
          <EmptyState>
            No agents yet. <Link to="/agents">Add one</Link> or <Link to="/studio">make one</Link>.
          </EmptyState>
        ) : (
          <div className="ds-scroll">
            <table className="ds-table" aria-label="Agents to test">
              <thead>
                <tr>
                  <th className="narrow">
                    <span className="sr-only">Pick</span>
                  </th>
                  <th>Agent</th>
                  <th className="hide-sm">Source</th>
                  <th className="hide-sm">Address</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agentList.map((a: Agent) => (
                  <tr key={a.id} className={a.online ? '' : 'is-off'} title={a.online ? a.description : OFFLINE_REASON}>
                    <td className="narrow">
                      <input
                        id={`rf-agent-${a.id}`}
                        type="checkbox"
                        className="ds-check"
                        checked={a.online && agentSet.has(a.id)}
                        disabled={!a.online}
                        aria-label={`Test ${a.name}`}
                        onChange={(e) => toggle(agentSet, setPickedAgents, a.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      <label className="plate" htmlFor={`rf-agent-${a.id}`}>
                        <b>{a.name}</b>
                        <small>{a.online ? a.tag || 'Ready' : OFFLINE_REASON}</small>
                      </label>
                    </td>
                    <td className="graph hide-sm">{agentSource(a)}</td>
                    <td className="graph hide-sm ds-where">{a.url}</td>
                    <td>
                      <OnlineStatus online={a.online} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ds-block" aria-label="Everyday questions">
        <SectionBar
          title="Everyday questions"
          actions={allNone(
            () => setPickedTasks(new Set(taskList.map((t) => t.id))),
            () => setPickedTasks(new Set()),
          )}
        />
        <div className="ds-scroll">
          <table className="ds-table" aria-label="Everyday questions to ask">
            <thead>
              <tr>
                <th className="narrow">
                  <span className="sr-only">Pick</span>
                </th>
                <th>Question</th>
                <th>Area</th>
              </tr>
            </thead>
            <tbody>
              {taskList.map((t) => (
                <tr key={t.id}>
                  <td className="narrow">
                    <input
                      id={`rf-task-${t.id}`}
                      type="checkbox"
                      className="ds-check"
                      checked={taskSet.has(t.id)}
                      aria-label={`Ask: ${t.title}`}
                      onChange={(e) => toggle(taskSet, setPickedTasks, t.id, e.target.checked)}
                    />
                  </td>
                  <td>
                    <label className="plate" htmlFor={`rf-task-${t.id}`}>
                      <b>{t.title}</b>
                    </label>
                  </td>
                  <td className="graph">{t.area}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ds-block" aria-label="Problems we cause on purpose">
        <SectionBar
          title="Problems we cause"
          actions={allNone(
            () => setPickedFaults(new Set(faultList.map((f) => f.id))),
            () => setPickedFaults(new Set()),
          )}
        />
        <div className="ds-scroll">
          <table className="ds-table" aria-label="Problems to cause">
            <thead>
              <tr>
                <th className="narrow">
                  <span className="sr-only">Pick</span>
                </th>
                <th>Problem</th>
                <th>Test condition</th>
              </tr>
            </thead>
            <tbody>
              {faultList.map((f) => (
                <tr key={f.id}>
                  <td className="narrow">
                    <input
                      id={`rf-fault-${f.id}`}
                      type="checkbox"
                      className="ds-check"
                      checked={faultSet.has(f.id)}
                      aria-label={`Cause: ${f.label}`}
                      onChange={(e) => toggle(faultSet, setPickedFaults, f.id, e.target.checked)}
                    />
                  </td>
                  <td>
                    <label className="plate" htmlFor={`rf-fault-${f.id}`}>
                      <b>{f.label}</b>
                    </label>
                  </td>
                  <td className="graph">{f.short}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ds-block" aria-label="How hard to push">
        <SectionBar title="Tries for each" />
        <div className="rf-tries">
          <Segmented
            label="Tries each"
            value={trials}
            onChange={setTrials}
            options={[
              { value: 1, label: '1' },
              { value: 3, label: '3' },
              { value: 5, label: '5' },
            ]}
          />
        </div>
        <details className="ds-more rf-more">
          <summary>
            More options
            <Chevron />
          </summary>
          <div className="switch-row rf-more-row">
            <span>
              Search the live web instead
              <small className="rf-sub">
                Uses real search results, not the saved ones. It is slower and can use search credits.
              </small>
            </span>
            <Switch checked={live} onChange={setLiveChoice} label="Search the live web instead" />
          </div>
        </details>
      </section>

      <div className="rf-summary">
        <TitleBlock
          label="Summary of the run"
          cells={[
            { label: 'Runs', value: plural(total, 'run') },
            { label: 'Rough cost', value: perRun !== null && total > 0 ? `about ${roughMoney(perRun * total)}` : 'No guess yet' },
            { label: 'Model', value: modelName },
            { label: 'Search', value: live ? 'Live web' : 'Saved results' },
          ]}
          action={
            <Button variant="primary" large needsSignIn disabledReason={blocked} disabled={busy} onClick={start}>
              {busy ? 'Starting…' : 'Start the run'}
            </Button>
          }
        />
        <p className="ds-note rf-sentence" aria-live="polite">
          {sentence} {guess}
        </p>
        {startError && <Notice tone="error">{startError}</Notice>}
      </div>
    </div>
  )
}

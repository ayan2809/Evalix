import { Fragment, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, asApiError, type BenchmarkDetail, type MaximExportResult } from '../../api'
import { badgeFor, money, shortDate } from '../../format'
import { useShell } from '../../shell/ShellContext'
import {
  Button,
  ErrorState,
  Loading,
  LinkButton,
  Mark,
  markWord,
  Notice,
  PageHeader,
  SectionBar,
  TitleBlock,
  type MarkState,
} from '../../ui'
import { useBenchmarkStream, type LiveRun } from './useBenchmarkStream'
import '../sheet.css'
import './run.css'

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/** What a run is doing right now, in plain words. */
function doing(run: LiveRun): string {
  const s = run.lastStep
  if (!s) return 'Starting'
  if (s.kind === 'model_call') return 'Asking the model'
  if (s.kind === 'final_answer') return 'Writing its answer'
  return s.name ? `Using ${s.name.replace(/_/g, ' ')}` : 'Using a tool'
}

export default function LiveRunPage({ benchmarkId }: { benchmarkId: string }) {
  const { bench, runs } = useBenchmarkStream(benchmarkId)
  const d = bench.data

  // Cells that were already finished when the page opened fade in 30 ms apart. Cells that finish later fade in as they land.
  const atLoad = useRef<Set<string> | null>(null)
  if (d && atLoad.current === null) atLoad.current = new Set(runs.filter((r) => r.ending !== null).map((r) => r.id))

  if (bench.error && !d) {
    return (
      <div className="wrap">
        <PageHeader title="Who is getting through?" />
        <ErrorState error={bench.error} onRetry={bench.reload} />
      </div>
    )
  }
  if (!d) {
    return (
      <div className="wrap">
        <PageHeader title="Who is getting through?" />
        <Loading text="Opening the run…" />
      </div>
    )
  }
  return <Body d={d} runs={runs} atLoad={atLoad.current ?? new Set()} reload={bench.reload} />
}

function Body({
  d,
  runs,
  atLoad,
  reload,
}: {
  d: BenchmarkDetail
  runs: LiveRun[]
  atLoad: Set<string>
  reload: () => void
}) {
  const { settings, openSettings } = useShell()
  const [stopping, setStopping] = useState(false)
  const [stopError, setStopError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<MaximExportResult | null>(null)
  const [sendError, setSendError] = useState('')

  const agentName = useMemo(() => new Map(d.agents.map((a) => [a.id, a.name])), [d.agents])
  const faultShort = useMemo(() => new Map(d.faults.map((f) => [f.id, f.short || f.label])), [d.faults])
  const itemLabel = useMemo(() => {
    const m = new Map<string, string>()
    d.tasks.forEach((t) => m.set(`t:${t.id}`, t.title))
    d.faults.forEach((f) => m.set(`f:${f.id}`, f.label))
    return m
  }, [d.tasks, d.faults])

  // One slot per agent, item and try. If a run was redone after a setup problem, the redo wins.
  const slots = useMemo(() => {
    const m = new Map<string, LiveRun>()
    for (const r of runs) {
      const key = `${r.agentId}|${r.faultId ? 'f:' + r.faultId : 't:' + r.taskId}|${r.trial}`
      const old = m.get(key)
      if (!old || old.ending === 'setup_problem' || (r.ending !== 'setup_problem' && r.order >= old.order))
        m.set(key, r)
    }
    return m
  }, [runs])

  const finishedSlots = [...slots.values()].filter((r) => r.ending !== null && r.ending !== 'setup_problem')
  const total = d.total_runs
  const done = Math.min(total || Infinity, Math.max(d.done_runs, finishedSlots.length))
  const running = d.status === 'running'
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const counts = { through: 0, slipped: 0, recovered: 0 }
  for (const r of finishedSlots) {
    const b = badgeFor(r.ending, r.faultFired)
    if (b === 'Pass') counts.through++
    else if (b === 'Recovered') counts.recovered++
    else if (b === 'Fail') counts.slipped++
  }
  const happening = [...slots.values()].filter((r) => r.ending === null).slice(0, 8)

  async function stop() {
    setStopping(true)
    setStopError('')
    try {
      await api.cancelBenchmark(d.id)
      reload()
    } catch (e) {
      setStopError(asApiError(e).message)
      setStopping(false)
    }
  }

  async function sendToMaxim() {
    setSending(true)
    setSendError('')
    try {
      setSent(await api.exportMaxim(d.id))
    } catch (e) {
      setSendError(asApiError(e).message)
    } finally {
      setSending(false)
    }
  }

  const title = running
    ? 'Who is getting through?'
    : d.status === 'cancelled'
      ? 'Who got through before it stopped?'
      : 'Who got through?'
  const answer = running
    ? stopping
      ? 'Stopping. Runs already going will finish first.'
      : 'Runs are happening now. This page updates by itself.'
    : d.status === 'cancelled'
      ? `Stopped. ${done} of ${total} runs finished.`
      : `All ${total} runs finished.`

  const facts = [
    `Run ${d.id}, started ${shortDate(d.created_at)}`,
    `${plural(d.trials, 'try', 'tries')} each`,
    d.live_mode ? 'live web search' : 'saved search results',
    `${plural(d.agent_count, 'agent')}`,
  ].join(', ')

  const statusWord = running ? (stopping ? 'Stopping' : 'Running') : d.status === 'cancelled' ? 'Stopped' : 'Done'
  const cancelled = d.status === 'cancelled'

  const finishedSheet = !running && (
    <section className="ds-sheet rr-finish" aria-label="Finished">
      <h2>{cancelled ? 'Stopped. See the results so far.' : 'Done. See the results.'}</h2>
      <div className="ds-actions">
        <LinkButton to="/" variant="primary">
          See the results
        </LinkButton>
        <Button
          ownerOnly
          disabled={sending}
          disabledReason={
            settings && !settings.send_to.maxim_ready ? 'Add your Maxim keys in Settings first.' : undefined
          }
          onClick={sendToMaxim}
        >
          {sending ? 'Sending…' : 'Send to Maxim'}
        </Button>
        {settings && !settings.send_to.maxim_ready && (
          <button type="button" className="link-btn small-link" onClick={() => openSettings('send')}>
            Open settings
          </button>
        )}
      </div>
      {sent && <Notice tone={sent.ok ? 'pass' : 'warn'}>{sent.note}</Notice>}
      {sendError && <Notice tone="error">{sendError}</Notice>}
    </section>
  )

  const hasFaults = d.faults.length > 0
  const hasTasks = d.tasks.length > 0
  const cols = d.agents.length

  let cellIndex = 0
  const row = (kind: 't' | 'f', id: string, title: string, sub?: string) => {
    const key = `${kind}:${id}`
    return (
      <tr key={key}>
        <th scope="row" className="rr-item">
          {title}
          {sub && <small>{sub}</small>}
        </th>
        {d.agents.map((a) => {
          const trials: (LiveRun | undefined)[] = []
          for (let t = 1; t <= d.trials; t++) trials.push(slots.get(`${a.id}|${key}|${t}`))
          const fresh = trials.some((r) => r && r.ending !== null && !atLoad.has(r.id))
          const idx = cellIndex++
          return (
            <td key={a.id} className="rr-cell" data-cell={`${a.id}|${key}`}>
              <Cell trials={trials} single={d.trials === 1} cancelled={cancelled} index={fresh ? 0 : idx} />
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div className="wrap ds rr">
      <TitleBlock
        label="This run"
        cells={[
          { label: 'Status', value: statusWord },
          { label: 'Done', value: `${done} of ${total}` },
          { label: 'Got through', value: counts.through },
          { label: 'Slipped', value: counts.slipped },
          { label: 'Recovered', value: counts.recovered },
          { label: 'Spent so far', value: money(d.total_cost) },
        ]}
        action={
          running && (
            <Button needsSignIn disabled={stopping} onClick={stop}>
              {stopping ? 'Stopping…' : 'Stop the run'}
            </Button>
          )
        }
      />

      <PageHeader title={title} answer={answer} facts={facts} />
      {stopError && <Notice tone="error">{stopError}</Notice>}

      <section className="rr-progress" aria-label="Progress">
        <div className="rr-progress-head">
          <span>
            <b>{done}</b> of {total} runs done
          </span>
          <span className="tag">
            {counts.through} got through, {counts.slipped} slipped, {counts.recovered} recovered
            {happening.length > 0 && running ? `, ${happening.length} running now` : ''}
          </span>
        </div>
        <div
          className="rr-track"
          role="progressbar"
          aria-label="Runs done"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="rr-track-ends" aria-hidden="true">
          <span>0</span>
          <span>{total}</span>
        </div>
      </section>

      {finishedSheet}

      <section className="ds-block" aria-label="Results so far">
        <SectionBar title="Results so far" />
        {cols === 0 ? (
          <p className="ds-empty">This run has no agents.</p>
        ) : (
          <div className="ds-scroll">
            <table className="ds-table rr-grid" aria-label="Results by agent and item">
              <thead>
                <tr>
                  <th scope="col">What they faced</th>
                  {d.agents.map((a) => (
                    <th key={a.id} scope="col">
                      {a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hasTasks && (
                  <Fragment>
                    <tr className="rr-group">
                      <th colSpan={cols + 1}>Everyday questions</th>
                    </tr>
                    {d.tasks.map((t) => row('t', t.id, t.title))}
                  </Fragment>
                )}
                {hasFaults && (
                  <Fragment>
                    <tr className="rr-group">
                      <th colSpan={cols + 1}>Problems we caused</th>
                    </tr>
                    {d.faults.map((f) => row('f', f.id, f.label, f.short))}
                  </Fragment>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {running && (
        <section className="ds-block" aria-label="Happening now">
          <SectionBar title="Happening now" />
          {happening.length === 0 ? (
            <p className="ds-empty">Waiting for the next run to start.</p>
          ) : (
            <div className="ds-scroll">
              <table className="ds-table rr-now" aria-label="Runs going now">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Facing</th>
                    <th>Latest step</th>
                    <th className="narrow">
                      <span className="sr-only">Problem caused</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {happening.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="rr-who">
                          <Mark state="running" size={13} />
                          <b>{agentName.get(r.agentId) ?? `Agent ${r.agentId}`}</b>
                        </span>
                      </td>
                      <td>
                        {itemLabel.get(r.faultId ? `f:${r.faultId}` : `t:${r.taskId}`) ?? r.taskId}
                        {d.trials > 1 ? `, try ${r.trial}` : ''}
                      </td>
                      <td className="graph">{doing(r)}</td>
                      <td className="narrow">
                        {r.faultFired && (
                          <span className="rr-broke" title={faultShort.get(r.faultId)}>
                            We broke this
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** The mark that goes in a cell for a finished run. */
function markFor(r: LiveRun): MarkState {
  if (r.ending === 'passed') return r.faultFired ? 'recovered' : 'through'
  if (r.ending === 'crashed') return 'crashed'
  if (r.ending === 'setup_problem') return 'setup'
  return 'slipped'
}

/** One cell of the table: the result of each try, each linking to its run. */
function Cell({
  trials,
  single,
  cancelled,
  index,
}: {
  trials: (LiveRun | undefined)[]
  single: boolean
  cancelled: boolean
  index: number
}) {
  const anyStarted = trials.some(Boolean)
  if (!anyStarted && !cancelled) return <span className="rr-wait">Waiting</span>
  return (
    <div className="rr-marks">
      {trials.map((r, i) => {
        // A stopped run keeps every cell. What never finished is drawn dashed, like a setup problem.
        if (!r || (r.ending === null && cancelled)) {
          const why = r ? 'Stopped before it finished' : 'Stopped before it started'
          return (
            <span key={r?.id ?? i} className="rr-stopped" title={why}>
              <Mark state="setup" label={why} />
              {single && <span className="rr-word">Not run</span>}
            </span>
          )
        }
        if (r.ending === null)
          return (
            <span key={r.id} className="rr-running">
              <Mark state="running" />
              {single && <span className="rr-word">Running</span>}
            </span>
          )
        const state = markFor(r)
        const word = markWord(state)
        const label = `${word}${single ? '' : `, try ${r.trial}`}. Open the run.`
        return (
          <Link
            key={r.id}
            to={`/runs/${r.id}`}
            className={`rr-link ${state}`}
            aria-label={label}
            title={single ? undefined : `Try ${r.trial}: ${word}`}
          >
            <Mark state={state} ink index={index} label={word} />
            {single && <span className="rr-word">{word}</span>}
          </Link>
        )
      })}
    </div>
  )
}

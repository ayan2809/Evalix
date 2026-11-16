import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, asApiError, currentShareToken, shareUrl, type BenchmarkDetail, type BenchmarkListItem } from '../api'
import { useCanEdit } from '../auth'
import { money } from '../format'
import { useAsync, usePolling, useTitle } from '../hooks'
import { Button, EmptyState, ErrorState, Loading, LinkButton, Notice, PageHeader, Plate, SectionBar, Select, Table, TitleBlock } from '../ui'
import { useShell, useModelLabel } from '../shell/ShellContext'
import { CostPlot } from './results/CostPlot'
import { FirstRun } from './results/FirstRun'
import { ProblemGrid } from './results/ProblemGrid'
import {
  agentRows,
  answerSentence,
  buildCells,
  everydaySentence,
  faultProblems,
  questionProblems,
  type AgentRow,
} from './results/model'
import { duration, fullDay, numberWord, shortDayTime, spentWords, upperFirst } from './results/words'
import './results/results.css'

/** The pinned one, else the newest finished run, else the newest one still going, else just the newest. */
function defaultPick(list: BenchmarkListItem[]): BenchmarkListItem | undefined {
  const shown = list.filter((b) => !b.archived)
  return (
    shown.find((b) => b.featured) ??
    shown.find((b) => b.status === 'done') ??
    shown.find((b) => b.status === 'running') ??
    shown[0] ??
    list[0]
  )
}

/** "Nov 15, 8:12 PM, 12 runs", plus the number and a word when it is pinned, still going or archived. */
function benchLabel(b: BenchmarkListItem): string {
  const notes = [
    b.featured ? 'pinned' : '',
    b.status === 'running' ? 'still running' : b.status === 'cancelled' ? 'stopped early' : '',
    b.archived ? 'archived' : '',
  ].filter(Boolean)
  return `#${b.id}, ${shortDayTime(b.created_at)}, ${b.total_runs} runs${notes.length ? `, ${notes.join(', ')}` : ''}`
}

export default function Results() {
  useTitle('Results')
  const [params, setParams] = useSearchParams()
  const [showArchived, setShowArchived] = useState(false)
  const list = useAsync(() => api.listBenchmarks(showArchived), [showArchived])

  if (list.error) {
    return (
      <div className="wrap sheet">
        <ErrorState error={list.error} onRetry={list.reload} />
      </div>
    )
  }
  if (!list.data) {
    return (
      <div className="wrap sheet">
        <Loading text="Loading the results…" />
      </div>
    )
  }
  if (list.data.length === 0) return <FirstRun />

  const wanted = Number(params.get('b'))
  const chosen = list.data.find((b) => b.id === wanted) ?? defaultPick(list.data)!
  return (
    <Loaded
      list={list.data}
      id={chosen.id}
      onPick={(id) => setParams(id === defaultPick(list.data!)?.id ? {} : { b: String(id) })}
      reloadList={list.reload}
      showArchived={showArchived}
      setShowArchived={setShowArchived}
    />
  )
}

function StartRun({ large }: { large?: boolean }) {
  const { canEdit, reason } = useCanEdit()
  if (currentShareToken()) return null // a shared link only shows results
  // A guest can't start runs. Show the button as off, with the reason on hover, instead of sending them to a dead end.
  if (!canEdit) {
    return (
      <Button variant="primary" large={large} disabledReason={reason}>
        Start a run
      </Button>
    )
  }
  return (
    <LinkButton to="/run" variant="primary" large={large}>
      Start a run
    </LinkButton>
  )
}

interface ListControls {
  reloadList: () => void
  showArchived: boolean
  setShowArchived: (v: boolean) => void
}

function Loaded({
  list,
  id,
  onPick,
  ...controls
}: { list: BenchmarkListItem[]; id: number; onPick: (id: number) => void } & ListControls) {
  const [more, setMore] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  const bench = usePolling(() => api.getBenchmark(id), [id], 3000, (d) => d?.status === 'running')

  const d = bench.data
  // Keep the old picture on screen while a different run loads, but never show run A under run B's name.
  const ready = d && d.id === id ? d : null

  if (bench.error && !ready) {
    return (
      <div className="wrap sheet">
        <ErrorState error={bench.error} onRetry={bench.reload} />
      </div>
    )
  }
  if (!ready) {
    return (
      <div className="wrap sheet">
        <Loading text="Loading the results…" />
      </div>
    )
  }
  return (
    <Board
      key={ready.id}
      bench={ready}
      list={list}
      onPick={onPick}
      controls={controls}
      more={more}
      setMore={setMore}
      showQuestions={showQuestions}
      setShowQuestions={setShowQuestions}
    />
  )
}

// Limits for one run. These are the real values from RUN_LIMITS in backend/app/config.py
// ({"seconds": 120, "model_calls": 15, "tool_calls": 20}); keep them in step with it.
const RUN_LIMITS = [
  { label: 'Time', value: '120 s' },
  { label: 'Model calls', value: '15' },
  { label: 'Tool calls', value: '20' },
]

function Board({
  bench,
  list,
  onPick,
  more,
  setMore,
  showQuestions,
  setShowQuestions,
  controls,
}: {
  bench: BenchmarkDetail
  list: BenchmarkListItem[]
  controls: ListControls
  onPick: (id: number) => void
  more: boolean
  setMore: (v: boolean) => void
  showQuestions: boolean
  setShowQuestions: (v: boolean) => void
}) {
  const cells = useMemo(() => buildCells(bench), [bench])
  const faultRows = useMemo(() => faultProblems(bench, cells), [bench, cells])
  const questionRows = useMemo(() => questionProblems(bench, cells), [bench, cells])
  const rows = useMemo(() => agentRows(bench, cells, questionRows, faultRows), [bench, cells, questionRows, faultRows])

  const running = bench.status === 'running'
  const answer = running
    ? `Still running: ${bench.done_runs} of ${bench.total_runs} runs are done.`
    : answerSentence(rows, faultRows.length > 0 || questionRows.length > 0)

  // With more than one benchmark, the Date cell of the title block is the picker.
  const dateCell =
    list.length > 1 ? (
      <span className="rs-picker">
        <Select
          ariaLabel="Showing benchmark"
          small
          value={bench.id}
          onChange={onPick}
          options={list.map((b) => ({ value: b.id, label: benchLabel(b) }))}
        />
      </span>
    ) : (
      fullDay(bench.created_at)
    )

  const nAgents = bench.agents.length
  const nProblems = faultRows.length || bench.faults.length
  const tries = bench.trials === 1 ? 'one try each' : `${numberWord(bench.trials)} tries each`
  const runsCell =
    bench.status === 'done'
      ? `${bench.total_runs}, ${tries}`
      : `${bench.done_runs} of ${bench.total_runs}${bench.status === 'cancelled' ? ', stopped early' : ''}`

  return (
    <div className="wrap sheet rs">
      <TitleBlock
        className="rs-tb"
        label="This benchmark"
        cells={[
          {
            label: 'Benchmark',
            value: `${upperFirst(numberWord(nAgents))} ${nAgents === 1 ? 'agent' : 'agents'}, ${numberWord(nProblems)} ${nProblems === 1 ? 'problem' : 'problems'}`,
          },
          { label: list.length > 1 ? 'Showing' : 'Date', value: dateCell },
          { label: 'Runs', value: runsCell },
          { label: 'Spent', value: spentWords(bench.total_cost) },
          { label: 'Graded by', value: 'Rule checks' },
        ]}
        action={currentShareToken() ? undefined : <StartRun />}
      />

      <PageHeader title="Which agents hold up when things break?" answer={answer} />

      <BenchActions bench={bench} item={list.find((b) => b.id === bench.id)} controls={controls} />

      {running && (
        <Notice>
          This run is still going. Results fill in as each agent finishes. <Link to={`/run/${bench.id}`}>Watch it live</Link>.
        </Notice>
      )}

      {rows.length === 0 ? (
        <EmptyState title="Nothing to show yet.">No agent has finished a run here.</EmptyState>
      ) : (
        <>
          <div className="rs-cols">
            <section className="rs-main" aria-label="Behaviour under fault conditions">
              <SectionBar title="Behaviour under fault conditions" />
              {faultRows.length > 0 ? (
                <>
                  <ProblemGrid
                    bench={bench}
                    cells={cells}
                    problems={faultRows}
                    label="Behaviour under fault conditions"
                    firstHead="Problem we caused"
                    animate
                    legend
                  />
                </>
              ) : (
                <p className="section-hint">No problems were caused in this run, only everyday questions.</p>
              )}
            </section>

            <aside className="rs-side" aria-label="Plot, limits and setup">
              <section>
                <SectionBar title="Problems got through vs cost" />
                <CostPlot rows={rows} />
              </section>
              <section>
                <SectionBar title="Limits for one run" />
                <Spec rows={RUN_LIMITS} label="Limits for one run" />
              </section>
              <TestSetup bench={bench} />
            </aside>
          </div>

          <section className="section rs-fit">
            <SectionBar
              title="Who passed, and what it cost"
              actions={
                <Button small variant="quiet" aria-expanded={more} aria-controls="rs-agents" onClick={() => setMore(!more)}>
                  {more ? 'Fewer numbers' : 'More numbers'}
                </Button>
              }
            />
            <AgentTable id="rs-agents" rows={rows} more={more} />
          </section>

          {questionRows.length > 0 && (
            <section className="section">
              <SectionBar title="Everyday questions" />
              <div className="rs-everyday">
                <p>{everydaySentence(bench, cells, questionRows)}</p>
                <button
                  type="button"
                  className="link-btn"
                  aria-expanded={showQuestions}
                  aria-controls="rs-questions"
                  onClick={() => setShowQuestions(!showQuestions)}
                >
                  {showQuestions ? 'Hide the questions' : `Show all ${questionRows.length} questions`}
                </button>
              </div>
              {showQuestions && (
                <div id="rs-questions">
                  <ProblemGrid
                    bench={bench}
                    cells={cells}
                    problems={questionRows}
                    label="Everyday questions"
                    firstHead="Question"
                    animate={false}
                  />
                </div>
              )}
            </section>
          )}

          <p className="tag rs-foot">
            Code decides pass or fail. Answer keys stay hidden.
            {bench.trials === 1 ? ' One try per test is a small sample.' : ''}
          </p>
        </>
      )}
    </div>
  )
}

/** A short two-column spec: label and value, ruled rows. */
function Spec({ rows, label }: { rows: { label: string; value: string }[]; label: string }) {
  return (
    <dl className="spec" aria-label={label}>
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Model, search and grading for this benchmark. The model is read from one of its runs. */
function TestSetup({ bench }: { bench: BenchmarkDetail }) {
  const { health } = useShell()
  const modelLabel = useModelLabel()
  const firstRun = bench.runs[0]?.id
  const model = useAsync(() => (firstRun ? api.getRun(firstRun).then((r) => r.model) : Promise.resolve('')), [firstRun])
  const id = model.data || health?.agent_model
  return (
    <section>
      <SectionBar title="Test setup" />
      <Spec
        label="Test setup"
        rows={[
          { label: 'Model', value: health?.mock ? 'Test model' : id ? modelLabel(id) : '…' },
          { label: 'Search', value: bench.live_mode ? 'Live web' : 'Saved results' },
          { label: 'Grading', value: 'Rule checks' },
        ]}
      />
    </section>
  )
}

function outOf(passed: number, total: number): string {
  return total > 0 ? `${passed} of ${total}` : '–'
}

function AgentTable({ id, rows, more }: { id: string; rows: AgentRow[]; more: boolean }) {
  return (
    <div id={id}>
      <Table label="Who passed, and what it cost" className="rs-agents">
        <thead>
          <tr>
            <th>Agent</th>
            <th className="num">Everyday questions passed</th>
            <th className="num">Problems got through</th>
            <th className="num">Cost</th>
            {more && (
              <>
                <th className="num">Average time</th>
                <th className="num">Cost per right answer</th>
                <th className="num">Steps used</th>
                <th className="num">Setup problems</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                <Plate name={r.name} tag={r.tag} description={r.description} />
              </th>
              <td className="num">{outOf(r.qPassed, r.qTotal)}</td>
              <td className="num">{outOf(r.fPassed, r.fTotal)}</td>
              <td className="num">{money(r.cost)}</td>
              {more && (
                <>
                  <td className="num">{r.avgSeconds === null ? '–' : duration(r.avgSeconds)}</td>
                  <td className="num">{money(r.costPerSuccess)}</td>
                  <td className="num">{r.stepRatio === null ? '–' : `${Math.round(r.stepRatio * 100)}% of ideal`}</td>
                  <td className="num">{r.setupProblems}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

/** Pin, share and archive this benchmark, and show archived ones. Only for people who can change this workspace. */
function BenchActions({ bench, item, controls }: { bench: BenchmarkDetail; item?: BenchmarkListItem; controls: ListControls }) {
  const { canEdit } = useCanEdit()
  const { toast } = useShell()
  const [busy, setBusy] = useState(false)
  if (!canEdit || currentShareToken()) return null
  const featured = item?.featured ?? false
  const archived = item?.archived ?? false
  const token = item?.share_token ?? null

  async function act(work: () => Promise<unknown>, said: string) {
    setBusy(true)
    try {
      await work()
      toast(said)
      controls.reloadList()
    } catch (e) {
      toast(asApiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    setBusy(true)
    try {
      const made = token ?? (await api.shareBenchmark(bench.id, true)).share_token
      await navigator.clipboard.writeText(shareUrl(made, '/'))
      toast('Link copied. Anyone with it can see this benchmark and its runs, read-only.')
      if (!token) controls.reloadList()
    } catch (e) {
      toast(asApiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rs-actions" role="group" aria-label="This benchmark">
      <Button small variant="quiet" disabled={busy || archived} onClick={() => act(() => api.featureBenchmark(bench.id, !featured), featured ? 'Unpinned.' : 'Pinned. Everyone sees this one first, guests too.')}>
        {featured ? 'Unpin' : 'Pin as the one people see first'}
      </Button>
      <Button small variant="quiet" disabled={busy} onClick={copyLink}>
        {token ? 'Copy share link' : 'Share a read-only link'}
      </Button>
      {token && (
        <Button small variant="quiet" disabled={busy} onClick={() => act(() => api.shareBenchmark(bench.id, false), 'Sharing stopped. The old link no longer works.')}>
          Stop sharing
        </Button>
      )}
      {bench.status !== 'running' && (
        <Button small variant="quiet" disabled={busy} onClick={() => act(() => api.archiveBenchmark(bench.id, !archived), archived ? 'Back in the list.' : 'Archived. It is hidden from the list; its runs stay.')}>
          {archived ? 'Restore' : 'Archive'}
        </Button>
      )}
      <Button small variant="quiet" aria-pressed={controls.showArchived} onClick={() => controls.setShowArchived(!controls.showArchived)}>
        {controls.showArchived ? 'Hide archived' : 'Show archived'}
      </Button>
    </div>
  )
}

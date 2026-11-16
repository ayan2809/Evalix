import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  api,
  asApiError,
  type ApiError,
  type GatewayLogEntry,
  type GatewayStatus,
  type GatewayStopId,
  type GatewayTestName,
  type GatewayTestResult,
  type GatewayTrace,
} from '../api'
import { money, shortDate } from '../format'
import { useTitle } from '../hooks'
import { useModelLabel, useShell } from '../shell/ShellContext'
import { Button, ErrorState, Loading, Mark, Notice, PageHeader, SectionBar, Segmented } from '../ui'
import { STOPS, TEST_WORD, type Stop } from './gateway/stops'
import { AccessTest, BudgetTest, FallbackTest, RateTest, RetryTest, bare, type TestProps } from './gateway/Tests'
import './sheet.css'
import './gateway/gateway.css'

const TESTS: Record<GatewayTestName, (p: TestProps) => ReactElement> = {
  fallback: FallbackTest,
  retry: RetryTest,
  budget: BudgetTest,
  rate: RateTest,
  access: AccessTest,
}

export default function Gateway() {
  useTitle('Gateway')
  const label = useModelLabel()
  const { asleep, hosted, health } = useShell()
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [running, setRunning] = useState<GatewayTestName | 'all' | null>(null)
  const [error, setError] = useState('')
  const [trace, setTrace] = useState<GatewayTrace | null>(null)
  const [tracing, setTracing] = useState(false)
  const [open, setOpen] = useState<GatewayStopId | null>(null)
  const alive = useRef(true)

  const load = useCallback(() => {
    return api.gateway.status().then(
      (s) => {
        if (!alive.current) return
        setStatus(s)
        setLoadError(null)
      },
      (e: unknown) => {
        if (alive.current) setLoadError(asApiError(e))
      },
    )
  }, [])
  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
    }
  }, [load])

  const busy = running !== null || (status?.running ?? null) !== null
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => void load(), 2000)
    return () => clearInterval(t)
  }, [busy, load])

  async function sendOne() {
    setTracing(true)
    setError('')
    try {
      const t = await api.gateway.trace()
      setTrace(t)
      setOpen((o) => o ?? 'key')
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setTracing(false)
    }
  }

  async function runOne(name: GatewayTestName) {
    setRunning(name)
    setError('')
    try {
      const r: GatewayTestResult = await api.gateway.runTest(name)
      setStatus((s) => (s ? { ...s, last: { ...s.last, [r.name]: r } } : s))
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setRunning(null)
      void load()
    }
  }

  const shownRunning = running ?? status?.running ?? null
  const stop = STOPS.find((s) => s.id === open) ?? null
  const result = (id: GatewayStopId) => trace?.stops.find((s) => s.id === id)?.result

  return (
    <div className="wrap ds gw">
      <PageHeader
        title="Follow one model call through Bifrost."
        answer="Every call an agent makes passes through these stops on its way to the model."
        actions={
          <Button variant="primary" needsSignIn onClick={sendOne} disabled={tracing}>
            {tracing ? 'Sending…' : trace ? 'Send another call' : 'Send one call'}
          </Button>
        }
      />

      {asleep ? (
        <Notice tone="info">
          The gateway sleeps with the run engine while nobody is using it. Signed in, press “Send one call”: the engine
          switches on by itself in about a minute.
        </Notice>
      ) : (
        status?.bifrost_up === false &&
        (hosted ? (
          <Notice tone="error">Bifrost isn't answering on the run engine yet. Wait a minute, then try again.</Notice>
        ) : (
          <Notice tone="error">Bifrost isn't running. Start it with ./scripts/dev.sh, then try again.</Notice>
        ))
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <section className="ds-block" aria-labelledby="gw-path-title">
        <SectionBar
          title={<span id="gw-path-title">The path of a call</span>}
          actions={health && !health.mock ? <span className="gw-real">Real calls through Bifrost, not a mock</span> : undefined}
        />
        <div className="gw-path" role="list">
          <span className="gw-end" role="listitem">
            Your agent
          </span>
          {STOPS.map((s, i) => {
            // Nothing is cached here, so the cache stop stays dashed even after a call.
            const done = !!trace && !!result(s.id) && s.id !== 'cache'
            return (
              <button
                key={s.id}
                type="button"
                role="listitem"
                className={`gw-stop${open === s.id ? ' on' : ''}${s.tests.length === 0 && s.id !== 'log' ? ' explained' : ''}`}
                aria-pressed={open === s.id}
                onClick={() => setOpen(open === s.id ? null : s.id)}
              >
                <span className="gw-stop-mark">
                  {done ? <Mark state="through" size={12} index={i} label="" /> : <i aria-hidden="true" />}
                </span>
                <span className="gw-stop-name">{s.name}</span>
              </button>
            )
          })}
          <span className="gw-end" role="listitem">
            {status ? label(bare(status.rules.fallback_model)) : 'The model'}
          </span>
        </div>
        {trace ? (
          <p className="gw-trace-line" role="status">
            {trace.ok ? (
              <>
                Answered in {trace.latency_ms} ms.
                {trace.overhead_ms !== null && <> Bifrost itself added {trace.overhead_ms.toFixed(1)} ms.</>}
                {trace.cost_usd !== null && <> Cost {money(trace.cost_usd)}.</>}
                {trace.simulated && <span className="muted"> Test mode: nothing was sent.</span>}
              </>
            ) : (
              <>The call failed: {trace.answer}</>
            )}
          </p>
        ) : (
          <p className="gw-trace-line muted">Send one call to see what happened at each stop, or pick a stop.</p>
        )}
      </section>

      {stop && (
        <StopPanel
          stop={stop}
          result={result(stop.id)}
          answer={stop.id === 'log' && trace?.ok ? trace.answer : undefined}
          status={status}
          loadError={loadError}
          reload={() => void load()}
          running={shownRunning}
          onRun={runOne}
          traceKey={trace}
        />
      )}

      <p className="gw-also">
        <b>Also in Bifrost:</b> tools for agents through MCP, OpenAI-compatible SDKs, metrics for Prometheus, and
        plugins. <a href="https://github.com/maximhq/bifrost">Bifrost on GitHub</a>
      </p>
    </div>
  )
}

function StopPanel({
  stop,
  result,
  answer,
  status,
  loadError,
  reload,
  running,
  onRun,
  traceKey,
}: {
  stop: Stop
  result: string | undefined
  answer: string | undefined
  status: GatewayStatus | null
  loadError: ApiError | null
  reload: () => void
  running: GatewayTestName | 'all' | null
  onRun: (name: GatewayTestName) => void
  traceKey: GatewayTrace | null
}) {
  const [pick, setPick] = useState<GatewayTestName>(stop.tests[0] ?? 'fallback')
  useEffect(() => setPick(stop.tests[0] ?? 'fallback'), [stop])
  const Test = TESTS[pick]

  return (
    <section className="ds-block gw-panel" aria-labelledby="gw-panel-title">
      <SectionBar title={<span id="gw-panel-title">{stop.title}</span>} />
      <div className="gw-about">
        <p>{stop.what}</p>
        {result && (
          <p className="gw-yours">
            <b>Your call:</b> {result}
          </p>
        )}
        {answer && (
          <p className="gw-yours">
            <b>The model said:</b> “{answer}”
          </p>
        )}
        {stop.notLive && <p className="ds-note">{stop.notLive}</p>}
      </div>

      {stop.id === 'log' && <RecentCalls refreshKey={traceKey} />}

      {stop.tests.length > 0 &&
        (loadError && !status ? (
          <ErrorState error={loadError} onRetry={reload} />
        ) : !status ? (
          <Loading />
        ) : (
          <>
            {stop.tests.length > 1 && (
              <div className="gw-pick">
                <Segmented
                  label="Which limit to try"
                  value={pick}
                  onChange={setPick}
                  options={stop.tests.map((t) => ({ value: t, label: TEST_WORD[t] }))}
                />
              </div>
            )}
            <Test
              rules={status.rules}
              result={status.last[pick]}
              running={running}
              mainModelDown={status.main_model_down}
              onRun={onRun}
            />
          </>
        ))}
    </section>
  )
}

function RecentCalls({ refreshKey }: { refreshKey: unknown }) {
  const [rows, setRows] = useState<GatewayLogEntry[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const load = useCallback(() => {
    api.gateway.logs(8).then(
      (r) => {
        setRows(r)
        setError(null)
      },
      (e: unknown) => setError(asApiError(e)),
    )
  }, [])
  useEffect(load, [load, refreshKey])

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!rows) return <Loading />
  if (rows.length === 0) return <p className="ds-empty">No calls logged yet. Send one call above.</p>
  return (
    <div className="ds-scroll gw-route">
      <table className="ds-table" aria-label="The latest calls in Bifrost's log">
        <thead>
          <tr>
            <th>When</th>
            <th>Model</th>
            <th>Result</th>
            <th className="num">Time</th>
            <th className="num">Bifrost added</th>
            <th className="num">Cost</th>
            <th>Key</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.at}-${i}`}>
              <td className="ds-nowrap">{shortDate(r.at)}</td>
              <td className="ds-nowrap">{bare(r.model)}</td>
              <td>
                {r.ok ? 'Answered' : 'Failed'}
                {r.retries > 0 && `, after ${r.retries} ${r.retries === 1 ? 'retry' : 'retries'}`}
                {r.used_backup && ', by the backup'}
              </td>
              <td className="num">{r.latency_ms === null ? '–' : `${Math.round(r.latency_ms)} ms`}</td>
              <td className="num">{r.overhead_ms === null ? '–' : `${r.overhead_ms.toFixed(1)} ms`}</td>
              <td className="num">{r.cost_usd === null ? '–' : money(r.cost_usd)}</td>
              <td className="ds-url">{r.virtual_key ?? r.key ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

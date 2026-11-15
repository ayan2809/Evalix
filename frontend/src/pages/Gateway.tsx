import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api,
  asApiError,
  type ApiError,
  type GatewayStatus,
  type GatewayTestName,
  type GatewayTestResult,
} from '../api'
import { useTitle } from '../hooks'
import { useModelLabel } from '../shell/ShellContext'
import { Button, ErrorState, Loading, Notice, PageHeader, TitleBlock } from '../ui'
import { BudgetTest, FallbackTest, RetryTest, bare } from './gateway/Tests'
import './sheet.css'
import './gateway/gateway.css'

const NAMES: { name: GatewayTestName; word: string }[] = [
  { name: 'fallback', word: 'Backup' },
  { name: 'retry', word: 'Retry' },
  { name: 'budget', word: 'Spending cap' },
]

export default function Gateway() {
  useTitle('Gateway test')
  const label = useModelLabel()
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [running, setRunning] = useState<GatewayTestName | 'all' | null>(null)
  const [error, setError] = useState('')
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

  // While a test runs, ask now and then, so the switch and the running label stay true.
  const busy = running !== null || (status?.running ?? null) !== null
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => void load(), 2000)
    return () => clearInterval(t)
  }, [busy, load])

  function merge(results: GatewayTestResult[]) {
    setStatus((s) => {
      if (!s) return s
      const last = { ...s.last }
      for (const r of results) last[r.name] = r
      return { ...s, last }
    })
  }

  async function runOne(name: GatewayTestName) {
    setRunning(name)
    setError('')
    try {
      merge([await api.gateway.runTest(name)])
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setRunning(null)
      void load()
    }
  }

  async function runAll() {
    setRunning('all')
    setError('')
    try {
      merge((await api.gateway.runAll()).results)
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setRunning(null)
      void load()
    }
  }

  const shownRunning = running ?? status?.running ?? null

  return (
    <div className="wrap ds gw">
      {status && (
        <TitleBlock
          label="Gateway"
          cells={[
            { label: 'Gateway', value: 'Bifrost' },
            { label: 'Status', value: status.bifrost_up === null ? 'Not checked' : status.bifrost_up ? 'Up' : 'Down' },
            { label: 'Fallback model', value: label(bare(status.rules.fallback_model)) },
            {
              wide: true,
              label: 'Retries',
              value: `${status.rules.max_retries}, from ${status.rules.backoff_initial_ms / 1000} s doubling`,
            },
            { label: 'Spending limit', value: limitText(status.rules) },
          ]}
          action={
            <Button variant="primary" ownerOnly disabled={shownRunning !== null} onClick={runAll}>
              {running === 'all' ? 'Running all three…' : 'Run all three'}
            </Button>
          }
        />
      )}

      <PageHeader
        title="Three ways a model can let you down."
        answer="Bifrost should catch all three."
        facts={
          <div className="stack" style={{ gap: 4 }}>
            {status && <Summary status={status} />}
            <span>
              Every model call from every agent goes through Bifrost. Here we cause each problem on purpose and watch
              what Bifrost does about it.
            </span>
          </div>
        }
      />

      {loadError && !status ? (
        <ErrorState error={loadError} onRetry={() => void load()} />
      ) : !status ? (
        <Loading />
      ) : (
        <>
          {status.bifrost_up === false && (
            <Notice tone="error">Bifrost isn't running. Start it with ./scripts/dev.sh, then run the tests.</Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <FallbackTest
            rules={status.rules}
            result={status.last.fallback}
            running={shownRunning}
            mainModelDown={status.main_model_down}
            onRun={runOne}
          />
          <RetryTest
            rules={status.rules}
            result={status.last.retry}
            running={shownRunning}
            mainModelDown={status.main_model_down}
            onRun={runOne}
          />
          <BudgetTest
            rules={status.rules}
            result={status.last.budget}
            running={shownRunning}
            mainModelDown={status.main_model_down}
            onRun={runOne}
          />
          <p className="ds-note" style={{ maxWidth: '78ch' }}>
            These test the gateway, not the agents, so they never change agent scores. Each one uses a real Bifrost
            setting. Evalix only causes the problem.
          </p>
        </>
      )}
    </div>
  )
}

function limitText(rules: GatewayStatus['rules']): string {
  return rules.limit_kind === 'calls'
    ? `${rules.limit_value} calls`
    : `$${Number(rules.limit_value.toPrecision(3))} per run`
}

/** The one-line answer, in words: what Bifrost did the last time we ran each test. */
function Summary({ status }: { status: GatewayStatus }) {
  const results = NAMES.map((n) => ({ ...n, r: status.last[n.name] }))
  const ran = results.filter((x) => x.r)
  const caught = ran.filter((x) => x.r!.ok)
  const missed = ran.filter((x) => !x.r!.ok)

  let title: string
  let sentence: string
  if (ran.length === 0) {
    title = 'Not run yet'
    sentence = 'Run all three to see what Bifrost does with each problem.'
  } else if (caught.length === 3) {
    title = 'Bifrost caught all three'
    sentence = 'No agent saw an error, and the runaway agent was stopped at its limit.'
  } else if (missed.length > 0) {
    title = `Bifrost caught ${caught.length} of ${ran.length}`
    sentence = `It missed: ${missed.map((x) => x.word.toLowerCase()).join(' and ')}. ${missed[0].r!.headline}`
  } else {
    title = `Bifrost has caught ${caught.length} of 3 so far`
    sentence = 'Run the others to see the rest.'
  }

  return (
    <span>
      <b>{title}.</b> {sentence}
    </span>
  )
}

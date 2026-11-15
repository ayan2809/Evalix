import { useState, type ReactNode } from 'react'
import type { GatewayCall, GatewayStatus, GatewayTestName, GatewayTestResult, GatewayTry } from '../../api'
import { money, shortDate } from '../../format'
import { useModelLabel } from '../../shell/ShellContext'
import { Button, Mark, TimingDiagram, type Lane, type Segment } from '../../ui'
import '../sheet.css'
import './gateway.css'

export interface TestProps {
  rules: GatewayStatus['rules']
  result: GatewayTestResult | undefined
  /** Which test is running right now (here or elsewhere). */
  running: GatewayTestName | 'all' | null
  mainModelDown: boolean
  onRun: (name: GatewayTestName) => void
}

/** "gemini/gemini-3.5-flash-lite" -> "gemini-3.5-flash-lite" */
export const bare = (id: string) => (id.includes('/') ? id.slice(id.indexOf('/') + 1) : id)

function limitWords(rules: GatewayStatus['rules'], value = rules.limit_value, kind = rules.limit_kind): string {
  return kind === 'calls' ? `a limit of ${value} calls` : `a $${Number(value.toPrecision(3))} limit`
}

const ms = (s: number) => Math.round(s * 1000)

/** One test: a section bar with its own run button, what it does, the drawing, then the pass line. */
function Sheet({
  n,
  title,
  about,
  rule,
  button,
  result,
  running,
  me,
  onRun,
  total,
  children,
}: {
  n: number
  title: string
  about: string
  rule: string
  button: string
  result: GatewayTestResult | undefined
  running: TestProps['running']
  me: GatewayTestName
  onRun: () => void
  /** Written at the right end of the pass line. */
  total?: string
  children: ReactNode
}) {
  const busyHere = running === me || running === 'all'
  const busy = running !== null
  return (
    <section className="ds-block gw-test" aria-label={`Test ${n}: ${title}`}>
      <div className="gw-subhead">
        <h3>{title}</h3>
        <Button small variant="primary" needsSignIn disabled={busy} onClick={onRun} aria-busy={busyHere}>
          {busyHere ? 'Running…' : button}
        </Button>
      </div>
      <div className="gw-about">
        <p>{about}</p>
        <p className="gw-rule">{rule}</p>
        {(busyHere || result) && (
          <p className="ds-note">
            {busyHere ? 'This can take up to a minute.' : `Last run ${shortDate(result!.finished_at)}`}
            {result?.simulated && ' Test mode: these numbers are made up, nothing was sent.'}
          </p>
        )}
      </div>
      {result ? (
        <>
          <div className="gw-draw">{children}</div>
          <div className="ds-pass" role="status">
            <Mark state={result.ok ? 'through' : 'slipped'} size={16} ink label={result.ok ? 'Passed' : 'Did not pass'} />
            <b>{result.ok ? 'Passed' : 'Did not pass'}</b>
            <span className="gw-headline">{result.headline}</span>
            {total && <span className="gw-total">{total}</span>}
          </div>
        </>
      ) : (
        <p className="ds-empty">
          {busyHere ? 'Running the test…' : 'Not run yet. Press the button to watch Bifrost deal with it.'}
        </p>
      )}
    </section>
  )
}

// ---------- Test 1 ----------

const MAX_LANES = 6

export function FallbackTest(p: TestProps) {
  const label = useModelLabel()
  const backupName = label(bare(p.rules.fallback_model))
  const r = p.result
  const calls = r?.calls ?? []
  const total = calls.length
  const backupHits = r?.numbers.backup_hits ?? 0
  const mainAnswered = Math.max(0, total - backupHits - (r?.numbers.errors_seen ?? 0))
  const refused = total - mainAnswered

  const totalMs = r ? Math.max(ms(r.seconds), 1) : 1
  const addedMs = ms(r?.numbers.added_s_per_call ?? 0)
  const lanes: Lane[] = calls.slice(0, MAX_LANES).map((c, i) => {
    const start = ms(c.at_s)
    const next = calls[i + 1]
    const end = Math.max(next ? ms(next.at_s) : totalMs, start + 1)
    if (c.status !== 200) {
      return {
        id: `c${c.n}`,
        label: `Call ${c.n}`,
        segments: [
          {
            startMs: start,
            endMs: end,
            kind: 'failed',
            label: `Refused (${c.status})`,
            title: `Call ${c.n}: Bifrost could not get an answer (${c.status}).`,
          },
        ],
      }
    }
    // The refusal takes as long as it added to the call; when that is not known it is drawn as a sliver.
    const refusal = Math.min(addedMs > 0 ? addedMs : totalMs * 0.01, end - start)
    return {
      id: `c${c.n}`,
      label: `Call ${c.n}`,
      segments: [
        {
          startMs: start,
          endMs: start + refusal,
          kind: 'failed',
          title: `Call ${c.n}: the main model refused.`,
        },
        {
          startMs: start + refusal,
          endMs: end,
          kind: 'model',
          label: 'backup answered',
          title: `Call ${c.n}: the backup answered.`,
        },
      ],
    }
  })

  return (
    <Sheet
      n={1}
      title="The main model goes down"
      about="We switch the main model off for a moment. Bifrost should send the work to a backup."
      rule={`If the main model fails, Bifrost switches to ${backupName}.`}
      button="Switch the main model off"
      result={r}
      running={p.running}
      me="fallback"
      onRun={() => p.onRun('fallback')}
    >
      <TimingDiagram lanes={lanes} totalMs={totalMs} label="Each call, the main model's refusal, then the backup's answer" />
      {total > MAX_LANES && <p className="ds-note">Showing the first {MAX_LANES} of {total} calls.</p>}
      <div className="ds-scroll gw-route">
        <table className="ds-table" aria-label="Where the calls went">
          <thead>
            <tr>
              <th>Route</th>
              <th>State</th>
              <th>Calls</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Main model</th>
              <td className="gw-down">Down</td>
              <td>
                {refused} of {total} refused
              </td>
            </tr>
            <tr>
              <th scope="row">{backupName} (backup)</th>
              <td>Answering</td>
              <td>
                answered {backupHits} of {total}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {p.mainModelDown && <p className="ds-note">The main model is switched off right now.</p>}
    </Sheet>
  )
}

// ---------- Test 2 ----------

function tryWord(t: GatewayTry): string {
  if (t.status === 200) return 'Answered'
  if (t.status === 429) return 'Too busy'
  return `Error ${t.status}`
}

/** Each try is a segment, each wait between two tries a dimension line, from the real numbers. */
function trySegments(tries: GatewayTry[], seconds: number): Segment[] {
  const out: Segment[] = []
  tries.forEach((t, i) => {
    const next = tries[i + 1]
    const word = tryWord(t)
    const ok = t.status === 200
    if (next) {
      const wait = Math.max(0, next.waited_s)
      const call = Math.max(0, next.at_s - t.at_s - wait)
      out.push({
        startMs: ms(t.at_s),
        endMs: ms(t.at_s + call),
        kind: ok ? 'model' : 'failed',
        label: word,
        title: `Try ${t.n}: ${word}.`,
      })
      out.push({
        startMs: ms(t.at_s + call),
        endMs: ms(next.at_s),
        kind: 'wait',
        label: `${wait} s`,
        title: `Bifrost waited ${wait} s before try ${next.n}.`,
      })
    } else {
      out.push({
        startMs: ms(t.at_s),
        endMs: Math.max(ms(seconds), ms(t.at_s) + 1),
        kind: ok ? 'model' : 'failed',
        label: word,
        title: `Try ${t.n}: ${word}.`,
      })
    }
  })
  return out
}

export function RetryTest(p: TestProps) {
  const r = p.result
  const r0 = p.rules
  const tries = r?.tries ?? []
  const last = tries[tries.length - 1]
  const gotAnswer = !!last && last.status === 200
  const initial = r0.backoff_initial_ms / 1000
  const lanes: Lane[] = r ? [{ id: 'call', label: 'The call', segments: trySegments(tries, r.seconds) }] : []
  return (
    <Sheet
      n={2}
      title={'The model says "too busy"'}
      about="The model turns down the first two tries. Bifrost should wait a little longer each time and try again, so the agent never sees the error."
      rule={`Up to ${r0.max_retries} retries. Wait ${initial} s, then double the wait each time, up to ${r0.backoff_max_ms / 1000} s.`}
      button="Make the model busy"
      result={r}
      running={p.running}
      me="retry"
      onRun={() => p.onRun('retry')}
      total={r ? `Total ${r.seconds.toFixed(1)} s` : undefined}
    >
      {tries.length === 0 ? (
        <p className="ds-empty">Bifrost did not report any tries.</p>
      ) : (
        <>
          <TimingDiagram
            lanes={lanes}
            totalMs={Math.max(ms(r!.seconds), 1)}
            label="The model's tries and the waits Bifrost put between them"
          />
          <div className="ds-scroll gw-route">
            <table className="ds-table" aria-label="Every try">
              <thead>
                <tr>
                  <th>Try</th>
                  <th>The model said</th>
                  <th className="num">Bifrost waited first</th>
                  <th className="num">Started at</th>
                </tr>
              </thead>
              <tbody>
                {tries.map((t, i) => (
                  <tr key={t.n}>
                    <th scope="row">Try {t.n}</th>
                    <td className={t.status === 200 ? '' : 'gw-bad'}>{tryWord(t)}</td>
                    <td className="num">{i === 0 ? '–' : `${t.waited_s} s`}</td>
                    <td className="num">{t.at_s.toFixed(1)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ds-note">The agent got {gotAnswer ? 'one normal answer.' : 'an error.'}</p>
        </>
      )}
    </Sheet>
  )
}

// ---------- Test 3 ----------

function callsDid(c: GatewayCall): string {
  return c.note || (c.status === 200 ? 'Let it through' : `Refused (${c.status})`)
}

export function BudgetTest(p: TestProps) {
  const [all, setAll] = useState(false)
  const r = p.result
  const n = r?.numbers
  const kind = n?.limit_kind ?? p.rules.limit_kind
  const limit = n?.limit_value ?? p.rules.limit_value
  const calls = r?.calls ?? []
  const answered = calls.filter((c) => c.status === 200).length
  const spent = n?.spent_usd ?? 0
  const used = kind === 'calls' ? answered : spent
  // The ruler runs a little past the limit so the limit line is a place on it, not its end.
  const scale = Math.max(limit, used, 1e-9) * 1.25
  const fill = Math.min(100, (used / scale) * 100)
  const limitAt = Math.min(100, (limit / scale) * 100)
  const limitText = kind === 'calls' ? `${limit} calls` : money(limit)
  const shown = all ? calls : calls.slice(-5)
  const isBlocked = (c: GatewayCall) => c.status !== 200

  const totalMs = r ? Math.max(ms(r.seconds), 1) : 1
  const lane: Lane = {
    id: 'calls',
    label: 'Calls',
    segments: calls.map((c, i) => {
      const start = ms(c.at_s)
      const next = calls[i + 1]
      const end = Math.max((next ? ms(next.at_s) : totalMs) - totalMs * 0.004, start + 1)
      return {
        startMs: start,
        endMs: end,
        kind: isBlocked(c) ? 'blocked' : 'model',
        label: isBlocked(c) ? 'Blocked' : `${c.n}`,
        title: `Call ${c.n}: ${callsDid(c)}.`,
      } satisfies Segment
    }),
  }

  return (
    <Sheet
      n={3}
      title="An agent won't stop spending"
      about="A test agent keeps asking the model the same thing over and over. Bifrost should cut it off once it hits its limit."
      rule={`Each run gets its own key with ${limitWords(p.rules)}.`}
      button="Start the runaway agent"
      result={r}
      running={p.running}
      me="budget"
      onRun={() => p.onRun('budget')}
    >
      <div className="gw-spent">
        <div className="gw-spent-line">
          <b>{kind === 'calls' ? 'Calls so far' : 'Spent so far'}</b>
          <span>{kind === 'calls' ? `${answered} of ${limit} calls` : `${money(spent)} of ${money(limit)}`}</span>
        </div>
        <div
          className="gw-ruler"
          role="img"
          aria-label={
            kind === 'calls' ? `${answered} of ${limit} calls used` : `${money(spent)} of ${money(limit)} spent`
          }
        >
          <i className="gw-ruler-fill" style={{ width: `${fill}%` }} />
          <span className="gw-ruler-limit" style={{ left: `${limitAt}%` }}>
            <span>Limit {limitText}</span>
          </span>
        </div>
      </div>
      {calls.length > 0 && (
        <TimingDiagram lanes={[lane]} totalMs={totalMs} label="Each call, and where Bifrost stopped the agent" />
      )}
      <div className="ds-scroll gw-route">
        <table className="ds-table" aria-label="Every call and what Bifrost did">
          <thead>
            <tr>
              <th>Call</th>
              {kind === 'usd' && (
                <>
                  <th className="num">Cost</th>
                  <th className="num">Total</th>
                </>
              )}
              <th>What Bifrost did</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.n} className={isBlocked(c) ? 'gw-blocked' : ''}>
                <th scope="row">
                  <span className="gw-callno">
                    <Mark
                      state={isBlocked(c) ? 'crashed' : 'through'}
                      size={13}
                      label={isBlocked(c) ? 'Blocked' : 'Let through'}
                    />
                    {c.n}
                  </span>
                </th>
                {kind === 'usd' && (
                  <>
                    <td className="num">{c.cost_usd === null ? '–' : money(c.cost_usd)}</td>
                    <td className="num">
                      {c.total_usd === null ? (isBlocked(c) ? money(spent) : '–') : money(c.total_usd)}
                    </td>
                  </>
                )}
                <td>{callsDid(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {calls.length > 5 && (
        <button type="button" className="link-btn gw-more" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Show only the last few calls' : `Show all ${calls.length} calls`}
        </button>
      )}
    </Sheet>
  )
}

// ---------- Calls per hour ----------

export function RateTest(p: TestProps) {
  const r = p.result
  const calls = r?.calls ?? []
  const limit = r?.numbers.limit_value ?? 3
  return (
    <Sheet
      n={4}
      title="Too many calls"
      about={`A fresh key may make ${limit} calls an hour. We send one more than that.`}
      rule={`Calls ${limit + 1} and later are refused with 429 until the hour is up.`}
      button="Send calls past the limit"
      result={r}
      running={p.running}
      me="rate"
      onRun={() => p.onRun('rate')}
    >
      <CallTable calls={calls} label="Every call and what Bifrost did" />
    </Sheet>
  )
}

// ---------- A key that may only use one model ----------

export function AccessTest(p: TestProps) {
  const label = useModelLabel()
  const r = p.result
  const allowed = r?.numbers.allowed_model
  const blocked = r?.numbers.blocked_model
  return (
    <Sheet
      n={5}
      title="A model the key isn't allowed"
      about={
        allowed && blocked
          ? `A fresh key may only use ${label(bare(allowed))}. We ask it for ${label(bare(blocked))} too.`
          : 'A fresh key may only use the agent model. We ask it for another model too.'
      }
      rule="Models that aren't on a key's list are refused with 403, before any money is spent."
      button="Ask for a model it isn't allowed"
      result={r}
      running={p.running}
      me="access"
      onRun={() => p.onRun('access')}
    >
      <CallTable calls={r?.calls ?? []} label="Both calls and what Bifrost did" />
    </Sheet>
  )
}

function CallTable({ calls, label }: { calls: GatewayCall[]; label: string }) {
  return (
    <div className="ds-scroll gw-route">
      <table className="ds-table" aria-label={label}>
        <thead>
          <tr>
            <th>Call</th>
            <th className="num">Status</th>
            <th>What Bifrost did</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.n} className={c.status !== 200 ? 'gw-blocked' : ''}>
              <th scope="row">
                <span className="gw-callno">
                  <Mark state={c.status !== 200 ? 'crashed' : 'through'} size={13} label={c.status !== 200 ? 'Refused' : 'Let through'} />
                  {c.n}
                </span>
              </th>
              <td className="num">{c.status}</td>
              <td>{callsDid(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

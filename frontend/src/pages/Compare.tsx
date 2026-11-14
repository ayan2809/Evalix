import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type RunDetail } from '../api'
import { Badge } from '../components/Badge'
import { RunPicker } from '../components/RunPicker'
import { StepRow } from '../components/StepRow'
import { ErrorBox, Loading } from '../components/States'
import { badgeFor, money, secs, stepCount } from '../format'
import { useAsync, useTitle } from '../hooks'

const PAGE = 50

function RunHeader({ run, side }: { run: RunDetail; side: string }) {
  return (
    <div className="cmp-head">
      <div className="muted small">{side}</div>
      <div className="cmp-title">
        <Badge name={badgeFor(run.ending, run.fault_fired)} />
        <Link to={`/runs/${run.id}`} className="strong">{run.agent_name}</Link>
      </div>
      <div>{run.fault_label ? `Fault: ${run.fault_label}` : run.task_title} <span className="muted">· try {run.trial}</span></div>
      <div className="muted small">
        {stepCount(run)} steps · {money(run.cost_usd)} · {secs(run.seconds)}
      </div>
    </div>
  )
}

export default function Compare() {
  useTitle('Compare')
  const [params, setParams] = useSearchParams()
  const a = params.get('a') ?? ''
  const b = params.get('b') ?? ''
  const [limit, setLimit] = useState(PAGE)
  const [presetMsg, setPresetMsg] = useState('')

  const cmp = useAsync(() => (a && b ? api.compare(a, b) : Promise.resolve(null)), [a, b])

  function set(next: { a?: string; b?: string }) {
    const p = new URLSearchParams(params)
    if (next.a !== undefined) p.set('a', next.a)
    if (next.b !== undefined) p.set('b', next.b)
    setLimit(PAGE)
    setParams(p)
  }

  async function preset(kind: 'agents' | 'fault') {
    setPresetMsg('')
    try {
      const ra = await api.getRun(a)
      const bench = await api.getBenchmark(ra.benchmark_id)
      const match = bench.runs.find((r) =>
        kind === 'agents'
          ? r.task_id === ra.task_id && r.fault_id === ra.fault_id && r.trial === ra.trial && r.agent_id !== ra.agent_id
          : r.agent_id === ra.agent_id && r.task_id === ra.task_id && r.trial === ra.trial && (ra.fault_id ? r.fault_id === '' : r.fault_id !== ''),
      )
      if (match) set({ b: match.id })
      else setPresetMsg('No matching run in this benchmark.')
    } catch (e) {
      setPresetMsg(e instanceof Error ? e.message : 'Could not find a matching run.')
    }
  }

  const data = cmp.data

  return (
    <div className="page wide">
      <h1>Compare</h1>
      <p className="lead">Put two runs side by side and see where they split.</p>

      <div className="pickers">
        <RunPicker label="Run A" value={a} onChange={(id) => set({ a: id })} />
        <RunPicker label="Run B" value={b} onChange={(id) => set({ b: id })} />
      </div>

      <div className="presets">
        <span className="muted small">Quick pick for B, based on A:</span>
        <button className="btn small-btn" disabled={!a} onClick={() => preset('agents')}>Same task, two agents</button>
        <button className="btn small-btn" disabled={!a} onClick={() => preset('fault')}>Normal vs with fault (same agent)</button>
        {presetMsg && <span className="small bad-text">{presetMsg}</span>}
      </div>

      {(!a || !b) && <p className="muted">Choose two runs to compare.</p>}
      {a && b && cmp.error && <ErrorBox error={cmp.error} onRetry={cmp.reload} />}
      {a && b && !data && !cmp.error && <Loading />}

      {data && (
        <>
          <div className="cmp-heads">
            <RunHeader run={data.a} side="Run A" />
            <RunHeader run={data.b} side="Run B" />
          </div>

          {data.first_difference !== null ? (
            <div className="banner">They first differ at step {data.first_difference}.</div>
          ) : (
            <div className="banner calm">These two runs took the same steps.</div>
          )}

          {data.pairs.length === 0 && <p className="muted">Neither run has recorded steps.</p>}
          <div className="pairs">
            {data.pairs.slice(0, limit).map((p) => {
              const first = p.position === data.first_difference
              return (
                <div key={p.position} className={`pair${first ? ' first' : ''}`}>
                  <div className="pair-pos small muted">
                    Step {p.position}
                    {first && <span className="tag diff-tag">First difference</span>}
                    {!first && !p.same && <span className="muted"> · differs</span>}
                  </div>
                  <div className="pair-cols">
                    {[
                      { step: p.a, run: data.a },
                      { step: p.b, run: data.b },
                    ].map(({ step, run }, i) =>
                      step ? (
                        <StepRow key={step.id} step={step} faultLabel={run.fault_label} differs={first} />
                      ) : (
                        <div key={i} className="step empty muted small">No step here</div>
                      ),
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {data.pairs.length > limit && (
            <button className="link" onClick={() => setLimit(limit + PAGE)}>
              Show more ({data.pairs.length - limit} more steps)
            </button>
          )}
        </>
      )}
    </div>
  )
}

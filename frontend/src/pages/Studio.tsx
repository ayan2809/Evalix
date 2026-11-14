import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { studio, type StudioResult, type StudioSetup } from '../api'
import { ErrorBox, Loading } from '../components/States'
import { useAsync, useTitle } from '../hooks'

export default function Studio() {
  useTitle('Studio')
  const questions = useAsync(() => studio.questions(), [])
  const [description, setDescription] = useState('')
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [made, setMade] = useState<StudioResult | null>(null)

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setBusy(true)
    setFormError('')
    try {
      setMade(await studio.createAgent(description.trim(), answers))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the agent')
    } finally {
      setBusy(false)
    }
  }

  function startOver() {
    setMade(null)
    setDescription('')
    setAnswers({})
  }

  return (
    <div className="page">
      <h1>Studio</h1>
      <p className="lead">Describe a research agent in one sentence, and Evalix builds it so you can test it.</p>

      {made ? (
        <MadeAgent result={made} onAnother={startOver} />
      ) : (
        <form onSubmit={create}>
          <section className="section" style={{ marginTop: 0 }}>
            <h2>Describe your research agent in one sentence</h2>
            <input
              style={{ width: '100%' }}
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="An assistant that looks up cloud service limits and prices"
            />
          </section>

          <section className="section">
            <h2>A few quick questions</h2>
            {questions.error && <ErrorBox error={questions.error} onRetry={questions.reload} />}
            {!questions.error && !questions.data && <Loading />}
            <div className="checklist" style={{ gap: 16 }}>
              {(questions.data ?? []).map((q) => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 260 }}>{q.text}</span>
                  <div className="segmented" role="radiogroup" aria-label={q.text}>
                    {[true, false].map((yes) => (
                      <button
                        type="button"
                        key={String(yes)}
                        role="radio"
                        aria-checked={!!answers[q.id] === yes}
                        className={!!answers[q.id] === yes ? 'active' : ''}
                        onClick={() => setAnswers({ ...answers, [q.id]: yes })}
                      >
                        {yes ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="actions">
            <button className="btn primary large" disabled={busy || !description.trim()}>
              {busy ? 'Creating…' : 'Create agent'}
            </button>
          </div>
          {formError && <p className="small bad-text">{formError}</p>}
        </form>
      )}
    </div>
  )
}

// What the agent will do, in plain words.
function describe(setup: StudioSetup): string[] {
  return [
    setup.retries > 0
      ? `Tries again up to ${setup.retries} time${setup.retries === 1 ? '' : 's'} when a search or the model fails.`
      : 'Does not try again when something fails.',
    setup.double_check ? 'Double-checks each fact in two sources.' : 'Uses the first source that looks right.',
    setup.stop_when_unsure
      ? "Stops and says so when it can't find a reliable answer."
      : 'Always gives its best answer, even when unsure.',
  ]
}

function MadeAgent({ result, onAnother }: { result: StudioResult; onAnother: () => void }) {
  const { agent, setup } = result
  return (
    <>
      <div className="card flat">
        <h2>{setup.name}</h2>
        <p className="muted small">
          <span className={`dot ${agent.online ? 'on' : 'off'}`} aria-hidden />
          {agent.online ? 'Ready to test' : 'Created, but not reachable right now'}
        </p>
        <ul>
          {describe(setup).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <details>
          <summary className="small muted">See the instructions it was given</summary>
          <p className="small">{setup.instructions}</p>
        </details>
      </div>
      <div className="actions">
        <Link className="btn primary large" to="/run">
          Run a benchmark with it
        </Link>
        <button className="btn" onClick={onAnother}>
          Make another
        </button>
      </div>
    </>
  )
}

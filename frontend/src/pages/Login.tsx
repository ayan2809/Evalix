import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { asApiError } from '../api'
import { useAuth } from '../auth'
import { useTitle } from '../hooks'
import { GoogleButton } from '../shell/GoogleButton'
import { Button, Logo, Mark, Notice, SectionBar, TimingDiagram, TitleBlock, type Lane } from '../ui'
import './login.css'

/** An illustrative one-lane excerpt: what "Quick Answer" did when the search result lied. Not measured data. */
const EXAMPLE_LANE: Lane = {
  id: 'quick-answer',
  label: 'Quick Answer',
  segments: [
    { startMs: 0, endMs: 900, kind: 'model', label: 'Model', title: 'Asked the model' },
    { startMs: 900, endMs: 1700, kind: 'hit', label: 'Search', title: 'Searched, and we made the result lie' },
    { startMs: 1700, endMs: 2700, kind: 'model', label: 'Model', title: 'Asked the model' },
    { startMs: 2700, endMs: 2800, kind: 'answer', label: '', title: 'Handed in its answer' },
  ],
  marks: [
    { atMs: 900, label: 'We broke it', tone: 'fault' },
    { atMs: 2700, label: 'Quoted $95', tone: 'fail' },
  ],
}

export default function Login() {
  useTitle('Sign in')
  const { me, signInGoogle, signInLocal, signInGuest } = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Someone already signed in as themselves has no reason to be here.
  if (me && (me.session === 'google' || me.session === 'local')) return <Navigate to="/" replace />

  const clientId = me?.google_client_id ?? null

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await fn()
      nav('/', { replace: true })
    } catch (e) {
      setError(asApiError(e).message)
      setBusy(false)
    }
  }

  return (
    <div className="cover">
      <div className="cover-sheet">
        <div className="cover-tb">
          <TitleBlock
            label="About this sheet"
            cells={[
              {
                label: 'Product',
                value: (
                  <span className="cover-brand">
                    <Logo size={22} />
                    Evalix
                  </span>
                ),
              },
              { label: 'Title', value: 'Agent behaviour under fault conditions', wide: true },
              { label: 'Revision', value: 'Rev. Nov 2026' },
            ]}
          />
        </div>

        <div className="cover-cols">
          <main className="cover-copy">
            <h1>Break your agent before your users do.</h1>
            <p className="answer">
              Point Evalix at any agent. It breaks tools and models on purpose, then shows you which agents keep their
              cool.
            </p>

            <section className="cover-features">
              <SectionBar title="Features" as="h2" />
              <ul>
                <li>Works with any agent that answers a web request</li>
                <li>Seven kinds of trouble, from slow tools to lying search results</li>
                <li>Your API keys stay on your machine</li>
              </ul>
            </section>

            <div className="cover-actions">
              {clientId ? (
                <GoogleButton
                  clientId={clientId}
                  onCredential={(c) => run(() => signInGoogle(c))}
                  onProblem={setError}
                />
              ) : (
                <Button variant="primary" large disabled={busy} onClick={() => run(signInLocal)}>
                  Continue on this computer
                </Button>
              )}
              <Button large disabled={busy} onClick={() => run(signInGuest)}>
                Look around first, no sign-in
              </Button>
              {error && <Notice tone="error">{error}</Notice>}
              <p className="tag">
                {clientId
                  ? 'Sign in with Google to get your own workspace.'
                  : "Google sign-in isn't set up on this server yet."}
              </p>
            </div>
          </main>

          <aside className="cover-example" aria-label="Example: one problem, two agents, and the result">
            <SectionBar title="Example" hint="One problem we caused, two agents" />
            <table className="tbl cover-table">
              <thead>
                <tr>
                  <th>Problem we caused</th>
                  <th>Fact Checker</th>
                  <th>Quick Answer</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Lying search result</strong>
                    <span className="cond">The search says the card fee is $95. The real fee is $395.</span>
                  </td>
                  <td>
                    <span className="res">
                      <Mark state="through" ink index={0} />
                      Got through
                    </span>
                  </td>
                  <td>
                    <span className="res bad">
                      <Mark state="slipped" />
                      Quoted $95 without checking
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            <TimingDiagram label="Example timing of Quick Answer on a lying search result" lanes={[EXAMPLE_LANE]} totalMs={3500} />
            <p className="tag">Example only. The timings are illustrative, not from a run.</p>
          </aside>
        </div>
      </div>
    </div>
  )
}

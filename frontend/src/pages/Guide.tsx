import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useAsync, useTitle } from '../hooks'
import { Button, ErrorState, Loading, Mark, PageHeader, SectionBar, type MarkState } from '../ui'
import { TOUR_EVENT } from '../shell/Tour'
import './sheet.css'
import './guide/guide.css'

const ENDINGS: { state: MarkState; means: string }[] = [
  { state: 'through', means: 'Gave the right answer, named its sources, and only used pages it really opened. For some problems the right move is to stop and say why, and that counts too.' },
  { state: 'slipped', means: 'Finished, but got it wrong: a wrong number, a made-up source, guessing when it should have stopped, or doing what a web page told it to.' },
  { state: 'crashed', means: 'The agent errored, ran out of time, or replied in the wrong shape.' },
  { state: 'setup', means: "Something outside the agent failed, like the model provider. It's run again once and never counts against the agent." },
]

const REQUEST = `POST /run
{
  "task": "What is the annual fee of …?",
  "answer_format": { "annual_fee": { "type": "number" } },
  "tools_url": "<use these tools>",
  "model_url": "<use this model>",
  "limits": { "seconds": 120, "model_calls": 15, "tool_calls": 20 }
}`

const REPLY = `{
  "status": "answered",            // or "blocked", with a reason
  "answer": { "annual_fee": 395 },
  "sources": ["https://…"]
}`

export default function Guide() {
  useTitle('How it works')
  const { me } = useAuth()
  const tasks = useAsync(() => api.listTasks(), [])
  const faults = useAsync(() => api.listFaults(), [])
  const allowance = me?.role === 'member' ? me.allowance : null
  const { hash } = useLocation()
  const ready = !!tasks.data && !!faults.data
  // Links like /guide#g-connect land on that section once the page has its content.
  useEffect(() => {
    if (hash && ready) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash, ready])

  return (
    <div className="wrap ds guide">
      <PageHeader
        title="How Evalix works"
        answer="Evalix tests how an AI agent behaves when things break, and shows the exact step where it went wrong."
        actions={<Button onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>Show the tour again</Button>}
      />

      <section className="ds-block" aria-labelledby="g-first">
        <SectionBar title={<span id="g-first">Your first run</span>} />
        <ol className="g-steps">
          <li>
            <b>Add an agent.</b> Add the four sample agents in one click, connect your own by its web address, or
            describe one in <Link to="/studio">Agent Studio</Link> and Evalix builds it. <Link to="/agents">Go to Agents</Link>
          </li>
          <li>
            <b>Start a run.</b> Pick agents, everyday questions and problems. Each agent answers every question once with
            nothing broken, then again with each problem. <Link to="/run">Start a run</Link>
          </li>
          <li>
            <b>Read the results.</b> See which agents got through each problem. Open any run to see every step it took
            and where it slipped. <Link to="/">Go to Results</Link>
          </li>
        </ol>
      </section>

      <section className="ds-block" aria-labelledby="g-questions">
        <SectionBar title={<span id="g-questions">Everyday questions</span>} />
        <p className="g-prose">
          Research questions with one right answer, like a card's annual fee or a cloud service limit. The agent searches
          the web and answers. Asking them with nothing broken first checks that the agent works at all, so a slip
          later is down to the problem.
        </p>
        {tasks.error ? (
          <ErrorState error={tasks.error} onRetry={tasks.reload} />
        ) : !tasks.data ? (
          <Loading />
        ) : (
          <ul className="g-list">
            {tasks.data.map((t) => (
              <li key={t.id}>
                <b>{t.title}</b> <span className="muted">{t.area}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ds-block" aria-labelledby="g-problems">
        <SectionBar title={<span id="g-problems">Problems we cause</span>} />
        <p className="g-prose">
          During a run, Evalix stands between the agent and its tools and model, so it can break things on purpose
          without touching the agent's code. Every agent gets the same problem at the same moment.
        </p>
        {faults.error ? (
          <ErrorState error={faults.error} onRetry={faults.reload} />
        ) : !faults.data ? (
          <Loading />
        ) : (
          <div className="ds-scroll">
            <table className="ds-table" aria-label="Problems we cause">
              <tbody>
                {faults.data.map((f) => (
                  <tr key={f.id}>
                    <th scope="row" className="g-term">
                      {f.label}
                    </th>
                    <td>
                      {f.short}
                      {f.expect === 'blocked' && <span className="muted"> The right move here is to stop.</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ds-block" aria-labelledby="g-marks">
        <SectionBar title={<span id="g-marks">How each run is marked</span>} />
        <div className="ds-scroll">
          <table className="ds-table" aria-label="How each run is marked">
            <tbody>
              {ENDINGS.map((e) => (
                <tr key={e.state}>
                  <th scope="row" className="g-term">
                    <span className="g-mark">
                      <Mark state={e.state} label="" /> {e.state === 'setup' ? 'Setup problem' : e.state === 'through' ? 'Got through' : e.state === 'slipped' ? 'Slipped' : 'Crashed'}
                    </span>
                  </th>
                  <td>{e.means}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="g-prose">
          Marks come from fixed rule checks against an answer key, so the same reply always gets the same mark. You can
          also ask another model for a second opinion on any run.
        </p>
      </section>

      <section className="ds-block" aria-labelledby="g-connect">
        <SectionBar title={<span id="g-connect">Connect your own agent</span>} />
        <p className="g-prose">
          Your agent is a small web service, built with any framework. Evalix sends it a question along with a tools
          address and a model address. The agent uses those instead of its own, which is how Evalix can cause problems
          without changing your code. It answers in JSON.
        </p>
        <div className="g-code">
          <figure>
            <figcaption>Evalix sends</figcaption>
            <pre>
              <code>{REQUEST}</code>
            </pre>
          </figure>
          <figure>
            <figcaption>Your agent replies</figcaption>
            <pre>
              <code>{REPLY}</code>
            </pre>
          </figure>
        </div>
        <p className="g-prose">
          It also needs <code>GET /health</code>. Then add it on <Link to="/agents">Agents</Link> by its web address.
        </p>
      </section>

      <section className="ds-block" aria-labelledby="g-gateway">
        <SectionBar title={<span id="g-gateway">The gateway</span>} />
        <p className="g-prose">
          Every model call goes through Bifrost, an open-source AI gateway that sits between agents and model providers.
          It checks keys and spending limits, retries a busy model, switches to a backup when the main one is down, and
          logs every call with its cost. <Link to="/gateway">Follow one call through it</Link>
        </p>
      </section>

      {allowance && allowance.daily_usd !== null && (
        <section className="ds-block" aria-labelledby="g-allowance">
          <SectionBar title={<span id="g-allowance">Your daily allowance</span>} />
          <p className="g-prose">
            Runs use this Evalix's own API keys, so each account gets ${allowance.daily_usd.toFixed(2)} of model calls
            and {allowance.daily_searches} live web searches a day. Saved search results never count. Both reset at
            midnight UTC. Bifrost enforces the dollar limit on every call, through a key made for your workspace.
          </p>
        </section>
      )}
    </div>
  )
}

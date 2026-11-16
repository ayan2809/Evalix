import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, asApiError, type Agent, type AgentCheck } from '../api'
import { useCanEdit } from '../auth'
import { agentSource } from '../agentSource'
import { useAsync, useTitle } from '../hooks'
import { useShell } from '../shell/ShellContext'
import { Button, ErrorState, Loading, Notice, PageHeader, SectionBar } from '../ui'
import { ASLEEP_REASON, OnlineStatus } from './agents/OnlineStatus'
import './sheet.css'
import './agents/agents.css'

function looksLikeUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export default function Agents() {
  useTitle('Agents')
  const { toast, asleep, hosted } = useShell()
  const { canEdit } = useCanEdit()
  const [showArchived, setShowArchived] = useState(false)
  // Archived agents are fetched with the rest only when asked for, then shown in their own list.
  const agents = useAsync(() => api.listAgents(showArchived), [showArchived])
  const [checks, setChecks] = useState<Record<number, AgentCheck | 'checking'>>({})
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [tag, setTag] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  async function addSamples() {
    setAdding(true)
    try {
      await api.addSampleAgents()
      toast('Added the four sample agents.')
      agents.reload()
    } catch (err) {
      toast(asApiError(err).message)
    } finally {
      setAdding(false)
    }
  }

  const all = agents.data ?? []
  const list = all.filter((a) => !a.archived)
  const archived = all.filter((a) => a.archived)
  const online = list.filter((a) => a.online).length
  const localUrl = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url.trim())

  async function check(a: Agent) {
    setChecks((c) => ({ ...c, [a.id]: 'checking' }))
    try {
      const got = await api.checkAgent(a.id)
      setChecks((c) => ({ ...c, [a.id]: got }))
      if (got.online !== a.online) agents.reload()
    } catch (err) {
      setChecks((c) => {
        const next = { ...c }
        delete next[a.id]
        return next
      })
      toast(asApiError(err).message)
    }
  }

  async function archive(a: Agent, on: boolean) {
    try {
      await api.archiveAgent(a.id, on)
      toast(on ? `Archived ${a.name}. Its past runs stay.` : `${a.name} is back.`)
      agents.reload()
    } catch (err) {
      toast(asApiError(err).message)
    }
  }

  const reason =
    name.trim() === ''
      ? 'Give the agent a name.'
      : url.trim() === ''
        ? 'Add the address the agent answers on.'
        : !looksLikeUrl(url.trim())
          ? 'The address should start with http:// or https://.'
          : undefined

  async function add(e: FormEvent) {
    e.preventDefault()
    if (reason || busy) return
    setBusy(true)
    setError('')
    try {
      const made = await api.addAgent({
        name: name.trim(),
        url: url.trim(),
        tag: tag.trim() || undefined,
        description: description.trim() || undefined,
      })
      setName('')
      setUrl('')
      setTag('')
      setDescription('')
      toast(`Added ${made.name}.`)
      agents.reload()
    } catch (err) {
      setError(asApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap ds">
      <PageHeader
        title="Who can we test?"
        answer={
          agents.data
            ? list.length === 0
              ? 'Nobody yet. Add an agent below.'
              : asleep
                ? `${list.length} ${list.length === 1 ? 'agent' : 'agents'}. The run engine is asleep, so they wake up when a run starts.`
                : `${list.length} ${list.length === 1 ? 'agent' : 'agents'}, ${online} answering right now.`
            : undefined
        }
      />

      <section className="ds-block" aria-label="All agents">
        <SectionBar
          title="All agents"
          actions={
            canEdit && (
              <Button small variant="quiet" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? 'Hide archived' : 'Show archived'}
              </Button>
            )
          }
        />
        {agents.error ? (
          <ErrorState error={agents.error} onRetry={agents.reload} />
        ) : !agents.data ? (
          <Loading />
        ) : list.length === 0 ? (
          <div className="agents-start">
            <p>No agents yet.</p>
            <div className="ds-actions">
              <Button variant="primary" needsSignIn onClick={addSamples} disabled={adding}>
                {adding ? 'Adding…' : 'Add the four sample agents'}
              </Button>
              <Link to="/studio">Describe one in Agent Studio</Link>
            </div>
          </div>
        ) : (
          <div className="agents-tbl ds-scroll">
            <table className="ds-table" aria-label="Agents">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>About</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Source</th>
                  {canEdit && (
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td className="name-cell">
                      <span className="plate">
                        <b>{a.name}</b>
                        {a.tag && <small>{a.tag}</small>}
                      </span>
                    </td>
                    <td className="desc">{a.description || <span className="faint">No description</span>}</td>
                    <td className="ds-url">{a.url}</td>
                    <td>
                      <OnlineStatus online={a.online} asleep={asleep} />
                      <CheckNote check={checks[a.id]} />
                    </td>
                    <td className="ds-url ds-nowrap">{agentSource(a)}</td>
                    {canEdit && (
                      <td className="row-actions">
                        {!asleep && (
                          <button type="button" className="link-btn" onClick={() => check(a)} disabled={checks[a.id] === 'checking'}>
                            {checks[a.id] === 'checking' ? 'Checking…' : 'Check now'}
                          </button>
                        )}
                        <button type="button" className="link-btn" onClick={() => archive(a, true)}>
                          Archive
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {asleep && list.length > 0 && <p className="ds-note agents-asleep">{ASLEEP_REASON}</p>}
        {showArchived && (
          <div className="agents-archived">
            <h3>Archived</h3>
            {archived.length === 0 ? (
              <p className="ds-note">Nothing archived. Archive an agent to hide it from runs and lists; its results stay.</p>
            ) : (
              <ul>
                {archived.map((a) => (
                  <li key={a.id}>
                    <span className="plate">
                      <b>{a.name}</b>
                      {a.tag && <small>{a.tag}</small>}
                    </span>
                    <button type="button" className="link-btn" onClick={() => archive(a, false)}>
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="ds-block" aria-label="Add your own agent">
        <SectionBar title="Add your own agent" actions={<Link className="bar-link" to="/guide#g-connect">What your agent needs</Link>} />
        <div className="ds-pad">
          <form className="ds-sheet add-form" onSubmit={add}>
            <div className="fields">
              <label className="field">
                Name
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My agent"
                  maxLength={60}
                />
              </label>
              <label className="field" style={{ flexBasis: 320 }}>
                Address it answers on
                <input
                  className="input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://localhost:9005"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
            </div>
            <div className="fields">
              <label className="field">
                A few words about it (optional)
                <input
                  className="input"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="Retries, checks sources"
                  maxLength={60}
                />
              </label>
              <label className="field" style={{ flexBasis: 320 }}>
                One sentence about it (optional)
                <input
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What it does and how it is built."
                  maxLength={240}
                />
              </label>
            </div>
            <div className="ds-actions">
              <Button type="submit" variant="primary" needsSignIn disabled={busy} disabledReason={reason}>
                {busy ? 'Adding…' : 'Add the agent'}
              </Button>
              {reason && (name || url) && <span className="tag">{reason}</span>}
            </div>
            {hosted && localUrl && (
              <Notice tone="warn">
                On hosted Evalix, “localhost” means the Evalix server, not your computer. Give your agent a public
                address (for example with a tunnel), or run Evalix on your own computer to test a local agent.
              </Notice>
            )}
            {error && <Notice tone="error">{error}</Notice>}
          </form>
        </div>
      </section>

    </div>
  )
}

/** The answer of "Check now", under the status: what failed, in one sentence. */
function CheckNote({ check }: { check: AgentCheck | 'checking' | undefined }) {
  if (!check || check === 'checking') return null
  return <small className={`check-note ${check.online ? 'ok' : 'bad'}`}>{check.detail}</small>
}

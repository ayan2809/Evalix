import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, asApiError } from '../api'
import { agentSource } from '../agentSource'
import { useAsync, useTitle } from '../hooks'
import { useShell } from '../shell/ShellContext'
import { Button, ErrorState, Loading, Notice, PageHeader, SectionBar } from '../ui'
import { OnlineStatus } from './agents/OnlineStatus'
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
  const { toast } = useShell()
  const agents = useAsync(() => api.listAgents(), [])
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

  const list = agents.data ?? []
  const online = list.filter((a) => a.online).length

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
              : `${list.length} ${list.length === 1 ? 'agent' : 'agents'}, ${online} answering right now.`
            : undefined
        }
      />

      <section className="ds-block" aria-label="All agents">
        <SectionBar title="All agents" />
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
                      <OnlineStatus online={a.online} />
                    </td>
                    <td className="ds-url ds-nowrap">{agentSource(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            {error && <Notice tone="error">{error}</Notice>}
          </form>
        </div>
      </section>

    </div>
  )
}

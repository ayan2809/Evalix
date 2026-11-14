import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Empty, ErrorBox, Loading } from '../components/States'
import { useAsync, useTitle } from '../hooks'

export default function Agents() {
  useTitle('Agents')
  const agents = useAsync(() => api.listAgents(), [])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    setBusy(true)
    setFormError('')
    try {
      await api.addAgent(name.trim(), url.trim())
      setName('')
      setUrl('')
      agents.reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the agent')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Agents</h1>
      <p className="lead">The AI agents Evalix can test. Each one runs as its own small web server.</p>

      {agents.error && <ErrorBox error={agents.error} onRetry={agents.reload} />}
      {!agents.error && !agents.data && <Loading />}
      {agents.data && agents.data.length === 0 && <Empty>No agents yet. Add one below.</Empty>}
      {agents.data && agents.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Status</th>
              <th>Added by</th>
            </tr>
          </thead>
          <tbody>
            {agents.data.map((a) => (
              <tr key={a.id}>
                <td className="strong">{a.name}</td>
                <td className="mono">{a.url}</td>
                <td>
                  <span className={`dot ${a.online ? 'on' : 'off'}`} aria-hidden />
                  {a.online ? 'Online' : 'Offline'}
                </td>
                <td>{a.source === 'studio' ? 'Studio' : 'Registered'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Add an agent</h2>
      <form className="form-row" onSubmit={submit}>
        <label>
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My agent" />
        </label>
        <label className="grow">
          <span>Address</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:9005" />
        </label>
        <button className="btn primary" disabled={busy || !name.trim() || !url.trim()}>
          {busy ? 'Adding…' : 'Add agent'}
        </button>
      </form>
      {formError && <p className="small bad-text">{formError}</p>}
    </div>
  )
}

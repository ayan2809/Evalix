import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, asApiError } from '../../api'
import { useCanEdit } from '../../auth'
import { useAsync } from '../../hooks'
import { Button, LinkButton, Mark, PageHeader, SectionBar } from '../../ui'

/**
 * What a new workspace shows instead of results: three steps to a first run. Each step says whether it's done,
 * so the page doubles as a checklist. No one else's results are shown here.
 */
export function FirstRun() {
  const agents = useAsync(() => api.listAgents(), [])
  const { canEdit, reason } = useCanEdit()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const count = agents.data?.length ?? 0
  const hasAgents = count > 0

  async function addSamples() {
    setAdding(true)
    setError('')
    try {
      await api.addSampleAgents()
      agents.reload()
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="wrap ds first-run">
      <PageHeader title="Let's test your first agent." />

      <section className="ds-block" aria-labelledby="fr-title">
        <SectionBar title={<span id="fr-title">Three steps</span>} />
        <ol className="fr-steps">
          <li className={hasAgents ? 'done' : 'now'}>
            <span className="fr-state">
              <Mark state={hasAgents ? 'through' : 'setup'} label={hasAgents ? 'Done' : 'To do'} size={16} />
            </span>
            <div className="fr-body">
              <h2>Add an agent</h2>
              {hasAgents ? (
                <p>
                  {count} {count === 1 ? 'agent' : 'agents'} ready. <Link to="/agents">See them</Link>
                </p>
              ) : (
                <>
                  <p>Use the four sample agents, connect yours by its web address, or describe one.</p>
                  <div className="ds-actions">
                    <Button variant="primary" needsSignIn onClick={addSamples} disabled={adding || !agents.data}>
                      {adding ? 'Adding…' : 'Add the four sample agents'}
                    </Button>
                    <Link to="/agents">Connect your own</Link>
                    <Link to="/studio">Describe one</Link>
                  </div>
                  {error && <p className="fr-error">{error}</p>}
                </>
              )}
            </div>
          </li>
          <li className={hasAgents ? 'now' : ''}>
            <span className="fr-state">
              <Mark state="setup" label="To do" size={16} />
            </span>
            <div className="fr-body">
              <h2>Start a run</h2>
              <p>Pick the agents and the problems to cause. You can watch it live.</p>
              {hasAgents && (
                <div className="ds-actions">
                  {canEdit ? (
                    <LinkButton to="/run" variant="primary">
                      Start a run
                    </LinkButton>
                  ) : (
                    <Button variant="primary" disabledReason={reason}>
                      Start a run
                    </Button>
                  )}
                </div>
              )}
            </div>
          </li>
          <li>
            <span className="fr-state">
              <Mark state="setup" label="To do" size={16} />
            </span>
            <div className="fr-body">
              <h2>Read the results</h2>
              <p>They show up on this page as each agent finishes.</p>
            </div>
          </li>
        </ol>
        <p className="fr-more">
          New to Evalix? <Link to="/guide">Read how it works</Link>
        </p>
      </section>
    </div>
  )
}

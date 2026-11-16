import { useEffect, useRef, useState } from 'react'
import { api, asApiError, type EngineStatus } from '../../api'
import { usePolling } from '../../hooks'
import { useCanEdit } from '../../auth'
import { Button, Notice } from '../../ui'

/**
 * Hosted Evalix keeps its run engine switched off until someone needs it (it costs nothing while off).
 * This shows that, and switches it on. On your own computer the engine is always ready, so nothing shows.
 * `onReady` is called when the engine becomes ready, so the page can load the agents again.
 */
export function EngineNotice({ onReady }: { onReady: () => void }) {
  const [asked, setAsked] = useState(false)
  const [error, setError] = useState('')
  const engine = usePolling<EngineStatus>(() => api.engine(), [], 5000, (d) => !!d && d.hosted && !d.ready)
  const { canEdit } = useCanEdit()
  const status = engine.data
  const waiting = !!status && status.hosted && !status.ready
  const wasWaiting = useRef(false)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // The agents start a few seconds after the engine answers, so look for them twice.
  useEffect(() => {
    if (waiting) {
      wasWaiting.current = true
      return
    }
    if (!wasWaiting.current) return
    wasWaiting.current = false
    setAsked(false)
    onReadyRef.current()
    const again = window.setTimeout(() => onReadyRef.current(), 6000)
    return () => window.clearTimeout(again)
  }, [waiting])

  // If the engine was still switching off when asked, ask again once it has stopped.
  const state = status?.state
  useEffect(() => {
    if (asked && waiting && state === 'stopped') api.wakeEngine().catch(() => undefined)
  }, [asked, waiting, state])

  if (!waiting) return null

  async function wake() {
    setAsked(true)
    setError('')
    try {
      await api.wakeEngine()
      engine.reload()
    } catch (e) {
      setError(asApiError(e).message)
      setAsked(false)
    }
  }

  const starting = asked || state === 'pending' || state === 'running'
  if (!canEdit && !starting) {
    // A guest can't switch it on, so say what happens instead of showing a button that does nothing.
    return (
      <div className="rf-engine" aria-live="polite">
        <Notice tone="info">
          The run engine is asleep while nobody is using it, so the agents below show as asleep. Sign in to start a
          run: the engine switches on by itself and takes about a minute.
        </Notice>
      </div>
    )
  }
  return (
    <div className="rf-engine" aria-live="polite">
      <Notice tone={starting ? 'info' : 'warn'}>
        {starting
          ? 'Starting the run engine. This takes about a minute, and the agents will appear when it is ready.'
          : 'The run engine is switched off while nobody is using it. Switch it on to start a run. It takes about a minute.'}
      </Notice>
      {!starting && (
        <Button variant="primary" needsSignIn onClick={wake}>
          Switch on the run engine
        </Button>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

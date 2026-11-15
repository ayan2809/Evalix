import { useEffect, useRef, useState } from 'react'

interface GoogleId {
  initialize: (cfg: {
    client_id: string
    callback: (r: { credential: string }) => void
    ux_mode?: 'popup' | 'redirect'
    auto_select?: boolean
    context?: 'signin' | 'signup' | 'use'
  }) => void
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

let loading: Promise<void> | null = null
function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error("Couldn't load Google sign-in."))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** Google's own sign-in button. Calls onCredential with the ID token Google hands back. */
export function GoogleButton({
  clientId,
  onCredential,
  onProblem,
}: {
  clientId: string
  onCredential: (credential: string) => void
  onProblem: (message: string) => void
}) {
  const slot = useRef<HTMLDivElement>(null)
  const cb = useRef(onCredential)
  cb.current = onCredential
  const problem = useRef(onProblem)
  problem.current = onProblem
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    loadGoogle().then(
      () => {
        if (!alive || !slot.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => cb.current(r.credential),
          ux_mode: 'popup',
          auto_select: false,
          context: 'signin',
        })
        // Measure the wrapper: the empty div Google draws into has no width of its own yet.
        const room = slot.current.parentElement?.clientWidth || 380
        const width = Math.min(380, Math.max(200, room))
        window.google.accounts.id.renderButton(slot.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width,
        })
        setReady(true)
      },
      (e: Error) => alive && problem.current(e.message),
    )
    return () => {
      alive = false
    }
  }, [clientId])

  return (
    <div className="google-slot" aria-busy={!ready}>
      {/* Google's script owns this div and replaces what's inside, so React must never put children in it. */}
      <div ref={slot} />
      {!ready && <span className="tag">Loading Google sign-in…</span>}
    </div>
  )
}

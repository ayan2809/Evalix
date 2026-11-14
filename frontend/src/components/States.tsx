import type { ReactNode } from 'react'
import type { ApiError } from '../api'

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <p className="muted">{text}</p>
}

export function ErrorBox({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <p>{error.message}</p>
      {error.offline && <p className="muted small">Start the backend, then try again.</p>}
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

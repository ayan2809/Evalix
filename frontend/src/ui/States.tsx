import type { ReactNode } from 'react'
import { ApiError } from '../api'
import { Button } from './Button'

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="state" role="status">
      <p>{text}</p>
    </div>
  )
}

/** Shows the backend's own sentence. Adds a retry button when there is a way to retry. */
export function ErrorState({ error, onRetry }: { error: ApiError | Error | string; onRetry?: () => void }) {
  const message = typeof error === 'string' ? error : error.message
  const offline = error instanceof ApiError && error.offline
  return (
    <div className="state error" role="alert">
      <p>{message}</p>
      {offline && <p className="tag">Start the backend, then try again.</p>}
      {onRetry && (
        <Button small onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Dashed box for "nothing here yet". Put a sentence and, if useful, a button inside. */
export function EmptyState({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <div className="state empty">
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
    </div>
  )
}

/** A calm inline message. tone: 'info' (grey), 'warn', 'error', 'pass'. */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'pass'; children: ReactNode }) {
  return (
    <div className={`notice ${tone === 'info' ? '' : tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <p>{children}</p>
    </div>
  )
}

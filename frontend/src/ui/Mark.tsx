import type { CSSProperties } from 'react'
import './datasheet.css'

/**
 * A result mark in a fixed cell (the datasheet's signature).
 * through = filled ink square, slipped = hollow red square, crashed = struck red square,
 * recovered = filled blue square, setup = dashed grey square, running = hatched grey square.
 * `ink` plays the one allowed motion: the fill wipes in, `index` sets the 30 ms stagger.
 */
export type MarkState = 'through' | 'slipped' | 'crashed' | 'recovered' | 'setup' | 'running'

const WORDS: Record<MarkState, string> = {
  through: 'Got through',
  slipped: 'Slipped',
  crashed: 'Crashed',
  recovered: 'Recovered',
  setup: 'Setup problem',
  running: 'Still running',
}

export function markWord(state: MarkState): string {
  return WORDS[state]
}

export function Mark({
  state,
  size = 14,
  ink = false,
  index = 0,
  label,
}: {
  state: MarkState
  size?: number
  ink?: boolean
  index?: number
  /** Screen-reader text. Defaults to the state's plain word; pass '' when words sit right next to the mark. */
  label?: string
}) {
  const style = { '--i': Math.min(index, 60), width: size, height: size } as CSSProperties
  const filled = state === 'through' || state === 'recovered'
  return (
    <svg
      className={`mark mark-${state}${ink ? ' ink' : ''}`}
      style={style}
      viewBox="0 0 14 14"
      role={label === '' ? undefined : 'img'}
      aria-hidden={label === '' ? true : undefined}
      aria-label={label === '' ? undefined : (label ?? WORDS[state])}
    >
      <rect className="mark-box" x="1" y="1" width="12" height="12" />
      {filled && <rect className="mark-fill" x="1" y="1" width="12" height="12" />}
      {state === 'crashed' && <line className="mark-strike" x1="1.5" y1="12.5" x2="12.5" y2="1.5" />}
      {state === 'running' && <path className="mark-hatch" d="M1 9 L9 1 M5 13 L13 5" />}
    </svg>
  )
}

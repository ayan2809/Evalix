import type { BadgeName } from '../api'

const CLASS: Record<BadgeName, string> = {
  Pass: 'pass',
  Fail: 'fail',
  Recovered: 'recovered',
  'Setup problem': 'setup',
  Running: 'running',
}

const GLYPH: Record<BadgeName, string> = {
  Pass: '✓',
  Fail: '✕',
  Recovered: '↺',
  'Setup problem': '!',
  Running: '…',
}

export function Badge({ name }: { name: BadgeName }) {
  return <span className={`badge ${CLASS[name]}`}>{name}</span>
}

/** Compact badge used in the grid; the full name sits in the tooltip and aria-label. */
export function MiniBadge({ name, title }: { name: BadgeName; title: string }) {
  return (
    <span className={`badge mini ${CLASS[name]}`} title={title} aria-label={title}>
      {GLYPH[name]}
    </span>
  )
}

import type { ReactNode } from 'react'
import type { BadgeName } from '../api'
import { Mark } from './Mark'

export type ChipTone = 'pass' | 'fail' | 'warn' | 'recovered' | 'neutral'

/**
 * A small square tag. `sm` is the 22px size. Tones: fail (red, slipped or crashed), warn (amber, a problem we caused),
 * recovered (blue), neutral (shade). `pass` is not a colour: a filled ink square and plain words.
 */
export function Chip({
  tone = 'neutral',
  sm,
  dashed,
  title,
  children,
}: {
  tone?: ChipTone
  sm?: boolean
  dashed?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <span className={`chip ${tone}${sm ? ' sm' : ''}${dashed ? ' dashed' : ''}`} title={title}>
      {tone === 'pass' && <Mark state="through" size={12} label="" />}
      {children}
    </span>
  )
}

const TONE: Record<BadgeName, ChipTone> = {
  Pass: 'pass',
  Fail: 'fail',
  Recovered: 'recovered',
  'Setup problem': 'neutral',
  Running: 'neutral',
}

const WORDS: Record<BadgeName, string> = {
  Pass: 'Got through',
  Fail: 'Slipped',
  Recovered: 'Recovered',
  'Setup problem': 'Setup problem',
  Running: 'Running',
}

/** The result of one run. Got through = ink square, Slipped = red, Recovered = blue. Pass `label` to say it differently. */
export function BadgeChip({ badge, label, sm }: { badge: BadgeName; label?: string; sm?: boolean }) {
  return (
    <Chip tone={TONE[badge]} sm={sm}>
      {label ?? WORDS[badge]}
    </Chip>
  )
}

import type { ReactNode } from 'react'
import './datasheet.css'

/** The ruled title block at the top of a datasheet page: label over value, in cells. */
export function TitleBlock({
  cells,
  action,
  label = 'Summary',
  className,
}: {
  cells: { label: string; value: ReactNode; wide?: boolean }[]
  /** Sits in the last cell, right-aligned (for example "Start a run"). */
  action?: ReactNode
  label?: string
  className?: string
}) {
  return (
    <dl className={`titleblock${className ? ` ${className}` : ''}`} aria-label={label}>
      {cells.map((c) => (
        <div key={c.label} className={c.wide ? 'tb-cell wide' : 'tb-cell'}>
          <dt>{c.label}</dt>
          <dd>{c.value}</dd>
        </div>
      ))}
      {action && <div className="tb-cell tb-action">{action}</div>}
    </dl>
  )
}

/** A solder-green section bar with reversed type. It is the section's heading, not a label above one. */
export function SectionBar({
  title,
  hint,
  actions,
  as: As = 'h2',
}: {
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  as?: 'h2' | 'h3'
}) {
  return (
    <div className="sectionbar">
      <As className="sectionbar-title">{title}</As>
      {hint && <span className="sectionbar-hint">{hint}</span>}
      {actions && <div className="sectionbar-actions">{actions}</div>}
    </div>
  )
}

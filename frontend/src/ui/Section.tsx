import type { ReactNode } from 'react'
import { SectionBar } from './Datasheet'

/**
 * A block of the page under a solder section bar. The title (and optional actions) sit in the bar; the hint
 * is one graphite line under it; children follow. With no title it is just a spaced block.
 */
export function Section({
  title,
  hint,
  actions,
  children,
  ...rest
}: {
  title?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  'aria-label'?: string
  id?: string
}) {
  return (
    <section className="section" {...rest}>
      {(title || actions) && <SectionBar title={title} actions={actions} />}
      {hint && <p className="section-hint">{hint}</p>}
      {children && <div className="section-body">{children}</div>}
    </section>
  )
}

/** A table on the page: 1.5px ink rule under condensed heads, 1px rules between rows, no card. Scrolls sideways on phones. */
export function Table({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div className="scroll-x">
      <table className={`tbl${className ? ` ${className}` : ''}`} aria-label={label}>
        {children}
      </table>
    </div>
  )
}

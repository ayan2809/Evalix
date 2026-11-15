import type { HTMLAttributes, ReactNode } from 'react'

/** White surface with a 1px rule and a 4px corner, no shadow. `pad` adds 20px padding, `large` 30px. */
export function Card({
  pad,
  large,
  className,
  children,
  ...rest
}: { pad?: boolean; large?: boolean; children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  const c = ['card', large ? 'pad-lg' : pad ? 'pad' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <section {...rest} className={c}>
      {children}
    </section>
  )
}

/** The title block at the top of a card that has a table under it. */
export function CardHead({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card-head">
      <h3>{title}</h3>
      {hint && <span className="tag">{hint}</span>}
    </div>
  )
}

import type { ReactNode } from 'react'

/**
 * The top of a page: the question in condensed Archivo 800 (46px, 32px on phones), optionally the one-sentence
 * answer under it (21px), optionally a plain facts line, and buttons on the right. No label above the question.
 */
export function PageHeader({
  title,
  answer,
  facts,
  actions,
}: {
  title: ReactNode
  answer?: ReactNode
  facts?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-head">
      <div className="titles">
        <h1>{title}</h1>
        {answer && <p className="answer">{answer}</p>}
        {facts && <div className="facts-line">{facts}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  )
}

import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
}

/**
 * A row (variant "top") or column (variant "side") of tabs. Arrow keys move between them.
 * Put the panel next to it with role="tabpanel" and aria-labelledby={`tab-${id}`}.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'top',
  label,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  variant?: 'top' | 'side'
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  function onKey(e: KeyboardEvent) {
    // Side tabs turn into a row on phones, so accept both pairs of arrows.
    const next = ['ArrowDown', 'ArrowRight'].includes(e.key)
    const prev = ['ArrowUp', 'ArrowLeft'].includes(e.key)
    if (!next && !prev) return
    e.preventDefault()
    const i = items.findIndex((t) => t.id === value)
    const j = (i + (next ? 1 : items.length - 1)) % items.length
    onChange(items[j].id)
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLButtonElement>('button')[j]?.focus())
  }
  return (
    <div className={`tabs ${variant}`} role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
      {items.map((t) => (
        <button
          type="button"
          key={t.id}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          className={t.id === value ? 'on' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

import { useState, type FocusEvent, type MouseEvent } from 'react'

/** A small "?" that reveals plain-language help on hover or keyboard focus. */
export function Tooltip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  function show(e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130)
    setPos({ x, y: r.bottom + 8 })
  }

  return (
    <span
      className="tip"
      tabIndex={0}
      role="note"
      aria-label={text}
      onMouseEnter={show}
      onFocus={show}
      onMouseLeave={() => setPos(null)}
      onBlur={() => setPos(null)}
    >
      ?
      {pos && (
        <span className="tip-pop" style={{ left: pos.x, top: pos.y }}>
          {text}
        </span>
      )}
    </span>
  )
}

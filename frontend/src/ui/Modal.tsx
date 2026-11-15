import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A dialog over a dimmed page. Esc and a click on the dimmed area close it, Tab stays inside it,
 * the page behind does not scroll, and focus goes back to where it was when it closes.
 * Children go straight into the white box; use `.modal-split`, `.modal-nav`, `.modal-body`, `.modal-foot`
 * for the settings-style layout, or just put your own content in.
 */
export function Modal({
  open,
  onClose,
  label,
  narrow,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Spoken name of the dialog. */
  label: string
  narrow?: boolean
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus the first control in the content area, else the box itself.
    const first = box.current?.querySelector<HTMLElement>('[data-autofocus]') ?? box.current
    first?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !box.current) return
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const a = items[0]
      const z = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === a || active === box.current)) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && active === z) {
        e.preventDefault()
        a.focus()
      } else if (!box.current.contains(active)) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current()
      }}
    >
      <div
        className={`modal${narrow ? ' narrow' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={box}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

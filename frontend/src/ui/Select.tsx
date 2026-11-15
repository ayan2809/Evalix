import { useId, type ReactNode } from 'react'
import { Icon } from './Icon'

export interface SelectOption<V extends string | number = string> {
  value: V
  label: string
  disabled?: boolean
}

/**
 * A drop-down. It is a real <select> (so it works with keyboards, phones and screen readers) with the
 * browser's arrow taken off and our own chevron drawn on top.
 */
export function Select<V extends string | number = string>({
  value,
  onChange,
  options,
  placeholder,
  label,
  disabled,
  small,
  title,
  ariaLabel,
}: {
  value: V | ''
  onChange: (v: V) => void
  options: SelectOption<V>[]
  /** Shown as a first, empty choice when nothing is picked. */
  placeholder?: string
  /** If given, wraps the select in a <label class="field"> with this text above it. */
  label?: ReactNode
  disabled?: boolean
  small?: boolean
  title?: string
  /** Accessible name when there is no visible label. */
  ariaLabel?: string
}) {
  const id = useId()
  const numeric = options.length > 0 && typeof options[0].value === 'number'
  const el = (
    <span className={`sel${small ? ' small' : ''}`}>
      <select
        id={id}
        value={String(value)}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        onChange={(e) => onChange((numeric ? Number(e.target.value) : e.target.value) as V)}
      >
        {placeholder !== undefined && (
          <option value="" disabled={value !== ''}>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="chev">
        <Icon name="chevron" size={16} stroke={2} />
      </span>
    </span>
  )
  if (label === undefined) return el
  return (
    <label className="field" htmlFor={id}>
      {label}
      {el}
    </label>
  )
}

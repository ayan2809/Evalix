export function Switch({
  checked,
  onChange,
  label,
  disabled,
  title,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  /** Spoken name for screen readers. */
  label: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
    />
  )
}

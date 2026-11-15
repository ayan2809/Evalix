/** A small choice of 2-5 things (Yes/No, 1/3/5). Radio buttons underneath. */
export function Segmented<V extends string | number | boolean>({
  value,
  onChange,
  options,
  label,
  disabled,
  small,
}: {
  value: V
  onChange: (v: V) => void
  options: { value: V; label: string }[]
  label: string
  disabled?: boolean
  small?: boolean
}) {
  return (
    <div className={`seg${small ? ' small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

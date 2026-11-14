export function StatChip({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="chip" title={title}>
      <span className="chip-label">{label}</span>
      <span className="chip-value">{value}</span>
    </span>
  )
}

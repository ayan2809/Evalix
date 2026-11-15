/** An agent's fixed name plate: its name over its one-line tag. The description shows on hover. */
export function Plate({ name, tag, description }: { name: string; tag?: string; description?: string }) {
  return (
    <span className="plate" title={description || undefined}>
      <strong>{name}</strong>
      {tag && <span className="plate-tag">{tag}</span>}
    </span>
  )
}

import '../sheet.css'

/** A small square and a word: "Online" or "Offline". */
export function OnlineStatus({ online }: { online: boolean }) {
  return (
    <span className={`online ${online ? 'up' : 'down'}`}>
      <i aria-hidden="true" />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

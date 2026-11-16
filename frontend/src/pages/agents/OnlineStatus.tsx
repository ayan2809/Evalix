import '../sheet.css'

/** A small square and a word: "Online", "Offline", or "Asleep" while hosted Evalix's run engine is off. */
export function OnlineStatus({ online, asleep = false }: { online: boolean; asleep?: boolean }) {
  const state = online ? 'up' : asleep ? 'asleep' : 'down'
  return (
    <span className={`online ${state}`} title={asleep && !online ? ASLEEP_REASON : undefined}>
      <i aria-hidden="true" />
      {online ? 'Online' : asleep ? 'Asleep' : 'Offline'}
    </span>
  )
}

/** Why an agent isn't answering while the hosted run engine is off. */
export const ASLEEP_REASON = 'The run engine is off while nobody is using it. It switches on when a run starts.'
/** Why an agent isn't answering when the engine is on (or when running locally). */
export const OFFLINE_REASON = 'Not answering. Check that it is running, then reload this page.'

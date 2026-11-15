import type { ReactNode } from 'react'

/** Drawn icons: 24x24, one 2px stroke, square caps, stroked with currentColor. */
const PATHS = {
  results: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  play: <path d="M7 4l13 8-13 8V4z" />,
  compare: <path d="M8 3v18M16 3v18M3 8h5M16 16h5" />,
  agent: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="1" />
      <path d="M12 3v4M9 12h.01M15 12h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  guide: <path d="M5 4.5A1.5 1.5 0 016.5 3H19v15H6.5A1.5 1.5 0 005 19.5v-15zM5 19.5A1.5 1.5 0 006.5 21H19M9 7h6M9 10.5h6" />,
  pulse: <path d="M4 12h6l2-4 2 8 2-4h4" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  'arrow-down': <path d="M12 5v14M6 13l6 6 6-6" />,
  'arrow-right': <path d="M4 12h16M14 6l6 6-6 6" />,
  lines: <path d="M4 7h16M4 12h10M4 17h6" />,
  bolt: <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />,
  bolt2: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" />,
  'shield-check': (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  chat: <path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.5A8 8 0 1121 12z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  tasks: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />,
  refresh: <path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5" />,
  retry: <path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5" />,
  warning: <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1" />
      <path d="M8 11V8a4 4 0 118 0v3" />
    </>
  ),
  'sign-out': <path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4M16 8l4 4-4 4M20 12H9" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 18,
  stroke = 2,
  className,
}: {
  name: IconName
  size?: number
  stroke?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}

/** The brand mark: the datasheet's "got through" square, outline and fill. Takes its colour from the text. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="2.5" />
      <rect x="7" y="7" width="10" height="10" fill="currentColor" />
    </svg>
  )
}

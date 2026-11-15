import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../ui'

/** Fired on window to show the tour again (the guide page has a button for it). */
export const TOUR_EVENT = 'evalix:tour'
const SEEN_KEY = 'evalix.tour.seen'

export interface TourStep {
  title: string
  body: string
  /** The page this step opens. Its sidebar item is outlined while the step shows. None = stay where you are. */
  nav?: string
  /** What to point at on that page (CSS selectors, first match wins). It is outlined and scrolled into view. */
  target?: string
}

export const TOUR: TourStep[] = [
  {
    title: 'Welcome to Evalix',
    body: 'Evalix shows how an AI agent behaves when things break. This short tour opens each page and shows you what to do there.',
  },
  {
    title: 'Add an agent',
    nav: '/agents',
    target: 'section[aria-label="All agents"]',
    body: 'Your agents live here. Start with the four sample agents in one click, or add your own by its web address below.',
  },
  {
    title: 'Start a run',
    nav: '/run',
    target: 'section[aria-label="Who\'s being tested"]',
    body: 'Pick the agents to test, then the problems to cause further down. Every agent gets the same questions and the same problems.',
  },
  {
    title: 'Read the results',
    nav: '/',
    target: '.rs-main, .fr-steps',
    body: 'Results land here. Each mark is one agent facing one problem; open it to see the exact step where it slipped.',
  },
  {
    title: 'See the gateway',
    nav: '/gateway',
    target: '.gw-path',
    body: 'Every model call goes through Bifrost. Send one call along this path, then pick a stop to break it live.',
  },
]

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true // storage blocked: don't show the tour on every page load
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* fine: it just may show again */
  }
}

/** The step currently showing, or null. Shows by itself on the first visit in this browser. */
export function useTour(): { step: number | null; setStep: (n: number | null) => void } {
  const [step, setStep] = useState<number | null>(() => (seen() ? null : 0))
  useEffect(() => {
    const open = () => setStep(0)
    window.addEventListener(TOUR_EVENT, open)
    return () => window.removeEventListener(TOUR_EVENT, open)
  }, [])
  return { step, setStep }
}

/** Waits for the step's page to render its target, then outlines it and scrolls it into view. */
function usePointAt(selector: string | undefined, pathname: string, wanted: string) {
  useEffect(() => {
    if (!selector || pathname !== wanted) return
    let el: Element | null = null
    let tries = 0
    let timer = 0
    const find = () => {
      el = document.querySelector(selector)
      if (el) {
        el.classList.add('tour-target')
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } else if (tries++ < 40) {
        timer = window.setTimeout(find, 100) // the page may still be loading its data
      }
    }
    find()
    return () => {
      window.clearTimeout(timer)
      el?.classList.remove('tour-target')
    }
  }, [selector, pathname, wanted])
}

export function Tour({ step, setStep }: { step: number; setStep: (n: number | null) => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)
  const s = TOUR[step]
  const last = step === TOUR.length - 1

  // Open the page this step is about.
  useEffect(() => {
    if (s.nav && pathname !== s.nav) navigate(s.nav)
    heading.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  usePointAt(s.target, pathname, s.nav ?? pathname)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function close() {
    markSeen()
    setStep(null)
  }

  return (
    <section className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      <p className="tour-count">
        {step + 1} of {TOUR.length}
      </p>
      <h2 id="tour-title" ref={heading} tabIndex={-1}>
        {s.title}
      </h2>
      <p className="tour-body">{s.body}</p>
      <div className="tour-actions">
        {last ? (
          <>
            <Button variant="primary" small onClick={close}>
              Done
            </Button>
            <Button
              small
              onClick={() => {
                close()
                navigate('/guide')
              }}
            >
              Read the guide
            </Button>
          </>
        ) : (
          <Button variant="primary" small onClick={() => setStep(step + 1)}>
            Next
          </Button>
        )}
        {step > 0 && (
          <Button small onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {!last && (
          <Button small variant="quiet" onClick={close}>
            Skip the tour
          </Button>
        )}
      </div>
    </section>
  )
}

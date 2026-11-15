import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui'

/** Fired on window to show the tour again (the guide page has a button for it). */
export const TOUR_EVENT = 'evalix:tour'
const SEEN_KEY = 'evalix.tour.seen'

export interface TourStep {
  title: string
  body: string
  /** The sidebar item this step is about. It is outlined while the step shows. */
  nav?: string
}

export const TOUR: TourStep[] = [
  {
    title: 'Welcome to Evalix',
    body: 'Evalix shows how an AI agent behaves when things break. This is your own workspace, and it starts empty.',
  },
  {
    title: 'Add an agent',
    nav: '/agents',
    body: 'Start with the four sample agents in one click, add your own by its web address, or describe one in Agent Studio.',
  },
  {
    title: 'Start a run',
    nav: '/run',
    body: 'Pick the agents and the problems to cause. Every agent gets the same questions and the same problems.',
  },
  {
    title: 'Read the results',
    nav: '/',
    body: 'See which agents got through each problem, then open any run to find the exact step where it slipped.',
  },
  {
    title: 'See the gateway',
    nav: '/gateway',
    body: 'Every model call goes through Bifrost. Follow one call through it, then break things live and watch it cope.',
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

export function Tour({ step, setStep }: { step: number; setStep: (n: number | null) => void }) {
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)
  const s = TOUR[step]
  const last = step === TOUR.length - 1

  useEffect(() => {
    heading.current?.focus()
  }, [step])

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
          <>
            <Button variant="primary" small onClick={() => setStep(step + 1)}>
              Next
            </Button>
            <Button small variant="quiet" onClick={close}>
              Skip the tour
            </Button>
          </>
        )}
      </div>
    </section>
  )
}

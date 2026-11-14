import type { BadgeName, Ending, RunDetail } from './api'

export function money(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–'
  return v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`
}

export function secs(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–'
  return `${v.toFixed(1)} s`
}

export function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '–'
}

export function num(v: number | null | undefined): string {
  return v === null || v === undefined ? '–' : v.toLocaleString()
}

export function badgeFor(ending: Ending, faultFired: boolean): BadgeName {
  if (ending === null || ending === undefined) return 'Running'
  if (ending === 'passed') return faultFired ? 'Recovered' : 'Pass'
  if (ending === 'setup_problem') return 'Setup problem'
  return 'Fail'
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function plainResult(run: Pick<RunDetail, 'ending' | 'fail_reason' | 'fault_fired'>): string {
  switch (run.ending) {
    case null:
      return 'Still running'
    case 'passed':
      return run.fault_fired ? 'Passed, even after a fault was injected' : 'Passed'
    case 'setup_problem':
      return capitalize(run.fail_reason) || 'Setup problem (not counted against the agent)'
    default:
      return capitalize(run.fail_reason) || 'Failed'
  }
}

export function stepCount(run: Pick<RunDetail, 'steps'>): number {
  return Array.isArray(run.steps) ? run.steps.filter((s) => s.kind === 'model_call').length : run.steps
}

export function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Pretty-print a step's input/output (a JSON-dumped string cut to 500 chars, or a parsed value). */
export function prettyText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') {
    try {
      return JSON.stringify(JSON.parse(v), null, 2)
    } catch {
      return v
    }
  }
  return JSON.stringify(v, null, 2)
}

// Plain words for the results screens. Kept in one place so Results, Run details and Compare say things the same way.

import type { BadgeName, Ending } from '../../api'

export function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

export function upperFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** "annual_fee" becomes "annual fee". */
function fieldWords(name: string): string {
  return name.replace(/_/g, ' ').trim()
}

/** The grader's reason as a short label under a chip: "Wrong annual fee", "Quoted a page it never opened". */
export function reasonShort(reason: string): string {
  const r = (reason || '').trim()
  if (!r) return ''
  let m = r.match(/^wrong answer:\s*(.+)$/i)
  if (m) return `Wrong ${fieldWords(m[1])}`
  m = r.match(/^missing answer:\s*(.+)$/i)
  if (m) return `No ${fieldWords(m[1])}`
  const known: Record<string, string> = {
    'gave no sources': 'Gave no sources',
    'used a source it never saw': 'Quoted a page it never opened',
    'gave up when it should have answered': 'Gave up instead of answering',
    'answered when it should have stopped': 'Answered instead of stopping',
    'stopped without saying why': 'Stopped without saying why',
    'made up an answer': 'Made up an answer',
    'sent an email it was told not to send': "Sent an email it shouldn't",
  }
  const k = known[r.toLowerCase()]
  if (k) return k
  m = r.match(/^agent returned an error \((\d+)\)$/i)
  if (m) return `Returned an error (${m[1]})`
  return upperFirst(r)
}

/** The same reason as a clause after "it": "gave no sources", "got the annual fee wrong". */
export function reasonClause(reason: string): string {
  const r = (reason || '').trim()
  if (!r) return ''
  let m = r.match(/^wrong answer:\s*(.+)$/i)
  if (m) return `got the ${fieldWords(m[1])} wrong`
  m = r.match(/^missing answer:\s*(.+)$/i)
  if (m) return `left out the ${fieldWords(m[1])}`
  m = r.match(/^agent returned an error \((\d+)\)$/i)
  if (m) return `crashed with an error (${m[1]})`
  return lowerFirst(r)
}

export type Outcome = 'pass' | 'fail' | 'setup' | 'running'

export function outcomeOf(ending: Ending): Outcome {
  if (ending === 'passed') return 'pass'
  if (ending === 'wrong' || ending === 'crashed') return 'fail'
  if (ending === 'setup_problem') return 'setup'
  return 'running'
}

/** Slipped or Crashed, for the red chip. */
export function failWord(ending: Ending): string {
  return ending === 'crashed' ? 'Crashed' : 'Slipped'
}

export function chipBadge(ending: Ending, fired: boolean): BadgeName {
  if (ending === null) return 'Running'
  if (ending === 'passed') return fired ? 'Recovered' : 'Pass'
  if (ending === 'setup_problem') return 'Setup problem'
  return 'Fail'
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? one + 's')}`
}

/** Dollars for a total: $0.17, but $0.0042 when it is tiny. */
export function dollars(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–'
  if (v >= 0.095) return `$${v.toFixed(2)}`
  if (v === 0) return '$0'
  return `$${v.toFixed(4)}`
}

/** Money for a headline cell: cents, or "under 1¢" (four decimals read as noise there). */
export function spentWords(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–'
  if (v === 0) return '$0'
  return v < 0.01 ? 'under 1¢' : `$${v.toFixed(2)}`
}

export function shortDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function shortDayTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** "Nov 14, 2026" */
export function fullDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** How long, in words: "0.8 s", "9.2 s", "2 min 5 s". */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '–'
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const m = Math.floor(seconds / 60)
  return `${m} min ${Math.round(seconds - m * 60)} s`
}

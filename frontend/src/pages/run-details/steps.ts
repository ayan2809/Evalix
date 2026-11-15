// Says what a step was, in plain words. Used by Run details and Compare.

import type { AnswerJson, Step } from '../../api'
import { lowerFirst } from '../results/words'

export type StepTone = 'plain' | 'fault' | 'back' | 'final'

export interface StepWords {
  /** "Asked the model", "Searched", "Handed in its answer" */
  title: string
  /** one line under the title */
  line: string
  /** the thing it was asked, for a search: the query */
  query: string
  /** "OK", "Error 429" */
  status: string
  failed: boolean
  /** the same thing as a short verb phrase, lowercase: "asked the model", "searched" */
  short: string
  icon: 'chat' | 'search' | 'check' | 'warning' | 'lock'
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return null
}

/** The search words or other short input of a tool call. Empty when there is nothing short to show. */
export function shortInput(step: Step): string {
  const o = asObject(step.input_json)
  if (o) {
    if (typeof o.query === 'string') return o.query
    const first = Object.values(o).find((v) => typeof v === 'string') as string | undefined
    if (first) return first.length > 120 ? `${first.slice(0, 117)}…` : first
    return ''
  }
  if (typeof step.input_json === 'string') {
    const m = step.input_json.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)/)
    if (m) {
      try {
        return JSON.parse(`"${m[1]}"`)
      } catch {
        return m[1]
      }
    }
  }
  return ''
}

function emptyResults(step: Step): boolean {
  const o = asObject(step.output_json)
  if (o && Array.isArray(o.results)) return o.results.length === 0
  return typeof step.output_json === 'string' && /"results"\s*:\s*\[\s*\]/.test(step.output_json)
}

const toolWords = (name: string) => (name === 'search' ? 'Searched' : name === 'send_email' ? 'Sent an email' : `Used ${name.replace(/_/g, ' ')}`)
const toolShort = (name: string) => lowerFirst(toolWords(name))

export function describeStep(step: Step, prev: Step | undefined, next: Step | undefined, answer: AnswerJson | null): StepWords {
  const code = step.status_code
  const failed = code >= 400
  const status = failed ? `Error ${code}` : 'OK'
  const busy = code === 429

  if (step.kind === 'final_answer') {
    let line = ''
    let short = 'handed in its answer'
    if (failed) {
      line = 'Returned an error instead of an answer'
      short = 'gave up with an error'
    } else if (answer?.status === 'blocked') {
      line = 'Stopped and said why'
      short = 'stopped and said why'
    } else if (answer?.sources) {
      line = answer.sources.length === 0 ? 'With no sources' : `With ${answer.sources.length} ${answer.sources.length === 1 ? 'source' : 'sources'}`
    }
    return { title: failed ? 'Gave up' : 'Handed in its answer', line, query: '', status, failed, short, icon: failed ? 'warning' : 'check' }
  }

  if (step.kind === 'tool_call') {
    const query = shortInput(step)
    let line = ''
    if (failed) line = step.name === 'search' ? `The search failed (error ${code})` : `It failed (error ${code})`
    else if (step.name === 'search') line = emptyResults(step) ? 'Nothing came back' : 'Got results back'
    return { title: toolWords(step.name), line, query, status, failed, short: toolShort(step.name), icon: 'search' }
  }

  // model call
  let line: string
  let short = 'asked the model'
  if (busy) {
    line = prev && prev.status_code === 429 ? 'Still busy' : 'The model said “too many requests”'
    short = 'got “too many requests”'
  } else if (failed) {
    line = `The model had a problem (error ${code})`
    short = `got an error (${code})`
  } else if (next?.kind === 'tool_call') {
    line = next.name === 'search' ? 'The model decided to search' : `The model decided to use ${next.name.replace(/_/g, ' ')}`
  } else if (next?.kind === 'final_answer' || !next) {
    line = 'The model wrote the answer'
  } else {
    line = 'The model thought it over'
  }
  return { title: 'Asked the model', line, query: '', status, failed, short, icon: 'chat' }
}

/** "asked the model, searched, then got “too many requests”" */
export function sentenceOfSteps(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')}, then ${parts[parts.length - 1]}`
}

/** The first line of a fault marker: "We broke this: model busy". */
export function faultMarker(label: string): string {
  return label ? `We broke this: ${lowerFirst(label)}` : 'We broke this'
}

/** Whole seconds, in words: "1 second", "2 seconds". */
export function secondsWords(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  return `${s} ${s === 1 ? 'second' : 'seconds'}`
}

/**
 * How long the agent waited between two steps, in ms, when it is over a second.
 * Returns 0 when either step has no start time (older runs).
 */
export function waitBetween(prev: Step, next: Step): number {
  if (prev.at_ms === null || prev.at_ms === undefined || next.at_ms === null || next.at_ms === undefined) return 0
  const gap = next.at_ms - (prev.at_ms + (prev.ms || 0))
  return gap > 1000 ? gap : 0
}

/** Sentence for a wait: "Careful waited 2 seconds and asked again". */
export function waitSentence(agent: string, prev: Step, next: Step, gap: number): string {
  const when = secondsWords(gap)
  if (prev.fault && prev.kind === next.kind) return `${agent} waited ${when} and asked again`
  if (prev.fault) return `${agent} waited ${when} first`
  return `${agent} paused for ${when}`
}

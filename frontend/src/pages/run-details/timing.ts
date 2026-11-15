// Builds a timing-diagram lane from a run's steps. Used by Run details and Compare.

import type { RunDetail, Step } from '../../api'
import type { Lane, LaneMark, Segment, SegmentKind } from '../../ui'
import { describeStep } from './steps'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** True when every step has a start time. Older runs don't, and then the diagram is left out. */
export function hasTimes(run: RunDetail): boolean {
  return run.steps.length > 0 && run.steps.every((s) => s.at_ms !== null && s.at_ms !== undefined)
}

function baseLabel(s: Step): string {
  if (s.kind === 'model_call') return 'Model'
  if (s.kind === 'final_answer') return 'Answer'
  return s.name === 'search' ? 'Search' : s.name.replace(/_/g, ' ')
}

export interface BuiltLane {
  lane: Lane
  /** When the last step ended, in ms. */
  endMs: number
}

/**
 * One lane per run: model calls, tool calls and the answer as segments on a time scale. A step we broke is
 * a "hit", a failed step is "failed", and a gap over a second is drawn as a wait with its length written on it.
 * `onSelect` makes each segment a button (it gets the step id).
 */
export function buildLane(
  run: RunDetail,
  opts: { label: Lane['label']; onSelect?: (stepId: number) => void; selectedId?: number | null },
): BuiltLane | null {
  if (!hasTimes(run)) return null
  const steps = run.steps
  const segments: Segment[] = []
  const marks: LaneMark[] = []
  let endMs = 0
  steps.forEach((s, i) => {
    const prev = steps[i - 1]
    const next = steps[i + 1]
    const start = s.at_ms as number
    const end = start + (s.ms || 0)
    if (prev) {
      const prevEnd = (prev.at_ms as number) + (prev.ms || 0)
      if (start - prevEnd > 1000) {
        segments.push({
          startMs: prevEnd,
          endMs: start,
          kind: 'wait',
          label: `waited ${seconds(start - prevEnd)}`,
          title: `${run.agent_name} waited ${seconds(start - prevEnd)}`,
        })
      }
    }
    const words = describeStep(s, prev, next, run.answer_json)
    let kind: SegmentKind = s.kind === 'model_call' ? 'model' : s.kind === 'tool_call' ? 'tool' : 'answer'
    let label = baseLabel(s)
    if (s.fault) kind = 'hit'
    else if (words.failed) {
      kind = 'failed'
      label = `Error ${s.status_code}`
    }
    const broke = s.fault ? ', and we broke it' : words.failed ? `, ${words.status.toLowerCase()}` : ''
    segments.push({
      startMs: start,
      endMs: end,
      kind,
      label,
      title: `Step ${s.position}: ${words.title}${broke}. Starts at ${seconds(start)}, ${s.ms >= 100 ? `takes ${seconds(s.ms)}` : 'instant'}.`,
      onSelect: opts.onSelect ? () => opts.onSelect?.(s.id) : undefined,
      selected: opts.selectedId === s.id,
    })
    if (s.fault && !marks.some((m) => m.tone === 'fault')) marks.push({ atMs: start, label: 'We broke it', tone: 'fault' })
    endMs = Math.max(endMs, end)
  })
  return { lane: { id: run.id, label: opts.label, segments, marks }, endMs }
}

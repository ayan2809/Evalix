import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { textWidth, useFontsReady } from './measure'
import './datasheet.css'

/**
 * A timing diagram: one lane per run (or per test), every lane on the same time scale, so lengths and
 * waits compare directly. Segments are steps; a 'wait' segment is drawn as a dimension line with its
 * length written on it. Marks are vertical ticks (a fault we caused, the point where two runs split).
 */
export type SegmentKind = 'model' | 'tool' | 'answer' | 'wait' | 'hit' | 'failed' | 'blocked'

export interface Segment {
  startMs: number
  endMs: number
  kind: SegmentKind
  /** Short text drawn in the segment when it is wide enough. */
  label?: string
  /** Full plain-words description (tooltip and screen readers). */
  title: string
  onSelect?: () => void
  selected?: boolean
}

export interface LaneMark {
  atMs: number
  label: string
  tone: 'fault' | 'split' | 'fail'
}

export interface Lane {
  id: string
  label: ReactNode
  segments: Segment[]
  marks?: LaneMark[]
}

function niceStep(totalMs: number): number {
  const target = totalMs / 6
  const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000]
  return steps.find((s) => s >= target) ?? 60000
}

function fmt(ms: number): string {
  if (ms === 0) return '0 s'
  const s = ms / 1000
  return `${s < 10 && s % 1 ? s.toFixed(1) : Math.round(s)} s`
}

export function TimingDiagram({
  lanes,
  totalMs,
  label,
  splitAtMs,
}: {
  lanes: Lane[]
  /** The shared scale. Pass the longest lane's end so every lane uses the same ruler. */
  totalMs: number
  label: string
  /** Draws one vertical split line across every lane. */
  splitAtMs?: number
}) {
  const total = Math.max(totalMs, 1)
  const clampPct = (ms: number) => Math.min(100, Math.max(0, (ms / total) * 100))
  const pct = (ms: number) => `${clampPct(ms)}%`
  const step = niceStep(total)
  const ticks: number[] = []
  for (let t = 0; t <= total + 1; t += step) ticks.push(t)

  // The track's width in px, so labels can be hidden or moved when they would not fit.
  const ruler = useRef<HTMLDivElement>(null)
  const [trackW, setTrackW] = useState(0)
  useLayoutEffect(() => {
    const el = ruler.current
    if (!el) return
    setTrackW(el.clientWidth)
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useFontsReady()
  const px = (ms: number) => (clampPct(ms) / 100) * trackW

  const tickClass = (t: number, i: number) => {
    if (i === 0) return 'timing-tick'
    const w = textWidth(fmt(t), 12)
    const x = px(t)
    if (x + w / 2 > trackW) return 'timing-tick end'
    return 'timing-tick'
  }

  return (
    <figure className="timing" aria-label={label}>
      <div className="timing-axis" aria-hidden="true">
        <span className="timing-gutter" />
        <div className="timing-ruler" ref={ruler}>
          {ticks.map((t, i) => (
            <span key={t} className={tickClass(t, i)} style={{ left: pct(t) }}>
              {fmt(t)}
            </span>
          ))}
        </div>
      </div>
      {lanes.map((lane) => {
        // Labels above the bar (a mark's note, a short tool name) must not overlap each other.
        const taken: [number, number][] = []
        const take = (x0: number, x1: number) => taken.push([x0, x1])
        const free = (x0: number, x1: number) => x0 >= 0 && x1 <= trackW && !taken.some(([a, b]) => x0 < b + 4 && x1 > a - 4)
        const marks = (lane.marks ?? []).map((m) => {
          const w = textWidth(m.label, 12, 650)
          const x = px(m.atMs)
          // Right of the line by default; left of it at the end of the axis or when another note is already there.
          const right: [number, number] = [x + 4, x + 4 + w]
          const left: [number, number] = [x - 4 - w, x - 4]
          const flip = !free(...right) && free(...left) ? true : x + 6 + w > trackW
          const [a, b] = flip ? left : right
          take(a, b)
          return { ...m, flip }
        })
        return (
          <div key={lane.id} className="timing-lane">
            <div className="timing-gutter timing-name">{lane.label}</div>
            <div className="timing-track">
              {ticks.map((t) => (
                <span key={t} className="timing-grid" style={{ left: pct(t) }} aria-hidden="true" />
              ))}
              {splitAtMs !== undefined && (
                <span className="timing-split" style={{ left: pct(splitAtMs) }} aria-hidden="true" />
              )}
              <ol className="timing-segments">
                {lane.segments.map((s, i) => {
                  const wMs = Math.max(s.endMs - s.startMs, total * 0.004)
                  const l = clampPct(s.startMs)
                  // A segment never runs past the axis; a sliver at the very end slides in to stay inside it.
                  const style = { left: `min(${l}%, calc(100% - 3px))`, width: `${Math.min(clampPct(wMs), 100 - l)}%` }
                  const cls = `tseg tseg-${s.kind}${s.selected ? ' selected' : ''}`
                  let body: ReactNode = null
                  if (s.kind === 'wait') {
                    body = <span className="tseg-dim">{s.label ?? fmt(s.endMs - s.startMs)}</span>
                  } else if (s.label && trackW > 0) {
                    const need = textWidth(s.label, 12) + 13
                    if ((wMs / total) * trackW >= need) {
                      body = <span className="tseg-label">{s.label}</span>
                    } else if (s.kind === 'tool') {
                      // Too narrow for its name: put a short label above the bar if there is room.
                      const w = textWidth(s.label, 12, 600) + 2
                      const x0 = Math.min(px(s.startMs), trackW - w)
                      if (free(x0, x0 + w)) {
                        take(x0, x0 + w)
                        body = (
                          <span className="tseg-above" style={{ left: x0 - px(s.startMs) }}>
                            {s.label}
                          </span>
                        )
                      }
                    }
                  }
                  return (
                    <li key={i} className={cls} style={style} title={s.title}>
                      {s.onSelect ? (
                        <button type="button" className="tseg-btn" onClick={s.onSelect} aria-label={s.title}>
                          {body}
                        </button>
                      ) : (
                        <>
                          <span className="sr-only">{s.title}</span>
                          <span aria-hidden="true">{body}</span>
                        </>
                      )}
                    </li>
                  )
                })}
              </ol>
              {marks.map((m, i) => (
                <span key={i} className={`timing-mark tm-${m.tone}`} style={{ left: pct(m.atMs) }}>
                  <span className={`tm-label${m.flip ? ' flip' : ''}`}>{m.label}</span>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </figure>
  )
}

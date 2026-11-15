import { textWidth, useFontsReady } from '../../ui/measure'
import type { AgentRow } from './model'
import { dollars } from './words'

// A characteristic plot from real data: one labelled point per agent.
// x = the agent's total cost for the whole benchmark, y = problems it got through.

const W = 330
const PH_FIXED = 176
const M = { left: 42, right: 16, top: 14, bottom: 46 }
const PW = W - M.left - M.right
const PH = PH_FIXED

const COST_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10]

function niceMax(max: number): { max: number; step: number } {
  const step = COST_STEPS.find((s) => s >= max / 4) ?? 10
  return { max: Math.ceil(max / step - 1e-9) * step, step }
}

function costLabel(v: number, step: number): string {
  return `$${v.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}`
}

type Anchor = 'start' | 'end' | 'middle'
interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
}
interface Pt {
  name: string
  x: number
  y: number
  bad: boolean
  label: { x: number; y: number; anchor: Anchor }
  /** A short line from the dot to its label, drawn when the label had to move off to the side. */
  leader: { x1: number; y1: number; x2: number; y2: number } | null
  cost: number
  got: number
}

function overlaps(a: Box, b: Box) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
}

export function CostPlot({ rows }: { rows: AgentRow[] }) {
  useFontsReady()
  const usable = rows.filter((r) => r.cost !== null && r.fTotal > 0)
  if (usable.length === 0) return <p className="tag">No cost figures yet.</p>

  const { max: xMax, step: xStep } = niceMax(Math.max(...usable.map((r) => r.cost as number), 0.001))
  const yMax = Math.max(...usable.map((r) => r.fTotal))
  const yStep = yMax > 8 ? 2 : 1

  const px = (c: number) => M.left + (c / xMax) * PW
  // Dots tied on the top value and close together get one row of labels above the frame, in left-to-right
  // order, each joined to its own dot. A label beside a crowded dot would be ambiguous, and a label at another
  // height would suggest another value.
  const tops = usable.filter((r) => r.fPassed === yMax)
  const rowed = tops.length > 1 ? tops.filter((r) => tops.some((o) => o !== r && Math.abs(px(o.cost as number) - px(r.cost as number)) < 100)) : []
  const mTop = rowed.length > 1 ? 38 : 14
  const H = mTop + PH + M.bottom
  // Headroom above the best score so points and their labels don't sit on the frame.
  const yTop = yMax + 0.9
  const py = (v: number) => mTop + (1 - v / yTop) * PH

  // Put each label next to its own dot, inside the plot frame, clear of every dot and every other label.
  // Dots sharing a value get their labels stacked at different heights, joined to the dot by a short leader line.
  const dots: Box[] = usable.map((r) => {
    const x = px(r.cost as number)
    const y = py(r.fPassed)
    return { x0: x - 7, x1: x + 7, y0: y - 7, y1: y + 7 }
  })
  const placed: Box[] = []
  // The row above the frame: pack left to right, then pull back inside the SVG if it ran past the right edge.
  const rowLayout = new Map<number, { x: number; attach: number }>()
  {
    const sorted = [...rowed].sort((a, b) => (a.cost as number) - (b.cost as number))
    const ws = sorted.map((r) => Math.ceil(textWidth(r.name, 12, 600)) + 2)
    const xs: number[] = []
    sorted.forEach((r, i) => {
      const want = px(r.cost as number) - ws[i] / 2
      xs.push(Math.max(2, i > 0 ? Math.max(want, xs[i - 1] + ws[i - 1] + 10) : want))
    })
    for (let i = sorted.length - 1; i >= 0; i--) {
      const limit = i === sorted.length - 1 ? W - 2 : xs[i + 1] - 10
      if (xs[i] + ws[i] > limit) xs[i] = limit - ws[i]
    }
    sorted.forEach((r, i) => {
      const dx = px(r.cost as number)
      rowLayout.set(r.id, { x: xs[i], attach: Math.min(Math.max(dx, xs[i] + 4), xs[i] + ws[i] - 4) })
    })
  }
  const inner: Box = { x0: M.left + 3, x1: W - M.right - 3, y0: mTop + 2, y1: mTop + PH - 2 }
  const pts: Pt[] = [...usable]
    .sort((a, b) => (a.cost as number) - (b.cost as number))
    .map((r) => {
      const x = px(r.cost as number)
      const y = py(r.fPassed)
      const inRow = rowLayout.get(r.id)
      if (inRow) {
        const base = 22
        return {
          name: r.name,
          x,
          y,
          bad: r.fPassed < r.fTotal,
          label: { x: inRow.x, y: base, anchor: 'start' as Anchor },
          leader: { x1: inRow.attach, y1: base + 5, x2: x, y2: y - 6 },
          cost: r.cost as number,
          got: r.fPassed,
        }
      }
      const w = Math.ceil(textWidth(r.name, 12, 600)) + 2
      type Opt = { x: number; y: number; anchor: Anchor; leader: boolean }
      // Dots that share a value and sit close together would make a label beside the dot ambiguous.
      // Those get their labels stacked below, at different heights, each with a leader line to its own dot.
      const mates = usable.filter((o) => o !== r && o.fPassed === r.fPassed && Math.abs(px(o.cost as number) - x) < 100)
      const options: Opt[] =
        mates.length > 0
          ? []
          : [
              { x: x + 9, y: y + 4, anchor: 'start', leader: false },
              { x: x - 9, y: y + 4, anchor: 'end', leader: false },
              { x, y: y - 10, anchor: 'middle', leader: false },
              { x, y: y + 21, anchor: 'middle', leader: false },
            ]
      const leftmost = mates.every((o) => px(o.cost as number) > x)
      for (let k = 1; k <= 6; k++) {
        for (const dy of [16 * k, -16 * k]) {
          const right: Opt = { x: x + 17, y: y + dy + 4, anchor: 'start', leader: true }
          const left: Opt = { x: x - 17, y: y + dy + 4, anchor: 'end', leader: true }
          options.push(...(leftmost ? [left, right] : [right, left]))
        }
      }
      const box = (o: Opt): Box => {
        const x0 = o.anchor === 'start' ? o.x : o.anchor === 'end' ? o.x - w : o.x - w / 2
        return { x0, x1: x0 + w, y0: o.y - 11, y1: o.y + 3 }
      }
      const fits = (o: Opt) => {
        const b = box(o)
        return (
          b.x0 >= inner.x0 &&
          b.x1 <= inner.x1 &&
          b.y0 >= inner.y0 &&
          b.y1 <= inner.y1 &&
          !dots.some((p) => overlaps(b, p)) &&
          !placed.some((p) => overlaps(b, p))
        )
      }
      const chosen = options.find(fits) ?? options[0]
      placed.push(box(chosen))
      const leader = chosen.leader
        ? {
            x1: x + (chosen.anchor === 'start' ? 4 : -4),
            y1: y + (chosen.y - 4 > y ? 3 : -3),
            x2: chosen.x + (chosen.anchor === 'start' ? -3 : 3),
            y2: chosen.y - 4,
          }
        : null
      return { name: r.name, x, y, bad: r.fPassed < r.fTotal, label: chosen, leader, cost: r.cost as number, got: r.fPassed }
    })

  const xTicks: number[] = []
  for (let v = 0; v <= xMax + 1e-9; v += xStep) xTicks.push(Number(v.toFixed(6)))
  const yTicks: number[] = []
  for (let v = 0; v <= yMax; v += yStep) yTicks.push(v)

  return (
    <figure className="plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Problems got through against total cost, one point per agent">
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className="plot-grid" x1={M.left} x2={W - M.right} y1={py(v)} y2={py(v)} />
            <text className="plot-tick" x={M.left - 7} y={py(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <g key={`x${v}`}>
            <line className="plot-grid" x1={px(v)} x2={px(v)} y1={mTop} y2={mTop + PH} />
            <text className="plot-tick" x={px(v)} y={mTop + PH + 16} textAnchor="middle">
              {costLabel(v, xStep)}
            </text>
          </g>
        ))}
        <rect className="plot-frame" x={M.left} y={mTop} width={PW} height={PH} />
        <text className="plot-title" x={M.left + PW / 2} y={H - 6} textAnchor="middle">
          Total cost for the benchmark
        </text>
        <text className="plot-title" transform={`translate(11 ${mTop + PH / 2}) rotate(-90)`} textAnchor="middle">
          Problems got through
        </text>
        {pts.map((p) => (
          <g key={p.name}>
            {p.leader && <line className="plot-leader" x1={p.leader.x1} y1={p.leader.y1} x2={p.leader.x2} y2={p.leader.y2} />}
            <circle className={`plot-pt${p.bad ? ' bad' : ''}`} cx={p.x} cy={p.y} r={5} />
            <text className={`plot-label${p.bad ? ' bad' : ''}`} x={p.label.x} y={p.label.y} textAnchor={p.label.anchor}>
              {p.name}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="sr-only">
        {pts.map((p) => `${p.name}: ${p.got} problems got through, ${dollars(p.cost)} in total.`).join(' ')}
      </figcaption>
    </figure>
  )
}

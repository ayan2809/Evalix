import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { appPath, type BenchmarkDetail } from '../../api'
import { Mark, Table, type MarkState } from '../../ui'
import { cellKey, type CellInfo, type Problem } from './model'
import { failWord, reasonShort } from './words'

interface Hot {
  row: number
  col: number
}

/** One cell of the table: what one agent did on one problem, as a mark and a word. Links to the run. */
function Cell({
  cell,
  agent,
  problem,
  fault,
  ink,
  index,
  onHot,
}: {
  cell: CellInfo | undefined
  agent: string
  problem: string
  /** a problem we caused (not an everyday question): a pass after the problem hit is "Recovered" */
  fault: boolean
  ink: boolean
  index: number
  onHot: (on: boolean) => void
}) {
  if (!cell || cell.trials.length === 0) return <span className="rs-none">No result</span>
  const trials = cell.trials
  const failed = trials.find((t) => t.outcome === 'fail')
  const target = failed ?? trials[0]
  const many = trials.length > 1
  const allPass = cell.counted > 0 && cell.passed === cell.counted
  const anyRunning = trials.some((t) => t.outcome === 'running')
  const onlySetup = cell.counted === 0 && !anyRunning

  let state: MarkState
  let word = ''
  let why = ''
  let said: string
  if (cell.counted === 0) {
    state = onlySetup ? 'setup' : 'running'
    word = onlySetup ? 'Setup problem' : 'Still running'
    said = onlySetup ? 'a setup problem' : 'still running'
  } else if (allPass) {
    // Got through after the problem really hit it: say so, that is what the test is for.
    const recovered = fault && trials.filter((t) => t.outcome === 'pass').every((t) => t.fired)
    state = recovered ? 'recovered' : 'through'
    // A single pass is the mark alone; the link's label still says what happened.
    // The blue mark says it (the legend explains it once); a word in every cell is noise.
    word = many ? `${cell.passed} of ${cell.counted}` : ''
    said = many ? `${cell.passed} of ${cell.counted} got through` : recovered ? 'recovered' : 'got through'
  } else {
    state = failed?.ending === 'crashed' ? 'crashed' : 'slipped'
    why = reasonShort(failed?.reason ?? '')
    word = many ? `${cell.passed} of ${cell.counted}` : failWord(failed?.ending ?? null)
    said = `${many ? `${cell.passed} of ${cell.counted} got through` : failWord(failed?.ending ?? null).toLowerCase()}${why ? `, ${why.toLowerCase()}` : ''}`
  }

  return (
    <>
      <Link
        to={appPath(`/runs/${target.runId}`)}
        className="rs-cell-link"
        aria-label={`${agent} on ${problem}: ${said}. Open the run.`}
        title={why || undefined}
        onMouseEnter={() => onHot(true)}
        onMouseLeave={() => onHot(false)}
        onFocus={() => onHot(true)}
        onBlur={() => onHot(false)}
      >
        <Mark state={state} ink={ink} index={index} label="" />
        {why && !many ? (
          <span className="rs-why">{why}</span>
        ) : word ? (
          <span className={failed ? 'rs-why' : 'rs-word'}>{word}</span>
        ) : null}
      </Link>
      {many && (
        <span className="rs-tries">
          {trials.map((t) => (
            <Link
              key={t.runId}
              to={appPath(`/runs/${t.runId}`)}
              className={t.outcome === 'fail' ? 'bad' : undefined}
              aria-label={`Try ${t.trial}: ${t.outcome === 'pass' ? 'got through' : t.outcome === 'fail' ? 'slipped' : 'not counted'}`}
            >
              {t.trial}
            </Link>
          ))}
        </span>
      )}
    </>
  )
}

/** Phone column head: the last word of a long name, cut to fit a 58 px column. */
function shortHead(name: string): string {
  const words = name.trim().split(/\s+/)
  const w = words.length > 1 ? words[words.length - 1] : words[0]
  return w.length > 8 ? `${w.slice(0, 6)}.` : w
}

/** A head that shows the full name, or a short one on phones. The full name always stays for screen readers and hover. */
function Head({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="hd-full">{full}</span>
      <span className="hd-short" aria-hidden="true">
        {short}
      </span>
    </>
  )
}

/** What each mark means, once, under the table. */
function Legend() {
  return (
    <ul className="rs-legend" aria-label="What the marks mean">
      <li>
        <Mark state="through" size={12} label="" /> Got through
      </li>
      <li>
        <Mark state="recovered" size={12} label="" /> Recovered: the problem hit, and it still got through
      </li>
      <li>
        <Mark state="slipped" size={12} label="" /> Slipped
      </li>
      <li>
        <Mark state="crashed" size={12} label="" /> Crashed
      </li>
      <li>
        <Mark state="setup" size={12} label="" /> Setup problem, not counted
      </li>
    </ul>
  )
}

/**
 * The characteristics table: problems down the side, agents across the top, one mark per cell.
 * Hovering or focusing a cell lights up its row and column. `animate` inks the marks in, in reading order
 * (the one moving moment on the page); pass false for the plain table.
 */
export function ProblemGrid({
  bench,
  cells,
  problems,
  label,
  firstHead,
  animate,
  legend,
}: {
  bench: BenchmarkDetail
  cells: Map<string, CellInfo>
  problems: Problem[]
  label: string
  firstHead: string
  animate: boolean
  legend?: boolean
}) {
  const [hot, setHot] = useState<Hot | null>(null)
  const cols = bench.agents.length
  const box = useRef<HTMLDivElement>(null)
  // When the agents don't all fit (phones), fade the right edge and say so. The first column stays put.
  const [more, setMore] = useState(false)
  useEffect(() => {
    const scroller = box.current?.querySelector<HTMLElement>('.scroll-x')
    if (!scroller) return
    const check = () => setMore(scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 4)
    check()
    scroller.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(scroller)
    const t = scroller.querySelector('table')
    if (t) ro.observe(t)
    return () => {
      scroller.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [cols, problems.length])
  return (
    <div className="rs-gridwrap">
      <div className={`rs-scroller${more ? ' more' : ''}`} ref={box}>
        <span className="rs-edge" aria-hidden="true">
          More agents
        </span>
      <Table label={label} className="rs-grid">
        <thead>
          <tr>
            <th className="rs-first">
              <Head full={firstHead} short={firstHead.replace(/ we caused$/, '')} />
            </th>
            {bench.agents.map((a, col) => (
              <th key={a.id} title={a.description || undefined} className={hot?.col === col ? 'hot-col' : undefined}>
                <Head full={a.name} short={shortHead(a.name)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {problems.map((p, row) => (
            <tr key={`${p.taskId}|${p.faultId}`}>
              <th scope="row" className={`rs-first${hot?.row === row ? ' hot-row' : ''}`}>
                <strong>{p.title}</strong>
                <span className="rs-cond">{p.sub}</span>
              </th>
              {bench.agents.map((a, col) => {
                const isHot = hot?.row === row && hot.col === col
                const cls = `rs-td${isHot ? ' hot' : ''}${!isHot && hot?.row === row ? ' hot-row' : ''}${!isHot && hot?.col === col ? ' hot-col' : ''}`
                return (
                  <td key={a.id} className={cls}>
                    <Cell
                      cell={cells.get(cellKey(a.id, p.taskId, p.faultId))}
                      agent={a.name}
                      problem={p.title}
                      fault={p.faultId !== ''}
                      ink={animate}
                      index={row * cols + col}
                      onHot={(on) => setHot(on ? { row, col } : null)}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </Table>
      </div>
      {legend && <Legend />}
    </div>
  )
}

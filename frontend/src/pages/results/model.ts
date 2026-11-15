// Turns one benchmark into the numbers and sentences the Results screen shows.

import type { BenchmarkDetail, Ending } from '../../api'
import { dollars, joinNames, numberWord, outcomeOf, plural, reasonClause, shortDay, type Outcome } from './words'

export interface TrialInfo {
  runId: string
  trial: number
  ending: Ending
  outcome: Outcome
  reason: string
  fired: boolean
}

export interface CellInfo {
  agentId: number
  trials: TrialInfo[]
  /** trials that count (not setup problems, not still running) */
  counted: number
  passed: number
}

export const cellKey = (agentId: number, taskId: string, faultId: string) => `${agentId}|${taskId}|${faultId}`

export function buildCells(b: BenchmarkDetail): Map<string, CellInfo> {
  const runs = new Map(b.runs.map((r) => [r.id, r]))
  const cells = new Map<string, CellInfo>()
  for (const g of b.grid) {
    const trials: TrialInfo[] = g.trials.map((t) => {
      const run = runs.get(t.run_id)
      return {
        runId: t.run_id,
        trial: t.trial,
        ending: t.ending,
        outcome: outcomeOf(t.ending),
        reason: run?.fail_reason ?? '',
        fired: run?.fault_fired ?? t.badge === 'Recovered',
      }
    })
    const counted = trials.filter((t) => t.outcome === 'pass' || t.outcome === 'fail')
    cells.set(cellKey(g.agent_id, g.task_id, g.fault_id), {
      agentId: g.agent_id,
      trials,
      counted: counted.length,
      passed: counted.filter((t) => t.outcome === 'pass').length,
    })
  }
  return cells
}

export interface Problem {
  /** fault id, or '' for an everyday question */
  faultId: string
  taskId: string
  title: string
  sub: string
}

/** The problems we caused, in the order the benchmark lists them. Only those that have results. */
export function faultProblems(b: BenchmarkDetail, cells: Map<string, CellInfo>): Problem[] {
  return b.faults
    .filter((f) => b.agents.some((a) => cells.has(cellKey(a.id, f.task_id, f.id))))
    .map((f) => ({ faultId: f.id, taskId: f.task_id, title: f.label, sub: f.short }))
}

export function questionProblems(b: BenchmarkDetail, cells: Map<string, CellInfo>): Problem[] {
  return b.tasks
    .filter((t) => b.agents.some((a) => cells.has(cellKey(a.id, t.id, ''))))
    .map((t) => ({ faultId: '', taskId: t.id, title: t.title, sub: t.area }))
}

export interface AgentRow {
  id: number
  name: string
  tag: string
  description: string
  qPassed: number
  qTotal: number
  fPassed: number
  fTotal: number
  cost: number | null
  avgSeconds: number | null
  costPerSuccess: number | null
  stepRatio: number | null
  setupProblems: number
}

function weighted(parts: { v: number | null | undefined; w: number }[]): number | null {
  let sum = 0
  let weight = 0
  for (const p of parts) {
    if (p.v === null || p.v === undefined || p.w <= 0) continue
    sum += p.v * p.w
    weight += p.w
  }
  return weight > 0 ? sum / weight : null
}

export function agentRows(b: BenchmarkDetail, cells: Map<string, CellInfo>, questions: Problem[], faults: Problem[]): AgentRow[] {
  return b.agents.map((a) => {
    const tally = (list: Problem[]) => {
      let total = 0
      let passed = 0
      for (const p of list) {
        const c = cells.get(cellKey(a.id, p.taskId, p.faultId))
        if (!c || c.counted === 0) continue
        total += 1
        if (c.passed === c.counted) passed += 1
      }
      return { total, passed }
    }
    const q = tally(questions)
    const f = tally(faults)
    const s = b.summary.find((x) => x.agent_id === a.id)
    const cost = s ? s.normal.total_cost + s.faults.total_cost : null
    const successes = s ? s.normal.passed + s.faults.passed : 0
    return {
      id: a.id,
      name: a.name,
      tag: a.tag,
      description: a.description,
      qPassed: q.passed,
      qTotal: q.total,
      fPassed: f.passed,
      fTotal: f.total,
      cost,
      avgSeconds: s
        ? weighted([
            { v: s.normal.avg_seconds, w: s.normal.counted },
            { v: s.faults.avg_seconds, w: s.faults.counted },
          ])
        : null,
      costPerSuccess: cost !== null && successes > 0 ? cost / successes : null,
      stepRatio: s
        ? weighted([
            { v: s.normal.avg_step_ratio, w: s.normal.counted },
            { v: s.faults.avg_step_ratio, w: s.faults.counted },
          ])
        : null,
      setupProblems: s?.setup_problems ?? 0,
    }
  })
}

const ofTotal = (n: number, total: number) => (n === total ? `all ${total}` : `${n} of ${total}`)

/** "all 3 problems", "the 1 problem", "2 of 3 problems", "0 of 1 problem". */
function scoreWords(n: number, total: number, unit: string): string {
  const one = unit === 'problems' ? 'problem' : 'everyday question'
  if (total === 1) return n === 1 ? `the ${one}` : `0 of 1 ${one}`
  return `${ofTotal(n, total)} ${unit}`
}

/** "Careful got through all 7 problems. Careless got through 4." Handles ties and a single agent. */
export function answerSentence(rows: AgentRow[], hasProblems: boolean): string {
  const useFaults = rows.some((r) => r.fTotal > 0)
  const unit = useFaults ? 'problems' : 'everyday questions'
  const verb = useFaults ? 'got through' : 'passed'
  const score = (r: AgentRow) => (useFaults ? r.fPassed : r.qPassed)
  const total = (r: AgentRow) => (useFaults ? r.fTotal : r.qTotal)
  if (rows.length === 0 || !hasProblems) return 'There are no results to compare yet.'
  const maxTotal = Math.max(...rows.map(total))
  if (rows.length === 1) {
    const r = rows[0]
    return `${r.name} ${verb} ${scoreWords(score(r), total(r), unit)}.`
  }
  const best = Math.max(...rows.map(score))
  const worst = Math.min(...rows.map(score))
  const top = rows.filter((r) => score(r) === best)
  const bottom = rows.filter((r) => score(r) === worst)
  const names = (list: AgentRow[]) => (list.length <= 3 ? joinNames(list.map((r) => r.name)) : `${list.length} agents`)
  if (best === worst) {
    const who = rows.length === 2 ? 'Both agents' : `All ${rows.length} agents`
    return `${who} ${verb} ${scoreWords(best, maxTotal, unit)}.`
  }
  return `${names(top)} ${verb} ${scoreWords(best, maxTotal, unit)}. ${names(bottom)} ${verb} ${worst}.`
}

/** "65 runs on Nov 14, one try each. $0.17 in total." */
export function factsSentence(b: BenchmarkDetail): string {
  const tries = b.trials === 1 ? 'one try each' : `${numberWord(b.trials)} tries each`
  const runs = b.status === 'done' ? plural(b.total_runs, 'run') : `${b.done_runs} of ${b.total_runs} runs`
  const stopped = b.status === 'cancelled' ? ' Stopped early.' : ''
  return `${runs} on ${shortDay(b.created_at)}, ${tries}. ${dollars(b.total_cost)} in total.${stopped}`
}

/**
 * The everyday questions in one sentence: "Everyone passed all 6, except Google ADK once: it gave no sources on
 * AWS Fargate and EKS billing."
 */
export function everydaySentence(b: BenchmarkDetail, cells: Map<string, CellInfo>, questions: Problem[]): string {
  const n = questions.length
  if (n === 0) return 'No everyday questions were asked in this run.'
  const everyone = b.agents.length === 1 ? `${b.agents[0].name} passed` : b.agents.length === 2 ? 'Both passed' : 'Everyone passed'
  const slips: { agent: string; question: string; failed: number; reason: string }[] = []
  for (const q of questions) {
    for (const a of b.agents) {
      const c = cells.get(cellKey(a.id, q.taskId, q.faultId))
      if (!c || c.counted === 0 || c.passed === c.counted) continue
      const first = c.trials.find((t) => t.outcome === 'fail')
      slips.push({ agent: a.name, question: q.title, failed: c.counted - c.passed, reason: reasonClause(first?.reason ?? '') })
    }
  }
  const all = n === 1 ? 'the question' : `all ${n}`
  if (slips.length === 0) return `${everyone} ${all}.`
  const times = (k: number) => (k === 1 ? 'once' : k === 2 ? 'twice' : `${k} times`)
  if (slips.length === 1) {
    const s = slips[0]
    return `${everyone} ${all}, except ${s.agent} ${times(s.failed)}${s.reason ? `: it ${s.reason}` : ''} on ${s.question}.`
  }
  if (slips.length <= 3) {
    const parts = slips.map((s) => `${s.agent} on ${s.question}${s.reason ? ` (it ${s.reason})` : ''}`)
    return `${everyone} ${all}, except ${joinNames(parts)}.`
  }
  const agents = new Set(slips.map((s) => s.agent)).size
  return `Agents slipped ${slips.length} times on everyday questions, across ${agents === 1 ? 'one agent' : `${agents} agents`}.`
}

// Picks two runs to compare when the address doesn't say which.

import { api, type BenchmarkDetail } from '../../api'
import { buildCells, cellKey, type CellInfo } from '../results/model'

export interface Pair {
  a: string
  b: string
}

/** The run to link to for one agent on one problem. Prefers the given trial. */
export function runFor(cells: Map<string, CellInfo>, agentId: number, taskId: string, faultId: string, trial = 1): string | null {
  const c = cells.get(cellKey(agentId, taskId, faultId))
  if (!c || c.trials.length === 0) return null
  return (c.trials.find((t) => t.trial === trial) ?? c.trials[0]).runId
}

/** 'pass' or 'fail' for the first counted trial, null when it didn't count. */
function firstSide(c: CellInfo | undefined): 'pass' | 'fail' | null {
  const t = c?.trials.find((x) => x.outcome === 'pass' || x.outcome === 'fail')
  return t ? (t.outcome === 'pass' ? 'pass' : 'fail') : null
}

/** In one benchmark, the first problem where one agent got through and another didn't. Problems we caused come first. */
export function firstSplit(b: BenchmarkDetail): Pair | null {
  const cells = buildCells(b)
  const problems = [
    ...b.faults.map((f) => ({ taskId: f.task_id, faultId: f.id })),
    ...b.tasks.map((t) => ({ taskId: t.id, faultId: '' })),
  ]
  let fallback: Pair | null = null
  for (const p of problems) {
    const rows = b.agents.map((a) => ({ id: a.id, side: firstSide(cells.get(cellKey(a.id, p.taskId, p.faultId))) }))
    const pass = rows.find((r) => r.side === 'pass')
    const fail = rows.find((r) => r.side === 'fail')
    if (pass && fail) {
      const a = runFor(cells, pass.id, p.taskId, p.faultId)
      const bb = runFor(cells, fail.id, p.taskId, p.faultId)
      if (a && bb) return { a, b: bb }
    }
    if (!fallback && b.agents.length >= 2) {
      const a = runFor(cells, b.agents[0].id, p.taskId, p.faultId)
      const bb = runFor(cells, b.agents[1].id, p.taskId, p.faultId)
      if (a && bb) fallback = { a, b: bb }
    }
  }
  return fallback
}

/** With no addresses at all: the newest benchmark, and its first split. */
export async function defaultPair(): Promise<Pair | null> {
  const list = await api.listBenchmarks()
  const pick = list.find((x) => x.status === 'done') ?? list.find((x) => x.done_runs > 0)
  if (!pick) return null
  return firstSplit(await api.getBenchmark(pick.id))
}

/** With only run A: the same problem, another agent. One that ended differently if there is one. */
export async function partnerFor(aId: string): Promise<Pair | null> {
  const run = await api.getRun(aId)
  const bench = await api.getBenchmark(run.benchmark_id)
  const cells = buildCells(bench)
  const others = bench.agents.filter((x) => x.id !== run.agent_id)
  const mine = (run.ending === 'passed' ? 'pass' : 'fail') as 'pass' | 'fail'
  let best: string | null = null
  for (const o of others) {
    const id = runFor(cells, o.id, run.task_id, run.fault_id, run.trial)
    if (!id) continue
    best ??= id
    if (firstSide(cells.get(cellKey(o.id, run.task_id, run.fault_id))) !== mine) {
      best = id
      break
    }
  }
  return best ? { a: aId, b: best } : null
}

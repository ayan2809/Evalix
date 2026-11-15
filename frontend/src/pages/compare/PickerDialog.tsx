import { useEffect, useMemo, useState } from 'react'
import { api, type BenchmarkDetail, type CompareResult } from '../../api'
import { useAsync } from '../../hooks'
import { Button, ErrorState, Loading, Modal, Select } from '../../ui'
import { buildCells, faultProblems, questionProblems } from '../results/model'
import { shortDayTime } from '../results/words'
import { runFor, type Pair } from './defaults'

/**
 * A small dialog to change what is compared: which run, which problem, which two agents.
 * It builds the two run ids from the benchmark's grid.
 */
export function PickerDialog({
  open,
  onClose,
  current,
  onPick,
}: {
  open: boolean
  onClose: () => void
  current: CompareResult
  onPick: (pair: Pair) => void
}) {
  const [benchId, setBenchId] = useState(current.a.benchmark_id)
  const [problem, setProblem] = useState(`${current.a.task_id}|${current.a.fault_id}`)
  const [agentA, setAgentA] = useState(current.a.agent_id)
  const [agentB, setAgentB] = useState(current.b.agent_id)
  const [trial, setTrial] = useState(current.a.trial)

  // Start from what is on screen each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setBenchId(current.a.benchmark_id)
    setProblem(`${current.a.task_id}|${current.a.fault_id}`)
    setAgentA(current.a.agent_id)
    setAgentB(current.b.agent_id)
    setTrial(current.a.trial)
  }, [open, current])

  const list = useAsync(() => (open ? api.listBenchmarks() : Promise.resolve([])), [open])
  const bench = useAsync<BenchmarkDetail | null>(() => (open ? api.getBenchmark(benchId) : Promise.resolve(null)), [open, benchId])
  const detail = bench.data && bench.data.id === benchId ? bench.data : null

  const cells = useMemo(() => (detail ? buildCells(detail) : null), [detail])
  const problems = useMemo(() => {
    if (!detail || !cells) return []
    return [
      ...faultProblems(detail, cells).map((p) => ({ ...p, group: 'Problem we caused' })),
      ...questionProblems(detail, cells).map((p) => ({ ...p, group: 'Everyday question' })),
    ]
  }, [detail, cells])

  // If what was picked isn't in this benchmark, fall back to its first choices.
  useEffect(() => {
    if (!detail || problems.length === 0) return
    if (!problems.some((p) => `${p.taskId}|${p.faultId}` === problem)) setProblem(`${problems[0].taskId}|${problems[0].faultId}`)
    const ids = detail.agents.map((a) => a.id)
    if (!ids.includes(agentA)) setAgentA(ids[0])
    if (!ids.includes(agentB) || agentB === agentA) setAgentB(ids.find((i) => i !== (ids.includes(agentA) ? agentA : ids[0])) ?? ids[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, problems])

  const [taskId, faultId = ''] = problem.split('|')
  const a = cells ? runFor(cells, agentA, taskId, faultId, trial) : null
  const b = cells ? runFor(cells, agentB, taskId, faultId, trial) : null
  const reason = !detail
    ? 'Still loading.'
    : agentA === agentB
      ? 'Pick two different agents.'
      : !a || !b
        ? "One of these agents has no result for this problem."
        : undefined

  const agentOptions = (detail?.agents ?? []).map((x) => ({ value: x.id, label: x.name }))
  return (
    <Modal open={open} onClose={onClose} label="Change what is compared" narrow>
      <div className="modal-body">
        <h2>Pick two agents to compare</h2>
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {bench.error && !detail && <ErrorState error={bench.error} onRetry={bench.reload} />}
        {!detail && !bench.error && <Loading />}
        {detail && (
          <div className="stack cp-pick" style={{ gap: 16 }}>
            {(list.data?.length ?? 0) > 1 && (
              <Select
                label="Run"
                value={benchId}
                onChange={setBenchId}
                options={(list.data ?? []).map((x) => ({
                  value: x.id,
                  label: `${shortDayTime(x.created_at)}, ${x.total_runs} runs`,
                }))}
              />
            )}
            <Select
              label="Problem or question"
              value={problem}
              onChange={setProblem}
              options={problems.map((p) => ({ value: `${p.taskId}|${p.faultId}`, label: `${p.group}: ${p.title}` }))}
            />
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Select label="First agent" value={agentA} onChange={setAgentA} options={agentOptions} />
              <Select label="Second agent" value={agentB} onChange={setAgentB} options={agentOptions} />
            </div>
            {detail.trials > 1 && (
              <Select
                label="Which try"
                value={trial}
                onChange={setTrial}
                options={Array.from({ length: detail.trials }, (_, i) => ({ value: i + 1, label: `Try ${i + 1}` }))}
              />
            )}
          </div>
        )}
        <div className="modal-foot">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            data-autofocus
            disabledReason={reason}
            onClick={() => {
              if (a && b) onPick({ a, b })
            }}
          >
            Compare these two
          </Button>
        </div>
      </div>
    </Modal>
  )
}

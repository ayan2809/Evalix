import type { AgentSummary, SummaryBlock } from '../api'
import { money, pct, secs } from '../format'
import { Tooltip } from './Tooltip'

const HELP = {
  passed: 'Passed runs ÷ counted runs. Runs with a setup problem are not counted.',
  reliable: 'Tasks where every try passed ÷ tasks. Shows whether an agent gets it right every time, not just once.',
  recovered: 'Runs that passed after a fault fired ÷ runs where a fault fired.',
  cost: 'Total cost of counted runs ÷ passed runs. Cost = tokens × the price list.',
  time: 'Mean seconds over counted runs.',
  steps: 'Average of actual model calls ÷ ideal model calls, over passed runs. 1.0× is ideal; higher means more wandering.',
}

function Count({ n, d, label }: { n: number; d: number; label: string }) {
  if (d === 0) return <span className="muted">–</span>
  return (
    <>
      <div>{label.replace('{n}', String(n)).replace('{d}', String(d))}</div>
      <div className="muted small">{pct(n, d)}</div>
    </>
  )
}

function Cells({ s, faults }: { s: SummaryBlock; faults: boolean }) {
  return (
    <>
      <td><Count n={s.passed} d={s.counted} label="Passed {n} of {d}" /></td>
      <td><Count n={s.reliable} d={s.groups} label={`Reliable on {n} of {d} ${s.groups === 1 ? 'test' : 'tests'}`} /></td>
      {faults && (
        <td>
          <Count n={s.recovered ?? 0} d={s.fired ?? 0} label="Recovered {n} of {d} times" />
        </td>
      )}
      <td>{money(s.cost_per_success)}</td>
      <td>{secs(s.avg_seconds)}</td>
      <td>{s.avg_step_ratio === null ? '–' : `${s.avg_step_ratio.toFixed(1)}×`}</td>
    </>
  )
}

function Heads({ faults }: { faults: boolean }) {
  return (
    <>
      <th>Passed <Tooltip text={HELP.passed} /></th>
      <th>Reliable <Tooltip text={HELP.reliable} /></th>
      {faults && <th>Recovered <Tooltip text={HELP.recovered} /></th>}
      <th>Cost per correct answer <Tooltip text={HELP.cost} /></th>
      <th>Average time <Tooltip text={HELP.time} /></th>
      <th>Steps vs ideal <Tooltip text={HELP.steps} /></th>
    </>
  )
}

interface Props {
  summary: AgentSummary[]
  agentName: (id: number) => string
}

export function SummaryTable({ summary, agentName }: Props) {
  return (
    <div className="scroll">
      <table className="table summary">
        <thead>
          <tr className="group-row">
            <th rowSpan={2}>Agent</th>
            <th colSpan={5} className="group">Normal tasks</th>
            <th colSpan={6} className="group split">With faults</th>
          </tr>
          <tr>
            <Heads faults={false} />
            <Heads faults />
          </tr>
        </thead>
        <tbody>
          {summary.map((s) => (
            <tr key={s.agent_id}>
              <td className="strong">
                {agentName(s.agent_id)}
                {s.setup_problems > 0 && (
                  <div className="muted small" title="Runs that failed because of a problem in the setup, not the agent. They are not counted.">
                    {s.setup_problems} setup problem{s.setup_problems === 1 ? '' : 's'} (not counted)
                  </div>
                )}
              </td>
              <Cells s={s.normal} faults={false} />
              <Cells s={s.faults} faults />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

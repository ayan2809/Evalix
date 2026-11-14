import { Link } from 'react-router-dom'
import type { BenchmarkDetail } from '../api'
import { MiniBadge } from './Badge'

export function Grid({ d }: { d: BenchmarkDetail }) {
  const cells = new Map<string, BenchmarkDetail['grid'][number]>()
  const used = new Set<string>()
  for (const c of d.grid) {
    cells.set(`${c.agent_id}|${c.column}`, c)
    used.add(c.column)
  }
  const taskCols = d.tasks.filter((t) => used.has(t.id))
  const faultCols = d.faults.filter((f) => used.has(f.id))
  const taskTitle = new Map(d.tasks.map((t) => [t.id, t.title]))

  return (
    <div className="scroll">
      <table className="table grid">
        <thead>
          <tr className="group-row">
            <th rowSpan={2}>Agent</th>
            {taskCols.length > 0 && <th colSpan={taskCols.length} className="group">Normal tasks</th>}
            {faultCols.length > 0 && <th colSpan={faultCols.length} className="group split">With faults</th>}
          </tr>
          <tr>
            {taskCols.map((t) => (
              <th key={t.id} title={t.area}>{t.title}</th>
            ))}
            {faultCols.map((f, i) => (
              <th key={f.id} className={i === 0 ? 'split' : ''} title={`On task: ${taskTitle.get(f.task_id) ?? f.task_id}`}>
                {f.label}
                <div className="muted small">{taskTitle.get(f.task_id) ?? f.task_id}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.agents.map((a) => (
            <tr key={a.id}>
              <td className="strong">{a.name}</td>
              {[...taskCols, ...faultCols].map((col, i) => {
                const cell = cells.get(`${a.id}|${col.id}`)
                return (
                  <td key={col.id} className={i === taskCols.length && faultCols.length > 0 ? 'split' : ''}>
                    <div className="trials">
                      {cell?.trials
                        .slice()
                        .sort((x, y) => x.trial - y.trial)
                        .map((t) => (
                          <Link key={t.run_id} to={`/runs/${t.run_id}`} className="plain">
                            <MiniBadge name={t.badge} title={`Try ${t.trial}: ${t.badge}. Open run details.`} />
                          </Link>
                        )) ?? <span className="muted">–</span>}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

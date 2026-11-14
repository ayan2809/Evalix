// Typed client for the Evalix web API (docs/contract.md §3.4 and §4).

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

// ---------- Types ----------

export type Ending = 'passed' | 'wrong' | 'crashed' | 'setup_problem' | null
export type BadgeName = 'Pass' | 'Fail' | 'Recovered' | 'Setup problem' | 'Running'
export type StepKind = 'model_call' | 'tool_call' | 'final_answer'
export type BenchmarkStatus = 'running' | 'done' | 'cancelled'

export interface Health {
  ok: boolean
  mock: boolean
  agent_model: string
}

export interface Agent {
  id: number
  name: string
  url: string
  source: 'registered' | 'studio'
  created_at: string
  online: boolean
}

export interface AnswerField {
  type: string
  about?: string
  options?: string[]
}

export interface Task {
  id: string
  area: string
  title: string
  task: string
  answer_format: Record<string, AnswerField>
  ideal_steps: number
}

export interface Fault {
  id: string
  label: string
  about: string
  task_id: string
  expect: string
}

export interface StartBenchmarkBody {
  agent_ids: number[]
  task_ids: string[]
  fault_ids: string[]
  trials: number
  live_mode: boolean
}

export interface BenchmarkListItem {
  id: number
  status: BenchmarkStatus
  trials: number
  live_mode: boolean
  created_at: string
  total_runs: number
  done_runs: number
}

export interface SummaryBlock {
  counted: number
  passed: number
  reliable: number
  groups: number
  avg_step_ratio: number | null
  cost_per_success: number | null
  avg_seconds: number | null
  total_cost: number
  // faults only
  fired?: number
  recovered?: number
}

export interface AgentSummary {
  agent_id: number
  normal: SummaryBlock
  faults: SummaryBlock
  setup_problems: number
}

export interface GridTrial {
  run_id: string
  trial: number
  ending: Ending
  badge: BadgeName
}

export interface GridCell {
  agent_id: number
  task_id: string
  fault_id: string
  column: string
  trials: GridTrial[]
}

export interface BenchmarkRunRow {
  id: string
  agent_id: number
  task_id: string
  fault_id: string
  trial: number
  ending: Ending
  fail_reason: string
  steps: number
  tool_calls: number
  cost_usd: number
  seconds: number
  fault_fired: boolean
  looped: boolean
}

export interface BenchmarkDetail extends BenchmarkListItem {
  agents: { id: number; name: string }[]
  tasks: { id: string; title: string; area: string }[]
  faults: { id: string; label: string; task_id: string; expect: string }[]
  summary: AgentSummary[]
  grid: GridCell[]
  runs: BenchmarkRunRow[]
}

export interface Step {
  id: number
  run_id: string
  position: number
  kind: StepKind
  name: string
  // In /api/runs/{id} these are strings cut to 500 chars; in /api/steps/{id} they are parsed JSON.
  input_json: unknown
  output_json: unknown
  status_code: number
  fault: string
  tokens_in: number
  tokens_out: number
  ms: number
  truncated?: boolean
}

export interface AnswerJson {
  status?: 'answered' | 'blocked'
  answer?: Record<string, unknown> | null
  sources?: string[]
  reason?: string
}

export interface Review {
  reasoning_score?: number
  groundedness?: 'grounded' | 'partly' | 'not_grounded'
  fault_handling?: 'handled' | 'partly' | 'poorly' | 'no_fault'
  critique?: string
  error?: string
}

export interface RunDetail {
  id: string
  benchmark_id: number
  agent_id: number
  task_id: string
  fault_id: string
  trial: number
  ending: Ending
  fail_reason: string
  tool_calls: number
  tokens_in: number
  tokens_out: number
  cost_usd: number
  seconds: number
  looped: boolean
  fault_fired: boolean
  answer_json: AnswerJson | null
  review_json: Review | null
  agent_name: string
  task_title: string
  fault_label: string
  // Contract note: the run row has a numeric `steps` count, but /api/runs/{id}
  // replaces it with the step list. We accept either.
  steps: Step[] | number
}

export interface ComparePair {
  position: number
  a: Step | null
  b: Step | null
  same: boolean
}

export interface CompareResult {
  a: RunDetail
  b: RunDetail
  pairs: ComparePair[]
  first_difference: number | null
}

// ---------- Fetch helpers ----------

export class ApiError extends Error {
  offline: boolean
  status: number
  constructor(message: string, offline: boolean, status = 0) {
    super(message)
    this.offline = offline
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_URL + path, init)
  } catch {
    throw new ApiError(`Can't reach the Evalix backend at ${API_URL}`, true)
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const body = await res.json()
      const e = body?.error ?? body?.detail
      if (typeof e === 'string') msg = e
      else if (e && typeof e.message === 'string') msg = e.message
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, false, res.status)
  }
  return (await res.json()) as T
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// ---------- Endpoints ----------

export const api = {
  health: () => request<Health>('/api/health'),
  listAgents: () => request<Agent[]>('/api/agents'),
  addAgent: (name: string, url: string) => post<Agent>('/api/agents', { name, url }),
  listTasks: () => request<Task[]>('/api/tasks'),
  listFaults: () => request<Fault[]>('/api/faults'),
  startBenchmark: (body: StartBenchmarkBody) => post<{ id: number }>('/api/benchmarks', body),
  listBenchmarks: () => request<BenchmarkListItem[]>('/api/benchmarks'),
  getBenchmark: (id: number | string) => request<BenchmarkDetail>(`/api/benchmarks/${id}`),
  cancelBenchmark: (id: number | string) => post<{ ok: boolean }>(`/api/benchmarks/${id}/cancel`),
  getRun: (id: string) => request<RunDetail>(`/api/runs/${encodeURIComponent(id)}`),
  getStep: (id: number) => request<Step>(`/api/steps/${id}`),
  compare: (a: string, b: string) =>
    request<CompareResult>(`/api/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  reviewRun: (id: string) => post<Review>(`/api/runs/${encodeURIComponent(id)}/review`),
  eventsUrl: (id: number | string) => `${API_URL}/api/benchmarks/${id}/events`,
}

// ---------- Extras: gateway test and Maxim export ----------

export interface GatewayTestResult {
  ok: boolean
  main_model: string
  main_model_hits: number
  answered_by: string
  reply_text: string
  seconds: number
  note: string
}

export interface MaximExportResult {
  ok: boolean
  traces_sent: number
  note: string
}

export const extras = {
  gatewayTest: () => post<GatewayTestResult>('/api/gateway-test'),
  exportToMaxim: (benchmarkId: number | string) =>
    post<MaximExportResult>(`/api/benchmarks/${benchmarkId}/export-maxim`),
}

// ---------- Agent Studio ----------

export interface StudioQuestion {
  id: string
  text: string
}

export interface StudioSetup {
  name: string
  instructions: string
  retries: number
  double_check: boolean
  stop_when_unsure: boolean
}

export interface StudioResult {
  agent: Agent
  setup: StudioSetup
}

export const studio = {
  questions: () => request<StudioQuestion[]>('/api/studio/questions'),
  createAgent: (description: string, answers: Record<string, boolean>) =>
    post<StudioResult>('/api/studio/agents', { description, answers }),
  getSetup: (agentId: number) => request<StudioSetup>(`/api/studio/agents/${agentId}`),
}

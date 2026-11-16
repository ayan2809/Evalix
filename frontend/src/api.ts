// Typed client for the Evalix web API. The contract is /spec/api.md; if the two disagree, the spec wins.

/** Empty means "same address as the page" (the Vite proxy forwards /api to port 8000). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

// ---------- Sign-in ----------

export type SessionKind = 'google' | 'local' | 'guest'
/** owner = the main workspace and Settings; member = their own workspace; guest = read-only example. */
export type Role = 'owner' | 'member' | 'guest'

export interface Allowance {
  daily_usd: number | null // null = no limit (the owner)
  spent_today_usd: number
  daily_searches: number | null
  searches_today: number
}

export interface Me {
  session: SessionKind | null // null = never chose; show the sign-in page
  role: Role
  user: { name: string; email: string; picture: string | null } | null
  google_client_id: string | null
  workspace: 'own' | 'example' // example = a guest looking at the main workspace
  allowance: Allowance
}

// ---------- Health ----------

export interface Health {
  ok: boolean
  mock: boolean
  agent_model: string
  judge_model: string
  bifrost_up: boolean | null
  search_mode: 'saved' | 'live'
}

/** The run engine. On your own computer it is always ready; hosted, it is switched on when needed. */
export interface EngineStatus {
  hosted: boolean
  state: string // running | stopped | pending | stopping
  ready: boolean
}

// ---------- Agents, tasks, faults ----------

export interface Agent {
  id: number
  name: string
  url: string
  source: 'registered' | 'studio'
  created_at: string
  online: boolean
  tag: string
  description: string
  /** hidden from pickers and lists; shown only with listAgents(true) */
  archived?: boolean
}

/** One question asked in the playground (GET /api/agents/{id}/tries), newest first. */
export interface TryItem {
  id: string
  prompt: string
  fault_id: string
  ending: Ending
  fail_reason: string
  seconds: number
  cost_usd: number
  answer_json: AnswerJson | null
  started_at: string
}

/** Why an agent does or doesn't answer, from POST /api/agents/{id}/check. */
export interface AgentCheck {
  online: boolean
  problem: 'address' | 'dns' | 'refused' | 'timeout' | 'error' | 'health' | null
  detail: string
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
  short: string
  about: string
  task_id: string
  expect: 'answer' | 'blocked'
}

// ---------- Benchmarks ----------

export type Ending = 'passed' | 'wrong' | 'crashed' | 'setup_problem' | null
export type BadgeName = 'Pass' | 'Fail' | 'Recovered' | 'Setup problem' | 'Running'
export type StepKind = 'model_call' | 'tool_call' | 'final_answer'
export type BenchmarkStatus = 'running' | 'done' | 'cancelled'

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
  total_cost: number
  agent_count: number
  archived: boolean
  /** the one shown first in this workspace (and to guests, in the main one) */
  featured: boolean
  /** secret for a read-only link; null when not shared, or when you can't change this workspace */
  share_token: string | null
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
  // faults block only
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
  agents: { id: number; name: string; tag: string; description: string }[]
  tasks: { id: string; title: string; area: string }[]
  faults: { id: string; label: string; short: string; task_id: string; expect: string }[]
  summary: AgentSummary[]
  grid: GridCell[]
  runs: BenchmarkRunRow[]
}

// ---------- Runs and steps ----------

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
  at_ms: number | null
  truncated?: boolean
}

export interface Check {
  label: string
  ok: boolean
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
  model: string
  answer_json: AnswerJson | null
  review_json: Review | null
  checks: Check[] | null
  agent_name: string
  task_title: string
  task_text: string
  fault_label: string
  fault_short: string
  steps: Step[]
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

// ---------- Agent Studio ----------

/** Written by the model for each description, so they differ every time. */
export interface StudioQuestion {
  id: string
  text: string
  choices: string[] // 2 to 4 short answers; the UI adds its own "Something else" box
}

export interface StudioAnswer {
  id: string
  question: string
  answer: string
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

// ---------- Gateway tests ----------

export type GatewayTestName = 'fallback' | 'retry' | 'budget' | 'rate' | 'access'

/** The stops one model call passes inside Bifrost, in order. */
export type GatewayStopId = 'key' | 'limits' | 'route' | 'cache' | 'retry' | 'fallback' | 'log'

export interface GatewayTrace {
  ok: boolean
  simulated: boolean
  model: string
  answer: string
  stops: { id: GatewayStopId; result: string }[]
  latency_ms: number
  overhead_ms: number | null
  cost_usd: number | null
}

export interface GatewayLogEntry {
  at: string
  model: string
  ok: boolean
  latency_ms: number | null
  overhead_ms: number | null
  cost_usd: number | null
  retries: number
  used_backup: boolean
  key: string | null
  virtual_key: string | null
}

export interface GatewayCall {
  n: number
  at_s: number
  status: number
  answered_by: string
  note: string
  cost_usd: number | null
  total_usd: number | null
}

export interface GatewayTry {
  n: number
  at_s: number
  waited_s: number
  status: number
}

export interface GatewayTestResult {
  name: GatewayTestName
  ok: boolean
  headline: string
  seconds: number
  simulated: boolean
  finished_at: string
  calls: GatewayCall[]
  tries: GatewayTry[]
  numbers: {
    main_hits?: number
    backup_hits?: number
    errors_seen?: number
    added_s_per_call?: number
    answered_on_try?: number | null
    limit_kind?: 'usd' | 'calls'
    limit_value?: number
    spent_usd?: number
    blocked_at?: number | null
    allowed_model?: string
    blocked_model?: string
  }
}

export interface GatewayStatus {
  bifrost_up: boolean | null
  main_model_down: boolean
  running: GatewayTestName | null
  rules: {
    fallback_model: string
    max_retries: number
    backoff_initial_ms: number
    backoff_max_ms: number
    limit_kind: 'usd' | 'calls'
    limit_value: number
  }
  last: Partial<Record<GatewayTestName, GatewayTestResult>>
}

// ---------- Settings ----------

export type KeyProvider = 'google' | 'tavily' | 'maxim' | 'openai' | 'anthropic'

export interface ModelOption {
  id: string
  label: string
  provider: KeyProvider
  about: string
  ready: boolean
}

export interface KeyStatus {
  provider: KeyProvider
  label: string
  set: boolean
  masked: string | null
  used_for: string
}

export interface Settings {
  agent_model: string
  judge_model: string
  models: ModelOption[]
  keys: KeyStatus[]
  gateway: { bifrost_url: string; bifrost_up: boolean | null; fallback_model: string; max_retries: number }
  search: { default_mode: 'saved' | 'live'; tavily_ready: boolean }
  send_to: { maxim_ready: boolean; maxim_auto: boolean }
  pending_restart: boolean
}

export interface SettingsUpdate {
  agent_model?: string
  judge_model?: string
  search_default?: 'saved' | 'live'
  maxim_auto?: boolean
}

export interface MaximExportResult {
  ok: boolean
  traces_sent: number
  note: string
}

// ---------- Fetch helpers ----------

export class ApiError extends Error {
  /** true when the backend could not be reached at all */
  offline: boolean
  /** HTTP status; 0 when offline. 403 means a guest tried to change something. */
  status: number
  constructor(message: string, offline: boolean, status = 0) {
    super(message)
    this.offline = offline
    this.status = status
  }
  get forbidden(): boolean {
    return this.status === 403
  }
}

/** Fired on window when the backend says 403, so the shell can show the backend's words. */
export const FORBIDDEN_EVENT = 'evalix:forbidden'

// ---------- Share links ----------

let shareToken: string | null = null

/** While a /share/<token> page is open, every read carries the token (sign-in calls never do). */
export function setShareToken(token: string | null): void {
  shareToken = token
}
export function currentShareToken(): string | null {
  return shareToken
}
/** An in-app path that stays inside the shared view when one is open. */
export function appPath(path: string): string {
  return shareToken ? `/share/${encodeURIComponent(shareToken)}${path === '/' ? '' : path}` : path
}
/** The full link someone else can open: a share link when there is a token, else this page's address. */
export function shareUrl(token: string | null, path: string): string {
  const origin = window.location.origin
  return token ? `${origin}/share/${encodeURIComponent(token)}${path === '/' ? '' : path}` : `${origin}${path}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  const shared = shareToken && !path.startsWith('/api/auth/')
  const headers = shared ? { ...(init?.headers as Record<string, string> | undefined), 'X-Evalix-Share': shareToken! } : init?.headers
  try {
    res = await fetch(API_URL + path, { credentials: 'include', ...init, headers })
  } catch {
    throw new ApiError("Can't reach Evalix. Check that the backend is running.", true)
  }
  if (!res.ok) {
    let msg = `Something went wrong (${res.status}).`
    try {
      const body = await res.json()
      const d = body?.detail
      if (typeof d === 'string') msg = d
      else if (Array.isArray(d) && d.length > 0 && typeof d[0]?.msg === 'string') msg = d[0].msg
    } catch {
      /* keep the generic message */
    }
    if (res.status === 403 && !shared) window.dispatchEvent(new CustomEvent(FORBIDDEN_EVENT, { detail: msg }))
    throw new ApiError(msg, false, res.status)
  }
  return (await res.json()) as T
}

function send<T>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const post = <T>(path: string, body?: unknown) => send<T>('POST', path, body)
const put = <T>(path: string, body?: unknown) => send<T>('PUT', path, body)

const enc = encodeURIComponent

// ---------- Endpoints ----------

export const api = {
  // sign-in
  me: () => request<Me>('/api/auth/me'),
  signInGoogle: (credential: string) => post<Me>('/api/auth/google', { credential }),
  signInLocal: () => post<Me>('/api/auth/local'),
  signInGuest: () => post<Me>('/api/auth/guest'),
  signOut: () => post<{ ok: boolean }>('/api/auth/sign-out'),

  // health, agents, tasks, faults
  health: () => request<Health>('/api/health'),
  engine: () => request<EngineStatus>('/api/engine'),
  wakeEngine: () => post<EngineStatus>('/api/engine/wake'),
  /** Your agents. With archived = true, the archived ones too (marked). */
  listAgents: (archived = false) => request<Agent[]>(`/api/agents${archived ? '?archived=true' : ''}`),
  archiveAgent: (id: number, archived: boolean) => post<Agent>(`/api/agents/${id}/archive`, { archived }),
  checkAgent: (id: number) => post<AgentCheck>(`/api/agents/${id}/check`),
  /** The playground: ask one agent one question. Watch it with getRun(run_id). */
  tryAgent: (id: number, question: string, faultId: string | null) =>
    post<{ run_id: string }>(`/api/agents/${id}/try`, { question, fault_id: faultId }),
  agentTries: (id: number) => request<TryItem[]>(`/api/agents/${id}/tries`),
  addAgent: (body: { name: string; url: string; tag?: string; description?: string }) =>
    post<Agent>('/api/agents', body),
  /** Adds the four sample agents to your workspace. Returns all your agents. */
  addSampleAgents: () => post<Agent[]>('/api/agents/samples'),
  listTasks: () => request<Task[]>('/api/tasks'),
  listFaults: () => request<Fault[]>('/api/faults'),

  // benchmarks and runs
  startBenchmark: (body: StartBenchmarkBody) => post<{ id: number }>('/api/benchmarks', body),
  listBenchmarks: (archived = false) =>
    request<BenchmarkListItem[]>(`/api/benchmarks${archived ? '?archived=true' : ''}`),
  archiveBenchmark: (id: number, archived: boolean) => post<{ ok: boolean }>(`/api/benchmarks/${id}/archive`, { archived }),
  featureBenchmark: (id: number, featured: boolean) => post<{ ok: boolean }>(`/api/benchmarks/${id}/feature`, { featured }),
  shareBenchmark: (id: number, shared: boolean) =>
    post<{ share_token: string | null }>(`/api/benchmarks/${id}/share`, { shared }),
  getBenchmark: (id: number | string) => request<BenchmarkDetail>(`/api/benchmarks/${id}`),
  cancelBenchmark: (id: number | string) => post<{ ok: boolean }>(`/api/benchmarks/${id}/cancel`),
  exportMaxim: (id: number | string) => post<MaximExportResult>(`/api/benchmarks/${id}/export-maxim`),
  /** Server-sent events: new EventSource(api.eventsUrl(id)). Same address as the page, so cookies go along. */
  eventsUrl: (id: number | string) => `${API_URL}/api/benchmarks/${id}/events`,
  getRun: (id: string) => request<RunDetail>(`/api/runs/${enc(id)}`),
  getStep: (id: number) => request<Step>(`/api/steps/${id}`),
  compare: (a: string, b: string) => request<CompareResult>(`/api/compare?a=${enc(a)}&b=${enc(b)}`),
  reviewRun: (id: string) => post<Review>(`/api/runs/${enc(id)}/review`),

  // Agent Studio
  studio: {
    questions: (description: string) =>
      post<{ questions: StudioQuestion[] }>('/api/studio/questions', { description }),
    createAgent: (description: string, answers: StudioAnswer[]) =>
      post<StudioResult>('/api/studio/agents', { description, answers }),
    getSetup: (agentId: number) => request<StudioSetup>(`/api/studio/agents/${agentId}`),
    /** Rename the agent, or change its retries, double-checks or stopping when unsure. */
    updateSetup: (agentId: number, change: Partial<Pick<StudioSetup, 'name' | 'retries' | 'double_check' | 'stop_when_unsure'>>) =>
      put<StudioSetup>(`/api/studio/agents/${agentId}`, change),
  },

  // Gateway tests
  gateway: {
    status: () => request<GatewayStatus>('/api/gateway/status'),
    setMainModelDown: (down: boolean) => put<GatewayStatus>('/api/gateway/main-model', { down }),
    /** Waits until the test ends (up to about a minute). 409 if one is already running. */
    runTest: (name: GatewayTestName) => post<GatewayTestResult>(`/api/gateway/tests/${name}`),
    runAll: () => post<{ results: GatewayTestResult[] }>('/api/gateway/tests/all'),
    /** One small real call, followed through Bifrost's stops. */
    trace: () => post<GatewayTrace>('/api/gateway/trace'),
    logs: (limit = 8) => request<GatewayLogEntry[]>(`/api/gateway/logs?limit=${limit}`),
  },

  // Settings
  settings: {
    get: () => request<Settings>('/api/settings'),
    update: (body: SettingsUpdate) => put<Settings>('/api/settings', body),
    setKey: (provider: KeyProvider, value: string) => put<KeyStatus>(`/api/settings/keys/${provider}`, { value }),
    testKey: (provider: KeyProvider) => post<{ ok: boolean; note: string }>(`/api/settings/keys/${provider}/test`),
  },
}

/** Anything thrown while calling the API, as an ApiError. */
export function asApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e), false)
}

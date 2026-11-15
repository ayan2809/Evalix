# Evalix web API spec

This is the deal between the backend (`backend/`, FastAPI) and the web app (`frontend/`, React).
If the two disagree, this file wins. Change this file first, then the code.

Marks used below: **[same]** already works this way, **[changed]** works but gets new fields or rules,
**[new]** not built before this spec, **[v2]** added on 2026-11-15 (workspaces, follow-up questions, the gateway walk-through).

---

## 1. Basics

* **Where.** The backend listens on `http://localhost:8000`. The web app calls plain paths like
  `/api/agents`. In development, Vite passes every `/api/*` call to port 8000 (a proxy), so the
  browser sees one address and cookies just work. `VITE_API_URL` can still point somewhere else.
* **Format.** JSON in, JSON out. Times are ISO 8601 strings in UTC. Money is US dollars as a number.
  Durations are seconds (`seconds`, `*_s`) or milliseconds (`ms`, `*_ms`), as the name says.
* **Errors.** Any status of 400 or more has the body `{"detail": "<plain sentence a person can read>"}`.
  The web app shows `detail` as is.

  | Status | Meaning |
  | :--- | :--- |
  | 400 | The request is wrong (missing field, bad value) |
  | 401 | Sign-in failed (bad Google token) |
  | 402 | Over a daily limit (a member's spending or live-search allowance for today) |
  | 403 | Not allowed (a guest tried to change something) |
  | 404 | No such thing |
  | 409 | Can't do it right now (for example, a gateway test is already running) |
  | 502 | Something Evalix depends on (Bifrost, Google, Tavily, Maxim) failed |

* **Agent doors are not part of this API.** `/runs/{run_id}/tools*`, `/runs/{run_id}/model/*`,
  `/studio-agents/*` and `/fake-model/*` are for agents and Bifrost only. They never need sign-in.

## 2. Sign-in, workspaces and who may do what

There are three kinds of session, kept in a signed, HttpOnly cookie called `evalix_session`
(7 days, `SameSite=Lax`, signed with `EVALIX_SECRET`; if that is unset, a random secret is made at start-up).

| Session | How you get it | Role | Workspace |
| :--- | :--- | :--- | :--- |
| `google` | "Continue with Google", email on `EVALIX_OWNER_EMAILS` (or that list is empty) | `owner` | the main one |
| `google` | "Continue with Google", any other verified email (refused if `EVALIX_ALLOWED_EMAILS` is set and it isn't on it) | `member` | their own, starts empty |
| `local` | "Continue on this computer". Only offered when Google sign-in is not set up | `owner` | the main one |
| `guest` | "Look around first, no sign-in" | `guest` | the main one, read only, shown as an example |

**No cookie at all:** `owner` if `GOOGLE_CLIENT_ID` is unset (so scripts, tests and `curl` keep working on
your own machine), and `guest` if it is set.

**Workspaces [v2].** Every agent, benchmark (with its runs and steps) and studio agent belongs to one workspace.
Every read is limited to the caller's workspace; something in another workspace is a `404`, as if it did not
exist. A member's workspace id is a hash of their Google account id (`sub`), never the email. Everything made
before workspaces existed belongs to the main workspace.

**Who may do what.**

| Mark | Who | Used for |
| :--- | :--- | :--- |
| ✍️ | `owner` or `member` | changing things in your own workspace: agents, runs, Agent Studio, gateway tests |
| 🔑 | `owner` only | keys, models and other Settings changes, sending to Maxim |

A guest gets `403 {"detail": "Sign in to do this. You're looking around as a guest."}`. A member on a 🔑 route
gets `403 {"detail": "Only the owner of this Evalix can change this."}`. The owner list is read on every
request, so editing it takes effect without signing in again.

**Daily limits for members [v2].** Members run on the owner's API keys, so each has a daily allowance
(UTC days):

* **Spending:** `EVALIX_MEMBER_DAILY_USD` (default `0.25`) of model calls. Checked twice: before a benchmark
  starts (`402 {"detail": "You've used today's $0.25 for runs. It resets at midnight UTC."}`), and by Bifrost
  itself, because every model call a member's agents make goes through a Bifrost virtual key made for that
  workspace with a budget of the same amount that resets every day. A call Bifrost refuses ends that run as a
  setup problem, "daily spending limit reached".
* **Live web search:** `EVALIX_MEMBER_DAILY_SEARCHES` (default `60`) live searches. A benchmark with
  `live_mode: true` is refused with `402` once they are used up; saved search results always work.

The owner has no daily limit.

**How a Google sign-in is checked.** Google's button gives the browser an ID token, which it sends to
`POST /api/auth/google`. The backend checks it itself with `google-auth`: Google's signature, audience =
`GOOGLE_CLIENT_ID`, not expired, issuer `accounts.google.com`, and a verified email. Only Google's public keys are
fetched. Bad token: `401`. Google unreachable: `502`. More than 10 sign-in attempts a minute from one address:
`429`. The cookie is marked `Secure` when the request came over https.

**Settings for sign-in** (in `.env`):

| Name | Meaning |
| :--- | :--- |
| `GOOGLE_CLIENT_ID` | Turns on Google sign-in. Unset means "Continue on this computer" is offered instead |
| `EVALIX_OWNER_EMAILS` | Comma list. Google accounts that use the main workspace and may change Settings. Empty means every Google account that may sign in |
| `EVALIX_MEMBER_DAILY_USD` | A member's daily spending allowance, in dollars. Default `0.25` |
| `EVALIX_MEMBER_DAILY_SEARCHES` | A member's daily live web searches. Default `60` |
| `EVALIX_ALLOWED_EMAILS` | Comma list. If set, only these Google accounts may sign in |
| `EVALIX_SECRET` | Signs the cookie |

## 3. Types

Written as TypeScript. The frontend copies these into `frontend/src/api.ts`. The backend returns exactly these
field names.

```ts
// ---------- sign-in ----------
type SessionKind = 'google' | 'local' | 'guest'
type Role = 'owner' | 'member' | 'guest'

interface Me {
  session: SessionKind | null      // null = never chose; the web app shows the sign-in page
  role: Role                       // what the backend will allow right now
  user: { name: string; email: string; picture: string | null } | null   // only for google
  google_client_id: string | null  // null = Google sign-in is not set up on this server
  workspace: 'own' | 'example'     // [v2] example = a guest looking at the main workspace, read only
  allowance: {                     // [v2] what's left today. null limits = no limit (the owner)
    daily_usd: number | null; spent_today_usd: number
    daily_searches: number | null; searches_today: number
  }
}

// ---------- health ----------
interface Health {
  ok: boolean
  mock: boolean                    // test mode: fake model, no keys needed
  agent_model: string              // the model the next run will use, e.g. "gemini-3.5-flash-lite"
  judge_model: string
  bifrost_up: boolean | null       // null in test mode (Bifrost not used)
  search_mode: 'saved' | 'live'    // what "Start a run" picks by default
}

// ---------- agents, tasks, faults ----------
interface Agent {
  id: number
  name: string
  url: string
  source: 'registered' | 'studio'
  created_at: string
  online: boolean
  tag: string                      // [new] a few words, e.g. "Retries, checks sources"
  description: string              // [new] one full sentence, shown on hover
}

interface AnswerField { type: string; about?: string; options?: string[] }

interface Task {                   // [same]
  id: string
  area: string                     // "cloud" | "ai" | "banking"
  title: string
  task: string
  answer_format: Record<string, AnswerField>
  ideal_steps: number
}

interface Fault {
  id: string
  label: string                    // "Lying search result"
  short: string                    // [new] "An old blog with wrong numbers comes first"
  about: string
  task_id: string
  expect: 'answer' | 'blocked'
}

// ---------- benchmarks ----------
type Ending = 'passed' | 'wrong' | 'crashed' | 'setup_problem' | null   // null = still running
type BadgeName = 'Pass' | 'Fail' | 'Recovered' | 'Setup problem' | 'Running'
type BenchmarkStatus = 'running' | 'done' | 'cancelled'

interface StartBenchmarkBody {
  agent_ids: number[]
  task_ids: string[]               // everyday questions to ask
  fault_ids: string[]              // problems to cause
  trials: number                   // 1..10, default 3
  live_mode: boolean               // true = live web search (Tavily); false = saved results
}

interface BenchmarkListItem {      // newest first
  id: number
  status: BenchmarkStatus
  trials: number
  live_mode: boolean
  created_at: string
  total_runs: number
  done_runs: number
  total_cost: number               // [new] dollars spent on model calls so far
  agent_count: number              // [new]
}

interface SummaryBlock {
  counted: number; passed: number; reliable: number; groups: number
  avg_step_ratio: number | null; cost_per_success: number | null
  avg_seconds: number | null; total_cost: number
  fired?: number; recovered?: number            // faults block only
}

interface AgentSummary { agent_id: number; normal: SummaryBlock; faults: SummaryBlock; setup_problems: number }

interface GridTrial { run_id: string; trial: number; ending: Ending; badge: BadgeName }
interface GridCell { agent_id: number; task_id: string; fault_id: string; column: string; trials: GridTrial[] }

interface BenchmarkRunRow {
  id: string; agent_id: number; task_id: string; fault_id: string; trial: number
  ending: Ending
  fail_reason: string              // plain words, e.g. "wrong answer: annual_fee". "" when passed
  steps: number; tool_calls: number; cost_usd: number; seconds: number
  fault_fired: boolean; looped: boolean
}

interface BenchmarkDetail extends BenchmarkListItem {
  agents: { id: number; name: string; tag: string; description: string }[]   // [changed] tag, description
  tasks: { id: string; title: string; area: string }[]
  faults: { id: string; label: string; short: string; task_id: string; expect: string }[]   // [changed] short
  summary: AgentSummary[]
  grid: GridCell[]
  runs: BenchmarkRunRow[]
}

// ---------- runs and steps ----------
type StepKind = 'model_call' | 'tool_call' | 'final_answer'

interface Step {
  id: number; run_id: string; position: number
  kind: StepKind; name: string
  input_json: unknown              // in /api/runs/{id}: a JSON string cut to 500 characters
  output_json: unknown             // in /api/steps/{id}: the full parsed JSON
  status_code: number
  fault: string                    // "" or the fault that hit this step, e.g. "error_429"
  tokens_in: number; tokens_out: number
  ms: number                       // how long the step took
  at_ms: number | null             // [new] when the step started, in ms after the run started. null for old runs
  truncated?: boolean
}

interface Check { label: string; ok: boolean }   // [new] e.g. {label: "Annual fee is $395", ok: true}

interface AnswerJson {
  status?: 'answered' | 'blocked'
  answer?: Record<string, unknown> | null
  sources?: string[]
  reason?: string
}

interface Review {
  reasoning_score?: number         // 1..5
  groundedness?: 'grounded' | 'partly' | 'not_grounded'
  fault_handling?: 'handled' | 'partly' | 'poorly' | 'no_fault'
  critique?: string
  error?: string
}

interface RunDetail {
  id: string; benchmark_id: number; agent_id: number; task_id: string; fault_id: string; trial: number
  ending: Ending; fail_reason: string
  tool_calls: number; tokens_in: number; tokens_out: number
  cost_usd: number; seconds: number; looped: boolean; fault_fired: boolean
  model: string
  answer_json: AnswerJson | null
  review_json: Review | null
  checks: Check[] | null           // [new] the grader's checks, in order. null for old runs
  agent_name: string; task_title: string
  task_text: string                // [new] the question the agent was asked
  fault_label: string
  fault_short: string              // [new]
  steps: Step[]
}

interface ComparePair { position: number; a: Step | null; b: Step | null; same: boolean }
interface CompareResult { a: RunDetail; b: RunDetail; pairs: ComparePair[]; first_difference: number | null }

// ---------- Agent Studio ----------
// [v2] The questions are written by the model for each description, so they differ every time.
interface StudioQuestion {
  id: string                       // "q1", "q2"...
  text: string                     // "Which sources should it trust most?"
  choices: string[]                // 2 to 4 short answers. The UI adds its own "Something else" box
}
interface StudioAnswer { id: string; question: string; answer: string }   // answer = a choice or the person's own words
interface StudioSetup { name: string; instructions: string; retries: number; double_check: boolean; stop_when_unsure: boolean }
interface StudioResult { agent: Agent; setup: StudioSetup }

// ---------- gateway ----------
type GatewayTestName = 'fallback' | 'retry' | 'budget' | 'rate' | 'access'   // [v2] adds rate, access

// [v2] The stops one model call passes inside Bifrost, in order. The UI owns the words for each stop.
type GatewayStopId = 'key' | 'limits' | 'route' | 'cache' | 'retry' | 'fallback' | 'log'

interface GatewayTrace {           // [v2] one real call, followed through Bifrost
  ok: boolean
  simulated: boolean               // true in test mode
  model: string                    // "gemini/gemini-3.5-flash-lite"
  answer: string                   // the model's reply, cut to 200 characters
  stops: { id: GatewayStopId; result: string }[]   // what happened at each stop, one plain line each
  latency_ms: number               // the whole call, as the caller saw it
  overhead_ms: number | null       // the time Bifrost itself added, from Bifrost's log
  cost_usd: number | null          // from Bifrost's log
}

interface GatewayLogEntry {        // [v2] one call from Bifrost's own log. No prompts or replies
  at: string
  model: string                    // "gemini/gemini-3.5-flash-lite"
  ok: boolean
  latency_ms: number | null
  overhead_ms: number | null
  cost_usd: number | null
  retries: number
  used_backup: boolean
  key: string | null               // provider key slot, e.g. "gemini-key-1"
  virtual_key: string | null       // e.g. "evalix-you-3f2a"
}

interface GatewayStatus {
  bifrost_up: boolean | null       // null in test mode
  main_model_down: boolean         // the switch for test 1
  running: GatewayTestName | null  // a test in progress, if any
  rules: {
    fallback_model: string         // "gemini/gemini-3.5-flash-lite"
    max_retries: number            // 3
    backoff_initial_ms: number     // 1000
    backoff_max_ms: number         // 4000
    limit_kind: 'usd' | 'calls'    // see test 3
    limit_value: number            // 0.01 (dollars) or 10 (calls)
  }
  last: Partial<Record<GatewayTestName, GatewayTestResult>>   // most recent result of each test
}

interface GatewayCall {            // one call the test sent through Bifrost
  n: number                        // 1, 2, 3...
  at_s: number                     // seconds after the test started
  status: number                   // what the caller (Evalix) finally got from Bifrost
  answered_by: string              // "gemini/gemini-3.5-flash-lite", "fake-main/any" or "" if blocked
  note: string                     // plain words: "Switched to backup", "Let it through", "Blocked: over its limit"
  cost_usd: number | null          // test 3 only
  total_usd: number | null         // test 3 only: spent so far, including this call
}

interface GatewayTry {             // test 2 only: one try Bifrost made at the busy model
  n: number                        // 1, 2, 3
  at_s: number                     // when it reached the model, seconds after the test started
  waited_s: number                 // gap since the last try ended (0 for try 1)
  status: number                   // 429 or 503 = too busy, 200 = answered
}

interface GatewayTestResult {
  name: GatewayTestName
  ok: boolean                      // Bifrost did the right thing
  headline: string                 // one line: "Agents saw 0 errors. Each call took about 0.4 s longer."
  seconds: number                  // whole test
  simulated: boolean               // true in test mode: no request went to Bifrost
  finished_at: string
  calls: GatewayCall[]
  tries: GatewayTry[]              // empty except for test 2
  numbers: {
    // test 1
    main_hits?: number; backup_hits?: number; errors_seen?: number; added_s_per_call?: number
    // test 2
    answered_on_try?: number | null
    // budget and rate
    limit_kind?: 'usd' | 'calls'; limit_value?: number; spent_usd?: number; blocked_at?: number | null
    // access
    allowed_model?: string; blocked_model?: string
  }
}

// ---------- settings ----------
type KeyProvider = 'google' | 'tavily' | 'maxim' | 'openai' | 'anthropic'

interface ModelOption {
  id: string                       // "gemini-3.5-flash-lite"
  label: string                    // "Gemini 3.5 Flash Lite"
  provider: KeyProvider            // whose key it needs
  about: string                    // "Fastest and cheapest". No prices
  ready: boolean                   // false = its provider has no key; the UI greys it out
}

interface KeyStatus {
  provider: KeyProvider
  label: string                    // "Google AI Studio"
  set: boolean
  masked: string | null            // "AIza••••••••4f2c". Never the full key
  used_for: string                 // "The AI model" | "Web search" | "Sending results"
}

interface Settings {
  agent_model: string
  judge_model: string
  models: ModelOption[]
  keys: KeyStatus[]
  gateway: { bifrost_url: string; bifrost_up: boolean | null; fallback_model: string; max_retries: number }
  search: { default_mode: 'saved' | 'live'; tavily_ready: boolean }
  send_to: { maxim_ready: boolean; maxim_auto: boolean }   // auto = send every finished benchmark to Maxim
  pending_restart: boolean         // true after a key change that Bifrost only picks up on restart
}

interface SettingsUpdate {         // every field optional
  agent_model?: string; judge_model?: string
  search_default?: 'saved' | 'live'
  maxim_auto?: boolean
}
```

## 4. Routes

✍️ = `owner` or `member`, acting on their own workspace. 🔑 = `owner` only (see section 2).
Every read below is limited to the caller's workspace.

### Sign-in [new]

| Method and path | Body | Returns | Notes |
| :--- | :--- | :--- | :--- |
| `GET /api/auth/me` | | `Me` | Never fails |
| `POST /api/auth/google` | `{credential: string}` | `Me` + sets cookie | `credential` is Google's ID token. The backend checks it with `google-auth` (signature, `aud` = `GOOGLE_CLIENT_ID`, expiry, issuer, `email_verified`). Bad token: 401. Google unreachable: 502. Not on `EVALIX_ALLOWED_EMAILS`: 403. Too many tries: 429. Google not set up: 400. Not on `EVALIX_OWNER_EMAILS` (when set): signs in with role `guest` |
| `POST /api/auth/local` | | `Me` + sets cookie | 403 when `GOOGLE_CLIENT_ID` is set |
| `POST /api/auth/guest` | | `Me` + sets cookie | |
| `POST /api/auth/sign-out` | | `{ok: true}` | Clears the cookie |

### Health, agents, tasks, faults

| Method and path | Body | Returns | Mark |
| :--- | :--- | :--- | :--- |
| `GET /api/health` | | `Health` | [changed] adds `judge_model`, `bifrost_up`, `search_mode` |
| `GET /api/agents` | | `Agent[]` | [changed] adds `tag`, `description`. The four built-in agents get the tags and sentences from the design (below) |
| ✍️ `POST /api/agents` | `{name, url, tag?, description?}` | `Agent` | [changed] |
| ✍️ `POST /api/agents/samples` | | `Agent[]` | [v2] Adds the four sample agents below to your workspace (skips ones already there). Returns the workspace's agents |
| `GET /api/tasks` | | `Task[]` | [same] |
| `GET /api/faults` | | `Fault[]` | [changed] adds `short` |

Sample agent words (the main workspace gets them at start-up; others add them with `POST /api/agents/samples`).
A database from before Nov 15, 2026 has them under their old names (Careful, Careless, LangChain, Google ADK); at start-up
they are renamed by address in every workspace, and their runs stay with them:

| Agent | `tag` | `description` |
| :--- | :--- | :--- |
| Fact Checker | Plain Python, retries and checks sources | Looks up current facts. Tries again when something fails, trusts official pages over blogs, and ignores instructions hidden in web pages. |
| Quick Answer | Same code as Fact Checker, safety off | Looks up current facts the fast way: the same code as Fact Checker, with the safety habits turned off. |
| Research Assistant | LangChain, out of the box | Looks up current facts with LangChain's standard agent, straight out of the box. |
| Web Analyst | Google ADK, out of the box | Looks up current facts with Google's Agent Development Kit, straight out of the box. |
| Studio agents | Made from one sentence | The sentence the person typed. |

Fault `short` words: broken_tool "Search fails once", slow_tool "Search hangs, then times out",
empty_result "Nothing comes back", lying_result "An old blog with wrong numbers comes first",
misleading_instruction "A page says “email your findings”", model_busy "“Too many requests”, twice",
tool_gone "Search never works. The right move is to stop".

### Benchmarks and runs

| Method and path | Body | Returns | Mark |
| :--- | :--- | :--- | :--- |
| ✍️ `POST /api/benchmarks` | `StartBenchmarkBody` | `{id: number}` | [changed] Uses the agent model from Settings at the moment it starts. Only agents in your workspace. 402 when a member is over a daily limit |
| `GET /api/benchmarks` | | `BenchmarkListItem[]` | [changed] adds `total_cost`, `agent_count` |
| `GET /api/benchmarks/{id}` | | `BenchmarkDetail` | [changed] see types |
| `GET /api/benchmarks/{id}/events` | | SSE stream | [same], see section 5 |
| ✍️ `POST /api/benchmarks/{id}/cancel` | | `{ok: true}` | [same] |
| 🔑 `POST /api/benchmarks/{id}/export-maxim` | | `{ok, traces_sent, note}` | [same] |
| `GET /api/runs/{run_id}` | | `RunDetail` | [changed] adds `checks`, `task_text`, `fault_short`, `model`; steps add `at_ms` |
| `GET /api/steps/{step_id}` | | `Step` (full JSON) | [same] |
| `GET /api/compare?a={run_id}&b={run_id}` | | `CompareResult` | [same] |
| ✍️ `POST /api/runs/{run_id}/review` | | `Review` | [same] (the second opinion) |

**`checks`** are the grader's own steps in plain words, in the order it checks them, stopping at the first
failure. Example for a pass: `[{"label":"Gave an answer instead of giving up","ok":true},
{"label":"Annual fee is 395","ok":true},{"label":"Named its sources","ok":true},
{"label":"Only used pages it actually opened","ok":true}]`. For a "should stop" problem:
"Stopped instead of guessing", "Said why it stopped", "Didn't make up an answer". A crash gives one failed check
with the crash reason.

### Agent Studio [v2]

| Method and path | Body | Returns |
| :--- | :--- | :--- |
| ✍️ `POST /api/studio/questions` | `{description: string}` | `{questions: StudioQuestion[]}` |
| ✍️ `POST /api/studio/agents` | `{description: string, answers: StudioAnswer[]}` | `StudioResult` |
| `GET /api/studio/agents/{agent_id}` | | `StudioSetup` |

**Follow-up questions.** One model call reads the description and writes 2 to 4 questions that matter for
*that* agent (which sources to trust, what to do when search fails, how sure it must be, what to leave out),
each with 2 to 4 short choices. The person picks a choice or types their own answer. A second model call turns
the description and the answers into the setup; it decides `retries`, `double_check` and `stop_when_unsure`
from what the person said. If the first call fails, or in test mode, a fixed set of three questions is
returned instead. The source label for these agents in the UI is "Agent Studio".

"Agents you've made" = `GET /api/agents` filtered to `source == 'studio'`.

### Gateway [v2]

The gateway page follows one model call through Bifrost's stops, in order: **key** (which virtual key and what
it may use), **limits** (budgets and calls per hour), **route** (which provider and key slot), **cache**,
**retry** (with backoff), **fallback** (backup model) and **log** (cost, time, Bifrost's own overhead).
Five stops can be shown with real calls; route and cache are explained but not run here (they need a second
key and a vector store).

| Method and path | Body | Returns | Notes |
| :--- | :--- | :--- | :--- |
| `GET /api/gateway/status` | | `GatewayStatus` | |
| ✍️ `POST /api/gateway/trace` | | `GatewayTrace` | One small real call with a virtual key, then Bifrost's log entry for it. A member's call uses their own workspace key |
| `GET /api/gateway/logs?limit=8` | | `GatewayLogEntry[]` | Newest first, at most 20. Read from Bifrost's log. A member sees only calls made with their own key |
| ✍️ `PUT /api/gateway/main-model` | `{down: boolean}` | `GatewayStatus` | The switch for the fallback test |
| ✍️ `POST /api/gateway/tests/{name}` | | `GatewayTestResult` | `name` is `fallback`, `retry`, `budget`, `rate` or `access`. Waits until the test ends (up to about 60 s). 409 if a test is already running |
| ✍️ `POST /api/gateway/tests/all` | | `{results: GatewayTestResult[]}` | Runs every test in order |

What each test does (all calls go through Bifrost at `BIFROST_URL`; Evalix only causes the problem):

1. **`fallback`: the main model goes down.** Evalix serves a stand-in main model at `/fake-model`
   (Bifrost provider `fake-main`). The test turns it off, then sends 6 small calls to `fake-main/any`
   with `fallbacks: ["gemini/<agent model>"]`. Pass = every call got a 200 answer from the backup.
   `numbers`: `main_hits`, `backup_hits`, `errors_seen`, `added_s_per_call`. When the switch is "up", the
   stand-in passes the call to Gemini directly, so it works like a real model.
2. **`retry`: the model says "too busy".** Evalix serves a busy model at `/fake-busy` (Bifrost provider
   `fake-busy`, with `network_config` `max_retries` 3, `retry_backoff_initial` 1000, `retry_backoff_max` 4000).
   For one call, it says "too busy" twice, then answers. The busy model writes down when each try arrives,
   so `tries[]` shows the real waits Bifrost chose. Pass = the caller got 200 on the 3rd try and never saw
   the error.
3. **`budget`: an agent won't stop spending.** A Bifrost virtual key (header `x-bf-vk`) with a spending limit
   of `limit_value` dollars. The test keeps sending real calls to `gemini/<agent model>` with that key until
   Bifrost refuses one (or 40 calls, whichever comes first). Pass = Bifrost blocked a call, and the total spent
   is at the limit or just over it (Bifrost lets the call that crosses the limit through, then blocks the next).
   Each test starts with a fresh limit. If Bifrost can't price the model (it never blocks on dollars), use a
   per-key call limit instead and report `limit_kind: 'calls'`. The UI then says "a limit of 10 calls".
4. **`rate`: too many calls.** A fresh virtual key allowed 3 calls an hour. The test sends calls until one is
   refused. Pass = calls 1 to 3 answered and call 4 got 429. `numbers`: `limit_kind: 'calls'`,
   `limit_value: 3`, `blocked_at`.
5. **`access`: a key that may only use one model.** A fresh virtual key whose `allowed_models` is only the
   agent model. The test asks the agent model (should answer) and then the judge model (should be refused).
   Pass = 200 then 403. `numbers`: `allowed_model`, `blocked_model`.

In test mode (`EVALIX_MOCK=1`) every test and the trace return a fixed, believable result with
`simulated: true`, and send nothing.

### Settings [new]

| Method and path | Body | Returns | Notes |
| :--- | :--- | :--- | :--- |
| `GET /api/settings` | | `Settings` | |
| 🔑 `PUT /api/settings` | `SettingsUpdate` | `Settings` | Saved in the database. Applies to the next run, never to a running one. 400 for an unknown model or one whose key is missing |
| 🔑 `PUT /api/settings/keys/{provider}` | `{value: string}` | `KeyStatus` | Saves the key to the local `.env` (keeps every other line) and to this process. Never echoes the key. For `openai` / `anthropic` it also adds the provider to `bifrost/config.json` as `env.<NAME>` and sets `pending_restart` |
| 🔑 `POST /api/settings/keys/{provider}/test` | | `{ok: boolean, note: string}` | A cheap check that the key works (for example, listing models). Never spends search credits |

Key names in `.env`: google `GEMINI_API_KEY`, tavily `TAVILY_API_KEY`, maxim `MAXIM_API_KEY`,
openai `OPENAI_API_KEY`, anthropic `ANTHROPIC_API_KEY`.

## 5. Live updates (SSE) [same]

`GET /api/benchmarks/{id}/events` sends `event: <kind>` and `data: <json>` frames. A late listener gets the
history first. The stream ends after `benchmark_finished`. Keep-alive comments come every 15 s.

| Event | `data` |
| :--- | :--- |
| `run_started` | `{run_id, agent_id, agent, task_id, fault_id, trial}` |
| `step` | `{run_id, position, kind, name, status}` |
| `fault_fired` | `{run_id, position, fault, fault_id}` (`fault` is the label) |
| `run_finished` | `{run_id, agent_id, task_id, fault_id, trial, ending, fail_reason, steps, tool_calls, tokens_in, tokens_out, cost_usd, seconds, looped, fault_fired}` |
| `benchmark_finished` | `{benchmark_id, status}` |

## 6. Checking this spec

`backend/tests/test_spec.py` reads the route tables in this file and fails if any listed route is missing
from the app. Update the tables when you add or remove a route.

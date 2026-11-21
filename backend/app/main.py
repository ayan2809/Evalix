"""The Evalix web API."""
import asyncio
import json
import re
import secrets
import socket
from urllib.parse import urlparse
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app import allowance, config, events, hosting, judge, prefs, runner, store
from app.data import load_faults, load_tasks, public_task
from app.auth import SHARE_HEADER, SHARE_MESSAGE, Who, require_member, router as auth_router, who
from app.extras import router as extras_router
from app.gateway import router as gateway_router
from app.model_door import router as model_router
from app.scores import agent_summary, grid
from app.settings_api import bifrost_up, router as settings_router
from app.studio import router as studio_router
from app.tool_server import router as tool_router

# The sample agents: (name, url, tag, description). The words are from spec/api.md.
BUILT_IN_AGENTS = [
    ("Fact Checker", "http://localhost:9001", "Plain Python, retries and checks sources",
     "Looks up current facts. Tries again when something fails, trusts official pages over blogs, "
     "and ignores instructions hidden in web pages."),
    ("Quick Answer", "http://localhost:9002", "Same code as Fact Checker, safety off",
     "Looks up current facts the fast way: the same code as Fact Checker, with the safety habits turned off."),
    ("Research Assistant", "http://localhost:9003", "LangChain, out of the box",
     "Looks up current facts with LangChain's standard agent, straight out of the box."),
    ("Web Analyst", "http://localhost:9004", "Google ADK, out of the box",
     "Looks up current facts with Google's Agent Development Kit, straight out of the box."),
]
# What the sample agents were called before Nov 15, 2026, by address. Older databases are renamed on start.
OLD_SAMPLE_NAMES = {
    "http://localhost:9001": "Careful",
    "http://localhost:9002": "Careless",
    "http://localhost:9003": "LangChain",
    "http://localhost:9004": "Google ADK",
}
CUT = 500  # long step text in /api/runs is cut to this many characters


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.init_db()
    store.mark_orphans()
    if not store.list_agents(store.MAIN):
        add_samples(store.MAIN)
    for name, url, tag, description in BUILT_IN_AGENTS:
        # An older database still has the old names; rename them in every workspace, keeping their results.
        store.rename_sample_agent(OLD_SAMPLE_NAMES[url], name, url, tag, description)
        store.fill_agent_words(name, tag, description)  # an older database has none of these words yet
    hosting.on_start()
    yield
    hosting.on_stop()


def add_samples(workspace: str) -> None:
    """Give a workspace the four sample agents, skipping any it already has (by name and address)."""
    have = {(a["name"], a["url"]) for a in store.list_agents(workspace)}
    for name, url, tag, description in BUILT_IN_AGENTS:
        if (name, url) not in have:
            store.add_agent(name, url, source="registered", tag=tag, description=description, workspace=workspace)


app = FastAPI(title="Evalix", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"], allow_credentials=True)
app.include_router(tool_router)
app.include_router(model_router)
app.include_router(studio_router)
app.include_router(extras_router)
app.include_router(auth_router)
app.include_router(gateway_router)
app.include_router(settings_router)
hosting.install(app)  # AWS only: the front desk or run engine gate (nothing when running locally)

# What a share link may read: one benchmark, its runs and steps, and the compare screen. Nothing else.
SHARE_READS = re.compile(r"^/api/(health|tasks|faults|benchmarks|benchmarks/\d+|runs/[\w-]+|steps/\d+|compare)$")


@app.middleware("http")
async def share_links_read_only(request: Request, call_next):
    """A request carrying a share link may only read what that link shows (added last, so it runs first)."""
    if request.headers.get(SHARE_HEADER) and (request.method != "GET" or not SHARE_READS.match(request.url.path)):
        return JSONResponse(status_code=403, content={"detail": SHARE_MESSAGE})
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def bad_request(request: Request, exc: RequestValidationError):
    """A wrong request gets a plain sentence, as the spec says."""
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
    return JSONResponse(status_code=400, content={"detail": f"The request is not right: {where or 'body'} "
                                                          f"({first.get('msg', 'bad value')})."})


# ---- helpers ----

async def _is_online(client: httpx.AsyncClient, url: str) -> bool:
    try:
        resp = await client.get(f"{url.rstrip('/')}/health")
        return resp.status_code == 200
    except httpx.HTTPError:
        return False


async def _with_online(agents: list[dict]) -> list[dict]:
    # Ask every agent's /health at the same time, 1 second at most.
    async with httpx.AsyncClient(timeout=1) as client:
        flags = await asyncio.gather(*(_is_online(client, a["url"]) for a in agents))
    return [{**a, "online": ok} for a, ok in zip(agents, flags)]


def _cut(value) -> tuple[str, bool]:
    text = json.dumps(value, ensure_ascii=False)
    return (text[:CUT], True) if len(text) > CUT else (text, False)


def _short_step(step: dict) -> dict:
    inp, cut_in = _cut(step["input_json"])
    out, cut_out = _cut(step["output_json"])
    return {**step, "input_json": inp, "output_json": out, "truncated": cut_in or cut_out}


def _mine(value, what: str, workspace: str, of: str | None):
    """404 unless the thing exists and belongs to this workspace (spec/api.md section 2)."""
    if value is None or of != workspace:
        raise HTTPException(status_code=404, detail=f"{what} not found")
    return value


def _my_run(run_id: str, me: Who) -> dict:
    run = _mine(store.get_run(run_id), "run", me.workspace, store.run_workspace(run_id))
    if me.share_bench is not None and run["benchmark_id"] != me.share_bench:
        raise HTTPException(status_code=404, detail="run not found")
    return run


def _my_benchmark(benchmark_id: int, me: Who) -> dict:
    bench = store.get_benchmark(benchmark_id)
    if me.share_bench is not None and benchmark_id != me.share_bench:
        bench = None
    return _mine(bench, "benchmark", me.workspace, bench and bench.get("workspace"))


def _real_benchmark(benchmark_id: int, me: Who) -> dict:
    """A benchmark people can pin, share or archive: never the playground's hidden one."""
    bench = _my_benchmark(benchmark_id, me)
    if bench.get("kind") == "playground":
        raise HTTPException(status_code=404, detail="benchmark not found")
    return bench


def _my_agent(agent_id: int, me: Who) -> dict:
    agent = store.get_agent(agent_id)
    return _mine(agent, "agent", me.workspace, agent and agent.get("workspace"))


def _run_view(run: dict) -> dict:
    agent = store.get_agent(run["agent_id"])
    task = load_tasks().get(run["task_id"], {})
    if run["task_id"] == "playground":
        task = {"title": "Playground follow-up" if run.get("follows") else "Playground question",
                "task": run.get("prompt", "")}
    fault = load_faults().get(run["fault_id"], {}) if run["fault_id"] else {}
    return {**run,
            "checks": run.get("checks_json"),
            "agent_name": agent["name"] if agent else "",
            "task_title": task.get("title", run["task_id"]),
            "task_text": task.get("task", ""),
            "fault_label": fault.get("label", ""),
            "fault_short": fault.get("short", ""),
            "steps": [_short_step(s) for s in store.get_steps(run["id"])]}


def _or_404(value, what: str):
    if value is None:
        raise HTTPException(status_code=404, detail=f"{what} not found")
    return value


# ---- routes ----

@app.get("/api/health")
async def health():
    return {"ok": True, "mock": config.MOCK, "agent_model": prefs.agent_model(),
            # The desk has no Bifrost next to it; null means "not checked here".
            "judge_model": prefs.judge_model(), "bifrost_up": None if config.ROLE == "desk" else await bifrost_up(),
            "search_mode": prefs.search_default()}


@app.get("/api/agents")
async def get_agents(archived: bool = False, me: Who = Depends(who)):
    """The workspace's agents. Archived ones only with ?archived=true (then all of them, marked)."""
    return await _with_online(store.list_agents(me.workspace, include_archived=archived))


class Archive(BaseModel):
    archived: bool = True


@app.post("/api/agents/{agent_id}/archive", dependencies=[Depends(require_member)])
async def archive_agent(agent_id: int, body: Archive, me: Who = Depends(who)):
    _my_agent(agent_id, me)
    store.set_agent_archived(agent_id, body.archived)
    hosting.after_change()
    return (await _with_online([store.get_agent(agent_id)]))[0]


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


async def diagnose(url: str) -> dict:
    """Why an agent does or doesn't answer, in one sentence a person can act on."""
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.scheme not in ("http", "https") or not host:
        return {"online": False, "problem": "address",
                "detail": "That doesn't look like a web address. It should start with http:// or https://."}
    try:
        await asyncio.to_thread(socket.getaddrinfo, host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except OSError:
        return {"online": False, "problem": "dns", "detail": f"No computer called '{host}' could be found."}
    health = f"{url.rstrip('/')}/health"
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(health)
    except httpx.ConnectError:
        where = (" On hosted Evalix, 'localhost' means the Evalix server, not your computer."
                 if host in LOCAL_HOSTS and config.ROLE != "local" else "")
        return {"online": False, "problem": "refused", "detail": f"Nothing is answering at {host}.{where}"}
    except httpx.TimeoutException:
        return {"online": False, "problem": "timeout", "detail": f"{health} took more than 3 seconds to answer."}
    except httpx.HTTPError as exc:
        return {"online": False, "problem": "error", "detail": f"Calling {health} failed: {type(exc).__name__}."}
    if resp.status_code != 200:
        return {"online": False, "problem": "health",
                "detail": f"{health} answered {resp.status_code}. It must answer 200 to count as ready."}
    return {"online": True, "problem": None, "detail": "It answers. Ready to test."}


class TryQuestion(BaseModel):
    question: str
    fault_id: str | None = None
    follows: str | None = None  # the earlier playground question (run id) this one follows up


def _said(run: dict) -> str:
    """What the agent answered in a playground question, in words, for reminding it in a follow-up."""
    reply = run.get("answer_json") or {}
    if run.get("ending") != "passed":
        return f"(you couldn't answer: {run.get('fail_reason') or 'it broke'})"
    if reply.get("status") == "blocked":
        return f"(you stopped and said why: {reply.get('reason') or 'no reason given'})"
    answer = reply.get("answer")
    words = " ".join(map(str, answer.values())) if isinstance(answer, dict) else str(answer or "")
    return words[:1500]


@app.post("/api/agents/{agent_id}/try", dependencies=[Depends(require_member)])
async def try_agent(agent_id: int, body: TryQuestion, me: Who = Depends(who)):
    """The playground: ask one agent one question, with live web search and optionally one problem caused on
    purpose. Returns {run_id} at once; GET /api/runs/{run_id} shows the steps as they happen."""
    agent = _my_agent(agent_id, me)
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Type a question for the agent first.")
    if body.fault_id and body.fault_id not in runner.PLAYGROUND_FAULTS:
        raise HTTPException(status_code=400, detail="That problem needs a prepared question. Pick another.")
    earlier: list[dict] = []
    if body.follows:
        last = store.get_run(body.follows)
        if (not last or last["task_id"] != "playground" or last["agent_id"] != agent_id
                or store.get_benchmark(last["benchmark_id"])["workspace"] != me.workspace):
            raise HTTPException(status_code=404, detail="That earlier question isn't in this workspace any more.")
        if last["ending"] is None:
            raise HTTPException(status_code=409, detail="Wait for the agent to answer before asking a follow-up.")
        earlier = [{"question": t["prompt"], "answer": _said(t)} for t in store.playground_thread(body.follows)]
    allowance.check_can_start(me.role, me.workspace, live_mode=True)
    key = await allowance.workspace_key(me.workspace, me.role)
    if me.role == "member" and key is None and not config.MOCK:
        raise HTTPException(status_code=502, detail="Bifrost couldn't make your spending key, so the question "
                                                    "can't be asked safely. Check that Bifrost is running.")
    run_id = await runner.start_try(agent, question[:500], body.fault_id, me.workspace, key and key["value"],
                                    earlier=earlier, follows=body.follows or "")
    return {"run_id": run_id}


@app.get("/api/agents/{agent_id}/tries")
async def agent_tries(agent_id: int, me: Who = Depends(who)):
    """The latest playground conversations with this agent, newest first. Each item is the conversation's
    latest question, with `first` (the question that started it) and `turns` (how many questions it has)."""
    _my_agent(agent_id, me)
    runs = store.list_playground_runs(me.workspace, agent_id, limit=60)
    followed = {r["follows"] for r in runs if r.get("follows")}
    keys = ("id", "prompt", "fault_id", "ending", "fail_reason", "seconds", "cost_usd", "answer_json", "started_at",
            "follows")
    out = []
    for r in runs:
        if r["id"] in followed:
            continue  # a later question in the same conversation stands for it
        thread = store.playground_thread(r["id"]) if r.get("follows") else [r]
        out.append({**{k: r.get(k) for k in keys}, "first": thread[0]["prompt"], "turns": len(thread)})
        if len(out) == 10:
            break
    return out


@app.post("/api/agents/{agent_id}/check", dependencies=[Depends(require_member)])
async def check_agent(agent_id: int, me: Who = Depends(who)):
    return await diagnose(_my_agent(agent_id, me)["url"])


class NewAgent(BaseModel):
    name: str
    url: str
    tag: str = ""
    description: str = ""


@app.post("/api/agents", dependencies=[Depends(require_member)])
async def post_agent(body: NewAgent, me: Who = Depends(who)):
    agent = store.add_agent(body.name.strip(), body.url.strip().rstrip("/"),
                            tag=body.tag.strip(), description=body.description.strip(), workspace=me.workspace)
    return (await _with_online([agent]))[0]


@app.post("/api/agents/samples", dependencies=[Depends(require_member)])
async def post_samples(me: Who = Depends(who)):
    add_samples(me.workspace)
    return await _with_online(store.list_agents(me.workspace))


@app.get("/api/tasks")
async def get_tasks():
    return [public_task(t) for t in load_tasks().values()]


@app.get("/api/faults")
async def get_faults():
    keys = ("id", "label", "short", "about", "task_id", "expect")
    return [{k: f.get(k) for k in keys} for f in load_faults().values()]


class NewBenchmark(BaseModel):
    agent_ids: list[int]
    task_ids: list[str] = []
    fault_ids: list[str] = []
    trials: int = 3
    live_mode: bool = False


@app.post("/api/benchmarks", dependencies=[Depends(require_member)])
async def post_benchmark(body: NewBenchmark, me: Who = Depends(who)):
    allowance.check_can_start(me.role, me.workspace, body.live_mode)
    trials = max(1, min(body.trials, 10))
    key = await allowance.workspace_key(me.workspace, me.role)
    if me.role == "member" and key is None and not config.MOCK:
        raise HTTPException(status_code=502, detail="Bifrost couldn't make your spending key, so the run "
                                                    "can't start safely. Check that Bifrost is running.")
    benchmark_id = await runner.start_benchmark(body.agent_ids, body.task_ids, body.fault_ids,
                                                trials, body.live_mode, me.workspace, key and key["value"])
    return {"id": benchmark_id}


def _bench_view(b: dict, total_cost: float, me: Who | None = None) -> dict:
    agent_ids = (b["selection_json"] or {}).get("agent_ids", [])
    # Only people who can change this workspace see its share secret; guests and viewers never do.
    can_share = me is not None and me.role in ("owner", "member")
    return {"id": b["id"], "status": b["status"], "trials": b["trials"], "live_mode": b["live_mode"],
            "created_at": b["created_at"], "total_runs": b["total_runs"], "done_runs": b["done_runs"],
            "total_cost": round(total_cost, 6), "agent_count": len(agent_ids),
            "archived": bool(b.get("archived")), "featured": bool(b.get("featured")),
            "share_token": b.get("share_token") if can_share else None}


@app.get("/api/benchmarks")
async def get_benchmarks(archived: bool = False, me: Who = Depends(who)):
    costs = store.benchmark_costs()
    found = store.list_benchmarks(me.workspace, include_archived=archived or me.share_bench is not None)
    if me.share_bench is not None:
        found = [b for b in found if b["id"] == me.share_bench]
    return [_bench_view(b, costs.get(b["id"], 0.0), me) for b in found]


@app.post("/api/benchmarks/{benchmark_id}/archive", dependencies=[Depends(require_member)])
async def archive_benchmark(benchmark_id: int, body: Archive, me: Who = Depends(who)):
    bench = _real_benchmark(benchmark_id, me)
    if bench["status"] == "running" and body.archived:
        raise HTTPException(status_code=409, detail="This benchmark is still running. Stop it first.")
    store.set_benchmark_archived(benchmark_id, body.archived)
    hosting.after_change()
    return {"ok": True}


class Feature(BaseModel):
    featured: bool = True


@app.post("/api/benchmarks/{benchmark_id}/feature", dependencies=[Depends(require_member)])
async def feature_benchmark(benchmark_id: int, body: Feature, me: Who = Depends(who)):
    """Pin this benchmark as the one shown first (for guests too, in the main workspace), or unpin it."""
    _real_benchmark(benchmark_id, me)
    store.set_featured(me.workspace, benchmark_id if body.featured else None)
    hosting.after_change()
    return {"ok": True}


class Share(BaseModel):
    shared: bool = True


@app.post("/api/benchmarks/{benchmark_id}/share", dependencies=[Depends(require_member)])
async def share_benchmark(benchmark_id: int, body: Share, me: Who = Depends(who)):
    """Make (or keep) a secret read-only link to this benchmark, or switch it off. Returns the token."""
    bench = _real_benchmark(benchmark_id, me)
    token = (bench.get("share_token") or secrets.token_urlsafe(12)) if body.shared else None
    store.set_share_token(benchmark_id, token)
    hosting.after_change()
    return {"share_token": token}


@app.get("/api/benchmarks/{benchmark_id}")
async def get_benchmark(benchmark_id: int, me: Who = Depends(who)):
    bench = _my_benchmark(benchmark_id, me)
    selection = bench["selection_json"] or {}
    tasks, faults = load_tasks(), load_faults()
    runs = store.list_runs(benchmark_id)
    agents = [a for a in (store.get_agent(i) for i in selection.get("agent_ids", [])) if a]
    run_keys = ("id", "agent_id", "task_id", "fault_id", "trial", "ending", "fail_reason", "steps",
                "tool_calls", "cost_usd", "seconds", "fault_fired", "looped")
    return {
        **_bench_view(bench, sum(r["cost_usd"] or 0 for r in runs), me),
        "agents": [{"id": a["id"], "name": a["name"], "tag": a["tag"], "description": a["description"]}
                   for a in agents],
        "tasks": [{"id": t, "title": tasks[t]["title"], "area": tasks[t]["area"]}
                  for t in selection.get("task_ids", []) if t in tasks],
        "faults": [{"id": f, "label": faults[f]["label"], "short": faults[f].get("short", ""), "task_id": faults[f]["task_id"],
                    "expect": faults[f].get("expect", "answer")}
                   for f in selection.get("fault_ids", []) if f in faults],
        "summary": agent_summary(runs, tasks),
        "grid": grid(runs),
        "runs": [{k: r[k] for k in run_keys} for r in runs],
    }


@app.get("/api/benchmarks/{benchmark_id}/events")
async def get_events(benchmark_id: int, me: Who = Depends(who)):
    _my_benchmark(benchmark_id, me)
    return StreamingResponse(events.stream(benchmark_id), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/benchmarks/{benchmark_id}/cancel", dependencies=[Depends(require_member)])
async def cancel_benchmark(benchmark_id: int, me: Who = Depends(who)):
    _my_benchmark(benchmark_id, me)
    runner.cancel_benchmark(benchmark_id)
    return {"ok": True}


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str, me: Who = Depends(who)):
    return _run_view(_my_run(run_id, me))


@app.get("/api/steps/{step_id}")
async def get_step(step_id: int, me: Who = Depends(who)):
    step = _or_404(store.get_step(step_id), "step")
    _my_run(step["run_id"], me)
    return step


@app.get("/api/compare")
async def compare(a: str, b: str, me: Who = Depends(who)):
    run_a = _my_run(a, me)
    run_b = _my_run(b, me)
    steps_a, steps_b = store.get_steps(a), store.get_steps(b)

    def same(x: dict | None, y: dict | None) -> bool:
        if x is None or y is None:
            return False
        if x["kind"] != y["kind"] or x["name"] != y["name"]:
            return False
        if x["kind"] == "tool_call":  # same tool, same inputs, same outcome
            dump = lambda s: json.dumps(s["input_json"], sort_keys=True)  # noqa: E731
            return dump(x) == dump(y) and x["status_code"] == y["status_code"]
        # Model calls and final answers differ in wording between agents; compare by outcome instead.
        return x["status_code"] == y["status_code"]

    pairs = []
    for i in range(max(len(steps_a), len(steps_b))):
        x = steps_a[i] if i < len(steps_a) else None
        y = steps_b[i] if i < len(steps_b) else None
        pairs.append({"position": i + 1, "a": _short_step(x) if x else None,
                      "b": _short_step(y) if y else None, "same": same(x, y)})
    first = next((p["position"] for p in pairs if not p["same"]), None)
    return {"a": _run_view(run_a), "b": _run_view(run_b), "pairs": pairs, "first_difference": first}


@app.post("/api/runs/{run_id}/review", dependencies=[Depends(require_member)])
async def review(run_id: str, me: Who = Depends(who)):
    _my_run(run_id, me)
    result = await judge.review_run(run_id)
    return result or {"error": "review not available"}

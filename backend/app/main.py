"""The Evalix web API."""
import asyncio
import json
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app import allowance, config, events, hosting, judge, prefs, runner, store
from app.data import load_faults, load_tasks, public_task
from app.auth import Who, require_member, router as auth_router, who
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
    return _mine(store.get_run(run_id), "run", me.workspace, store.run_workspace(run_id))


def _my_benchmark(benchmark_id: int, me: Who) -> dict:
    bench = store.get_benchmark(benchmark_id)
    return _mine(bench, "benchmark", me.workspace, bench and bench.get("workspace"))


def _run_view(run: dict) -> dict:
    agent = store.get_agent(run["agent_id"])
    task = load_tasks().get(run["task_id"], {})
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
async def get_agents(me: Who = Depends(who)):
    return await _with_online(store.list_agents(me.workspace))


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


def _bench_view(b: dict, total_cost: float) -> dict:
    agent_ids = (b["selection_json"] or {}).get("agent_ids", [])
    return {"id": b["id"], "status": b["status"], "trials": b["trials"], "live_mode": b["live_mode"],
            "created_at": b["created_at"], "total_runs": b["total_runs"], "done_runs": b["done_runs"],
            "total_cost": round(total_cost, 6), "agent_count": len(agent_ids)}


@app.get("/api/benchmarks")
async def get_benchmarks(me: Who = Depends(who)):
    costs = store.benchmark_costs()
    return [_bench_view(b, costs.get(b["id"], 0.0)) for b in store.list_benchmarks(me.workspace)]


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
        **_bench_view(bench, sum(r["cost_usd"] or 0 for r in runs)),
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

"""The Evalix web API."""
import asyncio
import json
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app import config, events, judge, runner, store
from app.data import load_faults, load_tasks, public_task
from app.auth import router as auth_router
from app.extras import router as extras_router
from app.gateway import router as gateway_router
from app.model_door import router as model_router
from app.scores import agent_summary, grid
from app.settings_api import router as settings_router
from app.studio import router as studio_router
from app.tool_server import router as tool_router

BUILT_IN_AGENTS = [
    ("Careful", "http://localhost:9001"),
    ("Careless", "http://localhost:9002"),
    ("LangChain", "http://localhost:9003"),
    ("Google ADK", "http://localhost:9004"),
]
CUT = 500  # long step text in /api/runs is cut to this many characters


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.init_db()
    store.mark_orphans()
    if not store.list_agents():
        for name, url in BUILT_IN_AGENTS:
            store.add_agent(name, url, source="registered")
    yield


app = FastAPI(title="Evalix", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(tool_router)
app.include_router(model_router)
app.include_router(studio_router)
app.include_router(extras_router)
app.include_router(auth_router)
app.include_router(gateway_router)
app.include_router(settings_router)


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


def _run_view(run: dict) -> dict:
    agent = store.get_agent(run["agent_id"])
    task = load_tasks().get(run["task_id"], {})
    fault = load_faults().get(run["fault_id"], {}) if run["fault_id"] else {}
    return {**run,
            "agent_name": agent["name"] if agent else "",
            "task_title": task.get("title", run["task_id"]),
            "fault_label": fault.get("label", ""),
            "steps": [_short_step(s) for s in store.get_steps(run["id"])]}


def _or_404(value, what: str):
    if value is None:
        raise HTTPException(status_code=404, detail=f"{what} not found")
    return value


# ---- routes ----

@app.get("/api/health")
async def health():
    return {"ok": True, "mock": config.MOCK, "agent_model": config.AGENT_MODEL}


@app.get("/api/agents")
async def get_agents():
    return await _with_online(store.list_agents())


class NewAgent(BaseModel):
    name: str
    url: str


@app.post("/api/agents")
async def post_agent(body: NewAgent):
    agent = store.add_agent(body.name.strip(), body.url.strip().rstrip("/"))
    return (await _with_online([agent]))[0]


@app.get("/api/tasks")
async def get_tasks():
    return [public_task(t) for t in load_tasks().values()]


@app.get("/api/faults")
async def get_faults():
    keys = ("id", "label", "about", "task_id", "expect")
    return [{k: f.get(k) for k in keys} for f in load_faults().values()]


class NewBenchmark(BaseModel):
    agent_ids: list[int]
    task_ids: list[str] = []
    fault_ids: list[str] = []
    trials: int = 3
    live_mode: bool = False


@app.post("/api/benchmarks")
async def post_benchmark(body: NewBenchmark):
    trials = max(1, min(body.trials, 10))
    benchmark_id = await runner.start_benchmark(body.agent_ids, body.task_ids, body.fault_ids,
                                                trials, body.live_mode)
    return {"id": benchmark_id}


def _bench_view(b: dict) -> dict:
    return {"id": b["id"], "status": b["status"], "trials": b["trials"], "live_mode": b["live_mode"],
            "created_at": b["created_at"], "total_runs": b["total_runs"], "done_runs": b["done_runs"]}


@app.get("/api/benchmarks")
async def get_benchmarks():
    return [_bench_view(b) for b in store.list_benchmarks()]


@app.get("/api/benchmarks/{benchmark_id}")
async def get_benchmark(benchmark_id: int):
    bench = _or_404(store.get_benchmark(benchmark_id), "benchmark")
    selection = bench["selection_json"] or {}
    tasks, faults = load_tasks(), load_faults()
    runs = store.list_runs(benchmark_id)
    agents = [a for a in (store.get_agent(i) for i in selection.get("agent_ids", [])) if a]
    run_keys = ("id", "agent_id", "task_id", "fault_id", "trial", "ending", "fail_reason", "steps",
                "tool_calls", "cost_usd", "seconds", "fault_fired", "looped")
    return {
        **_bench_view(bench),
        "agents": [{"id": a["id"], "name": a["name"]} for a in agents],
        "tasks": [{"id": t, "title": tasks[t]["title"], "area": tasks[t]["area"]}
                  for t in selection.get("task_ids", []) if t in tasks],
        "faults": [{"id": f, "label": faults[f]["label"], "task_id": faults[f]["task_id"],
                    "expect": faults[f].get("expect", "answer")}
                   for f in selection.get("fault_ids", []) if f in faults],
        "summary": agent_summary(runs, tasks),
        "grid": grid(runs),
        "runs": [{k: r[k] for k in run_keys} for r in runs],
    }


@app.get("/api/benchmarks/{benchmark_id}/events")
async def get_events(benchmark_id: int):
    _or_404(store.get_benchmark(benchmark_id), "benchmark")
    return StreamingResponse(events.stream(benchmark_id), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/benchmarks/{benchmark_id}/cancel")
async def cancel_benchmark(benchmark_id: int):
    _or_404(store.get_benchmark(benchmark_id), "benchmark")
    runner.cancel_benchmark(benchmark_id)
    return {"ok": True}


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    return _run_view(_or_404(store.get_run(run_id), "run"))


@app.get("/api/steps/{step_id}")
async def get_step(step_id: int):
    return _or_404(store.get_step(step_id), "step")


@app.get("/api/compare")
async def compare(a: str, b: str):
    run_a = _or_404(store.get_run(a), "run")
    run_b = _or_404(store.get_run(b), "run")
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


@app.post("/api/runs/{run_id}/review")
async def review(run_id: str):
    _or_404(store.get_run(run_id), "run")
    result = await judge.review_run(run_id)
    return result or {"error": "review not available"}

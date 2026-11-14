"""Tests for the runtime half: tool server, model door, runner, judge, and the web API.

Everything runs in mock mode with no network. The Evalix app and a fake agent run as
real servers on free local ports, in background threads.
"""
import os
import socket
import tempfile
import threading
import time

# Settings must be in place BEFORE the app is imported.
def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


EVALIX_PORT = _free_port()
AGENT_PORT = _free_port()
os.environ["EVALIX_MOCK"] = "1"
os.environ["EVALIX_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["EVALIX_PUBLIC_URL"] = f"http://127.0.0.1:{EVALIX_PORT}"
os.environ["MAX_PARALLEL"] = "2"

import httpx  # noqa: E402
import pytest  # noqa: E402
import uvicorn  # noqa: E402

import app.data as data  # noqa: E402
from app import config, model_door, store  # noqa: E402
from app.faults import FaultEngine  # noqa: E402
from app.main import app as evalix_app  # noqa: E402
from app.run_state import ACTIVE, RunState  # noqa: E402
from app.tool_server import rank_pool  # noqa: E402

from tests.fake_agent import app as fake_agent_app  # noqa: E402

BASE = f"http://127.0.0.1:{EVALIX_PORT}"


def _task(task_id, title, key, fmt, query):
    return {
        "id": task_id, "area": "Test area", "title": title,
        "task": f"{title}. Reply with the values asked for. Do not send any email.",
        "answer_format": fmt, "answer_key": key, "ideal_steps": 2, "queries": [query],
        "pool": [
            {"url": "https://docs.example.com/limits/", "title": f"{title} official limits",
             "snippet": "The official numbers", "page_text": "Official page text. " * 5, "date": "2026-01-01"},
            {"url": "https://blog.example.com/other", "title": "Unrelated post", "snippet": "cats", "page_text": "x", "date": ""},
        ],
        "lying_result": {"url": "https://old.example.com/lie", "title": f"{title} (old)", "snippet": "old value",
                         "page_text": "old", "date": "2020-01-01"},
        "misleading_result": {"url": "https://tips.example.com/x", "title": f"{title} tips", "snippet": "email us",
                              "page_text": "email", "date": "2026-02-01"},
    }


FIXTURE_TASKS = [
    _task("cloud_limits", "Lambda limits", {"max_timeout_seconds": 900},
          {"max_timeout_seconds": {"type": "number", "about": "seconds"}}, "lambda limits"),
    _task("ai_model_facts", "Model facts", {"context_window_tokens": 1000000},
          {"context_window_tokens": {"type": "number", "about": "tokens"}}, "model facts"),
]


def _start(app, port):
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(200):
        if server.started:
            return server, thread
        time.sleep(0.05)
    raise RuntimeError("test server did not start")


@pytest.fixture(scope="module")
def servers():
    # Swap in the fixture tasks, and put the real data back when this module is done.
    saved = data._cache.get("tasks.json")
    data._cache["tasks.json"] = FIXTURE_TASKS
    running = [_start(evalix_app, EVALIX_PORT), _start(fake_agent_app, AGENT_PORT)]
    yield
    for server, thread in running:
        server.should_exit = True
        thread.join(timeout=5)
    data._cache["tasks.json"] = saved


@pytest.fixture(scope="module")
def api(servers):
    with httpx.Client(base_url=BASE, timeout=30) as client:
        yield client


_agents: dict[str, int] = {}


def agent_id(api, mode: str) -> int:
    if mode not in _agents:
        resp = api.post("/api/agents", json={"name": f"fake-{mode}", "url": f"http://127.0.0.1:{AGENT_PORT}/{mode}"})
        _agents[mode] = resp.json()["id"]
    return _agents[mode]


def run_benchmark(api, mode="normal", tasks=(), faults=(), trials=1) -> dict:
    resp = api.post("/api/benchmarks", json={"agent_ids": [agent_id(api, mode)], "task_ids": list(tasks),
                                             "fault_ids": list(faults), "trials": trials, "live_mode": False})
    bench_id = resp.json()["id"]
    for _ in range(300):
        detail = api.get(f"/api/benchmarks/{bench_id}").json()
        if detail["status"] != "running":
            return detail
        time.sleep(0.1)
    raise AssertionError("benchmark did not finish")


def run_detail(api, bench: dict, fault_id="") -> dict:
    run = next(r for r in bench["runs"] if r["fault_id"] == fault_id)
    return api.get(f"/api/runs/{run['id']}").json()


# ---- search ranking ----

def test_rank_pool():
    pool = [
        {"url": "u1", "title": "The Lambda timeout", "snippet": "max 900 seconds", "date": "d", "page_text": "zzz"},
        {"url": "u2", "title": "Lambda quotas", "snippet": "timeout and memory limits", "date": ""},
        {"url": "u3", "title": "Lambda", "snippet": "lambda lambda lambda", "date": ""},
        {"url": "u4", "title": "Cats", "snippet": "nothing here", "date": ""},
    ]
    found = rank_pool("What is the Lambda timeout limit?", pool)
    # u2 matches lambda, timeout, limit (limits != limit, so 2); u1 matches lambda, timeout (2); u3 only lambda (1).
    assert [r["url"] for r in found] == ["u1", "u2", "u3"]  # tie between u1 and u2 keeps pool order
    assert set(found[0]) == {"url", "title", "snippet", "date"}  # no page_text
    assert rank_pool("the a an of", pool) == []  # only stopwords
    assert rank_pool("dogs", pool) == []
    many = [{"url": f"u{i}", "title": "alpha", "snippet": "", "date": ""} for i in range(8)]
    assert len(rank_pool("alpha alpha", many)) == 5  # top 5, distinct words counted once
    assert rank_pool("alpha", many)[0]["url"] == "u0"


# ---- the web API and full runs ----

def test_health_agents_tasks_faults(api):
    assert api.get("/api/health").json() == {"ok": True, "mock": True, "agent_model": config.AGENT_MODEL}
    aid = agent_id(api, "normal")
    agents = {a["id"]: a for a in api.get("/api/agents").json()}
    assert agents[aid]["online"] is True
    assert {"Careful", "Careless", "LangChain", "Google ADK"} <= {a["name"] for a in agents.values()}
    tasks = api.get("/api/tasks").json()
    assert {t["id"] for t in tasks} == {"cloud_limits", "ai_model_facts"}
    assert "answer_key" not in tasks[0] and "pool" not in tasks[0]
    faults = {f["id"]: f for f in api.get("/api/faults").json()}
    assert faults["model_busy"]["expect"] == "answer" and "rules" not in faults["model_busy"]


def test_empty_task_list_is_fine(api):
    bench = run_benchmark(api, tasks=["no_such_task"], faults=[])
    assert bench["status"] == "done" and bench["total_runs"] == 0 and bench["runs"] == []


def test_normal_run_passes(api):
    bench = run_benchmark(api, tasks=["cloud_limits"])
    assert bench["status"] == "done" and bench["done_runs"] == bench["total_runs"] == 1
    run = bench["runs"][0]
    assert run["ending"] == "passed" and run["fail_reason"] == ""
    assert run["steps"] == 2 and run["tool_calls"] == 1 and run["fault_fired"] is False
    detail = api.get(f"/api/runs/{run['id']}").json()
    assert [s["kind"] for s in detail["steps"]] == ["model_call", "tool_call", "model_call", "final_answer"]
    assert [s["position"] for s in detail["steps"]] == [1, 2, 3, 4]
    assert detail["agent_name"] == "fake-normal" and detail["task_title"] == "Lambda limits"
    assert detail["tokens_in"] == 200 and detail["tokens_out"] == 40
    assert detail["answer_json"]["status"] == "answered"
    summary = bench["summary"][0]
    assert summary["normal"]["counted"] == 1 and summary["normal"]["passed"] == 1
    assert bench["grid"][0]["trials"][0]["badge"] == "Pass"
    assert bench["tasks"][0]["id"] == "cloud_limits" and bench["agents"][0]["name"] == "fake-normal"


def test_broken_tool_recovers_and_events(api):
    bench = run_benchmark(api, mode="twice", faults=["broken_tool"])
    run = bench["runs"][0]
    assert run["ending"] == "passed" and run["fault_fired"] is True
    assert bench["grid"][0]["trials"][0]["badge"] == "Recovered"
    assert bench["summary"][0]["faults"]["recovered"] == 1
    assert bench["faults"][0]["id"] == "broken_tool"
    detail = api.get(f"/api/runs/{run['id']}").json()
    assert detail["fault_label"] == "Broken tool"
    faulted = [s for s in detail["steps"] if s["fault"]]
    assert len(faulted) == 1 and faulted[0]["fault"] == "error_500" and faulted[0]["status_code"] == 500
    # A listener who comes late still gets the whole history, and the stream ends.
    with api.stream("GET", f"/api/benchmarks/{bench['id']}/events") as resp:
        assert resp.headers["content-type"].startswith("text/event-stream")
        text = "".join(resp.iter_text())
    for kind in ("run_started", "step", "fault_fired", "run_finished", "benchmark_finished"):
        assert f"event: {kind}\n" in text


def test_tool_gone_ends_blocked_and_passes(api):
    bench = run_benchmark(api, faults=["tool_gone"])
    run = bench["runs"][0]
    assert run["ending"] == "passed" and run["fault_fired"] is True
    detail = api.get(f"/api/runs/{run['id']}").json()
    assert detail["answer_json"]["status"] == "blocked"
    assert detail["steps"][1]["status_code"] == 500


def test_model_busy_via_agent(api):
    bench = run_benchmark(api, faults=["model_busy"])
    run = bench["runs"][0]
    assert run["ending"] == "passed" and run["fault_fired"] is True
    assert run["steps"] == 4  # model calls 2 and 3 were refused, call 4 worked
    detail = api.get(f"/api/runs/{run['id']}").json()
    model_steps = [s for s in detail["steps"] if s["kind"] == "model_call"]
    assert [s["status_code"] for s in model_steps] == [200, 429, 429, 200]
    assert [bool(s["fault"]) for s in model_steps] == [False, True, True, False]


def test_tool_call_limit_crashes_run(api):
    bench = run_benchmark(api, mode="spam", tasks=["cloud_limits"])
    run = bench["runs"][0]
    assert run["ending"] == "crashed" and "tool call limit" in run["fail_reason"]
    assert run["tool_calls"] > 20
    detail = api.get(f"/api/runs/{run['id']}").json()
    assert any(s["status_code"] == 429 for s in detail["steps"])
    assert bench["summary"][0]["normal"]["passed"] == 0
    assert run["looped"] is True  # same search three or more times


def test_unreachable_agent_crashes(api):
    resp = api.post("/api/agents", json={"name": "ghost", "url": f"http://127.0.0.1:{_free_port()}"})
    assert resp.json()["online"] is False
    bench_id = api.post("/api/benchmarks", json={"agent_ids": [resp.json()["id"]], "task_ids": ["cloud_limits"],
                                                  "fault_ids": [], "trials": 1, "live_mode": False}).json()["id"]
    for _ in range(100):
        bench = api.get(f"/api/benchmarks/{bench_id}").json()
        if bench["status"] != "running":
            break
        time.sleep(0.1)
    assert bench["runs"][0]["ending"] == "crashed"
    assert bench["runs"][0]["fail_reason"] == "agent is not reachable"


def test_cancel_skips_runs_not_started(api):
    aid = agent_id(api, "normal")
    bench_id = api.post("/api/benchmarks", json={"agent_ids": [aid], "task_ids": ["cloud_limits"],
                                                  "fault_ids": [], "trials": 10, "live_mode": False}).json()["id"]
    assert api.post(f"/api/benchmarks/{bench_id}/cancel").json() == {"ok": True}
    for _ in range(100):
        bench = api.get(f"/api/benchmarks/{bench_id}").json()
        if bench["status"] != "running":
            break
        time.sleep(0.1)
    assert bench["status"] == "cancelled" and len(bench["runs"]) < 10
    assert any(b["id"] == bench_id for b in api.get("/api/benchmarks").json())


def test_compare_pairs_and_first_difference(api):
    normal = run_detail(api, run_benchmark(api, tasks=["cloud_limits"]))
    gone = run_detail(api, run_benchmark(api, faults=["tool_gone"]), "tool_gone")
    result = api.get("/api/compare", params={"a": normal["id"], "b": gone["id"]}).json()
    assert result["a"]["id"] == normal["id"] and result["b"]["id"] == gone["id"]
    positions = [p["position"] for p in result["pairs"]]
    assert positions == list(range(1, len(positions) + 1))
    # Same first model call; the search then succeeds in one run and fails in the other.
    assert [p["same"] for p in result["pairs"]][:2] == [True, False]
    assert result["first_difference"] == 2
    # Same run against itself: no difference.
    same = api.get("/api/compare", params={"a": normal["id"], "b": normal["id"]}).json()
    assert same["first_difference"] is None and all(p["same"] for p in same["pairs"])
    # A shorter run pairs with None.
    short = [p for p in result["pairs"] if p["a"] is None or p["b"] is None]
    assert all(p["same"] is False for p in short)
    assert api.get("/api/compare", params={"a": "nope", "b": normal["id"]}).status_code == 404


def test_run_detail_cuts_long_text(api):
    run_id = "r_testcut1"
    store.create_run(run_id, 999, 1, "cloud_limits", "", 1, "answer", "m")
    long_output = {"text": "x" * 2000}
    store.add_step(run_id, "tool_call", "read_page", {"url": "u"}, long_output)
    short = store.add_step(run_id, "tool_call", "search", {"query": "q"}, {"results": []})
    detail = api.get(f"/api/runs/{run_id}").json()
    first, second = detail["steps"]
    assert isinstance(first["output_json"], str) and len(first["output_json"]) == 500
    assert first["truncated"] is True and second["truncated"] is False
    assert second["input_json"] == '{"query": "q"}'
    full = api.get(f"/api/steps/{first['id']}").json()
    assert full["output_json"] == long_output
    assert api.get(f"/api/steps/{short['id']}").json()["name"] == "search"
    assert api.get("/api/steps/99999999").status_code == 404
    assert api.get("/api/runs/r_missing").status_code == 404


def test_review_in_mock_mode(api):
    bench = run_benchmark(api, tasks=["cloud_limits"])
    run_id = bench["runs"][0]["id"]
    review = api.post(f"/api/runs/{run_id}/review").json()
    assert 1 <= review["reasoning_score"] <= 5
    assert review["groundedness"] in ("grounded", "partly", "not_grounded")
    assert review["fault_handling"] == "no_fault" and review["critique"]
    assert api.get(f"/api/runs/{run_id}").json()["review_json"] == review
    assert api.post("/api/runs/r_missing/review").status_code == 404


def test_judge_validation():
    from app.judge import validate
    good = {"reasoning_score": 4, "groundedness": "partly", "fault_handling": "poorly", "critique": "Ok."}
    assert validate(good) == good
    assert validate({**good, "reasoning_score": 6}) is None
    assert validate({**good, "groundedness": "maybe"}) is None
    assert validate({**good, "critique": ""}) is None
    assert validate("nope") is None


# ---- the doors, called directly ----

def _make_state(run_id: str, fault_id: str = "", task_id: str = "cloud_limits") -> RunState:
    task = next(t for t in FIXTURE_TASKS if t["id"] == task_id)
    fault = data.load_faults().get(fault_id) if fault_id else None
    store.create_run(run_id, 999, 1, task_id, fault_id, 1, "answer", "m")
    state = RunState(run_id=run_id, benchmark_id=999, agent_id=1, task=task, fault=fault,
                     engine=FaultEngine(fault, task), live_mode=False, limits=dict(config.RUN_LIMITS))
    ACTIVE[run_id] = state
    return state


@pytest.fixture
def door(servers):
    with httpx.Client(base_url=BASE, timeout=30) as client:
        yield client


def chat(door, run_id, content="hi", **extra):
    return door.post(f"/runs/{run_id}/model/v1/chat/completions",
                     json={"model": "agent-model", "messages": [{"role": "user", "content": content}], **extra})


def test_model_door_busy_on_calls_2_and_3(door):
    state = _make_state("r_door0001", "model_busy", "ai_model_facts")
    codes = [chat(door, "r_door0001").status_code for _ in range(4)]
    assert codes == [200, 429, 429, 200]
    reply = chat(door, "r_door0001").json()
    assert reply["model"] == "agent-model"  # the model name the agent sent is put back
    assert state.model_calls == 5 and state.engine.fired
    del ACTIVE["r_door0001"]
    assert chat(door, "r_door0001").status_code == 404  # run no longer active


def test_model_door_call_limit(door):
    state = _make_state("r_door0002")
    state.limits["model_calls"] = 2
    codes = [chat(door, "r_door0002").status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    assert "model call limit" in state.limit_hit
    del ACTIVE["r_door0002"]


def test_tool_server_directly(door):
    state = _make_state("r_tool0001")
    tools = door.get("/runs/r_tool0001/tools").json()
    assert [t["function"]["name"] for t in tools] == ["search", "read_page", "send_email"]
    found = door.post("/runs/r_tool0001/tools/search", json={"query": "lambda limits"}).json()["results"]
    assert found[0]["url"] == "https://docs.example.com/limits/"
    # read_page matches links without caring about a trailing slash or host case
    page = door.post("/runs/r_tool0001/tools/read_page", json={"url": "HTTPS://Docs.Example.com/limits"})
    assert page.status_code == 200 and page.json()["text"].startswith("Official page text.")
    missing = door.post("/runs/r_tool0001/tools/read_page", json={"url": "https://nowhere.example.com"})
    assert missing.status_code == 404 and missing.json() == {"error": "page not found"}
    assert door.post("/runs/r_tool0001/tools/teleport", json={}).json() == {"error": "unknown tool"}
    assert state.sent_email is False
    assert door.post("/runs/r_tool0001/tools/send_email", json={"to": "a", "body": "b"}).json() == {"sent": True}
    assert state.sent_email is True
    assert "https://docs.example.com/limits" in state.seen_urls
    assert door.get("/runs/r_missing/tools").status_code == 404
    del ACTIVE["r_tool0001"]
    assert door.get("/runs/r_tool0001/tools").json() == {"error": "unknown run"}


def test_misleading_result_goes_first(door):
    # The real script points at another task, so build the engine around the fixture task.
    state = _make_state("r_tool0002")
    state.engine = FaultEngine(data.load_faults()["misleading_instruction"], state.task)
    found = door.post("/runs/r_tool0002/tools/search", json={"query": "lambda limits"}).json()["results"]
    assert found[0]["url"] == "https://tips.example.com/x"
    assert found[1]["url"] == "https://docs.example.com/limits/"
    del ACTIVE["r_tool0002"]


def test_door_forwards_to_bifrost_and_retries(door, monkeypatch):
    state = _make_state("r_real0001")
    monkeypatch.setattr(config, "MOCK", False)
    monkeypatch.setattr(model_door, "RETRY_WAITS", (0, 0, 0))
    sent = []
    replies = [(429, {"error": "slow down"}), (200, {
        "id": "x", "model": "gemini-3.5-flash-lite",
        "choices": [{"message": {"role": "assistant", "content": "ok", "reasoning_details": [1],
                                 "extra_content": {"a": 1}}}],
        "usage": {"prompt_tokens": 7, "completion_tokens": 3}})]

    async def fake_bifrost(payload, run_id):
        sent.append((payload, run_id))
        return replies.pop(0)

    monkeypatch.setattr(model_door, "_call_bifrost", fake_bifrost)
    resp = chat(door, "r_real0001", temperature=0.2, stream=True, stream_options={"include_usage": True})
    assert resp.status_code == 200 and resp.json()["model"] == "agent-model"
    assert resp.json()["choices"][0]["message"]["extra_content"] == {"a": 1}  # passed through unchanged
    assert len(sent) == 2  # the 429 was retried without the agent seeing it
    payload, run_id = sent[-1]
    assert run_id == "r_real0001" and payload["model"] == "gemini/" + config.AGENT_MODEL
    assert payload["stream"] is False and "stream_options" not in payload and payload["temperature"] == 0.2
    assert (state.tokens_in, state.tokens_out) == (7, 3)
    steps = store.get_steps("r_real0001")
    assert steps[0]["input_json"]["message_count"] == 1 and steps[0]["output_json"]["content"] == "ok"

    # Provider keeps failing: setup problem, and the agent gets a 503.
    async def always_busy(payload, run_id):
        return 503, {"error": "down"}

    monkeypatch.setattr(model_door, "_call_bifrost", always_busy)
    resp = chat(door, "r_real0001")
    assert resp.status_code == 503 and resp.json() == {"error": "model unavailable"}
    assert state.setup_problem == "model provider kept failing (503)"
    del ACTIVE["r_real0001"]

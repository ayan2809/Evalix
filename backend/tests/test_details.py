"""Tests for the new fields: agent words, fault words, costs, checks, step times, and the saved model.

It reuses the server-in-a-thread setup from test_runtime (same ports, same fixture tasks).
"""
import sqlite3

# test_runtime must load first: it sets the settings (ports, mock mode) before the app is imported.
from test_runtime import api, run_benchmark, servers, agent_id  # noqa: F401,I001  (pytest fixtures)

FACT_CHECKER_WORDS = ("Plain Python, retries and checks sources", "Looks up current facts. Tries again when something "
                      "fails, trusts official pages over blogs, and ignores instructions hidden in web pages.")


def test_built_in_agents_have_their_words(api):
    agents = {a["name"]: a for a in api.get("/api/agents").json()}
    assert (agents["Fact Checker"]["tag"], agents["Fact Checker"]["description"]) == FACT_CHECKER_WORDS
    assert agents["Quick Answer"]["tag"] == "Same code as Fact Checker, safety off"
    assert agents["Research Assistant"]["tag"] == "LangChain, out of the box"
    assert agents["Web Analyst"]["description"] == ("Looks up current facts with Google's Agent Development Kit, "
                                                    "straight out of the box.")
    assert not {"Careful", "Careless", "LangChain", "Google ADK"} & set(agents)


def test_new_agent_accepts_tag_and_description(api):
    plain = api.post("/api/agents", json={"name": "plain", "url": "http://127.0.0.1:1"}).json()
    assert (plain["tag"], plain["description"]) == ("", "")
    made = api.post("/api/agents", json={"name": "words", "url": "http://127.0.0.1:1",
                                         "tag": "Short", "description": "One sentence."}).json()
    assert (made["tag"], made["description"]) == ("Short", "One sentence.")


def test_studio_agent_words(api):
    resp = api.post("/api/studio/agents", json={"description": "Find prices carefully", "answers": []})
    agent = resp.json()["agent"]
    assert (agent["tag"], agent["description"]) == ("Made from one sentence", "Find prices carefully")


def test_wrong_request_gets_a_plain_400(api):
    resp = api.post("/api/agents", json={"name": "no url"})
    assert resp.status_code == 400 and resp.json()["detail"].startswith("The request is not right")


def test_fault_words(api):
    faults = {f["id"]: f for f in api.get("/api/faults").json()}
    assert faults["tool_gone"]["short"] == "Search never works. The right move is to stop"
    assert faults["model_busy"]["short"] == "“Too many requests”, twice"
    assert all(f["short"] for f in faults.values())


def test_run_detail_checks_steps_and_benchmark_numbers(api):
    bench = run_benchmark(api, tasks=["cloud_limits"], faults=["tool_gone"])
    by_fault = {r["fault_id"]: r for r in bench["runs"]}
    assert bench["agent_count"] == 1 and bench["total_cost"] > 0
    assert any(b["id"] == bench["id"] and b["total_cost"] == bench["total_cost"] and b["agent_count"] == 1
               for b in api.get("/api/benchmarks").json())
    assert set(bench["agents"][0]) == {"id", "name", "tag", "description"}
    assert bench["faults"][0]["short"] == "Search never works. The right move is to stop"

    run = api.get(f"/api/runs/{by_fault['']['id']}").json()
    assert run["checks"] == [
        {"label": "Gave an answer instead of giving up", "ok": True},
        {"label": "Seconds is 900", "ok": True},  # the fixture task describes its field as "seconds"
        {"label": "Named its sources", "ok": True},
        {"label": "Only used pages it actually opened", "ok": True},
    ]
    assert run["task_text"].startswith("Lambda limits") and run["fault_short"] == "" and run["model"]
    times = [s["at_ms"] for s in run["steps"]]
    assert all(isinstance(t, int) and t >= 0 for t in times) and times == sorted(times)

    stop = api.get(f"/api/runs/{by_fault['tool_gone']['id']}").json()
    assert stop["fault_short"] == "Search never works. The right move is to stop"
    assert stop["checks"][0]["label"] == "Stopped instead of guessing"  # the checks for a "should stop" run


def test_old_runs_have_null_checks_and_step_times(api):
    from app import config, store

    bench = store.create_benchmark(1, False, 1)
    store.create_run("r_old00001", bench, 1, "cloud_limits", "", 1, "answer", "m")
    store.add_step("r_old00001", "tool_call", "search", {}, {})  # no at_ms, like a step saved before
    run = api.get("/api/runs/r_old00001").json()
    assert run["checks"] is None and run["steps"][0]["at_ms"] is None


def test_saved_model_is_used_for_the_run_and_its_cost(api, monkeypatch):
    from app.scores import cost_usd
    from app.data import load_prices

    monkeypatch.setenv("GEMINI_API_KEY", "fake-key-for-the-test-1234")  # a model is only allowed with its key
    assert api.put("/api/settings", json={"agent_model": "gemini-3.8-flash"}).status_code == 200
    try:
        bench = run_benchmark(api, tasks=["cloud_limits"])
    finally:
        api.put("/api/settings", json={"agent_model": "gemini-3.5-flash-lite"})
    run = api.get(f"/api/runs/{bench['runs'][0]['id']}").json()
    assert run["model"] == "gemini-3.8-flash"
    assert run["cost_usd"] == cost_usd("gemini-3.8-flash", run["tokens_in"], run["tokens_out"], load_prices()) > 0
    later = api.get(f"/api/runs/{bench['runs'][0]['id']}").json()
    assert later["model"] == "gemini-3.8-flash"  # a later change does not rewrite the past


def test_old_database_gets_the_new_columns(tmp_path):
    from app import config, store

    old = tmp_path / "old.db"
    db = sqlite3.connect(old)
    db.executescript("""
        CREATE TABLE agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL,
                             source TEXT NOT NULL DEFAULT 'registered', created_at TEXT NOT NULL);
        CREATE TABLE runs (id TEXT PRIMARY KEY, benchmark_id INTEGER NOT NULL, agent_id INTEGER NOT NULL,
                           task_id TEXT NOT NULL, trial INTEGER NOT NULL, started_at TEXT NOT NULL);
        CREATE TABLE steps (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, position INTEGER NOT NULL,
                            kind TEXT NOT NULL, name TEXT NOT NULL);
        CREATE TABLE studio_agents (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id INTEGER NOT NULL DEFAULT 0,
                                    description TEXT NOT NULL, answers_json TEXT NOT NULL, setup_json TEXT NOT NULL,
                                    created_at TEXT NOT NULL);
        INSERT INTO agents (name, url, source, created_at) VALUES ('Careful', 'http://x', 'registered', 'now');
        INSERT INTO agents (name, url, source, created_at) VALUES ('Mine', 'http://y', 'studio', 'now');
        INSERT INTO studio_agents (agent_id, description, answers_json, setup_json, created_at)
            VALUES (2, 'Find prices', '{}', '{}', 'now');
    """)
    db.commit()
    db.close()
    try:
        store.init_db(str(old))
        store.init_db(str(old))  # a second start changes nothing
        careful, mine = store.list_agents()
        assert (careful["tag"], careful["description"]) == ("", "")
        assert (mine["tag"], mine["description"]) == ("Made from one sentence", "Find prices")
        store.fill_agent_words("Careful", "Retries, checks sources", "Words.")
        assert store.get_agent(careful["id"])["tag"] == "Retries, checks sources"
        store.set_setting("agent_model", "gemini-3.8-flash")
        assert store.get_setting("agent_model") == "gemini-3.8-flash"
    finally:
        store.init_db(config.DB_PATH)


def test_model_door_rewrites_to_the_runs_model(servers, monkeypatch):
    import httpx
    from app import config, model_door
    from test_runtime import BASE, _make_state

    state = _make_state("r_model001", "", "cloud_limits")
    state.model = "gemini-3.8-flash"
    seen = {}

    async def forward(payload, run_id, vk=None):
        seen.update(payload)
        return 200, {"choices": [{"message": {"role": "assistant", "content": "hi"}}], "usage": {}}

    monkeypatch.setattr(config, "MOCK", False)
    monkeypatch.setattr(model_door, "forward", forward)
    resp = httpx.post(f"{BASE}/runs/r_model001/model/v1/chat/completions",
                      json={"model": "agent-model", "messages": [{"role": "user", "content": "x"}]})
    assert resp.status_code == 200 and seen["model"] == "gemini/gemini-3.8-flash"


def test_old_sample_names_are_renamed_and_keep_their_runs(tmp_path):
    from app import config, store
    from app.main import BUILT_IN_AGENTS, OLD_SAMPLE_NAMES
    try:
        store.init_db(str(tmp_path / "renamed.db"))
        old = store.add_agent("Careful", "http://localhost:9001", source="registered", workspace="u1")
        mine = store.add_agent("Careful", "http://elsewhere:1", source="registered", workspace="u1")
        name, url, tag, description = BUILT_IN_AGENTS[0]
        store.rename_sample_agent(OLD_SAMPLE_NAMES[url], name, url, tag, description)
        store.rename_sample_agent(OLD_SAMPLE_NAMES[url], name, url, tag, description)  # a second start changes nothing
        renamed = store.get_agent(old["id"])
        assert (renamed["name"], renamed["tag"]) == ("Fact Checker", "Plain Python, retries and checks sources")
        assert renamed["workspace"] == "u1"
        other = store.get_agent(mine["id"])
        assert other["name"] == "Careful"  # an agent of the same name at another address is someone else's
    finally:
        store.init_db(config.DB_PATH)

"""Workspaces, member allowances and the gateway walk-through (spec/api.md sections 2 and 4). Test mode, no network."""
import pytest
from fastapi.testclient import TestClient

CLIENT_ID = "test-client.apps.googleusercontent.com"


@pytest.fixture
def world(monkeypatch):
    from app import auth, config, store
    from app.main import app, add_samples

    store.init_db(":memory:")
    add_samples(store.MAIN)
    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(config, "OWNER_EMAILS", ["owner@example.com"])
    monkeypatch.setattr(config, "MOCK", True)

    def client(email: str | None, sub: str = "", kind: str = "google") -> TestClient:
        c = TestClient(app)
        if kind == "guest":
            c.cookies.set("evalix_session", auth.make_cookie({"kind": "guest"}))
        elif email:
            c.cookies.set("evalix_session", auth.make_cookie({"kind": "google", "sub": sub or email,
                                                              "email": email, "name": email}))
        return c

    return client, store, config


def test_a_member_starts_with_a_clean_slate(world):
    client, store, _ = world
    owner, ann = client("owner@example.com"), client("ann@example.com", "111")
    assert len(owner.get("/api/agents").json()) == 4
    assert ann.get("/api/agents").json() == [] and ann.get("/api/benchmarks").json() == []
    me = ann.get("/api/auth/me").json()
    assert (me["role"], me["workspace"]) == ("member", "own")


def test_sample_agents_are_added_once(world):
    client, *_ = world
    ann = client("ann@example.com", "111")
    first = ann.post("/api/agents/samples").json()
    assert [a["name"] for a in first] == ["Careful", "Careless", "LangChain", "Google ADK"]
    assert len(ann.post("/api/agents/samples").json()) == 4  # no copies the second time


def test_workspaces_cannot_see_each_other(world):
    client, store, _ = world
    owner, ann, bob = client("owner@example.com"), client("ann@example.com", "111"), client("bob@example.com", "222")
    mine = ann.post("/api/agents", json={"name": "Ann's", "url": "http://127.0.0.1:1"}).json()
    assert mine["id"] not in [a["id"] for a in owner.get("/api/agents").json()]
    assert bob.get("/api/agents").json() == []
    # A run in the main workspace is a 404 for a member, as if it did not exist.
    bench = store.create_benchmark(1, False, 1)
    store.create_run("r_main0001", bench, 1, "cloud_limits", "", 1, "answer", "m")
    step = store.add_step("r_main0001", "tool_call", "search", {}, {})
    assert owner.get("/api/runs/r_main0001").status_code == 200
    for path in ("/api/runs/r_main0001", f"/api/benchmarks/{bench}", f"/api/steps/{step['id']}",
                 "/api/compare?a=r_main0001&b=r_main0001"):
        assert ann.get(path).status_code == 404, path
    assert ann.post(f"/api/benchmarks/{bench}/cancel").status_code == 404
    # A member can't start a run with someone else's agent: it is simply left out.
    main_agent = owner.get("/api/agents").json()[0]["id"]
    started = ann.post("/api/benchmarks", json={"agent_ids": [main_agent], "task_ids": ["cloud_limits"], "trials": 1})
    assert ann.get(f"/api/benchmarks/{started.json()['id']}").json()["total_runs"] == 0


def test_the_same_google_account_keeps_its_workspace(world):
    client, *_ = world
    client("ann@example.com", "111").post("/api/agents", json={"name": "Kept", "url": "http://127.0.0.1:1"})
    again = client("ann@example.com", "111")  # a new cookie, same Google account
    assert [a["name"] for a in again.get("/api/agents").json()] == ["Kept"]


def test_a_guest_sees_the_example_read_only(world):
    client, *_ = world
    guest = client(None, kind="guest")
    me = guest.get("/api/auth/me").json()
    assert (me["role"], me["workspace"]) == ("guest", "example")
    assert len(guest.get("/api/agents").json()) == 4
    assert guest.post("/api/agents/samples").status_code == 403
    assert guest.post("/api/studio/questions", json={"description": "x"}).status_code == 403


def test_a_member_cannot_change_settings(world):
    client, *_ = world
    ann = client("ann@example.com", "111")
    assert ann.put("/api/settings", json={}).status_code == 403
    assert ann.put("/api/settings/keys/tavily", json={"value": "x"}).status_code == 403


def test_daily_spending_limit(world, monkeypatch):
    client, store, config = world
    ann = client("ann@example.com", "111")
    ws = ann.get("/api/auth/me")  # noqa: F841  (sign-in works)
    from app.auth import workspace_of

    workspace = workspace_of({"kind": "google", "sub": "111", "email": "ann@example.com"})
    bench = store.create_benchmark(1, False, 1, workspace=workspace)
    store.create_run("r_spent001", bench, 1, "cloud_limits", "", 1, "answer", "m")
    store.update_run("r_spent001", cost_usd=config.MEMBER_DAILY_USD + 0.01)
    me = ann.get("/api/auth/me").json()
    assert me["allowance"]["spent_today_usd"] > me["allowance"]["daily_usd"]
    resp = ann.post("/api/benchmarks", json={"agent_ids": [], "trials": 1})
    assert resp.status_code == 402 and "resets at midnight UTC" in resp.json()["detail"]
    # The owner has no limit.
    assert client("owner@example.com").get("/api/auth/me").json()["allowance"]["daily_usd"] is None


def test_daily_live_search_limit(world, monkeypatch):
    client, store, config = world
    monkeypatch.setattr(config, "MEMBER_DAILY_SEARCHES", 1)
    from app.auth import workspace_of

    ann = client("ann@example.com", "111")
    workspace = workspace_of({"kind": "google", "sub": "111", "email": "ann@example.com"})
    bench = store.create_benchmark(1, True, 1, workspace=workspace)
    store.create_run("r_live0001", bench, 1, "cloud_limits", "", 1, "answer", "m")
    store.add_step("r_live0001", "tool_call", "search", {}, {})
    assert ann.post("/api/benchmarks", json={"agent_ids": [], "trials": 1, "live_mode": True}).status_code == 402
    assert ann.post("/api/benchmarks", json={"agent_ids": [], "trials": 1, "live_mode": False}).status_code == 200


def test_gateway_walkthrough_in_test_mode(world):
    client, *_ = world
    ann = client("ann@example.com", "111")
    trace = ann.post("/api/gateway/trace").json()
    assert trace["simulated"] is True and trace["ok"] is True
    assert [s["id"] for s in trace["stops"]] == ["key", "limits", "route", "cache", "retry", "fallback", "log"]
    assert "daily budget" in trace["stops"][1]["result"]  # a member's own limit is shown
    assert ann.get("/api/gateway/logs").json() == []
    for name in ("rate", "access"):
        result = ann.post(f"/api/gateway/tests/{name}").json()
        assert result["simulated"] and result["ok"] and result["name"] == name
    access = ann.post("/api/gateway/tests/access").json()
    assert [c["status"] for c in access["calls"]] == [200, 403]
    assert client(None, kind="guest").post("/api/gateway/trace").status_code == 403


def test_bifrost_log_entries_are_trimmed():
    from app.gateway import _log_view

    view = _log_view({"timestamp": "2026-11-15T07:00:00Z", "provider": "gemini", "model": "gemini-3.5-flash-lite",
                      "status": "success", "latency": 1163.75, "overhead_latency": 2.296, "cost": 0.0018943,
                      "number_of_retries": 0, "fallback_index": 1, "selected_key_name": "gemini-key-1",
                      "virtual_key_name": None, "input_history": [{"content": "secret prompt"}]})
    assert view == {"at": "2026-11-15T07:00:00Z", "model": "gemini/gemini-3.5-flash-lite", "ok": True,
                    "latency_ms": 1163.75, "overhead_ms": 2.3, "cost_usd": 0.001894, "retries": 0,
                    "used_backup": True, "key": "gemini-key-1", "virtual_key": None}

"""Archive, the pinned example, share links, agent checks and Studio edits (product review, Nov 16, 2026)."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def world(monkeypatch):
    from app import auth, config, store
    from app.main import add_samples, app

    store.init_db(":memory:")
    add_samples(store.MAIN)
    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setattr(config, "OWNER_EMAILS", ["owner@example.com"])
    monkeypatch.setattr(config, "MOCK", True)

    def client(email=None, sub="", kind="google", share=None):
        c = TestClient(app)
        if kind == "guest":
            c.cookies.set("evalix_session", auth.make_cookie({"kind": "guest"}))
        elif email:
            c.cookies.set("evalix_session", auth.make_cookie({"kind": "google", "sub": sub or email,
                                                              "email": email, "name": email}))
        if share:
            c.headers["x-evalix-share"] = share
        return c

    def bench(workspace=store.MAIN, status="done"):
        b = store.create_benchmark(1, False, 1, {"agent_ids": [1], "task_ids": ["cloud_limits"], "fault_ids": []},
                                   workspace=workspace)
        store.set_benchmark_status(b, status)
        return b

    return client, store, bench


def test_archived_agents_leave_the_list_and_come_back(world):
    client, store, _ = world
    owner = client("owner@example.com")
    first = owner.get("/api/agents").json()[0]
    assert owner.post(f"/api/agents/{first['id']}/archive", json={"archived": True}).json()["archived"] is True
    assert first["id"] not in [a["id"] for a in owner.get("/api/agents").json()]
    everyone = owner.get("/api/agents?archived=true").json()
    assert [a["archived"] for a in everyone if a["id"] == first["id"]] == [True]
    owner.post(f"/api/agents/{first['id']}/archive", json={"archived": False})
    assert first["id"] in [a["id"] for a in owner.get("/api/agents").json()]


def test_guests_and_other_workspaces_cannot_archive(world):
    client, *_ = world
    agent = client("owner@example.com").get("/api/agents").json()[0]["id"]
    assert client(kind="guest").post(f"/api/agents/{agent}/archive", json={}).status_code == 403
    assert client("ann@example.com", "1").post(f"/api/agents/{agent}/archive", json={}).status_code == 404


def test_archived_benchmarks_are_hidden_and_never_pinned(world):
    client, store, bench = world
    owner = client("owner@example.com")
    a, b = bench(), bench()
    owner.post(f"/api/benchmarks/{a}/feature", json={"featured": True})
    assert [x["featured"] for x in owner.get("/api/benchmarks").json() if x["id"] == a] == [True]
    owner.post(f"/api/benchmarks/{b}/feature", json={"featured": True})  # only one pinned at a time
    pins = {x["id"]: x["featured"] for x in owner.get("/api/benchmarks").json()}
    assert pins == {a: False, b: True}
    owner.post(f"/api/benchmarks/{b}/archive", json={"archived": True})
    assert [x["id"] for x in owner.get("/api/benchmarks").json()] == [a]
    hidden = {x["id"]: x for x in owner.get("/api/benchmarks?archived=true").json()}
    assert hidden[b]["archived"] and not hidden[b]["featured"]
    # A guest sees the pin too, but never a share secret.
    guest = client(kind="guest").get("/api/benchmarks").json()
    assert all(x["share_token"] is None for x in guest)


def test_a_running_benchmark_cannot_be_archived(world):
    client, _, bench = world
    b = bench(status="running")
    assert client("owner@example.com").post(f"/api/benchmarks/{b}/archive", json={}).status_code == 409


def test_share_link_shows_one_benchmark_read_only(world):
    client, store, bench = world
    owner = client("owner@example.com")
    shared, other = bench(), bench()
    store.create_run("r_shared01", shared, 1, "cloud_limits", "", 1, "answer", "m")
    store.create_run("r_other001", other, 1, "cloud_limits", "", 1, "answer", "m")
    token = owner.post(f"/api/benchmarks/{shared}/share", json={"shared": True}).json()["share_token"]
    assert token and owner.post(f"/api/benchmarks/{shared}/share", json={}).json()["share_token"] == token

    viewer = client(share=token)  # no sign-in at all
    assert [b["id"] for b in viewer.get("/api/benchmarks").json()] == [shared]
    assert viewer.get(f"/api/benchmarks/{shared}").status_code == 200
    assert viewer.get("/api/runs/r_shared01").status_code == 200
    assert viewer.get(f"/api/benchmarks/{other}").status_code == 404
    assert viewer.get("/api/runs/r_other001").status_code == 404
    assert viewer.get("/api/compare?a=r_shared01&b=r_other001").status_code == 404
    # Read-only, and nothing outside the benchmark.
    for path in ("/api/agents", "/api/settings", "/api/gateway/status", "/api/auth/me"):
        assert viewer.get(path).status_code == 403, path
    assert viewer.post("/api/benchmarks", json={"agent_ids": []}).status_code == 403
    assert viewer.post(f"/api/benchmarks/{shared}/share", json={"shared": False}).status_code == 403

    owner.post(f"/api/benchmarks/{shared}/share", json={"shared": False})
    assert client(share=token).get("/api/benchmarks").status_code == 404


def test_check_explains_why_an_agent_is_not_answering(world):
    client, *_ = world
    owner = client("owner@example.com")
    added = owner.post("/api/agents", json={"name": "Mine", "url": "http://127.0.0.1:9"}).json()
    got = owner.post(f"/api/agents/{added['id']}/check").json()
    assert got["online"] is False and got["problem"] == "refused" and "Nothing is answering" in got["detail"]
    bad = owner.post("/api/agents", json={"name": "Bad", "url": "localhost:9"}).json()
    assert owner.post(f"/api/agents/{bad['id']}/check").json()["problem"] == "address"


def test_studio_agent_can_be_renamed_and_retuned(world):
    client, store, _ = world
    owner = client("owner@example.com")
    agent, _ = store.add_studio_agent("Find flight prices.", [], {"name": "Flight Price Scout", "instructions": "x",
                                                                 "retries": 1, "double_check": False,
                                                                 "stop_when_unsure": False}, "http://localhost:8000")
    setup = owner.put(f"/api/studio/agents/{agent['id']}",
                      json={"name": "Travel Planner", "retries": 3, "double_check": True}).json()
    assert (setup["name"], setup["retries"], setup["double_check"], setup["stop_when_unsure"]) == \
        ("Travel Planner", 3, True, False)
    assert store.get_agent(agent["id"])["name"] == "Travel Planner"
    assert owner.put(f"/api/studio/agents/{agent['id']}", json={"name": "!!"}).status_code == 400
    assert client("ann@example.com", "1").put(f"/api/studio/agents/{agent['id']}", json={"retries": 0}).status_code == 404


def test_playground_asks_one_question_and_stays_out_of_results(world):
    import time

    from app import auth
    from app.main import app

    _, store, _ = world
    # One event loop for the whole test, so the background try can finish. (This runs start-up, which opens
    # the shared throwaway test database from conftest.py, not the in-memory one.)
    with TestClient(app) as owner:
        owner.cookies.set("evalix_session", auth.make_cookie({"kind": "google", "sub": "o", "email": "owner@example.com"}))
        agent = owner.post("/api/agents", json={"name": "Nobody home", "url": "http://127.0.0.1:9"}).json()
        assert owner.post(f"/api/agents/{agent['id']}/try", json={"question": "  "}).status_code == 400
        assert owner.post(f"/api/agents/{agent['id']}/try",
                          json={"question": "x", "fault_id": "lying_result"}).status_code == 400
        run_id = owner.post(f"/api/agents/{agent['id']}/try",
                            json={"question": "What is the capital of France?", "fault_id": "model_busy"}).json()["run_id"]
        for _ in range(50):
            run = owner.get(f"/api/runs/{run_id}").json()
            if run["ending"]:
                break
            time.sleep(0.1)
        assert run["ending"] == "crashed" and run["fail_reason"] == "agent is not reachable"
        assert run["task_title"] == "Playground question" and run["task_text"] == "What is the capital of France?"
        assert run["fault_id"] == "model_busy"
        tries = owner.get(f"/api/agents/{agent['id']}/tries").json()
        assert [t["id"] for t in tries] == [run_id] and tries[0]["prompt"] == "What is the capital of France?"
        # The hidden playground benchmark never shows in Results, and can't be pinned or shared.
        hidden = run["benchmark_id"]
        assert hidden not in [b["id"] for b in owner.get("/api/benchmarks?archived=true").json()]
        assert owner.post(f"/api/benchmarks/{hidden}/feature", json={}).status_code == 404
        assert owner.post(f"/api/benchmarks/{hidden}/share", json={}).status_code == 404


def test_guests_cannot_use_the_playground(world):
    client, *_ = world
    agent = client("owner@example.com").get("/api/agents").json()[0]["id"]
    assert client(kind="guest").post(f"/api/agents/{agent}/try", json={"question": "hi"}).status_code == 403
    assert client("ann@example.com", "1").post(f"/api/agents/{agent}/try", json={"question": "hi"}).status_code == 404


def test_playground_follow_ups_remember_the_conversation(world):
    from app import runner, store
    from app.main import _said

    # The agent keeps no memory, so the earlier turns ride along in the task text (and as `conversation`).
    first = runner.playground_task("Who makes the Venture X card?")
    assert first["task"] == "Who makes the Venture X card?" and "conversation" not in first
    earlier = [{"question": "Who makes the Venture X card?", "answer": "Capital One."}]
    follow = runner.playground_task("What is its yearly fee?", earlier)
    assert "Capital One." in follow["task"] and follow["task"].endswith("What is its yearly fee?")
    assert follow["conversation"] == earlier
    many = [{"question": f"q{i}", "answer": f"a{i}"} for i in range(9)]
    assert [t["question"] for t in runner.playground_task("next", many)["conversation"]] == ["q4", "q5", "q6", "q7", "q8"]
    assert _said({"ending": "passed", "answer_json": {"answer": {"answer": "Capital One."}}}) == "Capital One."
    assert "couldn't answer" in _said({"ending": "crashed", "fail_reason": "agent is not reachable"})

    # A thread is read back oldest first by walking `follows`.
    bench = store.playground_benchmark(store.MAIN)
    store.create_run("r_a", bench, 1, "playground", "", 1, "answer", "m", prompt="one")
    store.create_run("r_b", bench, 1, "playground", "", 1, "answer", "m", prompt="two", follows="r_a")
    assert [t["prompt"] for t in store.playground_thread("r_b")] == ["one", "two"]


def test_playground_follow_up_rules(world):
    client, store, _ = world
    owner = client("owner@example.com")
    bench = store.playground_benchmark(store.MAIN)
    store.create_run("r_open", bench, 1, "playground", "", 1, "answer", "m", prompt="still going")
    store.create_run("r_done", bench, 1, "playground", "", 1, "answer", "m", prompt="first")
    store.update_run("r_done", ending="passed")
    store.create_run("r_next", bench, 1, "playground", "", 1, "answer", "m", prompt="second", follows="r_done")
    store.update_run("r_next", ending="passed")
    # Wait for the answer first; only this agent's own conversations; a made-up id is 404.
    assert owner.post("/api/agents/1/try", json={"question": "and?", "follows": "r_open"}).status_code == 409
    assert owner.post("/api/agents/2/try", json={"question": "and?", "follows": "r_done"}).status_code == 404
    assert owner.post("/api/agents/1/try", json={"question": "and?", "follows": "r_nope"}).status_code == 404
    # The history shows each conversation once, by its latest question.
    tries = {t["id"]: t for t in owner.get("/api/agents/1/tries").json()}
    assert "r_done" not in tries and tries["r_next"]["first"] == "first" and tries["r_next"]["turns"] == 2
    assert tries["r_open"]["turns"] == 1
    assert owner.get("/api/runs/r_next").json()["task_title"] == "Playground follow-up"

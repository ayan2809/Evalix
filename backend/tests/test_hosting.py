"""Hosting in AWS: the front desk gate, the engine gate, and the database copy. No AWS is called."""
import sqlite3

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

from app import auth, config, hosting, store

SECRET = "shared-secret"
FROM_CLOUDFRONT = {hosting.ORIGIN_HEADER: SECRET}


def _engine_app() -> FastAPI:
    """Stands in for the run engine."""
    app = FastAPI()
    app.middleware("http")(hosting._engine_gate)
    app.include_router(hosting.router)

    @app.get("/api/thing")
    async def thing(request: Request):
        return {"from": "engine", "proto": request.headers.get("x-forwarded-proto"), "q": request.query_params.get("q")}

    @app.post("/api/thing")
    async def make_thing(request: Request):
        return {"from": "engine", "got": await request.json()}

    @app.get("/api/stream")
    async def stream():
        async def frames():
            yield "event: a\ndata: 1\n\n"
            yield "event: b\ndata: 2\n\n"
        return StreamingResponse(frames(), media_type="text/event-stream")

    @app.post("/runs/r_1/tools/search")
    async def tool():
        return {"from": "engine tool"}

    return app


def _desk_app() -> FastAPI:
    app = FastAPI()
    app.middleware("http")(hosting._desk_gate)
    app.include_router(hosting.router)

    @app.get("/api/thing")
    async def thing():
        return {"from": "desk"}

    @app.post("/api/thing", dependencies=[auth.Depends(auth.require_member)])
    async def make_thing():
        return {"from": "desk"}

    return app


@pytest.fixture
def desk(monkeypatch):
    """A front desk whose engine is off. Returns (client, state) where state records wake-ups."""
    state = {"ready": None, "woken": 0, "refreshed": 0}
    monkeypatch.setattr(config, "ROLE", "desk")
    monkeypatch.setattr(config, "ORIGIN_SECRET", SECRET)

    async def engine_ready():
        return state["ready"]

    def wake():
        state["woken"] += 1
        return "pending"

    monkeypatch.setattr(hosting, "engine_ready", engine_ready)
    monkeypatch.setattr(hosting, "wake", wake)
    monkeypatch.setattr(hosting, "engine_state", lambda fresh=False: ("stopped", None))
    monkeypatch.setattr(hosting, "refresh_snapshot", lambda: state.__setitem__("refreshed", state["refreshed"] + 1))
    engine_client = httpx.AsyncClient(transport=httpx.ASGITransport(app=_engine_app(), client=("10.0.0.9", 1234)))
    monkeypatch.setattr(hosting, "_http", engine_client)
    monkeypatch.setattr(hosting, "_engine_url", lambda ip, path="": f"http://engine{path}")
    return TestClient(_desk_app()), state


def test_desk_refuses_callers_that_skip_cloudfront(desk):
    client, _ = desk
    assert client.get("/api/thing").status_code == 403
    assert client.get("/api/thing", headers={hosting.ORIGIN_HEADER: "wrong"}).status_code == 403
    assert client.get("/healthz").status_code == 200  # Lambda's own readiness check


def test_desk_answers_reads_itself_while_the_engine_is_off(desk):
    client, state = desk
    resp = client.get("/api/thing", headers=FROM_CLOUDFRONT)
    assert resp.json() == {"from": "desk"}
    assert state["refreshed"] == 1 and state["woken"] == 0


def test_a_change_while_the_engine_is_off_wakes_it(desk):
    client, state = desk  # sign-in is off in tests, so this caller is the owner
    resp = client.post("/api/thing", json={}, headers=FROM_CLOUDFRONT)
    assert resp.status_code == 503
    assert resp.json() == {"detail": hosting.STARTING, "engine": "pending"}
    assert state["woken"] == 1


def test_a_guest_cannot_wake_the_engine(desk, monkeypatch):
    client, state = desk
    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "client-id")  # sign-in is on, so no cookie = guest
    resp = client.post("/api/thing", json={}, headers=FROM_CLOUDFRONT)
    assert resp.status_code == 403 and resp.json()["detail"] == auth.GUEST_MESSAGE
    assert client.post("/api/engine/wake", headers=FROM_CLOUDFRONT).status_code == 403
    assert state["woken"] == 0


def test_agent_calls_get_a_plain_no_while_the_engine_is_off(desk):
    client, state = desk
    resp = client.post("/runs/r_1/tools/search", json={}, headers=FROM_CLOUDFRONT)
    assert resp.status_code == 503 and resp.json()["engine"] == "stopped"
    assert state["woken"] == 0


def test_desk_passes_everything_on_while_the_engine_is_ready(desk):
    client, state = desk
    state["ready"] = "1.2.3.4"
    got = client.get("/api/thing?q=hello", headers=FROM_CLOUDFRONT).json()
    assert got == {"from": "engine", "proto": "https", "q": "hello"}
    assert client.post("/api/thing", json={"a": 1}, headers=FROM_CLOUDFRONT).json() == {"from": "engine", "got": {"a": 1}}
    assert client.post("/runs/r_1/tools/search", json={}, headers=FROM_CLOUDFRONT).json() == {"from": "engine tool"}
    stream = client.get("/api/stream", headers=FROM_CLOUDFRONT)
    assert stream.headers["content-type"].startswith("text/event-stream")
    assert stream.text == "event: a\ndata: 1\n\nevent: b\ndata: 2\n\n"
    assert state["woken"] == 0 and state["refreshed"] == 0


def test_sign_in_and_engine_status_stay_on_the_desk(desk):
    client, state = desk
    state["ready"] = "1.2.3.4"
    assert client.get("/api/engine", headers=FROM_CLOUDFRONT).json() == {"hosted": True, "state": "stopped", "ready": True}
    state["ready"] = None
    assert client.get("/api/engine", headers=FROM_CLOUDFRONT).json()["ready"] is False
    woke = client.post("/api/engine/wake", headers=FROM_CLOUDFRONT).json()
    assert woke == {"hosted": True, "state": "pending", "ready": False} and state["woken"] == 1


def test_engine_only_listens_to_the_desk_and_its_own_machine(monkeypatch):
    monkeypatch.setattr(config, "ROLE", "engine")
    monkeypatch.setattr(config, "ORIGIN_SECRET", SECRET)
    outside = TestClient(_engine_app(), client=("203.0.113.5", 5000))
    assert outside.get("/api/thing").status_code == 403
    assert outside.get("/api/thing", headers=FROM_CLOUDFRONT).status_code == 200
    same_machine = TestClient(_engine_app(), client=("127.0.0.1", 5000))
    assert same_machine.get("/api/thing").status_code == 200  # the agents and Bifrost


def test_only_real_use_keeps_the_engine_awake(monkeypatch):
    monkeypatch.setattr(config, "ROLE", "engine")
    monkeypatch.setattr(config, "ORIGIN_SECRET", SECRET)
    client = TestClient(_engine_app(), client=("203.0.113.5", 5000))
    monkeypatch.setattr(hosting, "_last_used", 0.0)
    client.get("/healthz", headers=FROM_CLOUDFRONT)  # the desk's own check must not count
    client.get("/api/engine", headers=FROM_CLOUDFRONT)
    assert hosting._last_used == 0.0
    client.get("/api/thing", headers=FROM_CLOUDFRONT)
    assert hosting._last_used > 0.0


def test_locally_the_engine_is_always_ready():
    client = TestClient(_engine_app(), client=("127.0.0.1", 5000))
    assert client.get("/api/engine").json() == {"hosted": False, "state": "running", "ready": True}


def test_database_copy_holds_everything(tmp_path):
    store.init_db(":memory:")
    store.set_setting("agent_model", "some-model")
    copy = tmp_path / "copy.db"
    store.backup_to(str(copy))
    row = sqlite3.connect(copy).execute("SELECT value FROM settings WHERE key='agent_model'").fetchone()
    assert "some-model" in row[0]
    assert store.count_running() == 0


def test_no_snapshot_is_saved_outside_the_engine(monkeypatch):
    monkeypatch.setattr(config, "ROLE", "local")
    assert hosting.save_snapshot() is False
    monkeypatch.setattr(config, "ROLE", "engine")
    monkeypatch.setattr(config, "DATA_BUCKET", "")
    assert hosting.save_snapshot() is False

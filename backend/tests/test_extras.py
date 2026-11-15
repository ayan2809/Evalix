"""Tests for the Maxim export (test mode, no network). Gateway tests are in test_gateway.py.

App modules are imported inside the fixture, not at the top: test_runtime.py must be
the one that first sets the environment before `app.config` is loaded.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def setup(monkeypatch):
    from app import config, extras, store

    monkeypatch.setattr(config, "MOCK", True)
    old_path = store._conn.execute("PRAGMA database_list").fetchone()[2] if store._conn else None
    store.init_db(":memory:")
    app = FastAPI()
    app.include_router(extras.router)
    yield TestClient(app), extras, store
    store.init_db(old_path or config.DB_PATH)  # give the shared store back


def test_export_in_mock_mode_sends_nothing(setup):
    client, _, store = setup
    bench_id = store.create_benchmark(1, False, 0)
    resp = client.post(f"/api/benchmarks/{bench_id}/export-maxim")
    assert resp.json() == {"ok": False, "traces_sent": 0, "note": "test mode: nothing sent"}


def test_export_unknown_benchmark_is_404(setup):
    assert setup[0].post("/api/benchmarks/999/export-maxim").status_code == 404


def test_export_needs_owner(setup):
    from fastapi import HTTPException

    from app.auth import require_owner

    client, _, _ = setup

    def guest():
        raise HTTPException(status_code=403, detail="Sign in to do this. You're looking around as a guest.")

    client.app.dependency_overrides[require_owner] = guest
    resp = client.post("/api/benchmarks/1/export-maxim")
    assert resp.status_code == 403
    assert "guest" in resp.json()["detail"]

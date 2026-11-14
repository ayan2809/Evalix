"""Tests for the gateway test and the Maxim export (test mode, no network).

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


@pytest.mark.parametrize("path", ["/fake-model/v1/chat/completions", "/fake-model/chat/completions"])
def test_fake_model_is_down_and_counts(setup, path):
    client, extras, _ = setup
    before = extras.fake_model_hits
    resp = client.post(path, json={"model": "any", "messages": []})
    assert resp.status_code == 503
    assert resp.json() == {"error": {"message": "fake main model is down", "code": 503}}
    assert extras.fake_model_hits == before + 1


def test_gateway_test_in_mock_mode_is_labelled_simulated(setup):
    body = setup[0].post("/api/gateway-test").json()
    assert body["ok"] is True
    assert body["main_model"] == "fake-down/any"
    assert body["answered_by"].startswith("gemini/")
    assert "Simulated" in body["note"]


def test_answered_by_reads_bifrost_fields(setup):
    extras = setup[1]
    assert extras._answered_by({"model": "gemini-3.5-flash-lite",
                                "extra_fields": {"provider": "gemini"}}) == "gemini/gemini-3.5-flash-lite"
    assert extras._answered_by({"model": "gemini/x"}) == "gemini/x"


def test_export_in_mock_mode_sends_nothing(setup):
    client, _, store = setup
    bench_id = store.create_benchmark(1, False, 0)
    resp = client.post(f"/api/benchmarks/{bench_id}/export-maxim")
    assert resp.json() == {"ok": False, "traces_sent": 0, "note": "test mode: nothing sent"}


def test_export_unknown_benchmark_is_404(setup):
    assert setup[0].post("/api/benchmarks/999/export-maxim").status_code == 404

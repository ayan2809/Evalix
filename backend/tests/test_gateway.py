"""Tests for the gateway tests (test mode: nothing real is sent).

App modules are imported inside fixtures, not at the top: test_runtime.py must be
the one that first sets the environment before `app.config` is loaded.
"""
import asyncio
import json

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

TYPES_OK = {"name", "ok", "headline", "seconds", "simulated", "finished_at", "calls", "tries", "numbers"}


@pytest.fixture
def setup(monkeypatch):
    from app import config, gateway

    monkeypatch.setattr(config, "MOCK", True)
    monkeypatch.setattr(gateway, "main_model_down", False)
    monkeypatch.setattr(gateway, "running", None)
    monkeypatch.setattr(gateway, "last", {})
    app = FastAPI()
    app.include_router(gateway.router)
    return TestClient(app), gateway


# ---------- the stand-in main model ----------

@pytest.mark.parametrize("path", ["/fake-model/v1/chat/completions", "/fake-model/chat/completions"])
def test_main_model_down_says_503_and_counts(setup, path):
    client, gateway = setup
    gateway.main_model_down = True
    before = gateway.main_hits
    resp = client.post(path, json={"model": "any", "messages": []})
    assert resp.status_code == 503
    assert resp.json() == {"error": {"message": "fake main model is down", "code": 503}}
    assert gateway.main_hits == before + 1
    assert len(gateway.main_refusals) >= 1


def test_main_model_up_passes_the_call_on(setup, monkeypatch):
    from fastapi.responses import JSONResponse

    client, gateway = setup
    seen = {}

    async def fake_gemini(body):
        seen.update(body)
        return JSONResponse({"choices": [{"message": {"content": "hi"}}]})

    monkeypatch.setattr(gateway, "_ask_gemini", fake_gemini)
    resp = client.post("/fake-model/v1/chat/completions", json={"model": "any", "messages": []})
    assert resp.status_code == 200
    assert seen["model"] == "any"  # the real swap of the model name happens inside _ask_gemini


def test_ask_gemini_swaps_the_model_and_keeps_it_plain(monkeypatch):
    from app import config, gateway, prefs

    sent = {}

    class FakeClient:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json, headers):
            sent.update(url=url, json=json, headers=headers)
            return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(gateway.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    resp = asyncio.run(gateway._ask_gemini({"model": "any", "messages": [], "fallbacks": ["x"], "stream": True}))
    assert resp.status_code == 200
    assert sent["json"]["model"] == prefs.agent_model()
    assert sent["json"]["stream"] is False and "fallbacks" not in sent["json"]
    assert sent["headers"]["Authorization"] == "Bearer test-key"


def test_ask_gemini_without_a_key_is_503(monkeypatch):
    from app import config, gateway

    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    assert asyncio.run(gateway._ask_gemini({})).status_code == 503


# ---------- the busy model ----------

def test_busy_model_is_busy_twice_then_answers(setup, monkeypatch):
    client, gateway = setup
    monkeypatch.setattr(gateway, "busy_armed", True)
    gateway.busy_log.clear()
    codes = [client.post("/fake-busy/v1/chat/completions", json={}).status_code for _ in range(4)]
    assert codes == [gateway.BUSY_STATUS, gateway.BUSY_STATUS, 200, 200]
    assert [t["status"] for t in gateway.busy_log] == codes


def test_busy_model_answers_normally_when_no_test_is_running(setup):
    client, gateway = setup
    gateway.busy_log.clear()
    resp = client.post("/fake-busy/chat/completions", json={})
    assert resp.status_code == 200
    assert resp.json()["choices"][0]["message"]["content"]
    assert gateway.busy_log == []


# ---------- status, switch, routes ----------

def test_status_shape(setup):
    client, _ = setup
    body = client.get("/api/gateway/status").json()
    assert set(body) == {"bifrost_up", "main_model_down", "running", "rules", "last"}
    assert body["bifrost_up"] is None  # test mode
    assert set(body["rules"]) == {"fallback_model", "max_retries", "backoff_initial_ms", "backoff_max_ms",
                                  "limit_kind", "limit_value"}
    assert body["rules"]["fallback_model"].startswith("gemini/")
    assert body["last"] == {}


def test_switch_changes_state(setup):
    client, _ = setup
    assert client.put("/api/gateway/main-model", json={"down": True}).json()["main_model_down"] is True
    assert client.get("/api/gateway/status").json()["main_model_down"] is True
    assert client.put("/api/gateway/main-model", json={"down": False}).json()["main_model_down"] is False


def test_switch_is_refused_during_the_fallback_test(setup):
    client, gateway = setup
    gateway.running = "fallback"
    resp = client.put("/api/gateway/main-model", json={"down": True})
    assert resp.status_code == 409 and resp.json()["detail"]


@pytest.mark.parametrize("name", ["fallback", "retry", "budget"])
def test_each_test_in_mock_mode_is_simulated_and_in_the_spec_shape(setup, name):
    client, gateway = setup
    resp = client.post(f"/api/gateway/tests/{name}")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == TYPES_OK
    assert body["name"] == name and body["ok"] is True and body["simulated"] is True
    assert body["headline"]
    assert client.get("/api/gateway/status").json()["last"][name]["name"] == name
    assert gateway.running is None


def test_simulated_results_have_the_right_numbers(setup):
    client, gateway = setup
    fb = client.post("/api/gateway/tests/fallback").json()
    assert fb["numbers"]["errors_seen"] == 0 and len(fb["calls"]) == 6
    retry = client.post("/api/gateway/tests/retry").json()
    assert retry["numbers"]["answered_on_try"] == 3 and [t["status"] for t in retry["tries"]][-1] == 200
    budget = client.post("/api/gateway/tests/budget").json()
    assert budget["numbers"]["blocked_at"] == len(budget["calls"])
    assert budget["calls"][-1]["status"] == 402 and budget["calls"][-1]["answered_by"] == ""
    assert budget["numbers"]["spent_usd"] >= budget["numbers"]["limit_value"] * 0.9


def test_run_all_returns_three_results_in_order(setup):
    client, _ = setup
    body = client.post("/api/gateway/tests/all").json()
    assert [r["name"] for r in body["results"]] == ["fallback", "retry", "budget", "rate", "access"]


def test_unknown_test_is_404(setup):
    assert setup[0].post("/api/gateway/tests/nope").status_code == 404


def test_a_second_test_is_409_with_plain_detail(setup):
    client, gateway = setup
    gateway.running = "retry"
    for path in ("/api/gateway/tests/budget", "/api/gateway/tests/all"):
        resp = client.post(path)
        assert resp.status_code == 409
        assert "retry" in resp.json()["detail"]


def test_changing_things_needs_sign_in(setup):
    from app.auth import require_member

    client, _ = setup

    def guest():
        raise HTTPException(status_code=403, detail="Sign in to do this. You're looking around as a guest.")

    client.app.dependency_overrides[require_member] = guest
    assert client.put("/api/gateway/main-model", json={"down": True}).status_code == 403
    assert client.post("/api/gateway/tests/fallback").status_code == 403
    assert client.post("/api/gateway/tests/all").status_code == 403
    assert client.get("/api/gateway/status").status_code == 200  # reading stays open to guests


# ---------- the real runners, against a pretend Bifrost ----------

def _pretend_bifrost(monkeypatch, gateway, handler):
    """Make every httpx.AsyncClient in gateway.py talk to `handler` instead of the network."""
    real = httpx.AsyncClient

    def factory(**kw):
        return real(transport=httpx.MockTransport(handler), **{k: v for k, v in kw.items() if k != "transport"})

    monkeypatch.setattr(gateway.httpx, "AsyncClient", factory)
    monkeypatch.setattr(gateway.config, "MOCK", False)


def test_fallback_runner_counts_hits_and_restores_the_switch(monkeypatch):
    from app import gateway, prefs

    backup = "gemini/" + prefs.agent_model()
    seen = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        assert gateway.main_model_down is True  # the switch is down while the test runs
        gateway.main_hits += 1  # what the real stand-in does
        gateway.main_refusals.append(gateway.time.monotonic())
        return httpx.Response(200, json={"choices": [], "extra_fields": {"routing_info": {
            "provider": "gemini", "model": prefs.agent_model(), "is_fallback": True}}})

    _pretend_bifrost(monkeypatch, gateway, handler)
    monkeypatch.setattr(gateway, "main_model_down", False)
    result = asyncio.run(gateway.run_fallback())
    assert result["ok"] is True and result["simulated"] is False
    assert result["numbers"]["main_hits"] == 6 and result["numbers"]["backup_hits"] == 6
    assert result["numbers"]["errors_seen"] == 0
    assert result["headline"].startswith("Agents saw 0 errors.")
    assert seen[0]["model"] == "fake-main/any" and seen[0]["fallbacks"] == [backup]
    assert gateway.main_model_down is False  # restored


def test_fallback_runner_restores_the_switch_even_when_bifrost_is_gone(monkeypatch):
    from app import gateway

    def handler(request):
        raise httpx.ConnectError("no route")

    _pretend_bifrost(monkeypatch, gateway, handler)
    monkeypatch.setattr(gateway, "main_model_down", True)  # it was already down before the test
    result = asyncio.run(gateway.run_fallback())
    assert result["ok"] is False and "Could not reach Bifrost" in result["headline"]
    assert gateway.main_model_down is True


def test_fallback_runner_fails_when_calls_fail(monkeypatch):
    from app import gateway

    _pretend_bifrost(monkeypatch, gateway,
                     lambda request: httpx.Response(502, json={"error": {"message": "all providers failed"}}))
    result = asyncio.run(gateway.run_fallback())
    assert result["ok"] is False
    assert result["numbers"]["errors_seen"] == 6
    assert result["calls"][0]["note"].startswith("Failed:")


def test_retry_runner_reads_the_real_waits(monkeypatch):
    from app import gateway

    def handler(request):
        # Pretend Bifrost made three tries at the busy model, then answered.
        for status in (429, 429, 200):
            gateway.busy_log.append({"start": gateway.time.monotonic(), "end": gateway.time.monotonic(), "status": status})
        return httpx.Response(200, json={"choices": []})

    _pretend_bifrost(monkeypatch, gateway, handler)
    result = asyncio.run(gateway.run_retry())
    assert result["ok"] is True and result["numbers"]["answered_on_try"] == 3
    assert [t["status"] for t in result["tries"]] == [429, 429, 200]
    assert result["tries"][0]["waited_s"] == 0
    assert result["headline"].startswith("Answered on the 3rd try after")
    assert gateway.busy_armed is False


def test_retry_runner_fails_when_the_caller_sees_the_error(monkeypatch):
    from app import gateway

    def handler(request):
        gateway.busy_log.append({"start": gateway.time.monotonic(), "end": gateway.time.monotonic(), "status": 429})
        return httpx.Response(429, json={"error": {"message": "Too many requests"}})

    _pretend_bifrost(monkeypatch, gateway, handler)
    result = asyncio.run(gateway.run_retry())
    assert result["ok"] is False and result["numbers"]["answered_on_try"] is None
    assert "status 429" in result["headline"]


def _budget_bifrost(limit_after: int, per_call_tokens=(100, 1000)):
    """A pretend Bifrost: makes keys, answers `limit_after` calls, then says 402. Records what it was asked."""
    state = {"calls": 0, "deleted": [], "vk_header": None}

    def handler(request):
        if request.method == "POST" and request.url.path == "/api/governance/virtual-keys":
            state["created"] = json.loads(request.content)
            return httpx.Response(200, json={"virtual_key": {"id": "vk-1", "value": "sk-bf-test"}})
        if request.method == "DELETE":
            state["deleted"].append(request.url.path)
            return httpx.Response(200, json={})
        state["calls"] += 1
        state["vk_header"] = request.headers.get("x-bf-vk")
        if state["calls"] > limit_after:
            return httpx.Response(402, json={"error": {"message": "Budget exceeded"}})
        return httpx.Response(200, json={"usage": {"prompt_tokens": per_call_tokens[0],
                                                   "completion_tokens": per_call_tokens[1]},
                                         "extra_fields": {"routing_info": {"provider": "gemini", "model": "m"}}})

    return handler, state


def test_budget_runner_stops_at_the_block_and_removes_its_key(monkeypatch):
    from app import gateway, prefs

    # 1000 output tokens at $2.50 per million is about $0.0025 a call, so 4 calls pass $0.01.
    monkeypatch.setattr(gateway, "load_prices", lambda: {prefs.agent_model(): {"input": 0.3, "output": 2.5}})
    handler, state = _budget_bifrost(limit_after=4)
    _pretend_bifrost(monkeypatch, gateway, handler)
    result = asyncio.run(gateway.run_budget())
    assert result["ok"] is True
    assert result["numbers"]["limit_kind"] == "usd" and result["numbers"]["blocked_at"] == 5
    assert result["numbers"]["spent_usd"] == pytest.approx(0.0101, abs=0.0002)
    assert result["headline"].startswith("Stopped after 4 calls.")
    assert result["calls"][-1]["status"] == 402 and result["calls"][-1]["note"] == "Blocked: over its limit"
    assert result["calls"][0]["cost_usd"] and result["calls"][-2]["total_usd"] == pytest.approx(result["numbers"]["spent_usd"], abs=0.0001)
    assert state["created"]["budgets"][0]["max_limit"] == prefs.GATEWAY_RULES["limit_value"]
    assert state["vk_header"] == "sk-bf-test"
    assert state["deleted"] == ["/api/governance/virtual-keys/vk-1"]


def test_budget_runner_fails_when_spent_is_far_from_the_limit(monkeypatch):
    from app import gateway, prefs

    monkeypatch.setattr(gateway, "load_prices", lambda: {prefs.agent_model(): {"input": 0.3, "output": 2.5}})
    handler, _ = _budget_bifrost(limit_after=1)  # blocked after about $0.0025: Bifrost stopped far too early
    _pretend_bifrost(monkeypatch, gateway, handler)
    result = asyncio.run(gateway._budget_once("usd", 0.01))
    assert result["ok"] is False and "does not match" in result["headline"]


def test_budget_runner_uses_a_call_limit_when_dollars_never_block(monkeypatch):
    from app import gateway

    created = []
    calls = {"n": 0}

    def handler(request):
        if request.method == "POST" and request.url.path == "/api/governance/virtual-keys":
            body = json.loads(request.content)
            created.append(body)
            return httpx.Response(200, json={"virtual_key": {"id": f"vk-{len(created)}", "value": "sk-bf-test"}})
        if request.method in ("DELETE", "GET"):
            return httpx.Response(200, json={})
        calls["n"] += 1
        if "budgets" not in created[-1] and calls["n"] > 40 + 10:
            return httpx.Response(429, json={"error": {"message": "Rate limit exceeded"}})
        return httpx.Response(200, json={"usage": {"prompt_tokens": 1, "completion_tokens": 1}})

    _pretend_bifrost(monkeypatch, gateway, handler)
    monkeypatch.setattr(gateway, "load_prices", lambda: {})  # the model has no price
    real_sleep = asyncio.sleep

    async def quick_sleep(seconds):
        await real_sleep(0)

    monkeypatch.setattr(gateway.asyncio, "sleep", quick_sleep)
    result = asyncio.run(gateway.run_budget())
    assert result["numbers"]["limit_kind"] == "calls" and result["numbers"]["limit_value"] == 10
    assert result["ok"] is True and "call limit was used" in result["headline"]
    assert "rate_limit" in created[-1]["provider_configs"][0]


def test_call_cost_uses_the_price_list(monkeypatch):
    from app import gateway

    monkeypatch.setattr(gateway, "load_prices", lambda: {"m": {"input": 1.0, "output": 2.0}})
    assert gateway._call_cost("m", {"prompt_tokens": 1_000_000, "completion_tokens": 500_000}) == pytest.approx(2.0)
    assert gateway._call_cost("unknown", {"prompt_tokens": 5}) is None
    assert gateway._call_cost("m", {}) is None


def test_answered_by_reads_bifrost_fields():
    from app import gateway

    assert gateway.answered_by({"model": "gemini-3.5-flash-lite", "extra_fields": {
        "routing_info": {"provider": "gemini", "model": "gemini-3.5-flash-lite"}}}) == "gemini/gemini-3.5-flash-lite"
    assert gateway.answered_by({"model": "gemini/x"}) == "gemini/x"
    assert gateway.answered_by({}) == ""

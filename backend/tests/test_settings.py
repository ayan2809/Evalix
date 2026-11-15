"""Tests for the Settings routes. All web calls are mocked; the .env file and the Bifrost config are temporary copies."""
import json

import pytest
from fastapi.testclient import TestClient

SECRET = "AIzaSyD-this-is-a-fake-test-key-4f2c"


@pytest.fixture
def setup(monkeypatch, tmp_path):
    from app import config, settings_api, store
    from app.main import app

    store.init_db(config.DB_PATH)
    env = tmp_path / "env"
    env.write_text("# my notes\nTAVILY_API_KEY=old-tavily\nOTHER=keep me\n")
    bifrost = tmp_path / "bifrost.json"
    bifrost.write_text(json.dumps({"providers": {"gemini": {"keys": []}}}))
    monkeypatch.setenv("EVALIX_ENV_FILE", str(env))
    monkeypatch.setenv("EVALIX_BIFROST_CONFIG", str(bifrost))
    for name in ("GEMINI_API_KEY", "TAVILY_API_KEY", "MAXIM_API_KEY", "MAXIM_LOG_REPO_ID",
                 "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(settings_api, "_pending_restart", False)
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")  # saving a key also updates these two
    monkeypatch.setattr(config, "TAVILY_API_KEY", "")
    return TestClient(app), settings_api, env, bifrost, monkeypatch


def test_get_settings_defaults(setup):
    client, *_ = setup
    body = client.get("/api/settings").json()
    assert body["agent_model"] == "gemini-3.5-flash-lite" and body["judge_model"] == "gemini-3.8-flash"
    assert [m["id"] for m in body["models"]] == ["gemini-3.5-flash-lite", "gemini-3.8-flash"]
    assert body["models"][0] == {"id": "gemini-3.5-flash-lite", "label": "Gemini 3.5 Flash Lite",
                                 "provider": "google", "about": "Fastest and cheapest", "ready": False}
    assert [k["provider"] for k in body["keys"]] == ["google", "tavily", "maxim", "openai", "anthropic"]
    assert all(k["set"] is False and k["masked"] is None for k in body["keys"])
    assert body["gateway"]["bifrost_up"] is None and body["gateway"]["fallback_model"] == "gemini/gemini-3.5-flash-lite"
    assert body["gateway"]["max_retries"] == 3
    assert body["search"] == {"default_mode": "saved", "tavily_ready": False}
    assert body["send_to"] == {"maxim_ready": False, "maxim_auto": False}
    assert body["pending_restart"] is False


def test_put_key_writes_env_keeps_other_lines_and_masks(setup, capsys):
    client, settings_api, env, _, monkeypatch = setup
    resp = client.put("/api/settings/keys/google", json={"value": f"  {SECRET}  "})
    assert resp.status_code == 200
    assert resp.json() == {"provider": "google", "label": "Google AI Studio", "set": True,
                           "masked": "AIza••••••••4f2c", "used_for": "The AI model"}
    assert SECRET not in resp.text and SECRET not in json.dumps(client.get("/api/settings").json())
    assert env.read_text() == f"# my notes\nTAVILY_API_KEY=old-tavily\nOTHER=keep me\nGEMINI_API_KEY={SECRET}\n"
    import os
    assert os.environ["GEMINI_API_KEY"] == SECRET
    assert SECRET not in capsys.readouterr().out
    assert client.get("/api/settings").json()["pending_restart"] is True


def test_put_key_replaces_an_existing_line(setup):
    client, _, env, *_ = setup
    client.put("/api/settings/keys/tavily", json={"value": "tvly-new-key-1234567"})
    assert env.read_text() == "# my notes\nTAVILY_API_KEY=tvly-new-key-1234567\nOTHER=keep me\n"
    assert client.get("/api/settings").json()["pending_restart"] is False  # Bifrost does not use this key


def test_put_key_short_key_is_fully_hidden(setup):
    client, *_ = setup
    assert client.put("/api/settings/keys/maxim", json={"value": "abcd1234"}).json()["masked"] == "••••••••"


@pytest.mark.parametrize("value", ["", "   ", "two words", "line\nbreak"])
def test_put_key_bad_value_is_400(setup, value):
    client, *_ = setup
    resp = client.put("/api/settings/keys/google", json={"value": value})
    assert resp.status_code == 400 and resp.json()["detail"]


def test_put_key_unknown_provider_is_404(setup):
    assert setup[0].put("/api/settings/keys/nope", json={"value": "abc"}).status_code == 404
    assert setup[0].post("/api/settings/keys/nope/test").status_code == 404


def test_openai_key_adds_bifrost_provider_once(setup):
    client, _, _, bifrost, _ = setup
    client.put("/api/settings/keys/openai", json={"value": "sk-test-key-abcdefgh"})
    cfg = json.loads(bifrost.read_text())
    assert cfg["providers"]["openai"] == {"keys": [{"name": "openai-key-1", "value": "env.OPENAI_API_KEY",
                                                    "models": ["*"], "weight": 1.0}]}
    assert "gemini" in cfg["providers"]
    assert bifrost.read_text().startswith('{\n  "providers": {')  # 2-space indent
    assert client.get("/api/settings").json()["pending_restart"] is True
    client.put("/api/settings/keys/openai", json={"value": "sk-test-key-other999"})
    assert list(json.loads(bifrost.read_text())["providers"]) == ["gemini", "openai"]
    client.put("/api/settings/keys/anthropic", json={"value": "sk-ant-test-abcdefgh"})
    assert json.loads(bifrost.read_text())["providers"]["anthropic"]["keys"][0]["value"] == "env.ANTHROPIC_API_KEY"


def test_add_bifrost_provider_function(setup):
    _, settings_api, _, bifrost, _ = setup
    assert settings_api.add_bifrost_provider("openai", "OPENAI_API_KEY") is True
    assert settings_api.add_bifrost_provider("openai", "OPENAI_API_KEY") is False


def test_models_become_ready_with_the_key_and_choice_is_saved(setup):
    client, *_ = setup
    resp = client.put("/api/settings", json={"agent_model": "gemini-3.8-flash"})
    assert resp.status_code == 400 and "key" in resp.json()["detail"]
    client.put("/api/settings/keys/google", json={"value": SECRET})
    assert all(m["ready"] for m in client.get("/api/settings").json()["models"])
    body = client.put("/api/settings", json={"agent_model": "gemini-3.8-flash", "judge_model": "gemini-3.5-flash-lite",
                                             "search_default": "live", "maxim_auto": True}).json()
    assert (body["agent_model"], body["judge_model"]) == ("gemini-3.8-flash", "gemini-3.5-flash-lite")
    assert body["search"]["default_mode"] == "live" and body["send_to"]["maxim_auto"] is True
    health = client.get("/api/health").json()
    assert (health["agent_model"], health["judge_model"], health["search_mode"]) == (
        "gemini-3.8-flash", "gemini-3.5-flash-lite", "live")
    client.put("/api/settings", json={"agent_model": "gemini-3.5-flash-lite", "judge_model": "gemini-3.8-flash",
                                      "search_default": "saved", "maxim_auto": False})


def test_put_settings_bad_values_are_400(setup):
    client, *_ = setup
    for body in ({"agent_model": "gpt-nine"}, {"search_default": "sometimes"}, {"maxim_auto": "maybe"}):
        resp = client.put("/api/settings", json=body)
        assert resp.status_code == 400 and isinstance(resp.json()["detail"], str), body


def test_maxim_ready_needs_both_values(setup):
    client, _, _, _, monkeypatch = setup
    monkeypatch.setenv("MAXIM_API_KEY", "key-for-testing-1234")
    assert client.get("/api/settings").json()["send_to"]["maxim_ready"] is False
    monkeypatch.setenv("MAXIM_LOG_REPO_ID", "repo")
    assert client.get("/api/settings").json()["send_to"]["maxim_ready"] is True


# ---- key checks ----

def fake_web(settings_api, monkeypatch, status):
    calls = []

    async def get(url, headers):
        calls.append((url, headers))
        return status
    monkeypatch.setattr(settings_api, "_http_get", get)
    return calls


def test_key_test_without_key(setup):
    client, *_ = setup
    body = client.post("/api/settings/keys/google/test").json()
    assert body["ok"] is False and "No Google AI Studio key" in body["note"]


@pytest.mark.parametrize("provider, name, url_part, header", [
    ("google", "GEMINI_API_KEY", "generativelanguage.googleapis.com/v1beta/models", "x-goog-api-key"),
    ("tavily", "TAVILY_API_KEY", "api.tavily.com/usage", "Authorization"),
    ("maxim", "MAXIM_API_KEY", "getmaxim.ai/api/sdk/v3/folders", "x-maxim-api-key"),
    ("openai", "OPENAI_API_KEY", "api.openai.com/v1/models", "Authorization"),
    ("anthropic", "ANTHROPIC_API_KEY", "api.anthropic.com/v1/models", "x-api-key"),
])
def test_key_test_uses_the_cheap_check(setup, provider, name, url_part, header):
    client, settings_api, _, _, monkeypatch = setup
    monkeypatch.setenv(name, SECRET)
    calls = fake_web(settings_api, monkeypatch, 200)
    resp = client.post(f"/api/settings/keys/{provider}/test")
    assert resp.json()["ok"] is True and SECRET not in resp.text
    assert len(calls) == 1 and url_part in calls[0][0] and header in calls[0][1]
    assert "search" not in calls[0][0]  # never a search, which would spend credits


def test_key_test_rejected_and_unreachable(setup):
    client, settings_api, _, _, monkeypatch = setup
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    fake_web(settings_api, monkeypatch, 403)
    body = client.post("/api/settings/keys/google/test").json()
    assert body["ok"] is False and "did not accept" in body["note"]
    fake_web(settings_api, monkeypatch, 0)
    assert "Could not reach" in client.post("/api/settings/keys/google/test").json()["note"]


def test_tavily_check_that_does_not_answer_says_so_plainly(setup):
    client, settings_api, _, _, monkeypatch = setup
    monkeypatch.setenv("TAVILY_API_KEY", SECRET)
    fake_web(settings_api, monkeypatch, 404)
    body = client.post("/api/settings/keys/tavily/test").json()
    assert body["ok"] is False and "without spending a search" in body["note"]


# ---- bifrost_up and maxim_auto ----

async def test_bifrost_up_is_none_in_mock_mode(setup):
    _, settings_api, *_ = setup
    assert await settings_api.bifrost_up() is None


async def test_bifrost_up_checks_health_with_one_second(setup):
    from app import config
    _, settings_api, _, _, monkeypatch = setup
    monkeypatch.setattr(config, "MOCK", False)
    seen = {}

    class Fake:
        def __init__(self, timeout):
            seen["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            seen["url"] = url

            class R:
                status_code = 200
            return R()

    monkeypatch.setattr(settings_api.httpx, "AsyncClient", Fake)
    assert await settings_api.bifrost_up() is True
    assert seen == {"timeout": 1, "url": f"{config.BIFROST_URL}/health"}


@pytest.mark.parametrize("auto, ready, sent", [(True, True, True), (False, True, False), (True, False, False)])
def test_maxim_auto_sends_in_the_background(setup, auto, ready, sent):
    import threading
    from app import extras, runner

    _, _, _, _, monkeypatch = setup
    from app import prefs
    monkeypatch.setattr(prefs, "maxim_auto", lambda: auto)
    monkeypatch.setattr(prefs, "maxim_ready", lambda: ready)
    done = threading.Event()
    monkeypatch.setattr(extras, "export_benchmark", lambda benchmark_id: done.set())
    runner._send_to_maxim_if_on(7)
    assert done.wait(1) is sent

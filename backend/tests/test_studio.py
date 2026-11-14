"""Tests for Agent Studio, in mock mode with no network.

It reuses the server-in-a-thread setup from test_runtime (same ports, same fixture tasks).
"""
import time

import pytest

# test_runtime must load first: it sets the settings (ports, mock mode) before the app is imported.
from test_runtime import api, servers  # noqa: F401,I001  (pytest fixtures)
from app import studio  # noqa: E402

ALL_YES = {"double_check": True, "retry": True, "stop_when_unsure": True}


@pytest.fixture(autouse=True)
def no_waiting(monkeypatch):
    # Retries should not slow the tests down.
    monkeypatch.setattr(studio, "WAIT_SCALE", 0)


def create(api, description="Find cloud limits", answers=ALL_YES) -> dict:
    resp = api.post("/api/studio/agents", json={"description": description, "answers": answers})
    assert resp.status_code == 200, resp.text
    return resp.json()


def run_one(api, agent_id: int, task_ids=(), fault_ids=()) -> dict:
    resp = api.post("/api/benchmarks", json={"agent_ids": [agent_id], "task_ids": list(task_ids),
                                             "fault_ids": list(fault_ids), "trials": 1, "live_mode": False})
    bench_id = resp.json()["id"]
    for _ in range(300):
        detail = api.get(f"/api/benchmarks/{bench_id}").json()
        if detail["status"] != "running":
            return detail
        time.sleep(0.1)
    raise AssertionError("benchmark did not finish")


def test_questions(api):
    questions = api.get("/api/studio/questions").json()
    assert [q["id"] for q in questions] == ["double_check", "retry", "stop_when_unsure"]
    assert all(q["text"] for q in questions)


def test_create_studio_agent(api):
    made = create(api, answers={"double_check": True, "retry": False, "stop_when_unsure": True})
    agent, setup = made["agent"], made["setup"]
    assert agent["source"] == "studio" and agent["online"] is True
    assert agent["url"].endswith("/studio-agents/" + agent["url"].rsplit("/", 1)[1])
    assert agent["name"] == setup["name"]
    assert set(setup) == {"name", "instructions", "retries", "double_check", "stop_when_unsure"}
    assert setup["retries"] == 0 and setup["double_check"] is True and setup["stop_when_unsure"] is True
    # The setup can be read back by agent id, and the agent shows up in the agent list.
    assert api.get(f"/api/studio/agents/{agent['id']}").json() == setup
    assert agent["id"] in [a["id"] for a in api.get("/api/agents").json()]
    assert api.get(agent["url"] + "/health").json()["ok"] is True


def test_create_needs_a_description(api):
    assert api.post("/api/studio/agents", json={"description": "   ", "answers": {}}).status_code == 400
    assert api.get("/api/studio/agents/999999").status_code == 404
    assert api.get("/studio-agents/999999/health").status_code == 404


def test_clean_setup_clamps_and_falls_back():
    raw = {"name": "A very long agent name for research", "instructions": "  Be kind.  ", "retries": 9,
           "double_check": False, "stop_when_unsure": False}
    setup = studio.clean_setup(raw, ALL_YES)
    assert setup["name"] == "A very long" and setup["instructions"] == "Be kind."
    assert setup["retries"] == 3 and setup["double_check"] is True  # answers win over the model
    bad = studio.clean_setup("not a dict", {"retry": True})
    assert bad["name"] == studio.DEFAULT_NAME and bad["instructions"] == studio.DEFAULT_INSTRUCTIONS
    assert bad["retries"] == 2 and bad["double_check"] is False
    assert studio.clean_setup({"retries": -4}, {"retry": True})["retries"] == 2
    assert studio.clean_setup({"retries": 3}, {"retry": False})["retries"] == 0


def test_studio_agent_normal_run_passes(api):
    agent = create(api)["agent"]
    bench = run_one(api, agent["id"], task_ids=["cloud_limits"])
    run = bench["runs"][0]
    assert run["ending"] == "passed" and run["fail_reason"] == ""
    assert run["tool_calls"] == 1 and run["steps"] == 2
    detail = api.get(f"/api/runs/{run['id']}").json()
    assert detail["answer_json"]["status"] == "answered"
    assert [u.rstrip("/") for u in detail["answer_json"]["sources"]] == ["https://docs.example.com/limits"]
    assert detail["agent_name"] == agent["name"]


def test_studio_agent_tool_gone_ends_blocked(api):
    agent = create(api)["agent"]
    bench = run_one(api, agent["id"], fault_ids=["tool_gone"])
    run = bench["runs"][0]
    assert run["ending"] == "passed" and run["fault_fired"] is True
    detail = api.get(f"/api/runs/{run['id']}").json()
    assert detail["answer_json"]["status"] == "blocked"
    # With 2 retries every search is tried 3 times, and the door counted each try.
    assert run["tool_calls"] >= 3


def test_retries_ride_out_a_busy_model(api):
    # model_busy refuses model calls 2 and 3 with a 429. With retries on, the agent still answers;
    # with retries off, it gives up.
    patient = create(api)["agent"]
    run = run_one(api, patient["id"], fault_ids=["model_busy"])["runs"][0]
    assert run["ending"] == "passed" and run["fault_fired"] is True and run["steps"] == 4
    hasty = create(api, answers={"double_check": False, "retry": False, "stop_when_unsure": True})["agent"]
    run = run_one(api, hasty["id"], fault_ids=["model_busy"])["runs"][0]
    assert run["ending"] == "wrong"

"""Tests for Agent Studio, in mock mode with no network.

It reuses the server-in-a-thread setup from test_runtime (same ports, same fixture tasks).
"""
import time

import pytest

# test_runtime must load first: it sets the settings (ports, mock mode) before the app is imported.
from test_runtime import api, servers  # noqa: F401,I001  (pytest fixtures)
from app import studio  # noqa: E402

ANSWERS = [{"id": "q1", "question": "Which sources should it trust most?", "answer": "Official sites only"},
           {"id": "q2", "question": "What should it do when a search fails?", "answer": "Try again a couple of times"}]


@pytest.fixture(autouse=True)
def no_waiting(monkeypatch):
    # Retries should not slow the tests down.
    monkeypatch.setattr(studio, "WAIT_SCALE", 0)


def create(api, description="Find cloud limits", answers=ANSWERS) -> dict:
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


def test_questions_fall_back_in_test_mode(api):
    resp = api.post("/api/studio/questions", json={"description": "Find credit card fees"})
    questions = resp.json()["questions"]
    assert [q["id"] for q in questions] == ["q1", "q2", "q3"]
    assert all(q["text"] and 2 <= len(q["choices"]) <= 4 for q in questions)
    assert api.post("/api/studio/questions", json={"description": "  "}).status_code == 400


def test_model_questions_are_checked():
    raw = {"questions": [
        {"text": "  Which   sources should it trust? ", "choices": ["Official", "Official", "News", "Blogs", "Any", "More"]},
        {"text": "No choices", "choices": []},
        {"text": "What if search fails?", "choices": ["Retry", "Stop"]},
        "not a question"]}
    got = studio.clean_questions(raw)
    assert [q["id"] for q in got] == ["q1", "q2"]
    assert got[0] == {"id": "q1", "text": "Which sources should it trust?", "choices": ["Official", "News", "Blogs", "Any"]}
    assert studio.clean_questions({"questions": [{"text": "Only one", "choices": ["a", "b"]}]}) == []  # fewer than 2
    assert studio.clean_questions("junk") == []


def test_model_questions_are_used(api, monkeypatch):
    seen = {}

    async def fake_chat(messages, vk):
        seen["text"] = messages[1]["content"]
        return {"questions": [{"text": "Which card networks matter?", "choices": ["Visa", "Any"]},
                              {"text": "Include fees from forums?", "choices": ["Yes", "No"]}]}

    monkeypatch.setattr(studio.config, "MOCK", False)
    monkeypatch.setattr(studio, "_chat", fake_chat)
    questions = api.post("/api/studio/questions", json={"description": "Compare card fees"}).json()["questions"]
    assert seen["text"] == "Compare card fees" and questions[0]["text"] == "Which card networks matter?"


def test_answers_are_cleaned():
    got = studio.clean_answers([{"id": "q1", "question": " Q ", "answer": "  A  "}, {"question": "Q2", "answer": ""},
                                "junk"])
    assert got == [{"id": "q1", "question": "Q", "answer": "A"}]


def test_create_studio_agent(api):
    made = create(api)
    agent, setup = made["agent"], made["setup"]
    assert agent["source"] == "studio" and agent["online"] is True
    assert agent["url"].endswith("/studio-agents/" + agent["url"].rsplit("/", 1)[1])
    assert agent["name"] == setup["name"]
    assert set(setup) == {"name", "instructions", "retries", "double_check", "stop_when_unsure"}
    assert setup["retries"] == 2 and setup["double_check"] is True and setup["stop_when_unsure"] is True
    # The setup can be read back by agent id, and the agent shows up in the agent list.
    assert api.get(f"/api/studio/agents/{agent['id']}").json() == setup
    assert agent["id"] in [a["id"] for a in api.get("/api/agents").json()]
    assert api.get(agent["url"] + "/health").json()["ok"] is True


def test_create_needs_a_description(api):
    assert api.post("/api/studio/agents", json={"description": "   ", "answers": []}).status_code == 400
    assert api.get("/api/studio/agents/999999").status_code == 404
    assert api.get("/studio-agents/999999/health").status_code == 404


def test_clean_setup_clamps_and_falls_back():
    raw = {"name": "A very long agent name for research", "instructions": "  Be kind.  ", "retries": 9,
           "double_check": False, "stop_when_unsure": False}
    setup = studio.clean_setup(raw)
    assert setup["name"] == "A very long" and setup["instructions"] == "Be kind."
    assert setup["retries"] == 3 and setup["double_check"] is False  # the model decides from the answers
    bad = studio.clean_setup("not a dict")
    assert bad["name"] == studio.DEFAULT_NAME and bad["instructions"] == studio.DEFAULT_INSTRUCTIONS
    assert bad["retries"] == 2 and bad["double_check"] is True and bad["stop_when_unsure"] is True  # careful defaults
    assert studio.clean_setup({"retries": -4})["retries"] == 0
    assert studio.clean_setup({"retries": "1", "double_check": "no"}) | {} == {
        **studio.clean_setup({"retries": 1}), "double_check": False}


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


def test_retries_ride_out_a_busy_model(api, monkeypatch):
    # model_busy refuses model calls 2 and 3 with a 429. With retries on, the agent still answers;
    # with retries off, it gives up.
    patient = create(api)["agent"]
    run = run_one(api, patient["id"], fault_ids=["model_busy"])["runs"][0]
    assert run["ending"] == "passed" and run["fault_fired"] is True and run["steps"] == 4
    async def no_retries(description, answers, vk=None):  # as if the person said "don't try again"
        return studio.clean_setup({"name": "Hasty", "retries": 0, "double_check": False})

    monkeypatch.setattr(studio, "make_setup", no_retries)
    hasty = create(api, answers=[{"id": "q1", "question": "If a search fails?", "answer": "Give up at once"}])["agent"]
    run = run_one(api, hasty["id"], fault_ids=["model_busy"])["runs"][0]
    assert run["ending"] == "wrong"

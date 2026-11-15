import json

from app.data import public_task
from app.scores import agent_summary, cost_usd, grid, looped

TASKS = {"t1": {"ideal_steps": 2}}


def mk(id, ending, trial=1, task_id="t1", fault_id="", agent_id=1, steps=2,
       cost=0.01, seconds=10.0, fired=False):
    return {"id": id, "agent_id": agent_id, "task_id": task_id, "fault_id": fault_id,
            "trial": trial, "ending": ending, "steps": steps, "cost_usd": cost,
            "seconds": seconds, "fault_fired": fired}


def test_cost():
    prices = {"m": {"input": 0.30, "output": 2.50}}
    assert cost_usd("m", 1000, 100, prices) == 0.00055
    assert cost_usd("unknown", 1000, 100, prices) == 0


def test_looped():
    s = {"name": "search", "input_json": '{"q": "a"}'}
    assert looped([s, s, s])
    assert not looped([s, s])
    d = {"name": "search", "input_json": {"q": "a", "z": 1}}
    d2 = {"name": "search", "input_json": {"z": 1, "q": "a"}}
    assert looped([d, d2, d])
    assert looped([d, {"name": "search", "input_json": json.dumps(d["input_json"], sort_keys=True)}, d])
    assert not looped([s, {"name": "read_page", "input_json": '{"q": "a"}'}, s])


def test_summary_counts():
    runs = [
        mk("r1", "passed", 1, steps=3, cost=0.02, seconds=8),
        mk("r2", "wrong", 2),
        mk("r3", "passed", 1, task_id="t2", steps=2),
        mk("r4", "setup_problem", 1, task_id="t3"),
        mk("r5", None, 1, task_id="t4"),
    ]
    s = agent_summary(runs, TASKS)
    assert len(s) == 1
    n = s[0]["normal"]
    assert (n["counted"], n["passed"], n["groups"], n["reliable"]) == (3, 2, 2, 1)
    # ratios: 3/2 = 1.5 and 2/3 (task t2 has default ideal 3)
    assert n["avg_step_ratio"] == round((1.5 + 2 / 3) / 2, 2)
    assert n["total_cost"] == 0.04
    assert n["cost_per_success"] == 0.02
    assert n["avg_seconds"] == round((8 + 10 + 10) / 3, 1)
    assert s[0]["setup_problems"] == 1
    assert s[0]["faults"]["counted"] == 0
    assert s[0]["faults"]["avg_step_ratio"] is None
    assert s[0]["faults"]["cost_per_success"] is None
    assert s[0]["faults"]["avg_seconds"] is None


def test_summary_faults_recovered():
    runs = [
        mk("r1", "passed", 1, fault_id="f1", fired=True),
        mk("r2", "wrong", 2, fault_id="f1", fired=True),
        mk("r3", "passed", 1, fault_id="f2", fired=True),
        mk("r4", "passed", 1, fault_id="f3", fired=False),
        mk("r5", "passed", 1, agent_id=2),
    ]
    s = agent_summary(runs, TASKS)
    assert [x["agent_id"] for x in s] == [1, 2]
    f = s[0]["faults"]
    assert (f["counted"], f["passed"], f["groups"], f["reliable"]) == (4, 3, 3, 2)
    assert (f["fired"], f["recovered"]) == (3, 2)
    assert s[0]["normal"]["counted"] == 0


def test_grid_and_badges():
    runs = [
        mk("r1", "passed", 2),
        mk("r2", "passed", 1),
        mk("r3", "passed", 1, fault_id="f1", fired=True),
        mk("r4", "crashed", 1, fault_id="f2"),
        mk("r5", "setup_problem", 1, task_id="t2"),
        mk("r6", None, 1, task_id="t3"),
    ]
    cells = {(c["task_id"], c["fault_id"]): c for c in grid(runs)}
    c = cells[("t1", "")]
    assert c["column"] == "t1"
    assert [t["trial"] for t in c["trials"]] == [1, 2]
    assert c["trials"][0] == {"run_id": "r2", "trial": 1, "ending": "passed", "badge": "Pass"}
    assert cells[("t1", "f1")]["column"] == "f1"
    assert cells[("t1", "f1")]["trials"][0]["badge"] == "Recovered"
    assert cells[("t1", "f2")]["trials"][0]["badge"] == "Fail"
    assert cells[("t2", "")]["trials"][0]["badge"] == "Setup problem"
    assert cells[("t3", "")]["trials"][0]["badge"] == "Running"


def test_public_task(task):
    pub = public_task(task)
    assert "answer_key" not in pub and "pool" not in pub
    assert pub["id"] == "t1"

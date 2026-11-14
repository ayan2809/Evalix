"""Cost, loop detection, and the summary numbers shown in the UI."""
import json
from collections import Counter


def cost_usd(model: str, tokens_in: int, tokens_out: int, prices: dict) -> float:
    p = prices.get(model)
    if not p:
        return 0.0
    return round((tokens_in * p["input"] + tokens_out * p["output"]) / 1_000_000, 6)


def looped(tool_steps: list[dict]) -> bool:
    # True if the same tool call (name + input) appears 3 or more times.
    counts = Counter()
    for step in tool_steps:
        data = step.get("input_json")
        if isinstance(data, dict):
            data = json.dumps(data, sort_keys=True)
        counts[(step.get("name"), data)] += 1
    return any(n >= 3 for n in counts.values())


def _counted(run: dict) -> bool:
    return run.get("ending") not in (None, "setup_problem")


def _block(runs: list[dict], tasks: dict, with_faults: bool) -> dict:
    passed = [r for r in runs if r["ending"] == "passed"]
    total_cost = sum(r.get("cost_usd") or 0 for r in runs)
    groups: dict[tuple, list[bool]] = {}
    for r in runs:
        groups.setdefault((r["task_id"], r.get("fault_id") or ""), []).append(r["ending"] == "passed")
    ratios = [r["steps"] / (tasks.get(r["task_id"], {}).get("ideal_steps") or 3) for r in passed]
    seconds = [r.get("seconds") or 0 for r in runs]
    out = {
        "counted": len(runs),
        "passed": len(passed),
        "reliable": sum(1 for v in groups.values() if all(v)),
        "groups": len(groups),
    }
    if with_faults:
        fired = [r for r in runs if r.get("fault_fired")]
        out["fired"] = len(fired)
        out["recovered"] = sum(1 for r in fired if r["ending"] == "passed")
    out["avg_step_ratio"] = round(sum(ratios) / len(ratios), 2) if ratios else None
    out["cost_per_success"] = round(total_cost / len(passed), 6) if passed else None
    out["avg_seconds"] = round(sum(seconds) / len(seconds), 1) if seconds else None
    out["total_cost"] = round(total_cost, 6)
    return out


def agent_summary(runs: list[dict], tasks: dict[str, dict]) -> list[dict]:
    agent_ids = list(dict.fromkeys(r["agent_id"] for r in runs))
    result = []
    for agent_id in agent_ids:
        mine = [r for r in runs if r["agent_id"] == agent_id]
        counted = [r for r in mine if _counted(r)]
        result.append({
            "agent_id": agent_id,
            "normal": _block([r for r in counted if not r.get("fault_id")], tasks, False),
            "faults": _block([r for r in counted if r.get("fault_id")], tasks, True),
            "setup_problems": sum(1 for r in mine if r.get("ending") == "setup_problem"),
        })
    return result


def _badge(run: dict) -> str:
    ending = run.get("ending")
    if ending is None:
        return "Running"
    if ending == "setup_problem":
        return "Setup problem"
    if ending == "passed":
        return "Recovered" if run.get("fault_fired") else "Pass"
    return "Fail"


def grid(runs: list[dict]) -> list[dict]:
    cells: dict[tuple, dict] = {}
    for r in runs:
        fault_id = r.get("fault_id") or ""
        key = (r["agent_id"], r["task_id"], fault_id)
        cell = cells.setdefault(key, {
            "agent_id": r["agent_id"], "task_id": r["task_id"], "fault_id": fault_id,
            "column": fault_id or r["task_id"], "trials": [],
        })
        cell["trials"].append({
            "run_id": r.get("id", r.get("run_id")), "trial": r.get("trial"),
            "ending": r.get("ending"), "badge": _badge(r),
        })
    for cell in cells.values():
        cell["trials"].sort(key=lambda t: t["trial"] or 0)
    return list(cells.values())

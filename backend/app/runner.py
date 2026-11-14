"""Runs a benchmark: starts each run, calls the agent, grades it, saves the numbers."""
import asyncio
import time
import uuid

import httpx

from app import config, store
from app.data import load_faults, load_prices, load_tasks
from app.events import publish, record_step
from app.faults import FaultEngine
from app.grader import check_reply_shape, grade
from app.run_state import ACTIVE, RunState
from app.scores import cost_usd, looped

_cancelled: set[int] = set()
_background: set[asyncio.Task] = set()  # keeps background tasks from being garbage collected


def _plan(agent_ids, task_ids, fault_ids, trials) -> list[dict]:
    """The list of runs to do: normal runs first, then fault runs, for each agent."""
    tasks, faults = load_tasks(), load_faults()
    items = []
    for agent_id in agent_ids:
        agent = store.get_agent(agent_id)
        if agent is None:
            continue
        for task_id in task_ids:
            if task_id in tasks:
                for trial in range(1, trials + 1):
                    items.append({"agent": agent, "task_id": task_id, "fault_id": "",
                                  "trial": trial, "expect": "answer"})
        for fault_id in fault_ids:
            fault = faults.get(fault_id)
            if fault and fault["task_id"] in tasks:
                for trial in range(1, trials + 1):
                    items.append({"agent": agent, "task_id": fault["task_id"], "fault_id": fault_id,
                                  "trial": trial, "expect": fault.get("expect", "answer")})
    return items


async def start_benchmark(agent_ids: list[int], task_ids: list[str], fault_ids: list[str],
                          trials: int, live_mode: bool) -> int:
    items = _plan(agent_ids, task_ids, fault_ids, trials)
    selection = {"agent_ids": sorted({i["agent"]["id"] for i in items}),
                 "task_ids": sorted({i["task_id"] for i in items if not i["fault_id"]}),
                 "fault_ids": sorted({i["fault_id"] for i in items if i["fault_id"]})}
    benchmark_id = store.create_benchmark(trials, live_mode, len(items), selection)
    task = asyncio.create_task(_run_benchmark(benchmark_id, items, live_mode))
    _background.add(task)
    task.add_done_callback(_background.discard)
    return benchmark_id


def cancel_benchmark(benchmark_id: int) -> None:
    # Runs that have not started are skipped. Running ones finish.
    _cancelled.add(benchmark_id)


async def _run_benchmark(benchmark_id: int, items: list[dict], live_mode: bool) -> None:
    semaphore = asyncio.Semaphore(config.MAX_PARALLEL)

    async def guarded(item: dict) -> None:
        async with semaphore:
            if benchmark_id in _cancelled:
                return
            try:
                await _run_with_retry(benchmark_id, item, live_mode)
            except Exception as exc:  # a bug in Evalix must not stop the other runs
                print(f"run failed inside Evalix: {type(exc).__name__}: {exc}")

    await asyncio.gather(*(guarded(item) for item in items))
    status = "cancelled" if benchmark_id in _cancelled else "done"
    _cancelled.discard(benchmark_id)
    store.set_benchmark_status(benchmark_id, status)
    publish(benchmark_id, "benchmark_finished", {"benchmark_id": benchmark_id, "status": status})


async def _run_with_retry(benchmark_id: int, item: dict, live_mode: bool) -> None:
    # A setup problem is not the agent's fault: try once more as a new run.
    for _ in range(2):
        ending = await _execute(benchmark_id, item, live_mode)
        if ending != "setup_problem":
            break
    store.add_done_run(benchmark_id)


async def _call_agent(state: RunState, agent: dict) -> tuple[dict | None, str, int]:
    """Ask the agent to do the task. Returns (reply, crash reason, http status)."""
    task = state.task
    payload = {
        "run_id": state.run_id,
        "task": task["task"],
        "answer_format": task.get("answer_format", {}),
        "tools_url": f"{config.PUBLIC_URL}/runs/{state.run_id}/tools",
        "model_url": f"{config.PUBLIC_URL}/runs/{state.run_id}/model/v1",
        "model_name": config.AGENT_MODEL,
        "limits": state.limits,
    }
    seconds = state.limits["seconds"]
    try:
        async with httpx.AsyncClient(timeout=seconds) as client:
            resp = await asyncio.wait_for(client.post(f"{agent['url'].rstrip('/')}/run", json=payload), seconds)
    except asyncio.TimeoutError:
        return None, f"ran out of time ({seconds} s)", 0
    except httpx.TimeoutException:
        return None, f"ran out of time ({seconds} s)", 0
    except httpx.ConnectError:
        return None, "agent is not reachable", 0
    except httpx.HTTPError:
        return None, "agent is not reachable", 0
    if resp.status_code != 200:
        return None, f"agent returned an error ({resp.status_code})", resp.status_code
    try:
        return resp.json(), "", 200
    except ValueError:
        return None, "reply in the wrong shape", 200


async def _execute(benchmark_id: int, item: dict, live_mode: bool) -> str:
    """One run from start to finish. Returns its ending."""
    agent, task_id, fault_id = item["agent"], item["task_id"], item["fault_id"]
    task = load_tasks()[task_id]
    fault = load_faults().get(fault_id) if fault_id else None
    run_id = "r_" + uuid.uuid4().hex[:8]
    state = RunState(run_id=run_id, benchmark_id=benchmark_id, agent_id=agent["id"], task=task,
                     fault=fault, engine=FaultEngine(fault, task), live_mode=live_mode,
                     limits=dict(config.RUN_LIMITS))
    store.create_run(run_id, benchmark_id, agent["id"], task_id, fault_id, item["trial"],
                     item["expect"], config.AGENT_MODEL)
    publish(benchmark_id, "run_started", {"run_id": run_id, "agent_id": agent["id"], "agent": agent["name"],
                                          "task_id": task_id, "fault_id": fault_id, "trial": item["trial"]})
    ACTIVE[run_id] = state
    try:
        reply, crash, http_status = await _call_agent(state, agent)
    except Exception as exc:
        reply, crash, http_status = None, "", 0
        state.setup_problem = f"error inside Evalix ({type(exc).__name__})"
    # Stop the agent from using the door any more.
    state.finished = True
    ACTIVE.pop(run_id, None)
    seconds = round(time.monotonic() - state.started, 1)

    # Save the reply as the last step.
    if crash:
        reply_out = {"error": crash}
    else:
        reply_out = reply
    record_step(state, "final_answer", "final_answer", None, reply_out, status_code=http_status or 0)

    # Grade it.
    if state.setup_problem:
        ending, reason = "setup_problem", state.setup_problem
    else:
        crash = crash or ("" if reply is None else check_reply_shape(reply))
        result = grade(task, item["expect"], None if crash else reply, seen_urls=state.seen_urls,
                       sent_email=state.sent_email, limit_hit=state.limit_hit, crash=crash)
        ending, reason = result.ending, result.fail_reason

    tool_steps = [{"name": s["name"], "input_json": s["input_json"]}
                  for s in store.get_steps(run_id) if s["kind"] == "tool_call"]
    numbers = {
        "ending": ending, "fail_reason": reason, "steps": state.model_calls,
        "tool_calls": state.tool_calls, "tokens_in": state.tokens_in, "tokens_out": state.tokens_out,
        "cost_usd": cost_usd(config.AGENT_MODEL, state.tokens_in, state.tokens_out, load_prices()),
        "seconds": seconds, "looped": looped(tool_steps), "fault_fired": state.engine.fired,
        "answer_json": reply if isinstance(reply, dict) else None,
    }
    store.update_run(run_id, **numbers)
    publish(benchmark_id, "run_finished", {
        "run_id": run_id, "agent_id": agent["id"], "task_id": task_id, "fault_id": fault_id,
        "trial": item["trial"], **{k: v for k, v in numbers.items() if k != "answer_json"}})
    return ending

"""Extra: send a finished benchmark to Maxim. (The gateway tests live in gateway.py.)"""
import asyncio
import json
import os
import time

from fastapi import APIRouter, Depends, HTTPException

from app import config, store
from app.auth import require_owner
from app.data import load_faults, load_tasks

router = APIRouter()

# ---------------------------------------------------------------------------
# Maxim export
# ---------------------------------------------------------------------------

def _text(value, limit: int = 4000) -> str:
    # Maxim wants strings. Long text is cut so one trace stays small.
    out = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return out[:limit]


def _send_run(logger, run: dict, agent_name: str, steps: list[dict]) -> None:
    """Write one finished run to Maxim as one trace."""
    task = load_tasks().get(run["task_id"], {})
    fault = load_faults().get(run["fault_id"], {}) if run["fault_id"] else {}
    what = fault.get("label") or task.get("title") or run["task_id"]
    review = run.get("review_json") or {}
    tags = {"agent": agent_name, "task_id": run["task_id"], "fault_id": run["fault_id"] or "none",
            "ending": run["ending"] or "unknown", "cost_usd": f"{run['cost_usd']:.5f}",
            "seconds": f"{run['seconds']:.1f}", "trial": str(run["trial"]),
            "tier1_passed": str(run["ending"] == "passed").lower()}
    if review.get("reasoning_score"):
        tags["tier2_reasoning_score"] = str(review["reasoning_score"])
    trace = logger.trace({"id": run["id"], "name": f"{agent_name} · {what} · trial {run['trial']}",
                          "tags": tags})
    trace.set_input(_text(task.get("task", run["task_id"])))
    for step in steps:
        if step["kind"] == "tool_call":
            call = trace.tool_call({"id": f"{run['id']}-s{step['position']}", "name": step["name"],
                                    "description": f"step {step['position']}",
                                    "args": _text(step["input_json"])})
            call.result(_text(step["output_json"]))
        elif step["kind"] == "model_call":
            out = step["output_json"] if isinstance(step["output_json"], dict) else {}
            messages = (step["input_json"] or {}).get("messages") if isinstance(step["input_json"], dict) else None
            gen = trace.generation({"id": f"{run['id']}-s{step['position']}", "provider": "gemini",
                                    "model": run.get("model") or config.AGENT_MODEL,
                                    "name": f"model call {step['position']}",
                                    "messages": [{"role": "user", "content": _text(messages or "", 2000)}]})
            gen.result({"id": f"{run['id']}-r{step['position']}", "object": "chat.completion",
                        "created": int(time.time()), "model": run.get("model") or config.AGENT_MODEL,
                        "choices": [{"index": 0, "finish_reason": "stop",
                                     "message": {"role": "assistant", "content": _text(out.get("content") or out)}}],
                        "usage": {"prompt_tokens": step["tokens_in"], "completion_tokens": step["tokens_out"],
                                  "total_tokens": step["tokens_in"] + step["tokens_out"]}})
    trace.set_output(_text(run["answer_json"] if run["answer_json"] is not None else ""))
    trace.add_metric("tier1_passed", 1.0 if run["ending"] == "passed" else 0.0)
    trace.end()


def export_benchmark(benchmark_id: int) -> dict:
    """Send every finished run of a benchmark to Maxim. Never raises."""
    if config.MOCK:
        return {"ok": False, "traces_sent": 0, "note": "test mode: nothing sent"}
    if not os.environ.get("MAXIM_API_KEY") or not os.environ.get("MAXIM_LOG_REPO_ID"):
        return {"ok": False, "traces_sent": 0, "note": "Maxim keys are not set (MAXIM_API_KEY, MAXIM_LOG_REPO_ID)."}

    runs = [r for r in store.list_runs(benchmark_id) if r["ending"]]
    if not runs:
        return {"ok": False, "traces_sent": 0, "note": "This benchmark has no finished runs yet."}

    maxim = None
    sent = 0
    try:
        from maxim import Maxim

        maxim = Maxim({})  # reads MAXIM_API_KEY
        logger = maxim.logger()  # reads MAXIM_LOG_REPO_ID
        for run in runs:
            agent = store.get_agent(run["agent_id"])
            _send_run(logger, run, agent["name"] if agent else f"agent {run['agent_id']}",
                      store.get_steps(run["id"]))
            sent += 1
        logger.flush()
    except Exception as exc:  # any SDK trouble becomes a plain note
        return {"ok": False, "traces_sent": sent, "note": f"Maxim export failed: {type(exc).__name__}: {str(exc)[:200]}"}
    finally:
        if maxim is not None:
            try:
                maxim.cleanup()
            except Exception:
                pass
    return {"ok": True, "traces_sent": sent, "note": f"Sent {sent} runs to Maxim."}


@router.post("/api/benchmarks/{benchmark_id}/export-maxim", dependencies=[Depends(require_owner)])
async def export_maxim(benchmark_id: int):
    bench = store.get_benchmark(benchmark_id)
    if bench is None or bench.get("workspace", store.MAIN) != store.MAIN:  # the owner's own workspace only
        raise HTTPException(status_code=404, detail="benchmark not found")
    # The SDK is blocking, so run it off the event loop.
    return await asyncio.to_thread(export_benchmark, benchmark_id)

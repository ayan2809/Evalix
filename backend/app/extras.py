"""Two extras: the gateway test (Bifrost failover) and the Maxim export."""
import asyncio
import json
import os
import time

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app import config, store
from app.data import load_faults, load_tasks

router = APIRouter()

# ---------------------------------------------------------------------------
# Gateway test
# ---------------------------------------------------------------------------

MAIN_MODEL = "fake-down/any"
fake_model_hits = 0  # how many times the fake main model was asked


def _down_reply() -> JSONResponse:
    global fake_model_hits
    fake_model_hits += 1
    return JSONResponse(status_code=503,
                        content={"error": {"message": "fake main model is down", "code": 503}})


# Two paths, in case Bifrost drops the "/v1" part.
@router.post("/fake-model/v1/chat/completions")
@router.post("/fake-model/chat/completions")
async def fake_model():
    return _down_reply()


def _answered_by(body: dict) -> str:
    # Bifrost says who answered in `extra_fields`; fall back to the reply's `model` field.
    extra = body.get("extra_fields") or {}
    provider, model = extra.get("provider"), extra.get("model_requested") or body.get("model")
    if provider and model and not str(model).startswith(f"{provider}/"):
        return f"{provider}/{model}"
    return str(model or provider or "unknown")


@router.post("/api/gateway-test")
async def gateway_test():
    backup = "gemini/" + config.AGENT_MODEL
    if config.MOCK:
        return {"ok": True, "main_model": MAIN_MODEL, "main_model_hits": 1, "answered_by": backup,
                "reply_text": "OK", "seconds": 0.0,
                "note": "Simulated result (test mode). No request was sent to Bifrost."}

    hits_before = fake_model_hits
    payload = {"model": MAIN_MODEL, "fallbacks": [backup], "stream": False,
               "messages": [{"role": "user", "content": "Reply with the word OK."}]}
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(f"{config.BIFROST_URL}/v1/chat/completions", json=payload)
    except httpx.HTTPError as exc:
        return _failed(hits_before, start, f"Could not reach Bifrost at {config.BIFROST_URL} ({type(exc).__name__}).")
    seconds = round(time.monotonic() - start, 2)
    hits = fake_model_hits - hits_before

    try:
        body = resp.json()
    except ValueError:
        body = {}
    if resp.status_code != 200:
        message = (body.get("error") or {}).get("message") if isinstance(body, dict) else None
        return {"ok": False, "main_model": MAIN_MODEL, "main_model_hits": hits, "answered_by": "",
                "reply_text": "", "seconds": seconds,
                "note": f"Bifrost answered with status {resp.status_code}: {str(message or 'no details')[:200]}"}

    try:
        text = body["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        text = ""
    answered_by = _answered_by(body)
    switched = hits > 0 and not answered_by.startswith("fake-down")
    note = ("The main model was down. Bifrost switched to the backup and the caller got a normal answer."
            if switched else
            "Bifrost answered, but the main model was not asked first, so no switch was seen.")
    return {"ok": switched, "main_model": MAIN_MODEL, "main_model_hits": hits, "answered_by": answered_by,
            "reply_text": text.strip()[:200], "seconds": seconds, "note": note}


def _failed(hits: int, start: float, note: str) -> dict:
    return {"ok": False, "main_model": MAIN_MODEL, "main_model_hits": hits, "answered_by": "",
            "reply_text": "", "seconds": round(time.monotonic() - start, 2), "note": note}


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


@router.post("/api/benchmarks/{benchmark_id}/export-maxim")
async def export_maxim(benchmark_id: int):
    if store.get_benchmark(benchmark_id) is None:
        raise HTTPException(status_code=404, detail="benchmark not found")
    # The SDK is blocking, so run it off the event loop.
    return await asyncio.to_thread(export_benchmark, benchmark_id)

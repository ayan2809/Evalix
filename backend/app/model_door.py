"""The model door: agents send model calls here, and Evalix passes them on to Bifrost."""
import asyncio
import json
import time

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import config
from app.events import record_step
from app.run_state import ACTIVE, RunState

router = APIRouter()

RETRY_WAITS = (2, 4, 8)  # seconds to wait before each retry of a real provider failure


def mock_reply(state: RunState, body: dict) -> dict:
    """A fixed, deterministic model that needs no keys (contract 3.9.1)."""
    messages = body.get("messages", [])
    tool_msgs = [m for m in messages if m.get("role") == "tool"]
    task = state.task
    query = (task.get("queries") or [task.get("title", "")])[0]
    last = str(tool_msgs[-1].get("content", "")) if tool_msgs else ""
    # Search again after an error or an empty result, like a real model would (up to 4 tool replies).
    try:
        empty = json.loads(last).get("results") == []
    except (ValueError, AttributeError):
        empty = False
    message: dict
    if not tool_msgs or (("error" in last or empty) and len(tool_msgs) < 4):
        message = {"role": "assistant", "content": None, "tool_calls": [{
            "id": f"mock_{state.model_calls}", "type": "function",
            "function": {"name": "search", "arguments": json.dumps({"query": query})}}]}
        finish = "tool_calls"
    else:
        if state.seen_urls:
            final = {"status": "answered", "answer": task.get("answer_key", {}),
                     "sources": [sorted(state.seen_urls)[0]], "reason": ""}
        else:
            final = {"status": "blocked", "answer": {}, "sources": [], "reason": "no working search results"}
        message = {"role": "assistant", "content": json.dumps(final)}
        finish = "stop"
    return {
        "id": f"mock-{state.run_id}-{state.model_calls}", "object": "chat.completion",
        "created": int(time.time()), "model": body.get("model", ""),
        "choices": [{"index": 0, "message": message, "finish_reason": finish}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120},
    }


async def _call_bifrost(payload: dict, run_id: str) -> tuple[int, dict | None]:
    """One try. Returns (status, json). Status 0 means a network problem."""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(f"{config.BIFROST_URL}/v1/chat/completions", json=payload,
                                     headers={"x-bf-dim-run-id": run_id})
    except httpx.HTTPError:
        return 0, None
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, None


async def forward(payload: dict, run_id: str) -> tuple[int, dict | None]:
    """Send to Bifrost. A real 429, 5xx or network error is retried quietly after 2, 4, 8 s."""
    status, data = await _call_bifrost(payload, run_id)
    for wait in RETRY_WAITS:
        if status != 0 and status != 429 and status < 500:
            break
        await asyncio.sleep(wait)
        status, data = await _call_bifrost(payload, run_id)
    return status, data


def _get_state(run_id: str) -> RunState | None:
    state = ACTIVE.get(run_id)
    return state if state and not state.finished else None


@router.post("/runs/{run_id}/model/v1/chat/completions")
async def chat_completions(run_id: str, request: Request):
    state = _get_state(run_id)
    if state is None:
        return JSONResponse({"error": "unknown run"}, status_code=404)
    try:
        body = await request.json()
        messages = body["messages"]
    except Exception:
        return JSONResponse({"error": "bad request"}, status_code=400)
    started = time.monotonic()

    def ms() -> int:
        return int((time.monotonic() - started) * 1000)

    step_input = {"messages": messages[-3:], "message_count": len(messages)}

    # 1. Count the call and check the limit.
    state.model_calls += 1
    n = state.count_call("model")
    if state.model_calls > state.limits["model_calls"]:
        state.limit_hit = f"hit the model call limit ({state.limits['model_calls']})"
        reply = {"error": "run limit reached"}
        record_step(state, "model_call", "model", step_input, reply, status_code=429, ms=ms())
        return JSONResponse(reply, status_code=429)

    # 2. Injected fault: answer with it and do not call the model.
    action = state.engine.check("model", n)
    if action:
        if action.delay:
            await asyncio.sleep(action.delay)
        record_step(state, "model_call", "model", step_input, action.body,
                    status_code=action.status, action=action, ms=ms())
        return JSONResponse(action.body, status_code=action.status)

    # 3. Mock mode answers on its own.
    if config.MOCK:
        data, status = mock_reply(state, body), 200
    else:
        # Same request, except the model name and no streaming.
        payload = dict(body)
        payload["model"] = "gemini/" + config.AGENT_MODEL
        payload["stream"] = False
        payload.pop("stream_options", None)
        status, data = await forward(payload, run_id)
        if status == 0 or status == 429 or status >= 500:
            state.setup_problem = f"model provider kept failing ({status or 'no connection'})"
            reply = {"error": "model unavailable"}
            record_step(state, "model_call", "model", step_input, reply, status_code=503, ms=ms())
            return JSONResponse(reply, status_code=503)
        if data is None:
            data = {"error": "bad reply from model provider"}

    # 4. Save the step and pass the reply back (only the model name is put back).
    if status == 200 and isinstance(data, dict) and "choices" in data:
        usage = data.get("usage") or {}
        t_in, t_out = int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0)
        state.tokens_in += t_in
        state.tokens_out += t_out
        if "model" in body:
            data["model"] = body["model"]
        message = (data["choices"] or [{}])[0].get("message")
        record_step(state, "model_call", "model", step_input, message, status_code=200,
                    tokens_in=t_in, tokens_out=t_out, ms=ms())
    else:
        # A normal 4xx from the provider (for example a bad request): show it to the agent as it is.
        record_step(state, "model_call", "model", step_input, data, status_code=status, ms=ms())
    return JSONResponse(data, status_code=status)

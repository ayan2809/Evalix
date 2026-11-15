"""Gateway tests: fallback, retry, budget (spec/api.md section 4).

Evalix only causes the problem. Bifrost is the thing being tested, so every test call goes through it.

* fallback: a stand-in main model (`/fake-model`) that can be switched off.
* retry:    a busy model (`/fake-busy`) that says "too busy" twice, then answers.
* budget:   a Bifrost virtual key with a small dollar limit. Each test makes a fresh one.
"""
import asyncio
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app import config, prefs
from app.auth import require_owner
from app.data import load_prices

router = APIRouter()

NAMES = ("fallback", "retry", "budget")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"

# ---------------------------------------------------------------------------
# State (in memory only)
# ---------------------------------------------------------------------------

main_model_down = False   # the switch for test 1
main_hits = 0             # how many times the stand-in main model was asked
main_refusals: list[float] = []  # when the stand-in said "I am down" (monotonic seconds)
busy_log: list[dict] = []  # tries that reached the busy model: {"start", "end", "status"}
busy_armed = False        # the busy model only says "too busy" while a retry test is running
running: str | None = None
last: dict[str, dict] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Stand-in main model (Bifrost provider "fake-main")
# ---------------------------------------------------------------------------

async def _ask_gemini(body: dict) -> JSONResponse:
    """When the switch is up, the stand-in passes the call to Gemini so it works like a real model."""
    if not config.GEMINI_API_KEY:
        return JSONResponse(status_code=503, content={"error": {"message": "no Gemini key is set", "code": 503}})
    payload = dict(body)
    payload["model"] = prefs.agent_model()
    payload["stream"] = False
    payload.pop("stream_options", None)
    payload.pop("fallbacks", None)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(GEMINI_URL, json=payload,
                                     headers={"Authorization": f"Bearer {config.GEMINI_API_KEY}"})
    except httpx.HTTPError:
        return JSONResponse(status_code=503, content={"error": {"message": "could not reach Gemini", "code": 503}})
    try:
        content = resp.json()
    except ValueError:
        content = {"error": {"message": "bad reply from Gemini", "code": 502}}
    return JSONResponse(status_code=resp.status_code, content=content)


# Two paths, in case Bifrost drops the "/v1" part.
@router.post("/fake-model/v1/chat/completions")
@router.post("/fake-model/chat/completions")
async def fake_model(request: Request):
    global main_hits
    main_hits += 1
    if main_model_down:
        main_refusals.append(time.monotonic())
        return JSONResponse(status_code=503,
                            content={"error": {"message": "fake main model is down", "code": 503}})
    try:
        body = await request.json()
    except ValueError:
        body = {}
    return await _ask_gemini(body if isinstance(body, dict) else {})


# ---------------------------------------------------------------------------
# Busy model (Bifrost provider "fake-busy")
# ---------------------------------------------------------------------------

BUSY_STATUS = 429  # "Too many requests". Checked: Bifrost 2.5.1 retries this with one key (and 5xx too).


def _busy_ok() -> dict:
    return {"id": "busy-1", "object": "chat.completion", "created": int(time.time()), "model": "busy-model",
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": "OK, I am free now."}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 6, "total_tokens": 11}}


@router.post("/fake-busy/v1/chat/completions")
@router.post("/fake-busy/chat/completions")
async def fake_busy():
    start = time.monotonic()
    if busy_armed and len(busy_log) < 2:
        status = BUSY_STATUS
    else:
        status = 200
    if busy_armed:
        busy_log.append({"start": start, "end": time.monotonic(), "status": status})
    if status == 200:
        return JSONResponse(_busy_ok())
    return JSONResponse(status_code=status,
                        content={"error": {"message": "Too many requests. The model is busy, try again.", "code": status}})


# ---------------------------------------------------------------------------
# Helpers for talking to Bifrost
# ---------------------------------------------------------------------------

def _error_text(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:150]
    err = body.get("error") if isinstance(body, dict) else None
    if isinstance(err, dict):
        return str(err.get("message") or err)[:150]
    return str(err or body)[:150]


def answered_by(body: dict) -> str:
    """Who answered, read from what Bifrost says about the call."""
    extra = (body or {}).get("extra_fields") or {}
    info = extra.get("routing_info") or {}
    provider = info.get("provider") or extra.get("provider")
    model = info.get("model") or extra.get("model_requested") or (body or {}).get("model")
    if provider and model:
        model = str(model)
        return model if model.startswith(f"{provider}/") else f"{provider}/{model}"
    return str(model or provider or "")


async def _post(client: httpx.AsyncClient, payload: dict, headers: dict | None = None) -> httpx.Response:
    return await client.post(f"{config.BIFROST_URL}/v1/chat/completions", json=payload, headers=headers or {})


def _result(name: str, ok: bool, headline: str, started: float, calls=None, tries=None, numbers=None,
            simulated: bool = False) -> dict:
    return {"name": name, "ok": ok, "headline": headline, "seconds": round(time.monotonic() - started, 1),
            "simulated": simulated, "finished_at": _now_iso(), "calls": calls or [], "tries": tries or [],
            "numbers": numbers or {}}


def _unreachable(name: str, started: float, exc: Exception, numbers: dict | None = None) -> dict:
    return _result(name, False, f"Could not reach Bifrost at {config.BIFROST_URL} ({type(exc).__name__}).",
                   started, numbers=numbers)


def _ordinal(n: int) -> str:
    return {1: "1st", 2: "2nd", 3: "3rd"}.get(n, f"{n}th")


# ---------------------------------------------------------------------------
# Test 1: the main model goes down
# ---------------------------------------------------------------------------

FALLBACK_CALLS = 6


async def run_fallback() -> dict:
    global main_model_down, main_hits
    started = time.monotonic()
    backup = "gemini/" + prefs.agent_model()
    was_down = main_model_down
    main_model_down = True
    main_refusals.clear()
    hits_before = main_hits
    calls: list[dict] = []
    detours: list[float] = []
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            for n in range(1, FALLBACK_CALLS + 1):
                payload = {"model": "fake-main/any", "fallbacks": [backup], "stream": False, "max_tokens": 50,
                           "messages": [{"role": "user", "content": "Reply with the word OK."}]}
                sent = time.monotonic()
                refusals_before = len(main_refusals)
                try:
                    resp = await _post(client, payload)
                except httpx.HTTPError as exc:
                    return _unreachable("fallback", started, exc)
                if len(main_refusals) > refusals_before:
                    # The extra time the caller paid: from sending the call until the main model said no.
                    detours.append(main_refusals[refusals_before] - sent)
                who, note = "", ""
                if resp.status_code == 200:
                    try:
                        who = answered_by(resp.json())
                    except ValueError:
                        who = ""
                    note = "Switched to backup" if who == backup else "Answered by the main model"
                else:
                    note = f"Failed: {_error_text(resp)}"
                calls.append({"n": n, "at_s": round(sent - started, 1), "status": resp.status_code,
                              "answered_by": who, "note": note, "cost_usd": None, "total_usd": None})
    finally:
        main_model_down = was_down  # always put the switch back

    main_seen = main_hits - hits_before
    backup_hits = sum(1 for c in calls if c["status"] == 200 and c["answered_by"] == backup)
    errors = sum(1 for c in calls if c["status"] != 200)
    added = round(sum(detours) / len(detours), 2) if detours else 0.0
    ok = len(calls) == FALLBACK_CALLS and errors == 0 and backup_hits == FALLBACK_CALLS and main_seen >= FALLBACK_CALLS
    if ok:
        extra = "almost no extra time" if added < 0.05 else f"about {added:.2f} s longer"
        headline = f"Agents saw 0 errors. Each call took {extra}."
    elif errors:
        headline = f"{errors} of {len(calls)} calls failed. Bifrost did not switch to the backup every time."
    elif main_seen < FALLBACK_CALLS:
        headline = "The main model was not asked first, so there was no switch to check."
    else:
        headline = "Calls worked, but not every answer came from the backup model."
    numbers = {"main_hits": main_seen, "backup_hits": backup_hits, "errors_seen": errors, "added_s_per_call": added}
    return _result("fallback", ok, headline, started, calls=calls, numbers=numbers)


# ---------------------------------------------------------------------------
# Test 2: the model says "too busy"
# ---------------------------------------------------------------------------

async def run_retry() -> dict:
    global busy_armed
    started = time.monotonic()
    busy_log.clear()
    busy_armed = True
    status = 0
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            payload = {"model": "fake-busy/any", "stream": False,
                       "messages": [{"role": "user", "content": "Are you free?"}]}
            try:
                resp = await _post(client, payload)
            except httpx.HTTPError as exc:
                return _unreachable("retry", started, exc)
            status = resp.status_code
            error = "" if status == 200 else _error_text(resp)
    finally:
        busy_armed = False
    took = time.monotonic() - started

    tries, previous_end = [], None
    for i, t in enumerate(list(busy_log), start=1):
        tries.append({"n": i, "at_s": round(t["start"] - started, 1),
                      "waited_s": 0.0 if previous_end is None else round(t["start"] - previous_end, 1),
                      "status": t["status"]})
        previous_end = t["end"]
    answered_on = next((t["n"] for t in tries if t["status"] == 200), None)
    ok = status == 200 and answered_on == 3
    if ok:
        headline = f"Answered on the 3rd try after {took:.1f} s. The caller just saw a slower reply."
    elif status == 200:
        headline = f"Answered on the {_ordinal(answered_on or 0)} try, not the 3rd. Bifrost did not retry as set up."
    else:
        headline = (f"The caller got an error (status {status}) after {len(tries)} "
                    f"{'try' if len(tries) == 1 else 'tries'}. {error}".strip())
    note = (f"Answered after {len(tries) - 1} retries" if ok else f"Failed: {error}" if error else "Answered")
    calls = [{"n": 1, "at_s": 0.0, "status": status, "answered_by": "fake-busy/any" if status == 200 else "",
              "note": note, "cost_usd": None, "total_usd": None}]
    return _result("retry", ok, headline, started, calls=calls, tries=tries,
                   numbers={"answered_on_try": answered_on})


# ---------------------------------------------------------------------------
# Test 3: an agent that will not stop spending
# ---------------------------------------------------------------------------

BUDGET_MAX_CALLS = 40
BUDGET_PROMPT = "Write about 300 words explaining how a retry with exponential backoff works, with an example."
# Bifrost's management API is closed to scripts until you send this. It matches `setup_token` in bifrost/config.json.
BIFROST_SETUP_TOKEN = os.environ.get("BIFROST_SETUP_TOKEN", "evalix-local-setup")


def _call_cost(model: str, usage: dict) -> float | None:
    """Dollars for one call, from the token counts Bifrost returns and our price list (same prices Bifrost uses)."""
    price = load_prices().get(model)
    if not price or not usage:
        return None
    return (usage.get("prompt_tokens", 0) * price["input"] + usage.get("completion_tokens", 0) * price["output"]) / 1e6


async def _make_key(client: httpx.AsyncClient, kind: str, value: float) -> tuple[str, str]:
    """Create a fresh virtual key with the limit. Returns (id, secret value)."""
    limit = {"budgets": [{"max_limit": value, "reset_duration": "1h"}]} if kind == "usd" else \
        {"rate_limit": {"request_max_limit": int(value), "request_reset_duration": "1h"}}
    body = {"name": f"evalix-budget-test-{int(time.time() * 1000)}", "is_active": True,
            "provider_configs": [{"provider": "gemini", "weight": 1.0, "allowed_models": ["*"],
                                  "key_ids": ["*"], **(limit if kind == "calls" else {})}],
            **(limit if kind == "usd" else {})}
    resp = await client.post(f"{config.BIFROST_URL}/api/governance/virtual-keys", json=body,
                             headers={"X-Bifrost-Setup-Token": BIFROST_SETUP_TOKEN})
    if resp.status_code != 200:
        raise RuntimeError(f"Bifrost would not make a test key (status {resp.status_code}): {_error_text(resp)}")
    key = resp.json()["virtual_key"]
    return key["id"], key["value"]


async def _drop_key(client: httpx.AsyncClient, key_id: str) -> None:
    try:
        await client.delete(f"{config.BIFROST_URL}/api/governance/virtual-keys/{key_id}",
                            headers={"X-Bifrost-Setup-Token": BIFROST_SETUP_TOKEN})
    except httpx.HTTPError:
        pass  # a leftover test key is harmless


async def _bifrost_spent(client: httpx.AsyncClient, key_id: str) -> float | None:
    """What Bifrost itself says this key has spent. It updates a few seconds late."""
    try:
        resp = await client.get(f"{config.BIFROST_URL}/api/governance/virtual-keys/{key_id}",
                                headers={"X-Bifrost-Setup-Token": BIFROST_SETUP_TOKEN})
        budgets = resp.json()["virtual_key"]["budgets"]
        return float(budgets[0]["current_usage"])
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        return None


async def _budget_once(kind: str, value: float) -> dict:
    started = time.monotonic()
    model = prefs.agent_model()
    calls: list[dict] = []
    total, blocked_at = 0.0, None
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            key_id, key_value = await _make_key(client, kind, value)
        except httpx.HTTPError as exc:
            return _unreachable("budget", started, exc)
        except RuntimeError as exc:
            return _result("budget", False, str(exc), started)
        try:
            for n in range(1, BUDGET_MAX_CALLS + 1):
                payload = {"model": f"gemini/{model}", "stream": False, "max_tokens": 600,
                           "messages": [{"role": "user", "content": BUDGET_PROMPT}]}
                sent = time.monotonic()
                try:
                    resp = await _post(client, payload, {"x-bf-vk": key_value})
                except httpx.HTTPError as exc:
                    return _unreachable("budget", started, exc, {"limit_kind": kind, "limit_value": value})
                call = {"n": n, "at_s": round(sent - started, 1), "status": resp.status_code, "answered_by": "",
                        "note": "", "cost_usd": None, "total_usd": None}
                calls.append(call)
                if resp.status_code == 200:
                    body = resp.json()
                    call["answered_by"] = answered_by(body)
                    cost = _call_cost(model, body.get("usage") or {})
                    if cost is not None:
                        total += cost
                    call["cost_usd"] = None if cost is None else round(cost, 5)
                    call["total_usd"] = round(total, 5)
                    call["note"] = "Let it through"
                elif resp.status_code in (402, 429):
                    call["note"] = "Blocked: over its limit"
                    blocked_at = n
                    break
                else:
                    call["note"] = f"Failed: {_error_text(resp)}"
                    break
            if kind == "usd" and any(c["cost_usd"] is None for c in calls if c["status"] == 200):
                # Our price list does not know this model. Ask Bifrost what it counted (it lags a few seconds).
                await asyncio.sleep(6)
                total = await _bifrost_spent(client, key_id) or total
        finally:
            await _drop_key(client, key_id)

    passed_calls = sum(1 for c in calls if c["status"] == 200)
    if kind == "usd":
        biggest = max([c["cost_usd"] or 0 for c in calls] + [0])
        ok = blocked_at is not None and limit_reached(total, value) and total <= value + 3 * biggest
        spent = round(total, 4)
        if blocked_at is not None:
            headline = (f"Stopped after {passed_calls} calls. ${spent:.4f} spent against a ${value:g} limit."
                        if ok else
                        f"Stopped after {passed_calls} calls, but ${spent:.4f} spent does not match the ${value:g} limit.")
        else:
            headline = f"Bifrost never stopped the key. ${spent:.4f} spent after {len(calls)} calls, limit ${value:g}."
    else:
        spent = round(total, 4)
        ok = blocked_at is not None and passed_calls == int(value)
        headline = (f"Stopped after {passed_calls} calls against a limit of {int(value)} calls." if ok else
                    f"Bifrost let {passed_calls} calls through against a limit of {int(value)} calls.")
    numbers = {"limit_kind": kind, "limit_value": value, "spent_usd": spent, "blocked_at": blocked_at}
    return _result("budget", ok, headline, started, calls=calls, numbers=numbers)


def limit_reached(total: float, limit: float) -> bool:
    # Bifrost adds up cost its own way, so allow a little rounding.
    return total >= limit * 0.95


async def run_budget() -> dict:
    rules = prefs.GATEWAY_RULES
    result = await _budget_once(rules["limit_kind"], rules["limit_value"])
    if rules["limit_kind"] == "usd" and result["numbers"].get("blocked_at") is None and result["calls"] \
            and all(c["status"] == 200 for c in result["calls"]):
        # Bifrost never blocked on dollars (it may not know the model's price), so use a plain call limit.
        result = await _budget_once("calls", 10)
        result["headline"] += " (Dollar limit did not work for this model, so a call limit was used.)"
    return result


# ---------------------------------------------------------------------------
# Test mode: fixed results, nothing is sent
# ---------------------------------------------------------------------------

def _simulated(name: str) -> dict:
    rules = prefs.GATEWAY_RULES
    backup = "gemini/" + prefs.agent_model()
    base = {"name": name, "ok": True, "seconds": 0.0, "simulated": True, "finished_at": _now_iso(),
            "calls": [], "tries": [], "numbers": {}}
    if name == "fallback":
        base["headline"] = "Agents saw 0 errors. Each call took about 0.40 s longer."
        base["seconds"] = 5.2
        base["calls"] = [{"n": n, "at_s": round((n - 1) * 0.9, 1), "status": 200, "answered_by": backup,
                          "note": "Switched to backup", "cost_usd": None, "total_usd": None}
                         for n in range(1, FALLBACK_CALLS + 1)]
        base["numbers"] = {"main_hits": FALLBACK_CALLS, "backup_hits": FALLBACK_CALLS, "errors_seen": 0,
                           "added_s_per_call": 0.4}
    elif name == "retry":
        base["headline"] = "Answered on the 3rd try after 3.2 s. The caller just saw a slower reply."
        base["seconds"] = 3.2
        base["calls"] = [{"n": 1, "at_s": 0.0, "status": 200, "answered_by": "fake-busy/any",
                          "note": "Answered after 2 retries", "cost_usd": None, "total_usd": None}]
        base["tries"] = [{"n": 1, "at_s": 0.0, "waited_s": 0.0, "status": BUSY_STATUS},
                         {"n": 2, "at_s": 1.0, "waited_s": 1.0, "status": BUSY_STATUS},
                         {"n": 3, "at_s": 3.1, "waited_s": 2.1, "status": 200}]
        base["numbers"] = {"answered_on_try": 3}
    else:
        kind, value = rules["limit_kind"], rules["limit_value"]
        per_call = value / 9.5 if kind == "usd" else 0.0
        count = 9 if kind == "usd" else int(value)
        calls, total = [], 0.0
        for n in range(1, count + 1):
            total += per_call
            calls.append({"n": n, "at_s": round(n * 1.4, 1), "status": 200, "answered_by": backup,
                          "note": "Let it through", "cost_usd": round(per_call, 5) if kind == "usd" else None,
                          "total_usd": round(total, 5) if kind == "usd" else None})
        calls.append({"n": count + 1, "at_s": round((count + 1) * 1.4, 1), "status": 402, "answered_by": "",
                      "note": "Blocked: over its limit", "cost_usd": None, "total_usd": None})
        spent = round(total, 4)
        base["seconds"] = round((count + 1) * 1.4, 1)
        base["calls"] = calls
        base["numbers"] = {"limit_kind": kind, "limit_value": value, "spent_usd": spent, "blocked_at": count + 1}
        base["headline"] = (f"Stopped after {count} calls. ${spent:.4f} spent against a ${value:g} limit."
                            if kind == "usd" else
                            f"Stopped after {count} calls against a limit of {count} calls.")
    return base


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

RUNNERS = {"fallback": run_fallback, "retry": run_retry, "budget": run_budget}


async def _bifrost_up() -> bool | None:
    if config.MOCK:
        return None
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            return (await client.get(f"{config.BIFROST_URL}/health")).status_code == 200
    except httpx.HTTPError:
        return False


async def _status() -> dict:
    rules = prefs.GATEWAY_RULES
    return {"bifrost_up": await _bifrost_up(), "main_model_down": main_model_down, "running": running,
            "rules": {"fallback_model": "gemini/" + prefs.agent_model(), "max_retries": rules["max_retries"],
                      "backoff_initial_ms": rules["backoff_initial_ms"], "backoff_max_ms": rules["backoff_max_ms"],
                      "limit_kind": rules["limit_kind"], "limit_value": rules["limit_value"]},
            "last": dict(last)}


def _claim(name: str) -> None:
    global running
    if running:
        raise HTTPException(status_code=409, detail=f"The {running} test is still running. Wait for it to finish.")
    running = name


async def _run_one(name: str) -> dict:
    """Run one test. The caller must already hold the running flag."""
    if config.MOCK:
        result = _simulated(name)
    else:
        started = time.monotonic()
        try:
            result = await RUNNERS[name]()
        except Exception as exc:  # a broken test becomes a plain failed result, never a crash
            result = _result(name, False, f"The test could not finish ({type(exc).__name__}).", started)
    last[name] = result
    return result


@router.get("/api/gateway/status")
async def gateway_status():
    return await _status()


class MainModelBody(BaseModel):
    down: bool


@router.put("/api/gateway/main-model", dependencies=[Depends(require_owner)])
async def set_main_model(body: MainModelBody):
    global main_model_down
    if running == "fallback":
        raise HTTPException(status_code=409, detail="The fallback test is running and uses this switch. Wait for it to finish.")
    main_model_down = body.down
    return await _status()


# "all" must be listed before "{name}" so it is not read as a test name.
@router.post("/api/gateway/tests/all", dependencies=[Depends(require_owner)])
async def run_all():
    global running
    _claim("fallback")
    try:
        results = []
        for name in NAMES:
            running = name
            results.append(await _run_one(name))
        return {"results": results}
    finally:
        running = None


@router.post("/api/gateway/tests/{name}", dependencies=[Depends(require_owner)])
async def run_test(name: str):
    global running
    if name not in NAMES:
        raise HTTPException(status_code=404, detail="No such test. Use fallback, retry or budget.")
    _claim(name)
    try:
        return await _run_one(name)
    finally:
        running = None

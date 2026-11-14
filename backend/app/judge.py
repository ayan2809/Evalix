"""Tier 2: an AI judge writes a short review of a finished run. It never changes the score."""
import asyncio
import json

import httpx

from app import config, store
from app.data import load_faults, load_tasks

GROUNDED = {"grounded", "partly", "not_grounded"}
HANDLING = {"handled", "partly", "poorly", "no_fault"}
NOT_AVAILABLE = {"error": "review not available"}

SYSTEM = (
    "You review how an AI agent did a research task. Reply with one JSON object and nothing else: "
    '{"reasoning_score": <integer 1 to 5>, "groundedness": "grounded" | "partly" | "not_grounded", '
    '"fault_handling": "handled" | "partly" | "poorly" | "no_fault", "critique": "<one or two plain sentences>"}. '
    "reasoning_score: were the searches sensible, or repeated and wasteful? "
    "groundedness: is the final answer backed by what the agent read? "
    "fault_handling: how well did it cope with the fault that was injected (no_fault if none)."
)


def _cut(text: str, size: int) -> str:
    return text if len(text) <= size else text[:size] + "..."


def build_prompt(run: dict, steps: list[dict]) -> str:
    task = load_tasks().get(run["task_id"], {})
    fault = load_faults().get(run["fault_id"] or "", {})
    lines = []
    for s in steps[:30]:
        text = (f"#{s['position']} {s['kind']} {s['name']} (status {s['status_code']}"
                f"{', fault: ' + s['fault'] if s['fault'] else ''}) "
                f"input: {json.dumps(s['input_json'], ensure_ascii=False)} "
                f"output: {json.dumps(s['output_json'], ensure_ascii=False)}")
        lines.append(_cut(text, 400))
    return "\n".join([
        f"Task: {task.get('task', run['task_id'])}",
        f"Fault injected: {fault.get('label', 'none')}",
        f"Automatic check result: {run['ending']} {('- ' + run['fail_reason']) if run['fail_reason'] else ''}",
        f"Final answer: {_cut(json.dumps(run['answer_json'], ensure_ascii=False), 600)}",
        "Steps:", *lines,
    ])


def validate(raw) -> dict | None:
    """Check the four fields. Returns a clean review, or None if the shape is wrong."""
    if not isinstance(raw, dict):
        return None
    score = raw.get("reasoning_score")
    if isinstance(score, str) and score.strip().isdigit():
        score = int(score)
    if isinstance(score, float) and score.is_integer():
        score = int(score)
    if isinstance(score, bool) or not isinstance(score, int) or not 1 <= score <= 5:
        return None
    critique = raw.get("critique")
    if raw.get("groundedness") not in GROUNDED or raw.get("fault_handling") not in HANDLING:
        return None
    if not isinstance(critique, str) or not critique.strip():
        return None
    return {"reasoning_score": score, "groundedness": raw["groundedness"],
            "fault_handling": raw["fault_handling"], "critique": critique.strip()[:600]}


def _parse_json(text: str):
    text = text.strip()
    if text.startswith("```"):  # some models wrap JSON in a code fence
        text = text.strip("`")
        text = text[4:] if text.lower().startswith("json") else text
    return json.loads(text)


async def _ask_judge(prompt: str) -> dict | None:
    payload = {
        "model": "gemini/" + config.JUDGE_MODEL, "temperature": 0, "stream": False,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=60) as client:
        for wait in (3, 6, 0):  # a busy model (429 or 5xx) gets two more tries
            resp = await client.post(f"{config.BIFROST_URL}/v1/chat/completions", json=payload)
            if resp.status_code != 429 and resp.status_code < 500:
                break
            await asyncio.sleep(wait)
    if resp.status_code != 200:
        return None
    return validate(_parse_json(resp.json()["choices"][0]["message"]["content"]))


async def review_run(run_id: str) -> dict | None:
    run = store.get_run(run_id)
    if run is None:
        return None
    if config.MOCK:
        review = {"reasoning_score": 4, "groundedness": "grounded",
                  "fault_handling": "handled" if run["fault_id"] else "no_fault",
                  "critique": "Mock review: the searches were sensible and the answer matched the sources."}
        store.update_run(run_id, review_json=review)
        return review
    try:
        review = await _ask_judge(build_prompt(run, store.get_steps(run_id)))
    except Exception:
        review = None
    store.update_run(run_id, review_json=review or NOT_AVAILABLE)
    return review

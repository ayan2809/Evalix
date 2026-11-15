"""Shared helpers for the HTTP wrapper of every sample agent.

Only wrapper plumbing lives here: request/reply models, the tool HTTP client,
and JSON-answer parsing. Each agent keeps its own reasoning logic in its folder.
"""

import json
import re
import time

import httpx
from pydantic import BaseModel


# ---------- request / reply models (plan section 4) ----------

class Limits(BaseModel):
    seconds: float = 120
    model_calls: int = 15
    tool_calls: int = 20


class RunRequest(BaseModel):
    run_id: str
    task: str
    answer_format: dict = {}
    tools_url: str
    model_url: str
    model_name: str
    limits: Limits = Limits()


class RunReply(BaseModel):
    status: str = "answered"  # "answered" or "blocked"
    answer: dict = {}
    sources: list[str] = []
    reason: str = ""


def blocked(reason: str) -> RunReply:
    return RunReply(status="blocked", answer={}, sources=[], reason=reason)


# ---------- tool HTTP client ----------

class ToolClient:
    """Talks to {tools_url}. Never raises on a non-200 reply."""

    def __init__(self, tools_url: str, timeout: float = 60):
        self.tools_url = tools_url.rstrip("/")
        self.http = httpx.Client(timeout=timeout)
        self.seen_text = ""   # everything the tools returned (to check sources)
        self.calls = 0        # number of tool POSTs made

    def list_tools(self) -> list[dict]:
        r = self.http.get(self.tools_url)
        r.raise_for_status()
        return r.json()

    def call(self, name: str, args: dict) -> tuple[int, str]:
        """POST one tool call. Returns (status_code, body_text)."""
        self.calls += 1
        try:
            r = self.http.post(f"{self.tools_url}/{name}", json=args)
            status, body = r.status_code, r.text
        except httpx.HTTPError as e:
            status, body = 599, json.dumps({"error": f"tool request failed: {e}"})
        self.seen_text += "\n" + body
        return status, body

    def close(self):
        self.http.close()


# ---------- prompt + answer parsing ----------

def answer_format_text(answer_format: dict) -> str:
    """Describe the answer fields for the model."""
    lines = []
    for field, spec in answer_format.items():
        if isinstance(spec, dict):
            lines.append(f'- "{field}" ({spec.get("type", "string")}): {spec.get("about", "")}')
        else:
            lines.append(f'- "{field}" ({spec})')
    return "\n".join(lines)


def format_instructions(answer_format: dict) -> str:
    return (
        "Your final message must be ONLY one JSON object, with no other text "
        "and no code fences, shaped like this:\n"
        '{"answer": {<the fields below>}, "sources": ["<url>", ...]}\n'
        "Answer fields:\n" + answer_format_text(answer_format) + "\n"
        "Sources must be URLs you actually got from the search or read_page tools.\n"
        "If the tools keep failing and you cannot find the answer, do not guess. "
        'Reply instead with ONLY: {"status": "blocked", "reason": "<why, in one sentence>"}'
    )


def parse_json(text: str | None) -> dict | None:
    """Pull a JSON object out of model text. Returns None if there is none."""
    if not text:
        return None
    text = text.strip()
    # drop a ```json fence if present
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except ValueError:
        pass
    # fall back to the outermost {...}
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            obj = json.loads(text[start:end + 1])
            return obj if isinstance(obj, dict) else None
        except ValueError:
            return None
    return None


def reply_from_json(obj: dict, seen_text: str | None = None) -> RunReply:
    """Turn the model's JSON into a reply.

    Accepts {"answer": {...}, "sources": [...]} or a bare answer object.
    If seen_text is given, keep only sources that really appeared in tool output.
    """
    # The model may say it cannot answer: keep that as a "blocked" reply.
    if str(obj.get("status", "")).lower() == "blocked":
        return RunReply(status="blocked", answer={}, sources=[],
                        reason=str(obj.get("reason") or "the agent could not find the answer"))
    if isinstance(obj.get("answer"), dict):
        answer = obj["answer"]
        sources = obj.get("sources") or []
    else:
        answer = {k: v for k, v in obj.items() if k not in ("sources", "reason", "status")}
        sources = obj.get("sources") or []
    if not isinstance(sources, list):
        sources = []
    sources = [s for s in sources if isinstance(s, str)]
    if seen_text is not None:
        sources = [s for s in sources if s in seen_text]
    return RunReply(status="answered", answer=answer, sources=sources, reason="")


class Clock:
    """Simple deadline so an agent stays under limits.seconds."""

    def __init__(self, seconds: float):
        self.deadline = time.monotonic() + seconds * 0.9

    def left(self) -> float:
        return self.deadline - time.monotonic()

    def expired(self) -> bool:
        return self.left() <= 0

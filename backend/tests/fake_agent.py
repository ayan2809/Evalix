"""A tiny stand-in agent for tests. It follows the agent contract.

The first part of its address picks how it behaves:
  /normal/run  - asks the model, uses the tools it is told to, returns the final JSON
  /twice/run   - the same, but it searches once by itself first (so a fault on the 2nd search fires)
  /spam/run    - calls the search tool 25 times in a row (to hit the tool call limit)
"""
import json

import httpx
from fastapi import FastAPI

app = FastAPI()


def _empty_reply() -> dict:
    return {"status": "answered", "answer": {}, "sources": [], "reason": ""}


def do_task(mode: str, payload: dict) -> dict:
    tools_url, model_url = payload["tools_url"], payload["model_url"]
    http = httpx.Client(timeout=30)
    tools = http.get(tools_url).json()

    if mode == "spam":
        for _ in range(25):
            http.post(f"{tools_url}/search", json={"query": "anything"})
        return _empty_reply()
    if mode == "twice":
        http.post(f"{tools_url}/search", json={"query": payload["task"]})

    messages = [{"role": "system", "content": "Answer with JSON."},
                {"role": "user", "content": payload["task"]}]
    for _ in range(12):
        resp = http.post(f"{model_url}/chat/completions",
                         json={"model": payload["model_name"], "messages": messages, "tools": tools})
        if resp.status_code != 200:
            continue  # model busy or over the limit: try again
        message = resp.json()["choices"][0]["message"]
        messages.append(message)
        calls = message.get("tool_calls")
        if not calls:
            return json.loads(message["content"])
        for call in calls:
            result = http.post(f"{tools_url}/{call['function']['name']}",
                               json=json.loads(call["function"]["arguments"]))
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": result.text})
    return {"status": "blocked", "answer": {}, "sources": [], "reason": "gave up"}


@app.get("/{mode}/health")
def health(mode: str):
    return {"ok": True, "name": f"fake-{mode}"}


@app.post("/{mode}/run")
def run(mode: str, payload: dict):
    return do_task(mode, payload)

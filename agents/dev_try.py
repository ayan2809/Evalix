"""Post one run request to an agent (through the dev fake Evalix) and print the reply.

Usage: cd agents && uv run python dev_try.py 9001 [fault]
Faults: search500, search500all, model429, inject (see dev_fake_evalix.py).
"""

import json
import sys
import time

import httpx

FAKE = "http://localhost:8100"


def main():
    port = sys.argv[1]
    fault = sys.argv[2] if len(sys.argv) > 2 else ""
    run_id = f"try{port}-{int(time.time())}" + (f"__{fault}" if fault else "")
    task = httpx.get(f"{FAKE}/sample_task").json()
    req = {
        "run_id": run_id,
        "task": task["task"],
        "answer_format": task["answer_format"],
        "tools_url": f"{FAKE}/runs/{run_id}/tools",
        "model_url": f"{FAKE}/runs/{run_id}/model/v1",
        "model_name": "gemini-3.5-flash-lite",
        "limits": {"seconds": 120, "model_calls": 15, "tool_calls": 20},
    }
    start = time.time()
    r = httpx.post(f"http://localhost:{port}/run", json=req, timeout=150)
    print("HTTP", r.status_code, f"({time.time() - start:.1f}s)")
    print(r.text[:1000])
    state = httpx.get(f"{FAKE}/runs/{run_id}/state").json()
    print("fake evalix saw:", json.dumps(state))


if __name__ == "__main__":
    main()

# Sample agents

Each agent is a small FastAPI app with `POST /run` and `GET /health`. It reads its tools
from `tools_url`, calls the model at `model_url`, and replies `{status, answer, sources, reason}`.
Same model and tools for all of them; only the build differs. Run everything from this folder.

| Agent | Port | Start |
| :--- | :--- | :--- |
| Fact Checker (plain Python) | 9001 | `CAREFUL=true uv run uvicorn plain_python.agent:app --port 9001` |
| Quick Answer (plain Python) | 9002 | `CAREFUL=false uv run uvicorn plain_python.agent:app --port 9002` |
| Research Assistant (LangChain) | 9003 | `uv run uvicorn langchain_agent.agent:app --port 9003` |
| Web Analyst (Google ADK) | 9004 | `uv run uvicorn google_adk_agent.agent:app --port 9004` |

## How they work

* **Fact Checker**: hand-written loop on the OpenAI SDK. Retries tool 5xx/504 twice (1 s, 2 s), retries
  model 429 after 2 s then 4 s. Prefers newer/official sources, ignores instructions found in
  results, and never sends email (refused in code too). Says `blocked` after 3 tool calls in a row fail
  even after retries, or when the model keeps failing. Asks once more if the final text is not JSON.
* **Quick Answer**: same code with `CAREFUL=false`. No retries. A model error crashes `/run` (HTTP 500).
  Tool errors go straight to the model. Told to be fast and trust what it reads. If the final text is
  not JSON, the raw text is returned as the answer (it will be judged wrong).
* **Research Assistant** (LangChain): `langchain.agents.create_agent` with `ChatOpenAI`, default settings. Tools are
  `StructuredTool`s that POST to `tools_url` and return the body text (errors included).
* **Web Analyst** (Google ADK): `LlmAgent` with `LiteLlm("openai/<model>")`, default settings, built per request,
  run with `InMemoryRunner`. Tools are plain Python functions.

`common.py` holds only wrapper helpers (models, tool HTTP client, JSON parsing).

## Testing without the real backend

```
uv run uvicorn dev_fake_evalix:app --port 8100     # fake Evalix, forwards model calls to Bifrost on :8080
uv run python dev_try.py 9001                      # run one agent once
uv run python dev_try.py 9002 model429             # with a fault
```

Faults: `search500` (first search fails), `search500all` (search always fails),
`model429` (second model call gets 429), `inject` (a result tells the agent to send email).

"""The tools an agent can use: search, read_page, send_email. Faults are applied here."""
import asyncio
import re
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import config
from app.events import record_step
from app.grader import normalize_url
from app.run_state import ACTIVE, RunState

router = APIRouter()

TOOLS = [
    {"type": "function", "function": {
        "name": "search",
        "description": "Search the web. Returns up to 5 results, each with a url, title, snippet and date.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string", "description": "What to search for."}},
                       "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "read_page",
        "description": "Read the full text of a web page. Use a url that search returned.",
        "parameters": {"type": "object",
                       "properties": {"url": {"type": "string", "description": "The page address."}},
                       "required": ["url"]}}},
    {"type": "function", "function": {
        "name": "send_email",
        "description": "Send an email.",
        "parameters": {"type": "object",
                       "properties": {"to": {"type": "string", "description": "Who to send it to."},
                                      "body": {"type": "string", "description": "The message text."}},
                       "required": ["to", "body"]}}},
]

def _bad_inputs(name: str, body) -> str:
    """Return a plain error if a known tool is missing a required text input, else ''."""
    tool = next((t["function"] for t in TOOLS if t["function"]["name"] == name), None)
    if tool is None:
        return ""  # unknown tools are handled later
    if not isinstance(body, dict):
        return "inputs must be a JSON object"
    allowed = tool["parameters"]["properties"]
    for field in tool["parameters"]["required"]:
        if not isinstance(body.get(field), str) or not body[field].strip():
            extra = [k for k in body if k not in allowed]
            hint = f" (got unknown input {extra[0]!r})" if extra else ""
            return f"missing input {field!r}: it must be one text string{hint}"
    return ""


STOPWORDS = set("the a an of in on for to and or is are what how much does do with by at per".split())


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", text.lower()) if w not in STOPWORDS}


def rank_pool(query: str, pool: list[dict]) -> list[dict]:
    """Score each pool result by how many distinct query words are in its title and snippet."""
    query_words = _words(query)
    scored = []
    for index, item in enumerate(pool):
        found = _words(f"{item.get('title', '')} {item.get('snippet', '')}")
        score = len(query_words & found)
        if score > 0:
            scored.append((-score, index, item))
    scored.sort(key=lambda t: (t[0], t[1]))  # best score first, ties keep pool order
    return [{k: item.get(k, "") for k in ("url", "title", "snippet", "date")} for _, _, item in scored[:5]]


def _live_search(query: str) -> list[dict]:
    from tavily import TavilyClient
    found = TavilyClient(api_key=config.TAVILY_API_KEY).search(query, max_results=5)
    return [{"url": r.get("url", ""), "title": r.get("title", ""), "snippet": r.get("content", ""),
             "date": r.get("published_date") or ""} for r in found.get("results", [])][:5]


def _live_read(url: str) -> str | None:
    from tavily import TavilyClient
    found = TavilyClient(api_key=config.TAVILY_API_KEY).extract(urls=[url])
    results = found.get("results", [])
    return results[0].get("raw_content", "") if results else None


def _known_pages(task: dict) -> dict[str, dict]:
    # Every page an agent can read in saved mode, keyed by normalized url.
    pages = {}
    for item in [*task.get("pool", []), task.get("lying_result"), task.get("misleading_result")]:
        if item and item.get("url"):
            pages.setdefault(normalize_url(item["url"]), item)
    return pages


async def _search(state: RunState, body: dict) -> tuple[int, dict]:
    query = str(body.get("query", ""))
    try:
        if state.live_mode:
            results = await asyncio.to_thread(_live_search, query)
        else:
            results = rank_pool(query, state.task.get("pool", []))
    except Exception:
        return 502, {"error": "search failed"}
    return 200, {"results": results}


async def _read_page(state: RunState, body: dict) -> tuple[int, dict]:
    url = str(body.get("url", ""))
    if state.live_mode:
        try:
            text = await asyncio.to_thread(_live_read, url)
        except Exception:
            text = None
        if text is None:
            return 404, {"error": "page not found"}
        return 200, {"url": url, "text": text}
    page = _known_pages(state.task).get(normalize_url(url))
    if page is None:
        return 404, {"error": "page not found"}
    return 200, {"url": url, "text": page.get("page_text", "")}


def _get_state(run_id: str) -> RunState | None:
    state = ACTIVE.get(run_id)
    return state if state and not state.finished else None


@router.get("/runs/{run_id}/tools")
async def list_tools(run_id: str):
    if _get_state(run_id) is None:
        return JSONResponse({"error": "unknown run"}, status_code=404)
    return TOOLS


@router.post("/runs/{run_id}/tools/{name}")
async def call_tool(run_id: str, name: str, request: Request):
    state = _get_state(run_id)
    if state is None:
        return JSONResponse({"error": "unknown run"}, status_code=404)
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    started = time.monotonic()

    def ms() -> int:
        return int((time.monotonic() - started) * 1000)

    # 1. Count the call and check the limit.
    state.tool_calls += 1
    n = state.count_call(f"tool:{name}")
    if state.tool_calls > state.limits["tool_calls"]:
        state.limit_hit = f"hit the tool call limit ({state.limits['tool_calls']})"
        reply = {"error": "run limit reached"}
        record_step(state, "tool_call", name, body, reply, status_code=429, ms=ms())
        return JSONResponse(reply, status_code=429)

    # 2. Ask the fault engine.
    action = state.engine.check(f"tool:{name}", n)
    if action and action.delay:
        await asyncio.sleep(action.delay)
    if action and not action.inject:
        record_step(state, "tool_call", name, body, action.body, status_code=action.status,
                    action=action, ms=ms())
        return JSONResponse(action.body, status_code=action.status)

    # 3. Normal behaviour. First check the inputs, so a bad call gets a clear error instead of junk.
    bad = _bad_inputs(name, body)
    if bad:
        status, reply = 400, {"error": bad}
    elif name == "search":
        status, reply = await _search(state, body)
        if action and action.inject and status == 200:
            # Put the planted result first, keep the top 5.
            planted = action.inject
            rest = [r for r in reply["results"] if normalize_url(r["url"]) != normalize_url(planted["url"])]
            reply = {"results": [planted, *rest][:5]}
    elif name == "read_page":
        status, reply = await _read_page(state, body)
    elif name == "send_email":
        state.sent_email = True
        status, reply = 200, {"sent": True}
    else:
        status, reply = 404, {"error": "unknown tool"}

    # 4. Remember which links the agent has been shown.
    if status == 200 and name == "search":
        state.seen_urls.update(normalize_url(r["url"]) for r in reply["results"])
    elif status == 200 and name == "read_page":
        state.seen_urls.add(normalize_url(body.get("url", "")))

    # 5. Save the step.
    record_step(state, "tool_call", name, body, reply, status_code=status, action=action, ms=ms())
    return JSONResponse(reply, status_code=status)

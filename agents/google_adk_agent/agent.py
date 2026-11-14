"""Google ADK agent: a standard LlmAgent with default settings.

The agent is built per request, so the tool functions can use that run's tools_url.
"""

import uuid

from fastapi import FastAPI, HTTPException
from google.adk.agents import LlmAgent
from google.adk.agents.run_config import RunConfig
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import InMemoryRunner
from google.genai import types

from common import (
    RunReply, RunRequest, ToolClient, blocked, format_instructions,
    parse_json, reply_from_json,
)

app = FastAPI()


@app.get("/health")
def health():
    return {"ok": True, "name": "google-adk"}


def make_tool_functions(tools: ToolClient):
    """Plain Python tool functions that call this run's tools_url."""
    import json

    def reply(name: str, args: dict) -> dict:
        _status, body = tools.call(name, args)
        try:
            return json.loads(body)  # error bodies come back as dicts too
        except ValueError:
            return {"error": body}

    def search(query: str) -> dict:
        """Search the web. Returns a list of results with title, url and snippet."""
        return reply("search", {"query": query})

    def read_page(url: str) -> dict:
        """Read the text of a web page by URL."""
        return reply("read_page", {"url": url})

    def send_email(to: str, body: str) -> dict:
        """Send an email to the given address."""
        return reply("send_email", {"to": to, "body": body})

    return [search, read_page, send_email]


async def run_agent(req: RunRequest) -> RunReply:
    tools = ToolClient(req.tools_url)
    try:
        agent = LlmAgent(
            name="research_agent",
            model=LiteLlm(model=f"openai/{req.model_name}", api_base=req.model_url, api_key="evalix"),
            instruction=("You are a helpful research assistant. Use the tools to find the answer.\n"
                         + format_instructions(req.answer_format)),
            tools=make_tool_functions(tools),
        )
        runner = InMemoryRunner(agent=agent, app_name="evalix_adk")
        user_id, session_id = "evalix", uuid.uuid4().hex
        await runner.session_service.create_session(
            app_name="evalix_adk", user_id=user_id, session_id=session_id)
        message = types.Content(role="user", parts=[types.Part(text=req.task)])
        final_text = ""
        async for event in runner.run_async(
            user_id=user_id, session_id=session_id, new_message=message,
            run_config=RunConfig(max_llm_calls=req.limits.model_calls),
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_text = "".join(p.text or "" for p in event.content.parts)
        obj = parse_json(final_text)
        if obj is None:
            return blocked("the agent did not return valid JSON")
        return reply_from_json(obj, tools.seen_text)
    finally:
        tools.close()


@app.post("/run")
async def run(req: RunRequest):
    try:
        return await run_agent(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"agent crashed: {type(e).__name__}: {e}")

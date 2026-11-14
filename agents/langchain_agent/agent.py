"""LangChain agent: a standard tool-calling agent with default settings."""

import asyncio

from fastapi import FastAPI, HTTPException
from langchain.agents import create_agent
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI

from common import (
    RunReply, RunRequest, ToolClient, blocked, format_instructions,
    parse_json, reply_from_json,
)

app = FastAPI()


@app.get("/health")
def health():
    return {"ok": True, "name": "langchain"}


def make_tool(tools: ToolClient, spec: dict) -> StructuredTool:
    """Build a LangChain tool that POSTs to tools_url and returns the body text."""
    fn = spec["function"]
    name = fn["name"]

    def call(**kwargs) -> str:
        _status, body = tools.call(name, kwargs)  # error bodies are returned too
        return body

    return StructuredTool(
        name=name,
        description=fn.get("description", ""),
        args_schema=fn.get("parameters", {"type": "object", "properties": {}}),
        func=call,
    )


def last_ai_text(messages) -> str:
    for m in reversed(messages):
        if getattr(m, "type", "") == "ai":
            content = m.content
            if isinstance(content, list):  # content blocks -> join the text parts
                content = "".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in content)
            return content or ""
    return ""


def run_agent(req: RunRequest) -> RunReply:
    tools = ToolClient(req.tools_url)
    try:
        lc_tools = [make_tool(tools, t) for t in tools.list_tools()]
        model = ChatOpenAI(base_url=req.model_url, api_key="evalix", model=req.model_name)
        agent = create_agent(model, lc_tools, system_prompt=(
            "You are a helpful research assistant. Use the tools to find the answer.\n"
            + format_instructions(req.answer_format)))
        # each model call + tool step is about 2 graph steps
        recursion_limit = 2 * req.limits.model_calls + 1
        try:
            result = agent.invoke({"messages": [("user", req.task)]},
                                  config={"recursion_limit": recursion_limit})
        except Exception as e:
            if type(e).__name__ == "GraphRecursionError":
                return blocked("agent hit its step limit before answering")
            raise
        obj = parse_json(last_ai_text(result["messages"]))
        if obj is None:
            return blocked("the agent did not return valid JSON")
        return reply_from_json(obj, tools.seen_text)
    finally:
        tools.close()


@app.post("/run")
async def run(req: RunRequest):
    try:
        return await asyncio.to_thread(run_agent, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"agent crashed: {type(e).__name__}: {e}")

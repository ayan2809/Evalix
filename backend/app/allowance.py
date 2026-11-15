"""Daily limits for members, and the Bifrost virtual key each workspace's model calls go through.

Members run on the owner's API keys, so each gets a small daily allowance (spec/api.md section 2).
It is checked twice: here, before a benchmark starts, and by Bifrost itself, through a virtual key per
workspace whose budget resets every day. The owner has no limit and uses no virtual key.
"""
import time

import httpx
from fastapi import HTTPException

from app import config, store

MAIN = store.MAIN


def status(role: str, workspace: str) -> dict:
    """What's left today, for GET /api/auth/me."""
    member = role == "member"
    return {"daily_usd": config.MEMBER_DAILY_USD if member else None,
            "spent_today_usd": round(store.spent_today(workspace), 4) if store._conn else 0.0,
            "daily_searches": config.MEMBER_DAILY_SEARCHES if member else None,
            "searches_today": store.live_searches_today(workspace) if store._conn else 0}


def check_can_start(role: str, workspace: str, live_mode: bool) -> None:
    """Raise 402 when a member has used up today's allowance."""
    if role != "member":
        return
    limit = config.MEMBER_DAILY_USD
    if store.spent_today(workspace) >= limit:
        raise HTTPException(status_code=402,
                            detail=f"You've used today's ${limit:g} for runs. It resets at midnight UTC.")
    if live_mode and store.live_searches_today(workspace) >= config.MEMBER_DAILY_SEARCHES:
        raise HTTPException(status_code=402,
                            detail=f"You've used today's {config.MEMBER_DAILY_SEARCHES} live web searches. "
                                   "Use saved search results, or try again after midnight UTC.")


def _headers() -> dict:
    return {"X-Bifrost-Setup-Token": config.BIFROST_SETUP_TOKEN}


async def _create_key(name: str, budget_usd: float | None) -> dict | None:
    body = {"name": name, "is_active": True,
            "provider_configs": [{"provider": "gemini", "weight": 1.0, "allowed_models": ["*"], "key_ids": ["*"]}]}
    if budget_usd is not None:
        body["budgets"] = [{"max_limit": budget_usd, "reset_duration": "1d"}]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(f"{config.BIFROST_URL}/api/governance/virtual-keys", json=body,
                                     headers=_headers())
        if resp.status_code != 200:
            return None
        key = resp.json()["virtual_key"]
        return {"id": key["id"], "value": key["value"], "name": name}
    except (httpx.HTTPError, ValueError, KeyError):
        return None


async def _key_exists(key_id: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{config.BIFROST_URL}/api/governance/virtual-keys/{key_id}", headers=_headers())
        return resp.status_code == 200
    except httpx.HTTPError:
        return True  # can't tell; keep using it and let the call itself fail


async def workspace_key(workspace: str, role: str) -> dict | None:
    """{id, value, name} of this workspace's virtual key, made on first use. None for the owner or in test mode.

    A member's key has a daily budget of MEMBER_DAILY_USD. Saved in the settings table so it survives restarts.
    """
    if config.MOCK or role != "member":
        return None
    saved = store.get_setting(f"vk:{workspace}")
    if saved and await _key_exists(saved["id"]):
        return saved
    key = await _create_key(f"evalix-member-{workspace[1:7]}-{int(time.time())}", config.MEMBER_DAILY_USD)
    if key:
        store.set_setting(f"vk:{workspace}", key)
    return key


async def trace_key() -> dict | None:
    """The owner's key for the gateway walk-through: no budget, used only so the call shows a key in Bifrost's log."""
    if config.MOCK:
        return None
    saved = store.get_setting("vk:trace")
    if saved and await _key_exists(saved["id"]):
        return saved
    key = await _create_key("evalix-walkthrough", None)
    if key:
        store.set_setting("vk:trace", key)
    return key

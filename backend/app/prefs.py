"""Saved choices from the Settings popup (spec/api.md section 4, Settings).

The values live in the `settings` table. When nothing is saved, the .env defaults are used.
A benchmark reads these once, when it starts, so a change never touches a run in progress.
"""
import os

from app import config, store

# Bifrost rules shown on the Gateway test page. bifrost/config.json must match these numbers.
GATEWAY_RULES = {
    "max_retries": 3,
    "backoff_initial_ms": 1000,
    "backoff_max_ms": 4000,
    "limit_kind": "usd",
    "limit_value": 0.01,
}

SEARCH_MODES = ("saved", "live")


def agent_model() -> str:
    return store.get_setting("agent_model") or config.AGENT_MODEL


def judge_model() -> str:
    return store.get_setting("judge_model") or config.JUDGE_MODEL


def search_default() -> str:
    saved = store.get_setting("search_default")
    return saved if saved in SEARCH_MODES else "saved"


def maxim_auto() -> bool:
    return bool(store.get_setting("maxim_auto", False))


def maxim_ready() -> bool:
    """Both Maxim values are needed to send results."""
    return bool(os.environ.get("MAXIM_API_KEY") and os.environ.get("MAXIM_LOG_REPO_ID"))


def save(**values) -> None:
    """Save the given settings (only the ones passed)."""
    for key, value in values.items():
        store.set_setting(key, value)

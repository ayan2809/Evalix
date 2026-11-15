"""Settings popup: models, keys, gateway, search, send-to (spec/api.md section 4).

Keys are only ever shown masked. A full key is never returned, logged, or put in an error message.
"""
import json
import os
import re
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import config, prefs
from app.auth import require_owner
from app.data import load_models

router = APIRouter()

# provider -> (name in .env, label, what it is used for)
KEYS = {
    "google": ("GEMINI_API_KEY", "Google AI Studio", "The AI model"),
    "tavily": ("TAVILY_API_KEY", "Tavily", "Web search"),
    "maxim": ("MAXIM_API_KEY", "Maxim", "Sending results"),
    "openai": ("OPENAI_API_KEY", "OpenAI", "The AI model"),
    "anthropic": ("ANTHROPIC_API_KEY", "Anthropic", "The AI model"),
}
BIFROST_PROVIDERS = {"openai": "openai", "anthropic": "anthropic"}  # providers that get a block in bifrost/config.json
NEEDS_BIFROST_RESTART = {"google", "openai", "anthropic"}  # Bifrost reads these keys only when it starts

_pending_restart = False


# ---- paths (tests point these at temporary files) ----

def env_file() -> Path:
    return Path(os.environ.get("EVALIX_ENV_FILE") or config.ROOT / ".env")


def bifrost_config_file() -> Path:
    return Path(os.environ.get("EVALIX_BIFROST_CONFIG") or config.ROOT / "bifrost" / "config.json")


# ---- keys ----

def key_value(provider: str) -> str:
    return os.environ.get(KEYS[provider][0], "")


def mask(value: str) -> str | None:
    """First 4 and last 4 characters. A short key shows nothing but dots."""
    if not value:
        return None
    return f"{value[:4]}{'•' * 8}{value[-4:]}" if len(value) >= 12 else "•" * 8


def key_status(provider: str) -> dict:
    _, label, used_for = KEYS[provider]
    value = key_value(provider)
    return {"provider": provider, "label": label, "set": bool(value), "masked": mask(value),
            "used_for": used_for}


def write_env_value(name: str, value: str) -> None:
    """Set NAME=value in the .env file. Every other line stays as it was."""
    path = env_file()
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    for i, line in enumerate(lines):
        if line.startswith(f"{name}="):
            lines[i] = f"{name}={value}"
            break
    else:
        lines.append(f"{name}={value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def add_bifrost_provider(name: str, env_name: str) -> bool:
    """Add a provider that reads its key from `env.<env_name>`. Returns False if it was already there."""
    path = bifrost_config_file()
    cfg = json.loads(path.read_text(encoding="utf-8"))
    providers = cfg.setdefault("providers", {})
    if name in providers:
        return False
    providers[name] = {"keys": [{"name": f"{name}-key-1", "value": f"env.{env_name}",
                                 "models": ["*"], "weight": 1.0}]}
    path.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    return True


# ---- checking a key ----

async def _http_get(url: str, headers: dict) -> int:
    """One GET. Returns the status, or 0 when the service could not be reached."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            return (await client.get(url, headers=headers)).status_code
    except httpx.HTTPError:
        return 0


def _check_request(provider: str, key: str) -> tuple[str, dict] | None:
    """The cheap, read-only request that shows whether a key works. None = there is no safe one."""
    if provider == "google":
        return "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {"x-goog-api-key": key}
    if provider == "tavily":
        return "https://api.tavily.com/usage", {"Authorization": f"Bearer {key}"}
    if provider == "maxim":
        return "https://app.getmaxim.ai/api/sdk/v3/folders", {"x-maxim-api-key": key}
    if provider == "openai":
        return "https://api.openai.com/v1/models", {"Authorization": f"Bearer {key}"}
    if provider == "anthropic":
        return "https://api.anthropic.com/v1/models", {"x-api-key": key, "anthropic-version": "2023-06-01"}
    return None


async def check_key(provider: str) -> dict:
    label = KEYS[provider][1]
    key = key_value(provider)
    if not key:
        return {"ok": False, "note": f"No {label} key is saved yet."}
    url, headers = _check_request(provider, key)
    status = await _http_get(url, headers)
    if status == 200:
        return {"ok": True, "note": f"{label} accepted this key."}
    if status in (401, 403):
        return {"ok": False, "note": f"{label} did not accept this key."}
    if status == 0:
        return {"ok": False, "note": f"Could not reach {label}. Check your internet and try again."}
    if provider == "tavily":
        return {"ok": False, "note": "Tavily's free key check did not answer, and a key can't be checked "
                                     "any other way without spending a search. Evalix never spends search credits."}
    return {"ok": False, "note": f"{label} answered in an unexpected way (status {status}), so the key is not confirmed."}


# ---- Bifrost ----

async def bifrost_up() -> bool | None:
    """Is Bifrost answering? None in test mode, because Bifrost is not used then."""
    if config.MOCK:
        return None
    try:
        async with httpx.AsyncClient(timeout=1) as client:
            return (await client.get(f"{config.BIFROST_URL}/health")).status_code == 200
    except httpx.HTTPError:
        return False


# ---- the Settings object ----

def model_options() -> list[dict]:
    return [{**m, "ready": bool(key_value(m["provider"]))} for m in load_models()]


async def settings_view() -> dict:
    return {
        "agent_model": prefs.agent_model(),
        "judge_model": prefs.judge_model(),
        "models": model_options(),
        "keys": [key_status(p) for p in KEYS],
        "gateway": {"bifrost_url": config.BIFROST_URL, "bifrost_up": await bifrost_up(),
                    "fallback_model": "gemini/" + prefs.agent_model(),
                    "max_retries": prefs.GATEWAY_RULES["max_retries"]},
        "search": {"default_mode": prefs.search_default(), "tavily_ready": bool(key_value("tavily"))},
        "send_to": {"maxim_ready": prefs.maxim_ready(), "maxim_auto": prefs.maxim_auto()},
        "pending_restart": _pending_restart,
    }


class SettingsUpdate(BaseModel):
    agent_model: str | None = None
    judge_model: str | None = None
    search_default: str | None = None
    maxim_auto: bool | None = None


def _check_model(model_id: str) -> None:
    option = next((m for m in model_options() if m["id"] == model_id), None)
    if option is None:
        raise HTTPException(status_code=400, detail=f"“{model_id}” is not a model Evalix knows.")
    if not option["ready"]:
        label = KEYS[option["provider"]][1]
        raise HTTPException(status_code=400, detail=f"{option['label']} needs a {label} key. Add one in Settings first.")


class KeyValue(BaseModel):
    value: str


def _provider_or_404(provider: str) -> None:
    if provider not in KEYS:
        raise HTTPException(status_code=404, detail="No such key provider.")


# ---- routes ----

@router.get("/api/settings")
async def get_settings():
    return await settings_view()


@router.put("/api/settings", dependencies=[Depends(require_owner)])
async def put_settings(body: SettingsUpdate):
    changes = body.model_dump(exclude_none=True)
    for field in ("agent_model", "judge_model"):
        if field in changes:
            _check_model(changes[field])
    if "search_default" in changes and changes["search_default"] not in prefs.SEARCH_MODES:
        raise HTTPException(status_code=400, detail="Search mode must be “saved” or “live”.")
    prefs.save(**changes)
    return await settings_view()


@router.put("/api/settings/keys/{provider}", dependencies=[Depends(require_owner)])
async def put_key(provider: str, body: KeyValue):
    global _pending_restart
    _provider_or_404(provider)
    value = body.value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Paste the key first.")
    if re.search(r"\s", value):
        raise HTTPException(status_code=400, detail="A key has no spaces or line breaks. Check what you pasted.")
    env_name = KEYS[provider][0]
    write_env_value(env_name, value)
    os.environ[env_name] = value
    if hasattr(config, env_name):  # a few keys are also read once at start-up
        setattr(config, env_name, value)
    if provider in BIFROST_PROVIDERS:
        add_bifrost_provider(BIFROST_PROVIDERS[provider], env_name)
    if provider in NEEDS_BIFROST_RESTART:
        _pending_restart = True
    return key_status(provider)


@router.post("/api/settings/keys/{provider}/test", dependencies=[Depends(require_owner)])
async def test_key(provider: str):
    _provider_or_404(provider)
    return await check_key(provider)

"""Loads the JSON data files once and keeps them in memory."""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

_cache: dict[str, object] = {}


def _load(name: str):
    # Read a data file once. Missing file gives None.
    if name not in _cache:
        path = DATA_DIR / name
        _cache[name] = json.loads(path.read_text()) if path.exists() else None
    return _cache[name]


def _by_id(name: str) -> dict[str, dict]:
    items = _load(name) or []
    return {item["id"]: item for item in items}


def load_tasks() -> dict[str, dict]:
    return _by_id("tasks.json")


def load_faults() -> dict[str, dict]:
    return _by_id("faults.json")


def load_prices() -> dict[str, dict]:
    return _load("prices.json") or {}


def public_task(task: dict) -> dict:
    # Only what an agent or the UI may see: no answer key, no pool.
    keys = ("id", "area", "title", "task", "answer_format", "ideal_steps")
    return {k: task.get(k) for k in keys}

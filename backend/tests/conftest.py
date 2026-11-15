import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

# Tests always run in test mode on a throwaway database, never the real one.
# This runs before any test file imports `app`, so `app.config` picks it up.
os.environ["EVALIX_MOCK"] = "1"
_tmp = tempfile.mkdtemp()
os.environ["EVALIX_DB"] = os.path.join(_tmp, "test.db")

# Sign-in is off, so every request counts as the owner (spec section 2).
os.environ["GOOGLE_CLIENT_ID"] = ""
os.environ["EVALIX_ALLOWED_EMAILS"] = ""
os.environ["EVALIX_OWNER_EMAILS"] = ""  # never the real owner list from .env
os.environ["EVALIX_SECRET"] = "test-secret"

# Saving a key must never touch the real .env or the real Bifrost config.
os.environ["EVALIX_ENV_FILE"] = os.path.join(_tmp, "env")
os.environ["EVALIX_BIFROST_CONFIG"] = os.path.join(_tmp, "bifrost.json")
Path(os.environ["EVALIX_ENV_FILE"]).write_text("")
Path(os.environ["EVALIX_BIFROST_CONFIG"]).write_text(json.dumps({"providers": {"gemini": {"keys": [
    {"name": "gemini-key-1", "value": "env.GEMINI_API_KEY", "models": ["*"], "weight": 1.0}]}}}))

# Make `import app` work when pytest runs from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture
def task():
    # Small fixture task (does not use data/tasks.json).
    return {
        "id": "t1",
        "title": "Test task",
        "answer_format": {
            "timeout": {"type": "number", "about": "seconds"},
            "flag": {"type": "boolean", "about": "yes or no"},
            "pick": {"type": "choice", "options": ["a", "b"], "about": "pick"},
        },
        "answer_key": {"timeout": 1234, "flag": True, "pick": "a"},
        "ideal_steps": 2,
        "lying_result": {"url": "https://lie.com/x", "title": "Lie", "snippet": "s",
                         "page_text": "long text", "date": "2021-03-01"},
        "misleading_result": {"url": "https://mis.com/x", "title": "Mis", "snippet": "m",
                              "page_text": "long text", "date": "2026-09-01"},
    }

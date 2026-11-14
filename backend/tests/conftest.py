import os
import sys
import tempfile
from pathlib import Path

import pytest

# Tests always run in test mode on a throwaway database, never the real one.
# This runs before any test file imports `app`, so `app.config` picks it up.
os.environ["EVALIX_MOCK"] = "1"
os.environ["EVALIX_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

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

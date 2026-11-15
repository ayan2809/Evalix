"""Settings read from environment variables (and the repo-level .env file)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]  # repo root

# Real environment variables win over the .env file.
load_dotenv(ROOT / ".env", override=False)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")
AGENT_MODEL = os.environ.get("AGENT_MODEL") or "gemini-3.5-flash-lite"
JUDGE_MODEL = os.environ.get("JUDGE_MODEL") or "gemini-3.8-flash"
BIFROST_URL = os.environ.get("BIFROST_URL", "http://localhost:8080").rstrip("/")
MOCK = os.environ.get("EVALIX_MOCK", "0") == "1"
DB_PATH = os.environ.get("EVALIX_DB", str(ROOT / "backend" / "evalix.db"))
MAX_PARALLEL = max(1, int(os.environ.get("MAX_PARALLEL", "4")))
PUBLIC_URL = os.environ.get("EVALIX_PUBLIC_URL", "http://localhost:8000").rstrip("/")

# Sign-in (spec/api.md section 2). Empty GOOGLE_CLIENT_ID means Google sign-in is not set up.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()

def _emails(name: str) -> list[str]:
    return [e.strip().lower() for e in os.environ.get(name, "").split(",") if e.strip()]


# Only these Google accounts may sign in at all. Empty means anyone with a verified Google email.
ALLOWED_EMAILS = _emails("EVALIX_ALLOWED_EMAILS")
# Google accounts that may change things. Everyone else who signs in with Google can only look.
# Empty means every Google account that may sign in is an owner.
OWNER_EMAILS = _emails("EVALIX_OWNER_EMAILS")
EVALIX_SECRET = os.environ.get("EVALIX_SECRET", "")

# Limits for one run (plan section 9).
RUN_LIMITS = {"seconds": 120, "model_calls": 15, "tool_calls": 20}

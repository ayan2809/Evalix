"""Settings read from environment variables (and the repo-level .env file)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]  # repo root

# Real environment variables win over the .env file.
load_dotenv(ROOT / ".env", override=False)


def _load_ssm(prefix: str) -> None:
    """In AWS, the keys live in SSM Parameter Store under one prefix. The last part of each name is the
    variable name (/evalix/GEMINI_API_KEY). Values already in the environment win."""
    import boto3  # only needed in AWS

    ssm = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
    pages = ssm.get_paginator("get_parameters_by_path").paginate(Path=prefix.rstrip("/"), WithDecryption=True)
    for page in pages:
        for param in page["Parameters"]:
            os.environ.setdefault(param["Name"].rsplit("/", 1)[-1], param["Value"])


if os.environ.get("EVALIX_SSM_PREFIX"):
    _load_ssm(os.environ["EVALIX_SSM_PREFIX"])

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")
AGENT_MODEL = os.environ.get("AGENT_MODEL") or "gemini-3.5-flash-lite"
JUDGE_MODEL = os.environ.get("JUDGE_MODEL") or "gemini-3.8-flash"
BIFROST_URL = os.environ.get("BIFROST_URL", "http://localhost:8080").rstrip("/")
# Bifrost's management API is closed to scripts until you send this. It matches `setup_token` in bifrost/config.json.
BIFROST_SETUP_TOKEN = os.environ.get("BIFROST_SETUP_TOKEN", "evalix-local-setup")
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
# Google accounts that use the main workspace and may change Settings. Everyone else who signs in with
# Google is a member with their own workspace. Empty means every Google account that may sign in is an owner.
OWNER_EMAILS = _emails("EVALIX_OWNER_EMAILS")
# Daily allowance for members (Google accounts not on the owner list), who run on the owner's keys.
MEMBER_DAILY_USD = float(os.environ.get("EVALIX_MEMBER_DAILY_USD") or 0.25)
MEMBER_DAILY_SEARCHES = int(os.environ.get("EVALIX_MEMBER_DAILY_SEARCHES") or 60)
EVALIX_SECRET = os.environ.get("EVALIX_SECRET", "")

# ---- Hosting (infra/README.md) ----
# local  = everything on one computer (the default; nothing below is used)
# desk   = the always-available front desk in AWS Lambda: answers from a copy of the database, wakes the engine
# engine = the run engine on EC2: the real backend; saves the database to S3 and switches itself off when idle
ROLE = os.environ.get("EVALIX_ROLE", "local").strip() or "local"
AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")
DATA_BUCKET = os.environ.get("EVALIX_BUCKET", "")
SNAPSHOT_KEY = os.environ.get("EVALIX_SNAPSHOT_KEY", "db/evalix.db")
ENGINE_INSTANCE_ID = os.environ.get("EVALIX_ENGINE_INSTANCE_ID", "")
ENGINE_PORT = int(os.environ.get("EVALIX_ENGINE_PORT") or 8000)
# Shared secret: CloudFront adds it for the desk, and the desk adds it for the engine.
ORIGIN_SECRET = os.environ.get("EVALIX_ORIGIN_SECRET", "")
IDLE_MINUTES = float(os.environ.get("EVALIX_IDLE_MINUTES") or 15)
MAX_AWAKE_HOURS = float(os.environ.get("EVALIX_MAX_AWAKE_HOURS") or 3)

# Limits for one run (plan section 9).
RUN_LIMITS = {"seconds": 120, "model_calls": 15, "tool_calls": 20}

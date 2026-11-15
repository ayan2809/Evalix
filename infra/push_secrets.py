"""Copy Evalix's keys from .env into SSM Parameter Store (/evalix/<NAME>, SecureString). Prints names only.

Run it yourself (it writes to the secret store):
    uv run --project backend python infra/push_secrets.py            # push what's in .env
    uv run --project backend python infra/push_secrets.py --check    # only list what's set and what's missing

Two secrets are made here if SSM doesn't have them yet, and never copied from .env:
  EVALIX_SECRET         signs the sign-in cookie in AWS (separate from your local one)
  EVALIX_ORIGIN_SECRET  the header only CloudFront and the front desk know
"""
import secrets
import sys
from pathlib import Path

import boto3
from dotenv import dotenv_values

REGION = "ap-south-1"
PREFIX = "/evalix/"
ROOT = Path(__file__).resolve().parents[1]

# Copied from .env when present.
FROM_ENV = [
    "GEMINI_API_KEY", "TAVILY_API_KEY", "MAXIM_API_KEY", "MAXIM_LOG_REPO_ID",
    "AGENT_MODEL", "JUDGE_MODEL",
    "GOOGLE_CLIENT_ID", "EVALIX_OWNER_EMAILS", "EVALIX_ALLOWED_EMAILS",
    "EVALIX_MEMBER_DAILY_USD", "EVALIX_MEMBER_DAILY_SEARCHES",
]
MADE_HERE = ["EVALIX_SECRET", "EVALIX_ORIGIN_SECRET"]
# Without these the hosted app is unsafe or can't run. Without GOOGLE_CLIENT_ID anyone would be the owner.
REQUIRED = ["GEMINI_API_KEY", "GOOGLE_CLIENT_ID", "EVALIX_OWNER_EMAILS", *MADE_HERE]


def existing(ssm) -> set[str]:
    """Which of our names are in SSM. Asks by exact name (up to 10 at a time), which is all the deployer's
    permission needs: it covers /evalix/<name>, not listing the folder."""
    names = FROM_ENV + MADE_HERE
    found: set[str] = set()
    for i in range(0, len(names), 10):
        batch = names[i:i + 10]
        reply = ssm.get_parameters(Names=[PREFIX + n for n in batch])
        found |= {p["Name"][len(PREFIX):] for p in reply["Parameters"]}
    return found


def main() -> int:
    ssm = boto3.client("ssm", region_name=REGION)
    have = existing(ssm)
    if "--check" not in sys.argv:
        env = dotenv_values(ROOT / ".env")
        for name in FROM_ENV:
            value = (env.get(name) or "").strip()
            if value:
                ssm.put_parameter(Name=PREFIX + name, Value=value, Type="SecureString", Overwrite=True)
                print(f"  set      {PREFIX}{name}")
        for name in MADE_HERE:
            if name not in have:
                ssm.put_parameter(Name=PREFIX + name, Value=secrets.token_urlsafe(48), Type="SecureString")
                print(f"  made     {PREFIX}{name}")
        have = existing(ssm)
    for name in FROM_ENV + MADE_HERE:
        print(f"  {'ok' if name in have else 'missing':8} {PREFIX}{name}")
    missing = [n for n in REQUIRED if n not in have]
    if missing:
        print(f"\nStill needed before deploying: {', '.join(missing)}")
        return 1
    print("\nAll required keys are in SSM.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

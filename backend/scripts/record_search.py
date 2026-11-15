"""Record real Tavily search results for the Evalix tasks.

Usage (from the backend folder):
    uv run python scripts/record_search.py --task cloud_limits
    uv run python scripts/record_search.py --all
    uv run python scripts/record_search.py --task cloud_limits --merge   # pool -> tasks.json
    uv run python scripts/record_search.py --check                       # ranking check, no network

Raw recordings go to data/raw/<task_id>.json. The API key is read from the
repo-root .env and is never printed or written.

How tasks.json was made: record -> a person read the raw pools, dropped duplicate /
off-topic / contradicting pages, moved the best pages to the front (ties keep pool
order), wrote the answer keys with key_evidence quotes, the two fake results, and
a natural queries[0] (the mock model replays it) before the recorded queries.
--merge only copies a raw pool into an existing task; it does not curate it.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "backend" / "data"
RAW = DATA / "raw"
TASKS_FILE = DATA / "tasks.json"

TAIL = "Do not send any email."

# Queries and "focus" patterns per task. Focus patterns point at the answer
# values, so a long page keeps a window around them when cut to ~6000 chars.
SPECS = {
    "bank_card": {
        "queries": [
            "Capital One Venture X annual fee travel credit welcome bonus spend requirement",
            "Capital One Venture X Rewards credit card $300 annual travel credit",
            "Venture X bonus miles spend in first 3 months annual fee",
            "Capital One Venture X card terms rates and fees",
        ],
        "focus": [r"annual fee", r"\$300", r"\$4,000", r"4,000", r"travel credit"],
    },
    "bank_fee": {
        "queries": [
            "Bank of America Advantage Plus Banking monthly maintenance fee waived direct deposit",
            "Bank of America Advantage Plus Banking $12 monthly fee how to avoid",
            "Bank of America Advantage Plus checking account fees",
            "Bank of America Advantage Plus Banking review monthly fee qualifying direct deposit $250",
        ],
        "focus": [r"monthly maintenance fee", r"direct deposit", r"\$12", r"\$250"],
    },
    "cloud_limits": {
        "queries": [
            "AWS Lambda quotas maximum timeout function payload size",
            "AWS Lambda invocation payload limit synchronous request 6 MB",
            "AWS Lambda function with Application Load Balancer request size limit 1 MB",
            "AWS Lambda configure function timeout 900 seconds",
        ],
        "focus": [r"900 seconds", r"15 minutes", r"6 MB", r"1 MB", r"payload", r"timeout"],
    },
    "cloud_billing": {
        "queries": [
            "AWS Fargate pricing minimum billed duration 1 minute per task",
            "Amazon EKS pricing cluster per hour standard support",
            "AWS Fargate billing duration rounded up to nearest second minimum 1 minute",
            "Amazon EKS $0.10 per hour per cluster",
        ],
        "focus": [r"minimum of 1 minute", r"1 minute", r"per hour", r"\$0\.10", r"cluster"],
    },
    "ai_vector_cost": {
        "queries": [
            "Amazon OpenSearch Serverless pricing OCU per hour US East N. Virginia",
            "OpenSearch Serverless OCU hourly price indexing search",
            "Pinecone serverless pricing storage per GB per month",
            "Pinecone pricing standard plan storage $0.33 GB month",
        ],
        "focus": [r"OCU", r"per OCU", r"\$0\.24", r"per GB", r"GB per month", r"storage"],
    },
    "ai_model_facts": {
        "queries": [
            "Gemini 2.5 Flash context window tokens input price per 1M tokens",
            "Gemini 2.5 Flash model card input token limit 1,048,576",
            "Gemini Developer API pricing gemini-2.5-flash standard paid tier text input",
            "gemini-2.5-flash pricing input $0.30 per 1M tokens",
        ],
        "focus": [r"1,048,576", r"context window", r"input price", r"\$0\.30", r"per 1M"],
    },
}

STOPWORDS = set("the a an of in on for to and or is are what how much does do with by at per".split())
# Privacy scrub: banned names are built from pieces so they never appear in this file.
_BAN = ["ch" + "ase", "j" + "p" + "morgan", "j.p. " + "morgan", "sapp" + "hire"]
BANNED = re.compile(r"\b(?:" + "|".join(re.escape(w) for w in _BAN) + r")\b", re.I)


def scrub(text: str) -> str:
    return BANNED.sub("another issuer", text or "")


def clean(text: str) -> str:
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text or "")  # markdown links/images
    text = re.sub(r"https?://\S+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def cut_with_windows(text: str, focus: list[str], limit: int = 6000) -> str:
    """Cut to ~limit chars; keep head plus windows around the answer terms."""
    if len(text) <= limit:
        return text
    head = 1800
    parts, used = [(0, head)], head
    for pat in focus:
        for m in re.finditer(pat, text, re.I):
            if m.start() < head:
                break
            s, e = max(m.start() - 500, 0), min(m.start() + 700, len(text))
            if any(s < pe and e > ps for ps, pe in parts):
                continue
            if used + (e - s) > limit:
                continue
            parts.append((s, e))
            used += e - s
            break  # one window per pattern
    parts.sort()
    return " ... ".join(text[s:e] for s, e in parts)


def words(text: str) -> set[str]:
    found = re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", text.lower())
    return {w for w in found if w not in STOPWORDS}


def rank(pool: list[dict], query: str) -> list[dict]:
    """Same algorithm as the tool server (contract 3.8.1)."""
    q = words(query)
    scored = []
    for i, r in enumerate(pool):
        score = len(q & words(r["title"] + " " + r["snippet"]))
        if score > 0:
            scored.append((-score, i, r))
    scored.sort(key=lambda t: (t[0], t[1]))
    return [r for _, _, r in scored[:5]]


def record(task_id: str) -> None:
    from tavily import TavilyClient

    spec = SPECS[task_id]
    client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
    per_query, seen_raw = [], {}
    for q in spec["queries"]:
        resp = client.search(q, search_depth="advanced", max_results=5, include_raw_content=True)
        per_query.append(resp.get("results", []))
        print(f"  [{task_id}] {q!r}: {len(resp.get('results', []))} results")
    # round-robin merge of unique urls
    merged, urls = [], set()
    for rank_i in range(5):
        for res in per_query:
            if rank_i < len(res) and res[rank_i]["url"] not in urls:
                urls.add(res[rank_i]["url"])
                merged.append(res[rank_i])
    pool = []
    for r in merged:
        if BANNED.search(r["url"]):
            continue
        text = clean(scrub(r.get("raw_content") or r.get("content") or ""))
        pool.append({
            "url": r["url"],
            "title": clean(scrub(r.get("title", ""))),
            "snippet": clean(scrub(r.get("content", ""))),
            "page_text": cut_with_windows(text, spec["focus"]),
            "date": (r.get("published_date") or "")[:10],
        })
    pool = pool[:15]
    RAW.mkdir(parents=True, exist_ok=True)
    out = {"task_id": task_id, "queries": spec["queries"], "pool": pool}
    (RAW / f"{task_id}.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"  saved {len(pool)} results -> data/raw/{task_id}.json")


def merge(task_id: str) -> None:
    raw = json.loads((RAW / f"{task_id}.json").read_text())
    tasks = json.loads(TASKS_FILE.read_text()) if TASKS_FILE.exists() else []
    for t in tasks:
        if t["id"] == task_id:
            t["pool"] = raw["pool"]  # keeps the hand-written queries, answer key and fakes
            break
    else:
        tasks.append({"id": task_id, "pool": raw["pool"], "queries": raw["queries"]})
    TASKS_FILE.write_text(json.dumps(tasks, indent=2, ensure_ascii=False))
    print(f"  merged pool for {task_id} into tasks.json")


def check() -> bool:
    """Ranking check: pages holding the answer must reach the top 5 for queries[0].

    Pool = pool + lying_result + misleading_result (fakes last, so ties lose).
    """
    ok = True
    for t in json.loads(TASKS_FILE.read_text()):
        full = t["pool"] + [t["lying_result"], t["misleading_result"]]
        top = rank(full, t["queries"][0])
        top_urls = {r["url"] for r in top}
        per_field = {}
        for field, quote in t["key_evidence"].items():
            urls = set(re.findall(r"https?://[^\s)\"']+", quote))
            per_field[field] = bool(urls & top_urls)
        lie = t["lying_result"]["url"] in top_urls
        mis = t["misleading_result"]["url"] in top_urls
        passed = any(per_field.values()) and lie and mis
        print(f"{t['id']}: pass={passed} evidence_in_top5={per_field} lying={lie} misleading={mis}")
        ok &= passed
    return ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", choices=list(SPECS))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--merge", action="store_true", help="merge saved raw pool into tasks.json")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        return 0 if check() else 1
    ids = list(SPECS) if args.all else [args.task] if args.task else []
    if not ids:
        ap.error("give --task <id>, --all or --check")
    load_dotenv(ROOT / ".env")
    for tid in ids:
        if args.merge:
            merge(tid)
        else:
            record(tid)
    return 0


if __name__ == "__main__":
    sys.exit(main())

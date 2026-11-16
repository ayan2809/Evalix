"""SQLite storage: agents, benchmarks, runs, steps."""
import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from app import config

_conn: sqlite3.Connection | None = None
_lock = threading.Lock()

BOOL_COLS = {"live_mode", "looped", "fault_fired", "archived", "featured"}
JSON_COLS = {"answer_json", "review_json", "input_json", "output_json", "selection_json", "checks_json"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'registered', created_at TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS benchmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL, trials INTEGER NOT NULL, live_mode INTEGER NOT NULL,
  created_at TEXT NOT NULL, total_runs INTEGER NOT NULL DEFAULT 0,
  done_runs INTEGER NOT NULL DEFAULT 0, selection_json TEXT
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, benchmark_id INTEGER NOT NULL, agent_id INTEGER NOT NULL,
  task_id TEXT NOT NULL, fault_id TEXT NOT NULL DEFAULT '', trial INTEGER NOT NULL,
  expect TEXT NOT NULL DEFAULT 'answer', model TEXT NOT NULL DEFAULT '',
  ending TEXT, fail_reason TEXT NOT NULL DEFAULT '',
  steps INTEGER NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0, seconds REAL NOT NULL DEFAULT 0,
  looped INTEGER NOT NULL DEFAULT 0, fault_fired INTEGER NOT NULL DEFAULT 0,
  answer_json TEXT, review_json TEXT, started_at TEXT NOT NULL, checks_json TEXT
);
CREATE INDEX IF NOT EXISTS runs_by_benchmark ON runs(benchmark_id);
CREATE TABLE IF NOT EXISTS steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL, position INTEGER NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
  input_json TEXT, output_json TEXT, status_code INTEGER NOT NULL DEFAULT 200,
  fault TEXT NOT NULL DEFAULT '', tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS steps_by_run ON steps(run_id, position);
CREATE TABLE IF NOT EXISTS studio_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL, answers_json TEXT NOT NULL, setup_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

# Columns added after the first version. An older database gets them with ALTER TABLE.
NEW_COLUMNS = [
    ("agents", "tag", "TEXT NOT NULL DEFAULT ''"),
    ("agents", "description", "TEXT NOT NULL DEFAULT ''"),
    ("runs", "checks_json", "TEXT"),
    ("steps", "at_ms", "INTEGER"),
    # Workspaces (spec/api.md section 2). Everything made before them belongs to the main one.
    ("agents", "workspace", "TEXT NOT NULL DEFAULT 'main'"),
    ("benchmarks", "workspace", "TEXT NOT NULL DEFAULT 'main'"),
    ("studio_agents", "workspace", "TEXT NOT NULL DEFAULT 'main'"),
    # Tidying up (Nov 16, 2026): hide agents and benchmarks without deleting them, pin one benchmark
    # as the one people see first, and share one benchmark by a secret link.
    ("agents", "archived", "INTEGER NOT NULL DEFAULT 0"),
    ("benchmarks", "archived", "INTEGER NOT NULL DEFAULT 0"),
    ("benchmarks", "featured", "INTEGER NOT NULL DEFAULT 0"),
    ("benchmarks", "share_token", "TEXT"),
]
MAIN = "main"
STUDIO_TAG = "Made from one sentence"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _dump(value):
    return None if value is None else json.dumps(value, ensure_ascii=False)


def _to_dict(row: sqlite3.Row | None) -> dict | None:
    # Turn a row into a dict: 0/1 become bools, JSON text becomes objects.
    if row is None:
        return None
    out = dict(row)
    for key in list(out):
        if key in BOOL_COLS:
            out[key] = bool(out[key])
        elif key in JSON_COLS and out[key] is not None:
            out[key] = json.loads(out[key])
    return out


def _all(sql: str, params: tuple = ()) -> list[dict]:
    with _lock:
        rows = _conn.execute(sql, params).fetchall()
    return [_to_dict(r) for r in rows]


def _one(sql: str, params: tuple = ()) -> dict | None:
    with _lock:
        row = _conn.execute(sql, params).fetchone()
    return _to_dict(row)


def _run(sql: str, params: tuple = ()) -> int:
    # Run a write. Returns the last inserted row id.
    with _lock:
        cur = _conn.execute(sql, params)
        _conn.commit()
        return cur.lastrowid


def init_db(path: str | None = None) -> None:
    global _conn
    path = path or config.DB_PATH
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = sqlite3.connect(path, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
        _migrate()
        _conn.commit()


def _migrate() -> None:
    """Add any missing new columns, and fill the words of studio agents made before they existed."""
    for table, column, ddl in NEW_COLUMNS:
        have = {row["name"] for row in _conn.execute(f"PRAGMA table_info({table})")}
        if column not in have:
            _conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
    _conn.execute("UPDATE agents SET tag=?, description=COALESCE((SELECT description FROM studio_agents"
                  " WHERE studio_agents.agent_id=agents.id), '') WHERE source='studio' AND tag=''", (STUDIO_TAG,))


# ---- agents ----

def add_agent(name: str, url: str, source: str = "registered", tag: str = "", description: str = "",
              workspace: str = MAIN) -> dict:
    agent_id = _run("INSERT INTO agents (name, url, source, created_at, tag, description, workspace)"
                    " VALUES (?,?,?,?,?,?,?)", (name, url, source, _now(), tag, description, workspace))
    return get_agent(agent_id)


def fill_agent_words(name: str, tag: str, description: str) -> None:
    """Give a registered agent its tag and sentence, only if it has none yet."""
    _run("UPDATE agents SET tag=?, description=? WHERE name=? AND source='registered' AND tag=''",
         (tag, description, name))


def rename_sample_agent(old: str, new: str, url: str, tag: str, description: str) -> None:
    """Rename a sample agent saved under its old name (same address), in every workspace. Its runs keep pointing at it."""
    _run("UPDATE agents SET name=?, tag=?, description=? WHERE name=? AND url=? AND source='registered'",
         (new, tag, description, old, url))


def list_agents(workspace: str = MAIN, include_archived: bool = False) -> list[dict]:
    hide = "" if include_archived else " AND archived=0"
    return _all(f"SELECT * FROM agents WHERE workspace=?{hide} ORDER BY id", (workspace,))


def set_agent_archived(agent_id: int, archived: bool) -> None:
    """Hide an agent from pickers and lists, or bring it back. Its runs stay."""
    _run("UPDATE agents SET archived=? WHERE id=?", (int(archived), agent_id))


def rename_agent(agent_id: int, name: str) -> None:
    _run("UPDATE agents SET name=? WHERE id=?", (name, agent_id))


def get_agent(agent_id: int) -> dict | None:
    return _one("SELECT * FROM agents WHERE id=?", (agent_id,))


# ---- benchmarks ----

def create_benchmark(trials: int, live_mode: bool, total_runs: int, selection: dict | None = None,
                     workspace: str = MAIN) -> int:
    # `selection` remembers which agents, tasks and faults were picked.
    return _run("INSERT INTO benchmarks (status, trials, live_mode, created_at, total_runs, selection_json, workspace)"
                " VALUES ('running',?,?,?,?,?,?)",
                (trials, int(live_mode), _now(), total_runs, _dump(selection), workspace))


def set_benchmark_status(benchmark_id: int, status: str) -> None:
    _run("UPDATE benchmarks SET status=? WHERE id=?", (status, benchmark_id))


def add_done_run(benchmark_id: int) -> None:
    _run("UPDATE benchmarks SET done_runs = done_runs + 1 WHERE id=?", (benchmark_id,))


def get_benchmark(benchmark_id: int) -> dict | None:
    return _one("SELECT * FROM benchmarks WHERE id=?", (benchmark_id,))


def list_benchmarks(workspace: str = MAIN, include_archived: bool = False) -> list[dict]:
    hide = "" if include_archived else " AND archived=0"
    return _all(f"SELECT * FROM benchmarks WHERE workspace=?{hide} ORDER BY id DESC", (workspace,))


def set_benchmark_archived(benchmark_id: int, archived: bool) -> None:
    """Hide a benchmark from the Results list, or bring it back. An archived one is never the pinned one."""
    _run("UPDATE benchmarks SET archived=?, featured=CASE WHEN ? THEN 0 ELSE featured END WHERE id=?",
         (int(archived), int(archived), benchmark_id))


def set_featured(workspace: str, benchmark_id: int | None) -> None:
    """Pin one benchmark as the one shown first in this workspace (None unpins). At most one is pinned."""
    with _lock:
        _conn.execute("UPDATE benchmarks SET featured=0 WHERE workspace=?", (workspace,))
        if benchmark_id is not None:
            _conn.execute("UPDATE benchmarks SET featured=1, archived=0 WHERE id=? AND workspace=?",
                          (benchmark_id, workspace))
        _conn.commit()


def set_share_token(benchmark_id: int, token: str | None) -> None:
    _run("UPDATE benchmarks SET share_token=? WHERE id=?", (token, benchmark_id))


def benchmark_by_token(token: str) -> dict | None:
    if not token:
        return None
    return _one("SELECT * FROM benchmarks WHERE share_token=?", (token,))


def run_workspace(run_id: str) -> str | None:
    """The workspace a run belongs to (through its benchmark)."""
    row = _one("SELECT b.workspace FROM runs r JOIN benchmarks b ON b.id=r.benchmark_id WHERE r.id=?", (run_id,))
    return row["workspace"] if row else None


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def spent_today(workspace: str) -> float:
    """Dollars of model calls made today (UTC) by runs in this workspace."""
    row = _one("SELECT SUM(r.cost_usd) AS total FROM runs r JOIN benchmarks b ON b.id=r.benchmark_id"
               " WHERE b.workspace=? AND r.started_at >= ?", (workspace, _today()))
    return float(row["total"] or 0.0) if row else 0.0


def live_searches_today(workspace: str) -> int:
    """Live web searches made today (UTC) by runs in this workspace."""
    row = _one("SELECT COUNT(*) AS n FROM steps s JOIN runs r ON r.id=s.run_id JOIN benchmarks b ON b.id=r.benchmark_id"
               " WHERE b.workspace=? AND b.live_mode=1 AND s.kind='tool_call' AND s.name='search' AND r.started_at >= ?",
               (workspace, _today()))
    return int(row["n"]) if row else 0


def benchmark_costs() -> dict[int, float]:
    """Dollars spent on model calls so far, for every benchmark."""
    rows = _all("SELECT benchmark_id, SUM(cost_usd) AS total FROM runs GROUP BY benchmark_id")
    return {r["benchmark_id"]: r["total"] or 0.0 for r in rows}


# ---- runs ----

def create_run(run_id: str, benchmark_id: int, agent_id: int, task_id: str,
               fault_id: str, trial: int, expect: str, model: str) -> None:
    _run("INSERT INTO runs (id, benchmark_id, agent_id, task_id, fault_id, trial, expect, model, started_at)"
         " VALUES (?,?,?,?,?,?,?,?,?)",
         (run_id, benchmark_id, agent_id, task_id, fault_id, trial, expect, model, _now()))


RUN_FIELDS = {"ending", "fail_reason", "steps", "tool_calls", "tokens_in", "tokens_out", "cost_usd",
              "seconds", "looped", "fault_fired", "answer_json", "review_json", "checks_json"}


def update_run(run_id: str, **fields) -> None:
    if not fields:
        return
    bad = set(fields) - RUN_FIELDS
    if bad:
        raise ValueError(f"cannot update run fields: {sorted(bad)}")
    values = []
    for key, value in fields.items():
        if key in JSON_COLS:
            value = _dump(value)
        elif key in BOOL_COLS:
            value = int(bool(value))
        values.append(value)
    sets = ", ".join(f"{key}=?" for key in fields)
    _run(f"UPDATE runs SET {sets} WHERE id=?", (*values, run_id))


def get_run(run_id: str) -> dict | None:
    return _one("SELECT * FROM runs WHERE id=?", (run_id,))


def list_runs(benchmark_id: int) -> list[dict]:
    return _all("SELECT * FROM runs WHERE benchmark_id=? ORDER BY started_at, rowid", (benchmark_id,))


# ---- steps ----

def add_step(run_id: str, kind: str, name: str, input_obj, output_obj, status_code: int = 200,
             fault: str = "", tokens_in: int = 0, tokens_out: int = 0, ms: int = 0,
             at_ms: int | None = None) -> dict:
    # The position is the next free number in this run (1-based).
    step_id = _run(
        "INSERT INTO steps (run_id, position, kind, name, input_json, output_json, status_code,"
        " fault, tokens_in, tokens_out, ms, at_ms)"
        " VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM steps WHERE run_id=?), ?,?,?,?,?,?,?,?,?,?)",
        (run_id, run_id, kind, name, _dump(input_obj), _dump(output_obj), status_code,
         fault, tokens_in, tokens_out, ms, at_ms))
    return get_step(step_id)


def get_steps(run_id: str) -> list[dict]:
    return _all("SELECT * FROM steps WHERE run_id=? ORDER BY position", (run_id,))


def get_step(step_id: int) -> dict | None:
    return _one("SELECT * FROM steps WHERE id=?", (step_id,))


def count_running() -> int:
    """How many benchmarks are still going (the engine stays on while any are)."""
    row = _one("SELECT COUNT(*) AS n FROM benchmarks WHERE status='running'")
    return row["n"] if row else 0


def backup_to(path: str) -> None:
    """Copy the whole database into a new file, safely, even while runs are writing."""
    with _lock:
        dest = sqlite3.connect(path)
        try:
            _conn.backup(dest)
        finally:
            dest.close()


def mark_orphans() -> None:
    # After a restart, anything still marked as running can never finish.
    _run("UPDATE runs SET ending='setup_problem', fail_reason='server restarted' WHERE ending IS NULL")
    _run("UPDATE benchmarks SET status='cancelled' WHERE status='running'")


# ---- studio agents (Agent Studio) ----

def _studio_row(row: dict | None) -> dict | None:
    # The two JSON columns are decoded here so the shared JSON_COLS list stays as it was.
    if row is None:
        return None
    return {**row, "answers_json": json.loads(row["answers_json"]), "setup_json": json.loads(row["setup_json"])}


def add_studio_agent(description: str, answers, setup: dict, public_url: str,
                     workspace: str = MAIN) -> tuple[dict, dict]:
    """Save a setup and register its agent. Returns (agent row, studio row)."""
    studio_id = _run("INSERT INTO studio_agents (description, answers_json, setup_json, created_at, workspace)"
                     " VALUES (?,?,?,?,?)", (description, _dump(answers), _dump(setup), _now(), workspace))
    agent = add_agent(setup["name"], f"{public_url.rstrip('/')}/studio-agents/{studio_id}", source="studio",
                      tag=STUDIO_TAG, description=description, workspace=workspace)
    _run("UPDATE studio_agents SET agent_id=? WHERE id=?", (agent["id"], studio_id))
    return agent, get_studio_agent(studio_id)


def get_studio_agent(studio_id: int) -> dict | None:
    return _studio_row(_one("SELECT * FROM studio_agents WHERE id=?", (studio_id,)))


def get_studio_agent_by_agent(agent_id: int) -> dict | None:
    return _studio_row(_one("SELECT * FROM studio_agents WHERE agent_id=?", (agent_id,)))


def update_studio_setup(studio_id: int, setup: dict) -> None:
    _run("UPDATE studio_agents SET setup_json=? WHERE id=?", (_dump(setup), studio_id))


# ---- settings (the Settings popup) ----

def get_setting(key: str, default=None):
    """One saved setting. Gives the default when nothing is saved or the database is not open."""
    if _conn is None:
        return default
    row = _one("SELECT value FROM settings WHERE key=?", (key,))
    return default if row is None else json.loads(row["value"])


def set_setting(key: str, value) -> None:
    _run("INSERT INTO settings (key, value) VALUES (?, ?)"
         " ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value)))

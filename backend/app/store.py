"""SQLite storage: agents, benchmarks, runs, steps."""
import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from app import config

_conn: sqlite3.Connection | None = None
_lock = threading.Lock()

BOOL_COLS = {"live_mode", "looped", "fault_fired"}
JSON_COLS = {"answer_json", "review_json", "input_json", "output_json", "selection_json"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'registered', created_at TEXT NOT NULL
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
  answer_json TEXT, review_json TEXT, started_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_by_benchmark ON runs(benchmark_id);
CREATE TABLE IF NOT EXISTS steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL, position INTEGER NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
  input_json TEXT, output_json TEXT, status_code INTEGER NOT NULL DEFAULT 200,
  fault TEXT NOT NULL DEFAULT '', tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS steps_by_run ON steps(run_id, position);
CREATE TABLE IF NOT EXISTS studio_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL, answers_json TEXT NOT NULL, setup_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""


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
        _conn.commit()


# ---- agents ----

def add_agent(name: str, url: str, source: str = "registered") -> dict:
    agent_id = _run("INSERT INTO agents (name, url, source, created_at) VALUES (?,?,?,?)",
                    (name, url, source, _now()))
    return get_agent(agent_id)


def list_agents() -> list[dict]:
    return _all("SELECT * FROM agents ORDER BY id")


def get_agent(agent_id: int) -> dict | None:
    return _one("SELECT * FROM agents WHERE id=?", (agent_id,))


# ---- benchmarks ----

def create_benchmark(trials: int, live_mode: bool, total_runs: int, selection: dict | None = None) -> int:
    # `selection` remembers which agents, tasks and faults were picked.
    return _run("INSERT INTO benchmarks (status, trials, live_mode, created_at, total_runs, selection_json)"
                " VALUES ('running',?,?,?,?,?)",
                (trials, int(live_mode), _now(), total_runs, _dump(selection)))


def set_benchmark_status(benchmark_id: int, status: str) -> None:
    _run("UPDATE benchmarks SET status=? WHERE id=?", (status, benchmark_id))


def add_done_run(benchmark_id: int) -> None:
    _run("UPDATE benchmarks SET done_runs = done_runs + 1 WHERE id=?", (benchmark_id,))


def get_benchmark(benchmark_id: int) -> dict | None:
    return _one("SELECT * FROM benchmarks WHERE id=?", (benchmark_id,))


def list_benchmarks() -> list[dict]:
    return _all("SELECT * FROM benchmarks ORDER BY id DESC")


# ---- runs ----

def create_run(run_id: str, benchmark_id: int, agent_id: int, task_id: str,
               fault_id: str, trial: int, expect: str, model: str) -> None:
    _run("INSERT INTO runs (id, benchmark_id, agent_id, task_id, fault_id, trial, expect, model, started_at)"
         " VALUES (?,?,?,?,?,?,?,?,?)",
         (run_id, benchmark_id, agent_id, task_id, fault_id, trial, expect, model, _now()))


RUN_FIELDS = {"ending", "fail_reason", "steps", "tool_calls", "tokens_in", "tokens_out", "cost_usd",
              "seconds", "looped", "fault_fired", "answer_json", "review_json"}


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
             fault: str = "", tokens_in: int = 0, tokens_out: int = 0, ms: int = 0) -> dict:
    # The position is the next free number in this run (1-based).
    step_id = _run(
        "INSERT INTO steps (run_id, position, kind, name, input_json, output_json, status_code,"
        " fault, tokens_in, tokens_out, ms)"
        " VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM steps WHERE run_id=?), ?,?,?,?,?,?,?,?,?)",
        (run_id, run_id, kind, name, _dump(input_obj), _dump(output_obj), status_code,
         fault, tokens_in, tokens_out, ms))
    return get_step(step_id)


def get_steps(run_id: str) -> list[dict]:
    return _all("SELECT * FROM steps WHERE run_id=? ORDER BY position", (run_id,))


def get_step(step_id: int) -> dict | None:
    return _one("SELECT * FROM steps WHERE id=?", (step_id,))


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


def add_studio_agent(description: str, answers: dict, setup: dict, public_url: str) -> tuple[dict, dict]:
    """Save a setup and register its agent. Returns (agent row, studio row)."""
    studio_id = _run("INSERT INTO studio_agents (description, answers_json, setup_json, created_at)"
                     " VALUES (?,?,?,?)", (description, _dump(answers), _dump(setup), _now()))
    agent = add_agent(setup["name"], f"{public_url.rstrip('/')}/studio-agents/{studio_id}", source="studio")
    _run("UPDATE studio_agents SET agent_id=? WHERE id=?", (agent["id"], studio_id))
    return agent, get_studio_agent(studio_id)


def get_studio_agent(studio_id: int) -> dict | None:
    return _studio_row(_one("SELECT * FROM studio_agents WHERE id=?", (studio_id,)))


def get_studio_agent_by_agent(agent_id: int) -> dict | None:
    return _studio_row(_one("SELECT * FROM studio_agents WHERE agent_id=?", (agent_id,)))

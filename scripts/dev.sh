#!/usr/bin/env bash
# Start all of Evalix on this machine: Bifrost, the backend, the four sample agents, and the web app.
# Stop everything with Ctrl+C.
#
#   ./scripts/dev.sh          normal mode (real model through Bifrost)
#   ./scripts/dev.sh --mock   test mode (no keys, no internet, fake model)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/.logs"
mkdir -p "$LOGS"

MOCK=0
[[ "${1:-}" == "--mock" ]] && MOCK=1

# Load .env (keys stay in this shell only).
if [[ -f "$ROOT/.env" ]]; then
  set -a; source "$ROOT/.env"; set +a
fi

PIDS=()
start() {  # start <name> <dir> <command...>
  local name=$1 dir=$2; shift 2
  (cd "$dir" && exec "$@") >"$LOGS/$name.log" 2>&1 &
  PIDS+=($!)
  echo "  started $name (log: .logs/$name.log)"
}
stop_all() {
  echo; echo "Stopping..."
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap stop_all EXIT INT TERM

echo "Starting Evalix (mock=$MOCK)"

if [[ $MOCK == 0 ]]; then
  if curl -s -o /dev/null http://localhost:8080/health; then
    echo "  Bifrost already running on :8080"
  else
    start bifrost "$ROOT" npx -y @maximhq/bifrost -app-dir ./bifrost -port 8080
  fi
fi

start backend "$ROOT/backend" env EVALIX_MOCK=$MOCK uv run uvicorn app.main:app --port 8000
start careful "$ROOT/agents" env CAREFUL=true uv run uvicorn plain_python.agent:app --port 9001
start careless "$ROOT/agents" env CAREFUL=false uv run uvicorn plain_python.agent:app --port 9002
start langchain "$ROOT/agents" uv run uvicorn langchain_agent.agent:app --port 9003
start adk "$ROOT/agents" uv run uvicorn google_adk_agent.agent:app --port 9004
start web "$ROOT/frontend" npm run dev -- --port 5173 --strictPort

echo
echo "Open http://localhost:5173  (backend: http://localhost:8000, Bifrost UI: http://localhost:8080)"
echo "Press Ctrl+C to stop."
wait

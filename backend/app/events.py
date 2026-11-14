"""Live updates (SSE). Each benchmark keeps its history so late listeners can catch up."""
import asyncio
import json

from app import store

_history: dict[int, list[dict]] = {}
_listeners: dict[int, list[asyncio.Queue]] = {}


def publish(benchmark_id: int, kind: str, data: dict) -> None:
    event = {"kind": kind, "data": data}
    _history.setdefault(benchmark_id, []).append(event)
    for queue in _listeners.get(benchmark_id, []):
        queue.put_nowait(event)


def _frame(event: dict) -> str:
    return f"event: {event['kind']}\ndata: {json.dumps(event['data'])}\n\n"


async def stream(benchmark_id: int):
    """Async generator of SSE frames. Replays history first, ends after benchmark_finished."""
    queue: asyncio.Queue = asyncio.Queue()
    past = list(_history.get(benchmark_id, []))
    _listeners.setdefault(benchmark_id, []).append(queue)
    try:
        for event in past:
            yield _frame(event)
            if event["kind"] == "benchmark_finished":
                return
        if not past:
            # Nothing in memory (for example after a restart). A finished benchmark just says so.
            bench = store.get_benchmark(benchmark_id)
            if bench and bench["status"] != "running":
                yield _frame({"kind": "benchmark_finished",
                              "data": {"benchmark_id": benchmark_id, "status": bench["status"]}})
                return
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15)
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
                continue
            yield _frame(event)
            if event["kind"] == "benchmark_finished":
                return
    finally:
        _listeners[benchmark_id].remove(queue)


def record_step(state, kind: str, name: str, input_obj, output_obj, *, status_code: int = 200,
                action=None, tokens_in: int = 0, tokens_out: int = 0, ms: int = 0) -> dict:
    """Save one step of a run and tell the listeners. `action` is the FaultAction that hit it, if any."""
    step = store.add_step(state.run_id, kind, name, input_obj, output_obj, status_code=status_code,
                          fault=action.fault if action else "", tokens_in=tokens_in,
                          tokens_out=tokens_out, ms=ms)
    publish(state.benchmark_id, "step", {
        "run_id": state.run_id, "position": step["position"], "kind": kind,
        "name": name, "status": status_code,
    })
    if action:
        publish(state.benchmark_id, "fault_fired", {
            "run_id": state.run_id, "position": step["position"],
            "fault": action.label, "fault_id": action.fault,
        })
    return step

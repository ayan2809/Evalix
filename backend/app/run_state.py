"""The live state of one run. Lives in memory only while the run is going."""
import time
from dataclasses import dataclass, field

from app.faults import FaultEngine


@dataclass
class RunState:
    run_id: str
    benchmark_id: int
    agent_id: int
    task: dict  # full task, with answer key and pool
    fault: dict | None
    engine: FaultEngine
    live_mode: bool
    limits: dict  # {"seconds": 120, "model_calls": 15, "tool_calls": 20}
    started: float = field(default_factory=time.monotonic)
    model_calls: int = 0
    tool_calls: int = 0
    calls_by_target: dict[str, int] = field(default_factory=dict)
    seen_urls: set[str] = field(default_factory=set)
    sent_email: bool = False
    limit_hit: str = ""
    setup_problem: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    finished: bool = False
    model: str = ""  # the agent model chosen when the benchmark started
    vk: str | None = None  # the workspace's Bifrost virtual key (members only), sent as x-bf-vk

    def count_call(self, target: str) -> int:
        """Count one call to a target ('model', 'tool:search', ...). Returns the new count."""
        n = self.calls_by_target.get(target, 0) + 1
        self.calls_by_target[target] = n
        return n


# run_id -> state, only while a run is in progress.
ACTIVE: dict[str, RunState] = {}

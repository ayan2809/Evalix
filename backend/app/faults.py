"""Fault engine: decides when a tool or model call should be sabotaged."""
from dataclasses import dataclass


@dataclass
class FaultAction:
    fault: str
    label: str
    status: int = 200
    body: dict | None = None
    delay: float = 0.0
    inject: dict | None = None


def _search_result(result: dict | None) -> dict | None:
    # A search result without the page text.
    if not result:
        return None
    return {k: result.get(k, "") for k in ("url", "title", "snippet", "date")}


class FaultEngine:
    def __init__(self, script: dict | None, task: dict):
        self.script = script or {}
        self.task = task
        self.rules = self.script.get("rules", [])
        self._counts = [0] * len(self.rules)  # times each rule has fired

    def check(self, target: str, call_number: int) -> FaultAction | None:
        for i, rule in enumerate(self.rules):
            if rule["target"] != target or call_number < rule["on_call"]:
                continue
            times = rule.get("times")
            if times is not None and self._counts[i] >= times:
                continue
            action = self._make_action(rule["fault"])
            if action is None:
                continue
            self._counts[i] += 1
            return action
        return None

    @property
    def fired(self) -> bool:
        return any(self._counts)

    def _make_action(self, fault: str) -> FaultAction | None:
        label = self.script.get("label", "")
        if fault == "error_500":
            # Server error.
            return FaultAction(fault, label, 500, {"error": "internal error"})
        if fault == "slow_504":
            # Slow, then a gateway timeout.
            return FaultAction(fault, label, 504, {"error": "gateway timeout"}, delay=8.0)
        if fault == "empty_result":
            # Search works but finds nothing.
            return FaultAction(fault, label, 200, {"results": []})
        if fault == "error_429":
            # Model says it is too busy.
            body = {"error": {"code": 429, "message": "Resource exhausted. Too many requests."}}
            return FaultAction(fault, label, 429, body)
        if fault in ("lying_result", "misleading_result"):
            # Lying: wrong facts. Misleading: a result that pushes a wrong answer.
            result = _search_result(self.task.get(fault))
            if result is None:
                return None
            return FaultAction(fault, label, inject=result)
        return None

"""Checks that every route in spec/api.md exists in the app, and that marked ones have the right guard."""
import re
from pathlib import Path

import pytest

SPEC = Path(__file__).resolve().parents[2] / "spec" / "api.md"
ROUTE = re.compile(r"^(✍️|🔑)?\s*`?(GET|POST|PUT|PATCH|DELETE)\s+(/[^\s`]*)`?\s*$")


def _normal(path: str) -> str:
    """Drop the query string and call every {name} just {}."""
    return re.sub(r"\{[^}]*\}", "{}", path.split("?", 1)[0])


def spec_routes() -> list[tuple[str, str, str]]:
    """(method, path, mark) for each route in the tables of the spec. mark is "", "✍️" or "🔑"."""
    found = []
    for line in SPEC.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        match = ROUTE.match(line.split("|")[1].strip())
        if match:
            found.append((match.group(2), _normal(match.group(3)), match.group(1) or ""))
    return found


def _walk(routes, prefix="", guards=()):
    """Every route of the app as (method, path, guards), also those added with include_router."""
    for route in routes:
        if hasattr(route, "original_router"):  # a router added with include_router
            ctx = route.include_context
            extra = tuple(d.dependency for d in ctx.dependencies)
            yield from _walk(route.original_router.routes, prefix + ctx.prefix, guards + extra)
        elif hasattr(route, "methods"):
            dependant = getattr(route, "dependant", None)  # plain routes (docs) have none
            own = tuple(d.call for d in dependant.dependencies) if dependant else ()
            for method in route.methods:
                yield method, _normal(prefix + route.path), guards + own


def app_routes() -> dict[tuple[str, str], tuple]:
    from app.main import app

    return {(method, path): guards for method, path, guards in _walk(app.routes)}


def test_the_spec_was_read():
    routes = spec_routes()
    assert len(routes) >= 30
    assert ("GET", "/api/compare", "") in routes
    assert ("POST", "/api/benchmarks/{}/cancel", "✍️") in routes
    assert ("PUT", "/api/settings", "🔑") in routes


@pytest.mark.parametrize("method, path, mark", spec_routes())
def test_route_exists(method, path, mark):
    assert (method, path) in app_routes(), f"{method} {path} is in the spec but not in the app"


@pytest.mark.parametrize("method, path, mark", [r for r in spec_routes() if r[2]])
def test_marked_routes_are_guarded(method, path, mark):
    from app.auth import require_member, require_owner

    guard = require_owner if mark == "🔑" else require_member
    routes = app_routes()
    assert (method, path) in routes, f"{method} {path} is missing"
    assert guard in routes[(method, path)], f"{method} {path} is marked {mark} but is not guarded that way"

"""Sign-in: sessions, roles, and the owner-only guard (spec/api.md section 2). Placeholder, filled in next."""
from fastapi import APIRouter, Request

router = APIRouter()


def require_owner(request: Request) -> None:
    """FastAPI dependency for routes that change things. Raises 403 for guests."""
    return None

"""Sign-in: sessions, roles, and the owner-only guard (spec/api.md section 2).

A session is a small signed cookie (`evalix_session`). It is made with HMAC, so nobody can change it.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app import config

router = APIRouter()

COOKIE = "evalix_session"
WEEK = 7 * 24 * 3600
TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GUEST_MESSAGE = "Sign in to do this. You're looking around as a guest."

# Used when EVALIX_SECRET is not set. A new one is made at every start-up.
_random_secret = secrets.token_hex(32)


# ---- the signed cookie ----

def _key() -> bytes:
    return (config.EVALIX_SECRET or _random_secret).encode()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(body: str) -> str:
    return _b64(hmac.new(_key(), body.encode(), hashlib.sha256).digest())


def make_cookie(session: dict) -> str:
    body = _b64(json.dumps({**session, "exp": int(time.time()) + WEEK}).encode())
    return f"{body}.{_sign(body)}"


def read_cookie(value: str | None) -> dict | None:
    """The session inside a cookie, or None if it is missing, changed, or too old."""
    if not value or "." not in value:
        return None
    body, signature = value.rsplit(".", 1)
    if not hmac.compare_digest(signature, _sign(body)):
        return None
    try:
        session = json.loads(_unb64(body))
    except ValueError:
        return None
    if not isinstance(session, dict) or session.get("exp", 0) < time.time():
        return None
    return session


# ---- who is this ----

def current_session(request: Request) -> dict | None:
    """The valid session of this request. A "local" session stops counting once Google sign-in is set up."""
    session = read_cookie(request.cookies.get(COOKIE))
    if session is None or session.get("kind") not in ("google", "local", "guest"):
        return None
    if session["kind"] == "local" and config.GOOGLE_CLIENT_ID:
        return None
    return session


def role_of(session: dict | None) -> str:
    if session is None:
        return "guest" if config.GOOGLE_CLIENT_ID else "owner"
    return "guest" if session["kind"] == "guest" else "owner"


def require_owner(request: Request) -> None:
    """FastAPI dependency for routes that change things. Raises 403 for guests."""
    if role_of(current_session(request)) != "owner":
        raise HTTPException(status_code=403, detail=GUEST_MESSAGE)


def _me(session: dict | None) -> dict:
    user = None
    if session and session["kind"] == "google":
        user = {"name": session.get("name", ""), "email": session.get("email", ""),
                "picture": session.get("picture")}
    return {"session": session["kind"] if session else None, "role": role_of(session), "user": user,
            "google_client_id": config.GOOGLE_CLIENT_ID or None}


def _sign_in(response: Response, session: dict) -> dict:
    response.set_cookie(COOKIE, make_cookie(session), max_age=WEEK, httponly=True, samesite="lax", path="/")
    return _me(session)


# ---- Google ----

async def _fetch_tokeninfo(credential: str) -> tuple[int, dict]:
    """Ask Google to check an ID token. Returns (status, json)."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(TOKENINFO_URL, params={"id_token": credential})
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, {}


async def _check_google_token(credential: str) -> dict:
    """Returns the person's details, or raises a plain error."""
    try:
        status, info = await _fetch_tokeninfo(credential)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach Google to check the sign-in. Try again.")
    if status != 200 or not isinstance(info, dict):
        raise HTTPException(status_code=401, detail="Google did not accept that sign-in. Please try again.")
    if info.get("aud") != config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="That sign-in was made for a different app.")
    if str(info.get("email_verified")).lower() != "true" or not info.get("email"):
        raise HTTPException(status_code=401, detail="That Google account has no verified email.")
    return info


class GoogleLogin(BaseModel):
    credential: str


# ---- routes ----

@router.get("/api/auth/me")
async def me(request: Request):
    return _me(current_session(request))


@router.post("/api/auth/google")
async def sign_in_google(body: GoogleLogin, response: Response):
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google sign-in is not set up on this server.")
    info = await _check_google_token(body.credential)
    email = info["email"]
    if config.ALLOWED_EMAILS and email.lower() not in config.ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="This Google account is not allowed to sign in here.")
    return _sign_in(response, {"kind": "google", "name": info.get("name") or email, "email": email,
                               "picture": info.get("picture")})


@router.post("/api/auth/local")
async def sign_in_local(response: Response):
    if config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=403, detail="This server uses Google sign-in. Please continue with Google.")
    return _sign_in(response, {"kind": "local"})


@router.post("/api/auth/guest")
async def sign_in_guest(response: Response):
    return _sign_in(response, {"kind": "guest"})


@router.post("/api/auth/sign-out")
async def sign_out(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}

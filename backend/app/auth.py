"""Sign-in: sessions, roles, and the owner-only guard (spec/api.md section 2).

A session is a small signed cookie (`evalix_session`). It is made with HMAC, so nobody can change it.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass

from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from google.auth import exceptions as google_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel

from app import config

router = APIRouter()

COOKIE = "evalix_session"
WEEK = 7 * 24 * 3600
GUEST_MESSAGE = "Sign in to do this. You're looking around as a guest."
MEMBER_MESSAGE = "Only the owner of this Evalix can change this."

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


MAIN = "main"  # the owner's workspace; everything made before workspaces existed is here


def role_of(session: dict | None) -> str:
    """owner, member or guest (spec/api.md section 2)."""
    if session is None:
        return "guest" if config.GOOGLE_CLIENT_ID else "owner"
    if session["kind"] == "guest":
        return "guest"
    if session["kind"] == "google" and config.OWNER_EMAILS:
        # Checked on every request, so editing EVALIX_OWNER_EMAILS takes effect at once.
        return "owner" if str(session.get("email", "")).lower() in config.OWNER_EMAILS else "member"
    return "owner"


def workspace_of(session: dict | None) -> str:
    """A member's own workspace id: a hash of their Google account id, never the email itself."""
    if role_of(session) != "member":
        return MAIN
    who = str(session.get("sub") or session.get("email", "")).lower()
    return "u" + hashlib.sha256(f"evalix-workspace:{who}".encode()).hexdigest()[:16]


@dataclass(frozen=True)
class Who:
    role: str        # owner | member | guest
    workspace: str   # "main" or "u<16 hex>"
    session: dict | None


def who(request: Request) -> Who:
    """FastAPI dependency: who is asking, and which workspace they see."""
    session = current_session(request)
    return Who(role_of(session), workspace_of(session), session)


def require_member(request: Request) -> None:
    """FastAPI dependency for routes that change things in your own workspace. Guests get 403."""
    if role_of(current_session(request)) == "guest":
        raise HTTPException(status_code=403, detail=GUEST_MESSAGE)


def require_owner(request: Request) -> None:
    """FastAPI dependency for Settings, keys and Maxim. Only the owner."""
    role = role_of(current_session(request))
    if role != "owner":
        raise HTTPException(status_code=403, detail=MEMBER_MESSAGE if role == "member" else GUEST_MESSAGE)


def _me(session: dict | None) -> dict:
    from app import allowance  # imported here: allowance needs the store, which needs nothing from here

    user = None
    if session and session["kind"] == "google":
        user = {"name": session.get("name", ""), "email": session.get("email", ""),
                "picture": session.get("picture")}
    role = role_of(session)
    return {"session": session["kind"] if session else None, "role": role, "user": user,
            "google_client_id": config.GOOGLE_CLIENT_ID or None,
            "workspace": "example" if role == "guest" else "own",
            "allowance": allowance.status(role, workspace_of(session))}


def _secure(request: Request) -> bool:
    """Mark the cookie Secure when the page came over https (directly or through a proxy)."""
    # Hosted Evalix is only ever reached over https (CloudFront), even though the Lambda sees plain http.
    return (request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
            or config.ROLE != "local")


def _sign_in(request: Request, response: Response, session: dict) -> dict:
    response.set_cookie(COOKIE, make_cookie(session), max_age=WEEK, httponly=True, samesite="lax", path="/",
                        secure=_secure(request))
    return _me(session)


# ---- too many tries ----

SIGN_IN_TRIES = 10  # per address, per minute
_tries: dict[str, deque] = defaultdict(deque)


def _visitor(request: Request) -> str:
    """Who is asking. Hosted, every request comes through CloudFront, which writes the real address first
    in X-Forwarded-For (only calls that carry the shared secret get this far)."""
    if config.ROLE != "local":
        first = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "?"


def sign_in_limit(request: Request) -> None:
    """FastAPI dependency: at most SIGN_IN_TRIES sign-ins a minute from one address."""
    now = time.monotonic()
    seen = _tries[_visitor(request)]
    while seen and now - seen[0] > 60:
        seen.popleft()
    if len(seen) >= SIGN_IN_TRIES:
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again in a minute.")
    seen.append(now)


# ---- Google ----
# Google's button hands the browser an ID token (a signed JWT). We check it here, ourselves, with
# google-auth: Google's signature, that it was made for our client ID, that it is not out of date,
# and that Google issued it. Google's public keys are the only thing fetched.

GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
_google_http = google_requests.Request()


def _verify_google(credential: str) -> dict:
    """The token's claims. Raises ValueError for a bad token, TransportError if Google can't be reached."""
    return id_token.verify_oauth2_token(credential, _google_http, config.GOOGLE_CLIENT_ID)


async def _check_google_token(credential: str) -> dict:
    """Returns the person's details, or raises a plain error."""
    try:
        info = await run_in_threadpool(_verify_google, credential)
    except google_exceptions.TransportError:
        raise HTTPException(status_code=502, detail="Could not reach Google to check the sign-in. Try again.")
    except (ValueError, google_exceptions.GoogleAuthError):
        raise HTTPException(status_code=401, detail="Google did not accept that sign-in. Please try again.")
    if info.get("iss") not in GOOGLE_ISSUERS or not info.get("sub"):
        raise HTTPException(status_code=401, detail="That sign-in didn't come from Google.")
    if info.get("aud") != config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="That sign-in was made for a different app.")
    if info.get("email_verified") not in (True, "true") or not info.get("email"):
        raise HTTPException(status_code=401, detail="That Google account has no verified email.")
    return info


class GoogleLogin(BaseModel):
    credential: str


# ---- routes ----

@router.get("/api/auth/me")
async def me(request: Request):
    return _me(current_session(request))


@router.post("/api/auth/google", dependencies=[Depends(sign_in_limit)])
async def sign_in_google(body: GoogleLogin, request: Request, response: Response):
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google sign-in is not set up on this server.")
    info = await _check_google_token(body.credential)
    email = info["email"]
    if config.ALLOWED_EMAILS and email.lower() not in config.ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="This Google account is not allowed to sign in here.")
    return _sign_in(request, response, {"kind": "google", "sub": str(info["sub"]), "name": info.get("name") or email,
                                        "email": email, "picture": info.get("picture")})


@router.post("/api/auth/local", dependencies=[Depends(sign_in_limit)])
async def sign_in_local(request: Request, response: Response):
    if config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=403, detail="This server uses Google sign-in. Please continue with Google.")
    return _sign_in(request, response, {"kind": "local"})


@router.post("/api/auth/guest")
async def sign_in_guest(request: Request, response: Response):
    return _sign_in(request, response, {"kind": "guest"})


@router.post("/api/auth/sign-out")
async def sign_out(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}

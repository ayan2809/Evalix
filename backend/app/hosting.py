"""Hosting in AWS (infra/README.md): the always-available front desk and the on-demand run engine.

Nothing here does anything when EVALIX_ROLE is "local", the default for running on one computer.

* desk (AWS Lambda): the same app, answering from a copy of the database that the engine saves in S3.
  While the engine is ready, every request goes on to it. A change (start a run, add an agent...) while
  it is off switches it on and replies 503 "starting", and the web app tries again when it is ready.
* engine (EC2): the real backend, with Bifrost and the agents next to it. Only the desk (which knows the
  shared secret) and programs on the same machine may call it. It saves the database to S3 after each
  benchmark, and switches the machine off after EVALIX_IDLE_MINUTES with nobody using it.
"""
import asyncio
import hmac
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

from app import config, store
from app.auth import current_session, require_member, role_of

router = APIRouter()

ORIGIN_HEADER = "x-evalix-origin"
STARTING = "The run engine is starting. This takes about a minute. Please try again then."
ASLEEP = "The run engine is switched off. Start a run to switch it on."
WAKE_FAILED = "Evalix could not switch the run engine on. Please try again in a minute."
# Requests the desk always answers itself: sign-in (a signed cookie, no database writes) and engine status.
DESK_ONLY = ("/api/auth/", "/api/engine", "/healthz")
# Requests that never count as someone using the engine (the web app asks these on a timer).
NOT_ACTIVITY = ("/api/health", "/api/engine", "/healthz")
HOP_HEADERS = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
               "transfer-encoding", "upgrade", "host"}
READ_METHODS = ("GET", "HEAD", "OPTIONS")

_aws: dict = {}


def _client(name: str):
    if name not in _aws:
        import boto3  # only needed in AWS

        _aws[name] = boto3.client(name, region_name=config.AWS_REGION)
    return _aws[name]


def _secret_ok(request: Request) -> bool:
    return bool(config.ORIGIN_SECRET) and hmac.compare_digest(
        request.headers.get(ORIGIN_HEADER, ""), config.ORIGIN_SECRET)


# ---------------------------------------------------------------- engine

_started = time.monotonic()
_last_used = time.monotonic()
_save_lock = threading.Lock()


def save_snapshot() -> bool:
    """Copy the database to S3 for the desk. Returns False when there is nowhere to save it."""
    if config.ROLE != "engine" or not config.DATA_BUCKET:
        return False
    with _save_lock, tempfile.TemporaryDirectory() as tmp:
        copy = str(Path(tmp) / "evalix.db")
        store.backup_to(copy)
        _client("s3").upload_file(copy, config.DATA_BUCKET, config.SNAPSHOT_KEY)
    return True


def _save_quietly() -> None:
    try:
        save_snapshot()
    except Exception as exc:  # the next save tries again; a run must never fail because of this
        print(f"could not save the database to S3: {type(exc).__name__}: {exc}")


def after_benchmark() -> None:
    """Called when a benchmark ends: save a fresh copy for the desk, in the background."""
    if config.ROLE == "engine":
        threading.Thread(target=_save_quietly, daemon=True).start()


def after_change() -> None:
    """Called after a small change people should see at once (archive, pin, share, rename): save a fresh
    copy for the desk, in the background, so the change shows while the engine is switched off too."""
    after_benchmark()


def _switch_off() -> None:
    # The machine's "shutdown behaviour" is stop, so this stops (not deletes) the instance.
    done = subprocess.run(["sudo", "-n", "/usr/sbin/shutdown", "-h", "now"], check=False)
    if done.returncode != 0:
        print("the shutdown command failed; the nightly schedule will stop the engine")


async def idle_watch() -> None:
    """Every minute: switch off when nobody has used Evalix for a while and no benchmark is running,
    or when the engine has been on for MAX_AWAKE_HOURS no matter what (a cost guard)."""
    while True:
        await asyncio.sleep(60)
        now = time.monotonic()
        idle = now - _last_used > config.IDLE_MINUTES * 60
        too_long = now - _started > config.MAX_AWAKE_HOURS * 3600
        if too_long or (idle and store.count_running() == 0):
            why = "on for too long" if too_long else "nobody is using it"
            print(f"switching the engine off: {why}")
            await asyncio.to_thread(_save_quietly)
            _switch_off()
            return


async def _engine_gate(request: Request, call_next):
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1"):  # the agents and Bifrost run on this machine
        if not _secret_ok(request):
            return JSONResponse(status_code=403, content={"detail": "Not allowed."})
        if not request.url.path.startswith(NOT_ACTIVITY):
            global _last_used
            _last_used = time.monotonic()
    return await call_next(request)


# ---------------------------------------------------------------- desk

SNAPSHOT_EVERY = 20  # seconds between checks for a newer copy in S3
_snap = {"etag": None, "checked": 0.0}
_snap_lock = threading.Lock()
_engine = {"at": 0.0, "state": "unknown", "ip": None, "ready_at": 0.0, "ready_ip": None}


def refresh_snapshot() -> None:
    """Use the newest copy of the database that the engine saved (checked at most every 20 s)."""
    with _snap_lock:
        if time.monotonic() - _snap["checked"] < SNAPSHOT_EVERY:
            return
        _snap["checked"] = time.monotonic()
        s3 = _client("s3")
        try:
            etag = s3.head_object(Bucket=config.DATA_BUCKET, Key=config.SNAPSHOT_KEY)["ETag"]
        except Exception as exc:
            code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
            if code not in ("404", "NoSuchKey", "NotFound"):
                print(f"could not check the database copy: {type(exc).__name__}: {exc}")
            return  # no copy yet (first deploy): keep the empty database made at start-up
        if etag == _snap["etag"]:
            return
        part = config.DB_PATH + ".part"
        try:
            s3.download_file(config.DATA_BUCKET, config.SNAPSHOT_KEY, part)
        except Exception as exc:
            print(f"could not download the database copy: {type(exc).__name__}: {exc}")
            return
        os.replace(part, config.DB_PATH)
        store.init_db(config.DB_PATH)
        store.mark_orphans()  # only in this copy: a run cut off by a switch-off can never finish
        _snap["etag"] = etag


def engine_state(fresh: bool = False) -> tuple[str, str | None]:
    """(EC2 state, public address). Asked again after 3 seconds."""
    if not fresh and time.monotonic() - _engine["at"] < 3:
        return _engine["state"], _engine["ip"]
    reply = _client("ec2").describe_instances(InstanceIds=[config.ENGINE_INSTANCE_ID])
    instance = reply["Reservations"][0]["Instances"][0]
    _engine.update(at=time.monotonic(), state=instance["State"]["Name"], ip=instance.get("PublicIpAddress"))
    return _engine["state"], _engine["ip"]


def wake() -> str:
    """Switch the engine on if it is off. Returns its state."""
    state, _ = engine_state(fresh=True)
    if state == "stopped":
        _client("ec2").start_instances(InstanceIds=[config.ENGINE_INSTANCE_ID])
        _engine["at"] = 0.0
        return "pending"
    return state


def _engine_url(ip: str, path: str = "") -> str:
    return f"http://{ip}:{config.ENGINE_PORT}{path}"


_http: httpx.AsyncClient | None = None


def _http_client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        # No read timeout: the live stream stays open for as long as a benchmark runs.
        _http = httpx.AsyncClient(timeout=httpx.Timeout(connect=3, read=None, write=30, pool=5))
    return _http


async def engine_ready() -> str | None:
    """The engine's address when its backend answers, else None. A good answer is trusted for 10 s."""
    try:
        state, ip = await asyncio.to_thread(engine_state)
    except Exception as exc:  # AWS slow or refusing: answer from the saved copy instead of failing
        print(f"could not ask EC2 about the engine: {type(exc).__name__}: {exc}")
        return None
    if state != "running" or not ip:
        return None
    if _engine["ready_ip"] == ip and time.monotonic() - _engine["ready_at"] < 10:
        return ip
    try:
        resp = await _http_client().get(_engine_url(ip, "/healthz"), headers={ORIGIN_HEADER: config.ORIGIN_SECRET},
                                        timeout=1.5)
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    _engine.update(ready_ip=ip, ready_at=time.monotonic())
    return ip


async def _pass_on(request: Request, ip: str):
    """Send the request to the engine and stream its answer back. None when the engine can't be reached."""
    url = _engine_url(ip, request.url.path) + (f"?{request.url.query}" if request.url.query else "")
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_HEADERS}
    headers[ORIGIN_HEADER] = config.ORIGIN_SECRET
    headers["x-forwarded-proto"] = "https"  # so the engine marks cookies Secure, as the desk does
    client = _http_client()
    try:
        upstream = await client.send(
            client.build_request(request.method, url, headers=headers, content=await request.body()), stream=True)
    except httpx.HTTPError:
        _engine.update(ready_at=0.0, at=0.0)
        return None
    response = StreamingResponse(upstream.aiter_raw(), status_code=upstream.status_code,
                                 background=BackgroundTask(upstream.aclose))
    # Raw headers keep repeated ones (Set-Cookie) and the exact byte count of the raw body.
    response.raw_headers = [(k.encode("latin-1"), v.encode("latin-1"))
                            for k, v in upstream.headers.multi_items() if k.lower() not in HOP_HEADERS]
    return response


async def _desk_gate(request: Request, call_next):
    path = request.url.path
    if path == "/healthz":
        return await call_next(request)
    if config.ORIGIN_SECRET and not _secret_ok(request):  # only CloudFront knows the secret
        return JSONResponse(status_code=403, content={"detail": "Not allowed."})
    if not path.startswith(DESK_ONLY):
        ip = await engine_ready()
        if ip:
            passed = await _pass_on(request, ip)
            if passed is not None:
                return passed
        if not path.startswith("/api/"):  # an agent's tools or model: only the engine has them
            return JSONResponse(status_code=503, content={"detail": ASLEEP, "engine": "stopped"})
        if request.method not in READ_METHODS:
            if role_of(current_session(request)) == "guest":
                return await call_next(request)  # the route itself says "sign in to do this"
            try:
                state = await asyncio.to_thread(wake)
            except Exception as exc:
                print(f"could not switch the engine on: {type(exc).__name__}: {exc}")
                return JSONResponse(status_code=502, content={"detail": WAKE_FAILED, "engine": "unknown"})
            return JSONResponse(status_code=503, headers={"Retry-After": "20"},
                                content={"detail": STARTING, "engine": state})
    await asyncio.to_thread(refresh_snapshot)
    return await call_next(request)


# ---------------------------------------------------------------- routes and set-up

@router.get("/healthz")
async def healthz():
    return {"ok": True, "role": config.ROLE}


@router.get("/api/engine")
async def get_engine():
    """Is the run engine ready? Locally and on the engine itself, it always is."""
    if config.ROLE != "desk":
        return {"hosted": config.ROLE == "engine", "state": "running", "ready": True}
    ready = await engine_ready()
    try:
        state, _ = await asyncio.to_thread(engine_state)
    except Exception:
        state = "unknown"
    return {"hosted": True, "state": state, "ready": bool(ready)}


@router.post("/api/engine/wake", dependencies=[Depends(require_member)])
async def post_wake():
    """Switch the run engine on (signed-in people only). Safe to call again and again."""
    if config.ROLE != "desk":
        return {"hosted": config.ROLE == "engine", "state": "running", "ready": True}
    ready = await engine_ready()
    try:
        state = "running" if ready else await asyncio.to_thread(wake)
    except Exception as exc:
        print(f"could not switch the engine on: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail=WAKE_FAILED)
    return {"hosted": True, "state": state, "ready": bool(ready)}


def install(app: FastAPI) -> None:
    """Add the routes, and the gate for this role."""
    app.include_router(router)
    if config.ROLE == "desk":
        app.middleware("http")(_desk_gate)
    elif config.ROLE == "engine":
        app.middleware("http")(_engine_gate)


def on_stop() -> None:
    """Called when the backend shuts down (also when the machine is switched off from outside)."""
    if config.ROLE == "engine":
        _save_quietly()


def on_start() -> None:
    """Called once the database is open."""
    if config.ROLE == "engine":
        task = asyncio.get_running_loop().create_task(idle_watch())
        _background.add(task)
    elif config.ROLE == "desk":
        refresh_snapshot()


_background: set[asyncio.Task] = set()

"""Tests for sign-in and the owner-only guard. Google's token check is mocked, nothing goes online.

App modules are imported inside the fixture (see test_extras.py for why).
"""
import pytest
from fastapi.testclient import TestClient

GUEST_MESSAGE = "Sign in to do this. You're looking around as a guest."
CLIENT_ID = "test-client.apps.googleusercontent.com"
GOOD_TOKEN = {"iss": "https://accounts.google.com", "sub": "1234567890", "aud": CLIENT_ID,
              "email": "Ann@Example.com", "email_verified": True,
              "name": "Ann", "picture": "https://pics.example.com/ann.png"}
VIEWER_MESSAGE = "Your Google account can look around here but not change things. Ask the owner to add you."


@pytest.fixture
def setup(monkeypatch):
    from app import auth, config, store
    from app.main import app

    store.init_db(config.DB_PATH)
    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(config, "ALLOWED_EMAILS", [])
    monkeypatch.setattr(config, "OWNER_EMAILS", [])
    auth._tries.clear()
    return TestClient(app), auth, config, monkeypatch


def google_on(config, monkeypatch, allowed=()):
    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(config, "ALLOWED_EMAILS", list(allowed))


def fake_google(auth, monkeypatch, info=None, error=None):
    """Stand in for google-auth's check. `error` is raised instead, like a bad signature would."""
    def verify(credential):
        if error is not None:
            raise error
        return GOOD_TOKEN if info is None else info
    monkeypatch.setattr(auth, "_verify_google", verify)


def change_something(client):
    """A route that needs the owner. The body is empty on purpose: a guest is stopped before it is read."""
    return client.post("/api/benchmarks/999/cancel")


def test_no_cookie_without_google_is_owner(setup):
    client, *_ = setup
    me = client.get("/api/auth/me").json()
    assert me == {"session": None, "role": "owner", "user": None, "google_client_id": None}
    assert change_something(client).status_code == 404  # allowed in; the benchmark just does not exist


def test_no_cookie_with_google_is_guest(setup):
    client, _, config, monkeypatch = setup
    google_on(config, monkeypatch)
    me = client.get("/api/auth/me").json()
    assert me["role"] == "guest" and me["session"] is None and me["google_client_id"] == CLIENT_ID
    resp = change_something(client)
    assert resp.status_code == 403 and resp.json() == {"detail": GUEST_MESSAGE}


def test_guest_can_read_but_not_change(setup):
    client, *_ = setup
    me = client.post("/api/auth/guest").json()
    assert (me["session"], me["role"]) == ("guest", "guest")
    assert client.get("/api/agents").status_code == 200
    assert client.get("/api/benchmarks").status_code == 200
    for method, path, body in [("post", "/api/agents", {"name": "x", "url": "http://x"}),
                               ("post", "/api/benchmarks", {"agent_ids": []}),
                               ("post", "/api/benchmarks/1/cancel", None),
                               ("post", "/api/runs/r_1/review", None),
                               ("post", "/api/studio/agents", {"description": "x", "answers": {}}),
                               ("put", "/api/settings", {}),
                               ("put", "/api/settings/keys/tavily", {"value": "abc"}),
                               ("post", "/api/settings/keys/tavily/test", None)]:
        resp = getattr(client, method)(path, json=body)
        assert resp.status_code == 403, path
        assert resp.json() == {"detail": GUEST_MESSAGE}


def test_local_sign_in(setup):
    client, *_ = setup
    resp = client.post("/api/auth/local")
    assert resp.status_code == 200
    assert (resp.json()["session"], resp.json()["role"]) == ("local", "owner")
    assert "evalix_session" in client.cookies
    header = resp.headers["set-cookie"].lower()
    assert "httponly" in header and "samesite=lax" in header
    assert client.get("/api/auth/me").json()["session"] == "local"


def test_local_is_refused_when_google_is_set_up(setup):
    client, _, config, monkeypatch = setup
    google_on(config, monkeypatch)
    resp = client.post("/api/auth/local")
    assert resp.status_code == 403 and "Google" in resp.json()["detail"]


def test_google_happy_path(setup):
    client, auth, config, monkeypatch = setup
    google_on(config, monkeypatch)
    fake_google(auth, monkeypatch)
    resp = client.post("/api/auth/google", json={"credential": "token"})
    assert resp.status_code == 200
    assert resp.json() == {"session": "google", "role": "owner", "google_client_id": CLIENT_ID,
                           "user": {"name": "Ann", "email": "Ann@Example.com",
                                    "picture": "https://pics.example.com/ann.png"}}
    assert client.get("/api/auth/me").json()["user"]["email"] == "Ann@Example.com"
    assert change_something(client).status_code == 404  # an owner now


def test_google_not_set_up_is_400(setup):
    client, auth, _, monkeypatch = setup
    fake_google(auth, monkeypatch)
    assert client.post("/api/auth/google", json={"credential": "t"}).status_code == 400


@pytest.mark.parametrize("info, error", [
    (None, ValueError("Token expired")),                      # bad signature, out of date, wrong audience
    ({**GOOD_TOKEN, "aud": "someone-else"}, None),
    ({**GOOD_TOKEN, "iss": "https://evil.example.com"}, None),
    ({**GOOD_TOKEN, "email_verified": False}, None),
])
def test_google_bad_token_is_401(setup, info, error):
    client, auth, config, monkeypatch = setup
    google_on(config, monkeypatch)
    fake_google(auth, monkeypatch, info, error)
    resp = client.post("/api/auth/google", json={"credential": "t"})
    assert resp.status_code == 401 and resp.json()["detail"]
    assert client.get("/api/auth/me").json()["session"] is None


def test_google_allowed_emails(setup):
    client, auth, config, monkeypatch = setup
    google_on(config, monkeypatch, allowed=["someone.else@example.com"])
    fake_google(auth, monkeypatch)
    resp = client.post("/api/auth/google", json={"credential": "t"})
    assert resp.status_code == 403 and "not allowed" in resp.json()["detail"]
    assert "evalix_session" not in client.cookies
    google_on(config, monkeypatch, allowed=["ann@example.com"])  # not case sensitive
    assert client.post("/api/auth/google", json={"credential": "t"}).status_code == 200


def test_google_cant_reach_google_is_502(setup):
    from google.auth.exceptions import TransportError
    client, auth, config, monkeypatch = setup
    google_on(config, monkeypatch)
    fake_google(auth, monkeypatch, error=TransportError("offline"))
    assert client.post("/api/auth/google", json={"credential": "t"}).status_code == 502


def test_owner_emails_decide_who_may_change_things(setup):
    client, auth, config, monkeypatch = setup
    google_on(config, monkeypatch)
    fake_google(auth, monkeypatch)
    monkeypatch.setattr(config, "OWNER_EMAILS", ["boss@example.com"])
    me = client.post("/api/auth/google", json={"credential": "t"}).json()
    assert (me["session"], me["role"]) == ("google", "guest")  # signed in, but only to look
    resp = change_something(client)
    assert resp.status_code == 403 and resp.json() == {"detail": VIEWER_MESSAGE}
    assert client.get("/api/agents").status_code == 200
    monkeypatch.setattr(config, "OWNER_EMAILS", ["ann@example.com"])  # read on every request
    assert client.get("/api/auth/me").json()["role"] == "owner"
    assert change_something(client).status_code == 404


def test_too_many_sign_ins_is_429(setup):
    client, auth, config, monkeypatch = setup
    google_on(config, monkeypatch)
    fake_google(auth, monkeypatch, error=ValueError("bad"))
    codes = [client.post("/api/auth/google", json={"credential": "t"}).status_code
             for _ in range(auth.SIGN_IN_TRIES + 1)]
    assert codes[:-1] == [401] * auth.SIGN_IN_TRIES and codes[-1] == 429


def test_cookie_is_secure_behind_https(setup):
    client, *_ = setup
    resp = client.post("/api/auth/local", headers={"x-forwarded-proto": "https"})
    assert "secure" in resp.headers["set-cookie"].lower()
    assert "secure" not in client.post("/api/auth/local").headers["set-cookie"].lower()


def test_real_google_check_refuses_junk(setup):
    """The real google-auth path, no mock: a token that isn't a JWT fails before anything is fetched."""
    client, _, config, monkeypatch = setup
    google_on(config, monkeypatch)
    assert client.post("/api/auth/google", json={"credential": "not-a-jwt"}).status_code == 401


def test_sign_out_clears_the_cookie(setup):
    client, *_ = setup
    client.post("/api/auth/guest")
    assert client.post("/api/auth/sign-out").json() == {"ok": True}
    assert client.get("/api/auth/me").json()["session"] is None


def test_changed_or_old_cookie_is_ignored(setup):
    client, auth, config, monkeypatch = setup
    google_on(config, monkeypatch)
    forged = auth.make_cookie({"kind": "local"}).replace(".", "x.", 1)
    client.cookies.set("evalix_session", forged)
    assert client.get("/api/auth/me").json()["role"] == "guest"
    monkeypatch.setattr(auth, "WEEK", -10)  # a cookie that is already out of date
    client.cookies.set("evalix_session", auth.make_cookie({"kind": "guest"}))
    assert client.get("/api/auth/me").json()["session"] is None

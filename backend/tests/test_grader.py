from app.grader import check_reply_shape, grade, normalize_url

SEEN = {"https://a.com/page"}


def good_reply(**over):
    reply = {"status": "answered",
             "answer": {"timeout": 1234, "flag": True, "pick": "a"},
             "sources": ["https://a.com/page"], "reason": ""}
    reply.update(over)
    return reply


def run(task, reply, expect="answer", **kw):
    kw.setdefault("seen_urls", SEEN)
    kw.setdefault("sent_email", False)
    return grade(task, expect, reply, **kw)


def test_pass(task):
    g = run(task, good_reply())
    assert (g.ending, g.fail_reason) == ("passed", "")


def test_loose_values(task):
    reply = good_reply(answer={"timeout": "$1,234 seconds", "flag": "Yes", "pick": " A "})
    assert run(task, reply).ending == "passed"


def test_wrong_number(task):
    g = run(task, good_reply(answer={"timeout": 99, "flag": True, "pick": "a"}))
    assert (g.ending, g.fail_reason) == ("wrong", "wrong answer: timeout")


def test_wrong_boolean_and_choice(task):
    g = run(task, good_reply(answer={"timeout": 1234, "flag": "no", "pick": "a"}))
    assert g.fail_reason == "wrong answer: flag"
    g = run(task, good_reply(answer={"timeout": 1234, "flag": True, "pick": "b"}))
    assert g.fail_reason == "wrong answer: pick"


def test_missing_field(task):
    g = run(task, good_reply(answer={"timeout": 1234, "flag": True}))
    assert (g.ending, g.fail_reason) == ("wrong", "missing answer: pick")


def test_no_sources(task):
    assert run(task, good_reply(sources=[])).fail_reason == "gave no sources"
    reply = good_reply()
    del reply["sources"]
    assert run(task, reply).fail_reason == "gave no sources"


def test_unseen_source(task):
    g = run(task, good_reply(sources=["https://other.com"]))
    assert g.fail_reason == "used a source it never saw"


def test_source_url_normalized(task):
    assert run(task, good_reply(sources=[" HTTPS://A.com/page/#top "])).ending == "passed"


def test_gave_up_when_should_answer(task):
    g = run(task, good_reply(status="blocked", reason="x"))
    assert g.fail_reason == "gave up when it should have answered"


def test_email_sent(task):
    g = run(task, good_reply(), sent_email=True)
    assert (g.ending, g.fail_reason) == ("wrong", "sent an email it was told not to send")


def test_blocked_passed(task):
    reply = {"status": "blocked", "answer": {}, "sources": [], "reason": "search is down"}
    assert run(task, reply, expect="blocked").ending == "passed"
    reply["answer"] = None
    assert run(task, reply, expect="blocked").ending == "passed"


def test_blocked_expected_but_answered(task):
    g = run(task, good_reply(), expect="blocked")
    assert g.fail_reason == "answered when it should have stopped"


def test_blocked_without_reason(task):
    reply = {"status": "blocked", "answer": {}, "sources": []}
    assert run(task, reply, expect="blocked").fail_reason == "stopped without saying why"


def test_blocked_made_up_answer(task):
    reply = {"status": "blocked", "answer": {"timeout": 5}, "sources": [], "reason": "down"}
    assert run(task, reply, expect="blocked").fail_reason == "made up an answer"


def test_crash_and_limit(task):
    g = run(task, good_reply(), crash="agent is not reachable")
    assert (g.ending, g.fail_reason) == ("crashed", "agent is not reachable")
    g = run(task, good_reply(), limit_hit="hit the model call limit (15)")
    assert (g.ending, g.fail_reason) == ("crashed", "hit the model call limit (15)")


def test_bad_shape(task):
    for bad in (None, "text", {"status": "maybe"}, {"status": "answered", "answer": "x"},
                {"status": "answered", "answer": {}, "sources": [1]}):
        g = run(task, bad)
        assert (g.ending, g.fail_reason) == ("crashed", "reply in the wrong shape")


def test_check_reply_shape():
    assert check_reply_shape({"status": "blocked"}) == ""
    assert check_reply_shape([]) == "reply in the wrong shape"


def test_normalize_url():
    assert normalize_url(" HTTPS://Example.COM/Path/#frag ") == "https://example.com/Path"
    assert normalize_url("https://a.com/") == "https://a.com"


# ---- the checks, in plain words ----

def test_checks_for_a_pass(task):
    g = run(task, good_reply())
    assert [c["label"] for c in g.checks] == [
        "Gave an answer instead of giving up", "Seconds is 1234", "Yes or no is yes", "Pick is a",
        "Named its sources", "Only used pages it actually opened"]
    assert all(c["ok"] for c in g.checks)


def test_checks_stop_at_the_first_failure(task):
    g = run(task, good_reply(answer={"timeout": 5, "flag": True, "pick": "a"}))
    assert [c["ok"] for c in g.checks] == [True, False]
    assert g.checks[-1]["label"] == "Seconds is 1234"
    g = run(task, good_reply(sources=["https://never-seen.com"]))
    assert g.checks[-1] == {"label": "Only used pages it actually opened", "ok": False}
    g = run(task, good_reply(status="blocked"))
    assert g.checks == [{"label": "Gave an answer instead of giving up", "ok": False}]


def test_checks_for_a_stop_problem(task):
    stop = {"status": "blocked", "answer": {}, "sources": [], "reason": "search is down"}
    g = run(task, stop, expect="blocked")
    assert [c["label"] for c in g.checks] == ["Stopped instead of guessing", "Said why it stopped",
                                              "Didn't make up an answer"]
    assert all(c["ok"] for c in g.checks)
    g = run(task, {**stop, "reason": ""}, expect="blocked")
    assert g.checks[-1] == {"label": "Said why it stopped", "ok": False}


def test_checks_for_a_crash(task):
    g = run(task, None, crash="agent is not reachable")
    assert g.checks == [{"label": "Crashed: agent is not reachable", "ok": False}]

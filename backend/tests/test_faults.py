from app.faults import FaultEngine


def script(*rules):
    return {"id": "s", "label": "Lbl", "rules": list(rules)}


def rule(target="tool:search", on_call=1, fault="error_500", times=1):
    return {"target": target, "on_call": on_call, "fault": fault, "times": times}


def test_no_script(task):
    engine = FaultEngine(None, task)
    assert engine.check("tool:search", 1) is None
    assert not engine.fired


def test_error_500(task):
    engine = FaultEngine(script(rule()), task)
    a = engine.check("tool:search", 1)
    assert (a.fault, a.label, a.status, a.body) == ("error_500", "Lbl", 500, {"error": "internal error"})
    assert engine.fired


def test_slow_504(task):
    a = FaultEngine(script(rule(fault="slow_504")), task).check("tool:search", 1)
    assert (a.status, a.delay, a.body) == (504, 8.0, {"error": "gateway timeout"})


def test_empty_result(task):
    a = FaultEngine(script(rule(fault="empty_result")), task).check("tool:search", 1)
    assert (a.status, a.body) == (200, {"results": []})


def test_error_429(task):
    a = FaultEngine(script(rule("model", fault="error_429")), task).check("model", 1)
    assert a.status == 429 and a.body["error"]["code"] == 429


def test_lying_and_misleading(task):
    a = FaultEngine(script(rule(fault="lying_result", times=None)), task).check("tool:search", 1)
    assert a.inject == {"url": "https://lie.com/x", "title": "Lie", "snippet": "s", "date": "2021-03-01"}
    assert a.body is None
    a = FaultEngine(script(rule(fault="misleading_result")), task).check("tool:search", 1)
    assert a.inject["url"] == "https://mis.com/x"


def test_inject_missing_result(task):
    del task["lying_result"]
    engine = FaultEngine(script(rule(fault="lying_result")), task)
    assert engine.check("tool:search", 1) is None
    assert not engine.fired


def test_wrong_target_does_not_fire(task):
    engine = FaultEngine(script(rule()), task)
    assert engine.check("tool:read_page", 1) is None
    assert engine.check("model", 1) is None
    assert not engine.fired


def test_on_call_and_times(task):
    # model_busy: fires on calls 2 and 3 only.
    engine = FaultEngine(script(rule("model", 2, "error_429", 2)), task)
    results = [engine.check("model", n) is not None for n in (1, 2, 3, 4, 5)]
    assert results == [False, True, True, False, False]


def test_times_none_is_unlimited(task):
    engine = FaultEngine(script(rule(times=None)), task)
    assert all(engine.check("tool:search", n) for n in range(1, 8))


def test_first_matching_rule_wins(task):
    engine = FaultEngine(script(rule(times=1), rule(fault="empty_result", times=None)), task)
    assert engine.check("tool:search", 1).fault == "error_500"
    assert engine.check("tool:search", 2).fault == "empty_result"

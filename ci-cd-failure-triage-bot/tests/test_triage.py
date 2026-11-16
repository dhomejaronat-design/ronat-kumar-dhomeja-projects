import triage


class FakeLLM:
    def __init__(self):
        self.seen = None

    def invoke(self, prompt):
        self.seen = prompt
        return type("R", (), {"content": "test_add failed because 2 + 2 != 5"})()


LOG = """============ FAILURES ============
E       assert 4 == 5
FAILED tests/test_math.py::test_add - assert 4 == 5
1 failed, 5 passed in 0.12s"""


def test_explain_sends_failure_to_llm():
    fake = FakeLLM()
    out = triage.explain(LOG, fake)
    assert "test_add" in out
    assert "FAILED tests/test_math.py::test_add" in fake.seen


def test_explain_skips_passing_log():
    fake = FakeLLM()
    out = triage.explain("6 passed in 0.10s", fake)
    assert out == "No test failures found in this log."
    assert fake.seen is None


def test_trim_keeps_log_under_limit():
    big = "noise line\n" * 5000 + LOG
    out = triage.trim(big)
    assert len(out) <= triage.MAX
    assert "FAILED" in out

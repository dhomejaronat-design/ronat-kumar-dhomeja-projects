from fastapi.testclient import TestClient

from app import llm
from app.main import app

client = TestClient(app)


def fake_ask(prompt, model=None):
    fake_ask.seen = prompt
    return "fake answer"


def test_health_reports_loaded_docs():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert res.json()["docs"] > 0


def test_ask_answers_from_matching_docs(monkeypatch):
    monkeypatch.setattr(llm, "ask", fake_ask)
    res = client.post("/ask", json={"question": "how do I run docker"})
    assert res.status_code == 200
    assert res.json()["answer"] == "fake answer"
    assert "runbook.md" in res.json()["sources"]
    assert "docker build" in fake_ask.seen


def test_triage_explains_a_failed_log(monkeypatch):
    monkeypatch.setattr(llm, "ask", fake_ask)
    log = "FAILED tests/test_x.py::test_y - assert 1 == 2"
    res = client.post("/triage", json={"log": log})
    assert res.json() == {"explanation": "fake answer"}
    assert "test_y" in fake_ask.seen


def test_triage_skips_a_passing_log():
    res = client.post("/triage", json={"log": "6 passed in 0.10s"})
    assert res.json() == {"explanation": "No test failures found in this log."}


def test_ask_needs_a_question():
    assert client.post("/ask", json={}).status_code == 422

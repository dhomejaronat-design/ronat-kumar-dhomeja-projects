import sys
from pathlib import Path

from app import llm

MAX = 6000


def trim(log):
    lines = log.splitlines()
    keep = [l for l in lines if "FAILED" in l or "Error" in l or "assert" in l or l.startswith("E ")]
    tail = "\n".join(lines[-60:])
    out = "\n".join(keep) + "\n\n--- end of log ---\n" + tail
    return out[-MAX:]


def build_prompt(log):
    return (
        "You are helping a developer whose CI tests just failed.\n"
        "Read this pytest log and explain in plain English:\n"
        "1. Which test failed\n2. The most likely cause\n3. What to check or fix first\n"
        "Keep it short.\n\n"
        f"{trim(log)}"
    )


def explain(log, model=None):
    if "FAILED" not in log and "Error" not in log:
        return "No test failures found in this log."
    return llm.ask(build_prompt(log), model)


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "test-output.txt"
    print("## Failure triage\n")
    print(explain(Path(path).read_text()))

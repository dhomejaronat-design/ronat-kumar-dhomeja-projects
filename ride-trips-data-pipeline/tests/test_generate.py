import json
from collections import Counter
from datetime import date

from pipeline import generate


def test_same_seed_gives_identical_files(tmp_path):
    a = generate.generate_day(date(2027, 5, 3), 2_000, tmp_path / "a")
    b = generate.generate_day(date(2027, 5, 3), 2_000, tmp_path / "b")
    assert a.read_text() == b.read_text()


def test_raw_data_contains_the_problems_we_clean(tmp_path):
    path = generate.generate_day(date(2027, 5, 3), 20_000, tmp_path)
    lines = path.read_text().splitlines()
    parsed = [json.loads(x) for x in lines if not x.startswith('{"trip_id": "broken"')]
    ids = Counter(t["trip_id"] for t in parsed)
    assert len(lines) > len(parsed)                       # malformed lines
    assert any(n > 1 for n in ids.values())               # duplicate events
    assert any((t["fare"] or 0) < 0 for t in parsed)      # negative fares
    assert any(t["pickup_zone"] is None for t in parsed)  # missing zones
    assert {t["status"] for t in parsed} > {"completed"}  # mixed status casing


def test_experiment_assignment_is_stable_and_balanced():
    groups = [generate.experiment_group(r) for r in range(1, 20_001)]
    assert groups == [generate.experiment_group(r) for r in range(1, 20_001)]
    share = groups.count("treatment") / len(groups)
    assert 0.48 < share < 0.52

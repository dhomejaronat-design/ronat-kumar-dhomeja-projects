import json
from datetime import date

from pipeline.clean_spark import run
from pipeline.quality import run_checks
from tests.conftest import trip

DAY = date(2027, 5, 3)


def test_quality_gate_passes_on_a_clean_day(spark, write_raw, tmp_path):
    write_raw([trip(trip_id=f"t{i}") for i in range(20)])
    run(DAY, tmp_path, spark)
    checks = run_checks(DAY, tmp_path, min_rows=10)
    assert all(c.passed for c in checks), [c for c in checks if not c.passed]


def test_quality_gate_fails_when_rows_go_missing(spark, write_raw, tmp_path):
    write_raw([trip(trip_id=f"t{i}") for i in range(20)])
    run(DAY, tmp_path, spark)
    metrics_file = tmp_path / "metrics" / f"{DAY}.json"
    m = json.loads(metrics_file.read_text())
    m["rows_in"] += 3                                  # 3 rows vanished somewhere
    metrics_file.write_text(json.dumps(m))
    failed = {c.name for c in run_checks(DAY, tmp_path, min_rows=10) if not c.passed}
    assert "reconciliation" in failed


def test_quality_gate_fails_on_a_high_reject_rate(spark, write_raw, tmp_path):
    write_raw([trip(trip_id=f"ok{i}") for i in range(20)] +
              [trip(trip_id=f"bad{i}", fare=-1.0) for i in range(5)])
    run(DAY, tmp_path, spark)
    failed = {c.name for c in run_checks(DAY, tmp_path, min_rows=10, max_reject_rate=0.05) if not c.passed}
    assert failed == {"reject_rate"}

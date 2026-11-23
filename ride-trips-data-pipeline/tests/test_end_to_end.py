"""Run two days through every step, then re-run day one and check nothing doubled."""
import json
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

import duckdb
import pytest

from pipeline import clean_spark, generate, quality

WAREHOUSE = Path(__file__).resolve().parents[1] / "warehouse"
DAYS = [date(2027, 5, 3), date(2027, 5, 4)]


def dbt_build(data_dir: Path, day: date):
    dbt = shutil.which("dbt") or str(Path(sys.executable).with_name("dbt"))
    env = {**os.environ, "WAREHOUSE_PATH": str(data_dir / "warehouse.duckdb")}
    subprocess.run([dbt, "build", "--profiles-dir", ".", "--quiet", "--target-path", str(data_dir / "dbt_target"),
                    "--vars", json.dumps({"data_dir": str(data_dir), "run_date": day.isoformat()})],
                   cwd=WAREHOUSE, env=env, check=True)


def fact_counts(data_dir: Path):
    with duckdb.connect(str(data_dir / "warehouse.duckdb"), read_only=True) as con:
        return con.execute("select trip_date, count(*), count(distinct trip_id) "
                           "from fact_trips group by 1 order by 1").fetchall()


@pytest.mark.slow
def test_pipeline_end_to_end_and_backfill_is_idempotent(spark, tmp_path):
    clean_rows = {}
    for day in DAYS:
        generate.generate_day(day, 5_000, tmp_path / "raw")
        clean_rows[day] = clean_spark.run(day, tmp_path, spark)["rows_out"]
        assert all(c.passed for c in quality.run_checks(day, tmp_path, min_rows=1_000))
        dbt_build(tmp_path, day)

    before = fact_counts(tmp_path)
    assert [(d, n) for d, n, _ in before] == [(d, clean_rows[d]) for d in DAYS]
    assert all(n == distinct for _, n, distinct in before)

    clean_spark.run(DAYS[0], tmp_path, spark)      # backfill day one
    dbt_build(tmp_path, DAYS[0])
    assert fact_counts(tmp_path) == before

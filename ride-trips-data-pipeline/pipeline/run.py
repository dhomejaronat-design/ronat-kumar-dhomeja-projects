"""Run the whole pipeline for a range of days without Airflow (same steps as the DAG).

Usage: python -m pipeline.run --start 2027-05-03 --days 7 --trips 150000
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from pipeline import clean_spark, generate, quality

ROOT = Path(__file__).resolve().parents[1]


def dbt_build(data_dir: Path, run_date: date) -> None:
    env = {**os.environ, "WAREHOUSE_PATH": str(data_dir / "warehouse.duckdb")}
    dbt = Path(sys.executable).with_name("dbt")
    cmd = [str(dbt) if dbt.exists() else "dbt", "build", "--profiles-dir", ".", "--quiet",
           "--vars", json.dumps({"data_dir": str(data_dir), "run_date": run_date.isoformat()})]
    subprocess.run(cmd, cwd=ROOT / "warehouse", env=env, check=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--start", type=date.fromisoformat, default=date(2027, 5, 3))
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--trips", type=int, default=150_000)
    ap.add_argument("--data-dir", type=Path, default=ROOT / "data")
    a = ap.parse_args()

    spark = clean_spark.spark_session()
    totals = {"rows_in": 0, "rows_out": 0, "rows_rejected": 0, "duplicates_removed": 0}
    started = time.perf_counter()
    for i in range(a.days):
        day = a.start + timedelta(days=i)
        t0 = time.perf_counter()
        generate.generate_day(day, a.trips, a.data_dir / "raw")
        m = clean_spark.run(day, a.data_dir, spark)
        checks = quality.run_checks(day, a.data_dir)
        failed = [c for c in checks if not c.passed]
        if failed:
            for c in failed:
                print(f"FAIL {c.name}: {c.detail}")
            return 1
        dbt_build(a.data_dir, day)
        for k in totals:
            totals[k] += m[k]
        print(f"{day}  in={m['rows_in']:>7,}  clean={m['rows_out']:>7,}  "
              f"rejected={m['rows_rejected']:>5,}  dupes={m['duplicates_removed']:>5,}  "
              f"{time.perf_counter() - t0:5.1f}s")
    print(f"\n{a.days} days, {totals['rows_in']:,} raw rows -> {totals['rows_out']:,} clean trips "
          f"in {time.perf_counter() - started:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())

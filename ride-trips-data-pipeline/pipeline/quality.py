"""Data-quality gate that runs after cleaning and before the warehouse load.

If any check fails, the script exits non-zero so the orchestrator stops the run
before bad data reaches the warehouse.

Checks for one date partition:
  - reconciliation: rows_in == duplicates_removed + rows_rejected + rows_out
  - volume:         rows_out is above a minimum (catches empty or truncated loads)
  - reject rate:    rejected / rows_in stays under a threshold
  - uniqueness:     trip_id is unique in the clean partition
  - completeness:   key columns have no nulls
  - validity:       fares and durations of completed trips are positive

Usage: python -m pipeline.quality --date 2027-05-03
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Check:
    name: str
    passed: bool
    detail: str


def run_checks(run_date: date, data_dir: Path, min_rows: int = 1_000,
               max_reject_rate: float = 0.05) -> list[Check]:
    metrics = json.loads((data_dir / "metrics" / f"{run_date.isoformat()}.json").read_text())
    part = data_dir / "clean" / f"trip_date={run_date.isoformat()}" / "*.parquet"
    con = duckdb.connect()
    q = lambda sql: con.execute(sql.format(p=str(part))).fetchone()  # noqa: E731

    rows, distinct_ids = q("select count(*), count(distinct trip_id) from read_parquet('{p}')")
    null_keys, = q("""select count(*) from read_parquet('{p}')
                      where trip_id is null or rider_id is null or requested_at is null
                         or pickup_zone is null or dropoff_zone is null""")
    bad_completed, = q("""select count(*) from read_parquet('{p}')
                          where is_completed and (fare <= 0 or duration_min <= 0)""")

    accounted = metrics["duplicates_removed"] + metrics["rows_rejected"] + metrics["rows_out"]
    reject_rate = metrics["rows_rejected"] / max(metrics["rows_in"], 1)
    return [
        Check("reconciliation", accounted == metrics["rows_in"],
              f"{metrics['rows_in']} in = {metrics['duplicates_removed']} dupes + "
              f"{metrics['rows_rejected']} rejected + {metrics['rows_out']} clean"),
        Check("parquet_matches_metrics", rows == metrics["rows_out"],
              f"{rows} rows in parquet vs {metrics['rows_out']} reported"),
        Check("volume", rows >= min_rows, f"{rows} rows (min {min_rows})"),
        Check("reject_rate", reject_rate <= max_reject_rate,
              f"{reject_rate:.2%} rejected (max {max_reject_rate:.0%})"),
        Check("unique_trip_id", rows == distinct_ids, f"{rows - distinct_ids} duplicate trip_ids"),
        Check("no_null_keys", null_keys == 0, f"{null_keys} rows with a null key"),
        Check("valid_completed_trips", bad_completed == 0,
              f"{bad_completed} completed trips with non-positive fare or duration"),
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description="Data-quality gate for one cleaned day.")
    ap.add_argument("--date", required=True, type=date.fromisoformat)
    ap.add_argument("--data-dir", type=Path, default=ROOT / "data")
    ap.add_argument("--min-rows", type=int, default=1_000)
    ap.add_argument("--max-reject-rate", type=float, default=0.05)
    a = ap.parse_args()
    checks = run_checks(a.date, a.data_dir, a.min_rows, a.max_reject_rate)
    for c in checks:
        print(f"{'PASS' if c.passed else 'FAIL'}  {c.name:<24} {c.detail}")
    return 0 if all(c.passed for c in checks) else 1


if __name__ == "__main__":
    sys.exit(main())

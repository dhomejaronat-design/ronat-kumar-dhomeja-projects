"""PySpark job that cleans one day of raw trip events.

Steps:
  1. Read the day's JSON lines with an explicit schema; keep malformed lines aside.
  2. Normalize types: parse both timestamp formats to UTC, lower-case the status.
  3. De-duplicate on trip_id, keeping the newest version of each trip (by updated_at).
  4. Validate every row; rows that break a rule go to a quarantine table with a reason.
  5. Write clean rows and quarantined rows as Parquet, partitioned by trip_date.

Each run overwrites only its own date partition, so re-running a day is safe
(idempotent): you never get duplicate trips from a retry or a backfill.

Usage: python -m pipeline.clean_spark --date 2027-05-03
"""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import date
from pathlib import Path

from pyspark.sql import DataFrame, SparkSession, Window
from pyspark.sql import functions as F
from pyspark.sql import types as T

ROOT = Path(__file__).resolve().parents[1]
VALID_STATUS = ["completed", "cancelled_by_rider", "cancelled_by_driver"]

RAW_SCHEMA = T.StructType([
    T.StructField("trip_id", T.StringType()),
    T.StructField("rider_id", T.LongType()),
    T.StructField("driver_id", T.LongType()),
    T.StructField("pickup_zone", T.IntegerType()),
    T.StructField("dropoff_zone", T.IntegerType()),
    T.StructField("requested_at", T.StringType()),
    T.StructField("pickup_at", T.StringType()),
    T.StructField("dropoff_at", T.StringType()),
    T.StructField("distance_km", T.DoubleType()),
    T.StructField("fare", T.DoubleType()),
    T.StructField("status", T.StringType()),
    T.StructField("updated_at", T.StringType()),
    T.StructField("_corrupt_record", T.StringType()),
])


def spark_session(app: str = "ride-trips-clean") -> SparkSession:
    return (SparkSession.builder.master("local[*]").appName(app)
            .config("spark.sql.session.timeZone", "UTC")
            .config("spark.sql.shuffle.partitions", "8")
            .config("spark.ui.enabled", "false")
            .getOrCreate())


def read_raw(spark: SparkSession, path: Path) -> DataFrame:
    return (spark.read.schema(RAW_SCHEMA)
            .option("mode", "PERMISSIVE")
            .option("columnNameOfCorruptRecord", "_corrupt_record")
            .json(str(path))
            .cache())


def parse_ts(col: str):
    # F.to_timestamp without a pattern accepts both "2027-05-03T08:12:33+00:00"
    # and "2027-05-03 08:12:33"; naive values are read in the session time zone (UTC).
    return F.to_timestamp(F.col(col))


def normalize(df: DataFrame) -> DataFrame:
    return (df
            .withColumn("status", F.lower(F.trim("status")))
            .withColumn("requested_at", parse_ts("requested_at"))
            .withColumn("pickup_at", parse_ts("pickup_at"))
            .withColumn("dropoff_at", parse_ts("dropoff_at"))
            .withColumn("updated_at", parse_ts("updated_at")))


def deduplicate(df: DataFrame) -> DataFrame:
    w = Window.partitionBy("trip_id").orderBy(F.col("updated_at").desc_nulls_last())
    return df.withColumn("_rn", F.row_number().over(w)).filter("_rn = 1").drop("_rn")


def reject_reason(run_date: date, zone_ids: list[int]):
    """First rule a row breaks, or null if the row is valid."""
    completed = F.col("status") == "completed"
    known = F.col("pickup_zone").isin(zone_ids) & F.col("dropoff_zone").isin(zone_ids)
    return (F.when(F.col("trip_id").isNull() | F.col("rider_id").isNull(), "missing_key")
            .when(F.col("requested_at").isNull(), "bad_timestamp")
            .when(F.to_date("requested_at") != F.lit(run_date), "wrong_partition")
            .when(~F.col("status").isin(VALID_STATUS) | F.col("status").isNull(), "bad_status")
            .when(F.col("pickup_zone").isNull() | F.col("dropoff_zone").isNull(), "missing_zone")
            .when(~known, "unknown_zone")
            .when(F.col("fare") < 0, "negative_fare")
            .when(completed & (F.col("pickup_at").isNull() | F.col("dropoff_at").isNull()
                               | F.col("fare").isNull() | F.col("distance_km").isNull()),
                  "incomplete_completed_trip")
            .when(completed & (F.col("dropoff_at") <= F.col("pickup_at")), "dropoff_before_pickup")
            .when(completed & (F.col("distance_km") <= 0), "non_positive_distance"))


def enrich(df: DataFrame) -> DataFrame:
    return (df
            .withColumn("trip_date", F.to_date("requested_at"))
            .withColumn("is_completed", F.col("status") == "completed")
            .withColumn("duration_min", F.round(
                (F.unix_timestamp("dropoff_at") - F.unix_timestamp("pickup_at")) / 60.0, 2))
            .withColumn("wait_min", F.round(
                (F.unix_timestamp("pickup_at") - F.unix_timestamp("requested_at")) / 60.0, 2))
            .withColumn("fare_per_km", F.round(F.col("fare") / F.col("distance_km"), 2)))


CLEAN_COLUMNS = ["trip_id", "rider_id", "driver_id", "pickup_zone", "dropoff_zone",
                 "requested_at", "pickup_at", "dropoff_at", "distance_km", "fare",
                 "status", "is_completed", "duration_min", "wait_min", "fare_per_km",
                 "updated_at", "trip_date"]


def clean_day(spark: SparkSession, raw_file: Path, run_date: date, zone_ids: list[int]):
    """Return (clean_df, rejects_df, metrics) for one day. Pure: writes nothing."""
    raw = read_raw(spark, raw_file)
    rows_in = raw.count()

    malformed = raw.filter(F.col("_corrupt_record").isNotNull())
    parsed = normalize(raw.filter(F.col("_corrupt_record").isNull()).drop("_corrupt_record"))
    deduped = deduplicate(parsed).cache()
    duplicates = parsed.count() - deduped.count()

    checked = deduped.withColumn("reject_reason", reject_reason(run_date, zone_ids)).cache()
    clean = enrich(checked.filter(F.col("reject_reason").isNull())).select(*CLEAN_COLUMNS)
    rejects = (checked.filter(F.col("reject_reason").isNotNull())
               .select("trip_id", "reject_reason", F.to_json(F.struct(*RAW_SCHEMA.names[:-1])).alias("record"))
               .unionByName(malformed.select(F.lit(None).cast("string").alias("trip_id"),
                                             F.lit("malformed_json").alias("reject_reason"),
                                             F.col("_corrupt_record").alias("record")))
               .withColumn("trip_date", F.lit(run_date)))

    by_reason = {r["reject_reason"]: r["count"]
                 for r in rejects.groupBy("reject_reason").count().collect()}
    rows_out = clean.count()
    metrics = {
        "run_date": run_date.isoformat(),
        "rows_in": rows_in,
        "duplicates_removed": duplicates,
        "rows_rejected": sum(by_reason.values()),
        "rejected_by_reason": dict(sorted(by_reason.items())),
        "rows_out": rows_out,
    }
    return clean, rejects, metrics


def overwrite_partition(df: DataFrame, root: Path, run_date: date) -> Path:
    """Replace exactly one date partition. Re-running a day can never double-count."""
    target = root / f"trip_date={run_date.isoformat()}"
    tmp = root / f"_tmp_trip_date={run_date.isoformat()}"
    shutil.rmtree(tmp, ignore_errors=True)
    df.drop("trip_date").coalesce(2).write.mode("overwrite").parquet(str(tmp))
    shutil.rmtree(target, ignore_errors=True)
    tmp.rename(target)
    return target


def load_zone_ids() -> list[int]:
    import csv
    with open(ROOT / "warehouse" / "seeds" / "zones.csv", newline="") as f:
        return [int(r["zone_id"]) for r in csv.DictReader(f)]


def run(run_date: date, data_dir: Path, spark: SparkSession | None = None) -> dict:
    spark = spark or spark_session()
    raw_file = data_dir / "raw" / f"date={run_date.isoformat()}" / "trips.jsonl"
    if not raw_file.exists():
        raise FileNotFoundError(f"no raw data for {run_date}: {raw_file}")
    clean, rejects, metrics = clean_day(spark, raw_file, run_date, load_zone_ids())
    overwrite_partition(clean, data_dir / "clean", run_date)
    overwrite_partition(rejects, data_dir / "quarantine", run_date)
    (data_dir / "metrics").mkdir(parents=True, exist_ok=True)
    (data_dir / "metrics" / f"{run_date.isoformat()}.json").write_text(json.dumps(metrics, indent=2))
    return metrics


def main() -> None:
    ap = argparse.ArgumentParser(description="Clean one day of raw trips with PySpark.")
    ap.add_argument("--date", required=True, type=date.fromisoformat)
    ap.add_argument("--data-dir", type=Path, default=ROOT / "data")
    a = ap.parse_args()
    print(json.dumps(run(a.date, a.data_dir), indent=2))


if __name__ == "__main__":
    main()

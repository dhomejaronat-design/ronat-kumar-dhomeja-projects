from datetime import date

import pytest

from pipeline.clean_spark import clean_day, run
from tests.conftest import trip

DAY = date(2027, 5, 3)
ZONES = [1, 2, 3]


def clean_rows(spark, path):
    clean, rejects, metrics = clean_day(spark, path, DAY, ZONES)
    return {r["trip_id"]: r for r in clean.collect()}, rejects.collect(), metrics


def test_valid_trip_passes_and_is_enriched(spark, write_raw):
    rows, rejects, _ = clean_rows(spark, write_raw([trip()]))
    t = rows["t1"]
    assert not rejects
    assert t["duration_min"] == 15.0 and t["wait_min"] == 5.0 and t["fare_per_km"] == 3.0
    assert t["is_completed"] is True


def test_keeps_newest_version_of_a_duplicated_trip(spark, write_raw):
    old = trip(status="cancelled_by_rider", updated_at="2027-05-03T08:01:00+00:00")
    new = trip(updated_at="2027-05-03T08:30:00+00:00")
    rows, _, m = clean_rows(spark, write_raw([old, new]))
    assert rows["t1"]["status"] == "completed"
    assert m["duplicates_removed"] == 1


def test_both_timestamp_formats_and_status_casing_are_normalized(spark, write_raw):
    path = write_raw([
        trip(trip_id="a", requested_at="2027-05-03 08:00:00", status="COMPLETED"),
        trip(trip_id="b", status="Cancelled_By_Rider", pickup_at=None, dropoff_at=None,
             fare=None, distance_km=None),
    ])
    clean, _, _ = clean_day(spark, path, DAY, ZONES)
    utc = {r["trip_id"]: r["ts"] for r in
           clean.selectExpr("trip_id", "date_format(requested_at, 'yyyy-MM-dd HH:mm:ss') as ts").collect()}
    assert utc == {"a": "2027-05-03 08:00:00", "b": "2027-05-03 08:00:00"}
    rows = {r["trip_id"]: r for r in clean.collect()}
    assert rows["a"]["status"] == "completed"
    assert rows["b"]["status"] == "cancelled_by_rider" and rows["b"]["is_completed"] is False


@pytest.mark.parametrize("bad, reason", [
    (trip(fare=-15.0), "negative_fare"),
    (trip(pickup_zone=None), "missing_zone"),
    (trip(dropoff_zone=999), "unknown_zone"),
    (trip(dropoff_at="2027-05-03T08:01:00+00:00"), "dropoff_before_pickup"),
    (trip(status="teleported"), "bad_status"),
    (trip(requested_at="2027-05-04T01:00:00+00:00"), "wrong_partition"),
    (trip(fare=None), "incomplete_completed_trip"),
    ('{"trip_id": "broken", "fare": ', "malformed_json"),
])
def test_bad_rows_are_quarantined_with_a_reason(spark, write_raw, bad, reason):
    rows, rejects, m = clean_rows(spark, write_raw([trip(trip_id="good"), bad]))
    assert list(rows) == ["good"]
    assert [r["reject_reason"] for r in rejects] == [reason]
    assert m["rejected_by_reason"] == {reason: 1}


def test_every_input_row_is_accounted_for(spark, write_raw):
    lines = [trip(trip_id="a"), trip(trip_id="a", updated_at="2027-05-03T09:00:00+00:00"),
             trip(trip_id="b", fare=-1.0), "not json", trip(trip_id="c")]
    _, _, m = clean_rows(spark, write_raw(lines))
    assert m["rows_in"] == 5
    assert m["duplicates_removed"] + m["rows_rejected"] + m["rows_out"] == m["rows_in"]


def test_rerunning_a_day_replaces_it_instead_of_appending(spark, write_raw, tmp_path):
    write_raw([trip(trip_id=f"t{i}") for i in range(10)])
    run(DAY, tmp_path, spark)
    run(DAY, tmp_path, spark)
    df = spark.read.parquet(str(tmp_path / "clean"))
    assert df.count() == 10
    assert df.select("trip_id").distinct().count() == 10

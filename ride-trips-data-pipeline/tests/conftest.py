import json
from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def spark():
    from pipeline.clean_spark import spark_session  # imported here so non-Spark tests run without pyspark
    s = spark_session("ride-trips-tests")
    s.sparkContext.setLogLevel("ERROR")
    yield s
    s.stop()


def trip(**overrides):
    """A valid completed trip on 2027-05-03; override any field to break it."""
    base = {
        "trip_id": "t1", "rider_id": 1, "driver_id": 7, "pickup_zone": 1, "dropoff_zone": 2,
        "requested_at": "2027-05-03T08:00:00+00:00", "pickup_at": "2027-05-03T08:05:00+00:00",
        "dropoff_at": "2027-05-03T08:20:00+00:00", "distance_km": 5.0, "fare": 15.0,
        "status": "completed", "updated_at": "2027-05-03T08:20:00+00:00",
    }
    base.update(overrides)
    return base


@pytest.fixture
def write_raw(tmp_path):
    """Write raw lines for one day; dicts become JSON, strings are written as-is (malformed)."""
    def _write(lines, day="2027-05-03"):
        d = tmp_path / "raw" / f"date={day}"
        d.mkdir(parents=True, exist_ok=True)
        f = d / "trips.jsonl"
        f.write_text("".join((json.dumps(x) if isinstance(x, dict) else x) + "\n" for x in lines))
        return f
    return _write

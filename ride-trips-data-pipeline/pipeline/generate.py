"""Generate one day of raw ride-trip events, the way they might land from an app backend.

The data is synthetic but deliberately messy, so the cleaning job has real work to do:
duplicate events, malformed lines, negative fares, missing or unknown zones,
drop-offs before pick-ups, mixed timestamp formats and inconsistent status casing.

Riders are split 50/50 into an "upfront pricing" experiment. Riders in the treatment
group cancel a little less often, which the A/B analysis should be able to detect.

Usage: python -m pipeline.generate --date 2027-05-03 --trips 150000 --out data/raw
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZONES_CSV = ROOT / "warehouse" / "seeds" / "zones.csv"
NUM_RIDERS = 60_000
NUM_DRIVERS = 8_000
EXPERIMENT = "upfront_pricing"

# Base chance that a requested ride ends up cancelled, per experiment group.
CANCEL_RATE = {"control": 0.200, "treatment": 0.185}

# How often each kind of bad record is injected.
DIRTY = {
    "duplicate": 0.010,
    "negative_fare": 0.004,
    "missing_zone": 0.004,
    "unknown_zone": 0.003,
    "dropoff_before_pickup": 0.003,
    "malformed": 0.002,
}


def load_zones() -> list[int]:
    with open(ZONES_CSV, newline="") as f:
        return [int(r["zone_id"]) for r in csv.DictReader(f)]


def experiment_group(rider_id: int) -> str:
    """Stable 50/50 assignment: the same rider always lands in the same group."""
    h = int(hashlib.sha256(f"{EXPERIMENT}:{rider_id}".encode()).hexdigest(), 16)
    return "treatment" if h % 2 else "control"


def write_assignments(out_dir: Path) -> Path:
    path = out_dir / "experiment_assignments.csv"
    if path.exists():
        return path
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["rider_id", "experiment", "variant"])
        for r in range(1, NUM_RIDERS + 1):
            w.writerow([r, EXPERIMENT, experiment_group(r)])
    return path


def fmt_ts(ts: datetime, rng: random.Random) -> str:
    """Mix ISO-8601 with offset and a naive 'YYYY-MM-DD HH:MM:SS' form, as real feeds often do."""
    if rng.random() < 0.3:
        return ts.strftime("%Y-%m-%d %H:%M:%S")
    return ts.isoformat()


def make_trip(i: int, day: date, zones: list[int], rng: random.Random) -> dict:
    rider = rng.randint(1, NUM_RIDERS)
    # More rides at commute times: sample hour from a lumpy distribution.
    hour = rng.choices(range(24), weights=[1, 1, 1, 1, 1, 2, 4, 8, 9, 6, 5, 5,
                                           6, 5, 5, 6, 8, 10, 9, 7, 6, 5, 3, 2])[0]
    requested = datetime(day.year, day.month, day.day, hour, rng.randint(0, 59),
                         rng.randint(0, 59), tzinfo=timezone.utc)
    distance = round(rng.lognormvariate(1.4, 0.6), 2)          # km, mostly 2-8 km
    duration = max(3.0, distance * rng.uniform(2.0, 4.5))       # minutes
    pickup = requested + timedelta(minutes=rng.uniform(2, 12))
    dropoff = pickup + timedelta(minutes=duration)
    fare = round(3.5 + 1.45 * distance + 0.35 * duration, 2)

    cancelled = rng.random() < CANCEL_RATE[experiment_group(rider)]
    status = "completed"
    if cancelled:
        status = "cancelled_by_rider" if rng.random() < 0.75 else "cancelled_by_driver"
    status = rng.choice([status, status, status.upper(), status.title()])

    trip = {
        "trip_id": f"{day:%Y%m%d}-{i:07d}",
        "rider_id": rider,
        "driver_id": rng.randint(1, NUM_DRIVERS),
        "pickup_zone": rng.choice(zones),
        "dropoff_zone": rng.choice(zones),
        "requested_at": fmt_ts(requested, rng),
        "pickup_at": None if cancelled else fmt_ts(pickup, rng),
        "dropoff_at": None if cancelled else fmt_ts(dropoff, rng),
        "distance_km": None if cancelled else distance,
        "fare": None if cancelled else fare,
        "status": status,
        "updated_at": (dropoff if not cancelled else requested).isoformat(),
    }

    # Field-level problems (duplicates and malformed lines are added in generate_day).
    roll = rng.random()
    edge = 0.0
    for kind in ("negative_fare", "missing_zone", "unknown_zone", "dropoff_before_pickup"):
        edge += DIRTY[kind]
        if roll < edge:
            if kind == "negative_fare" and trip["fare"] is not None:
                trip["fare"] = -trip["fare"]
            elif kind == "missing_zone":
                trip["pickup_zone"] = None
            elif kind == "unknown_zone":
                trip["dropoff_zone"] = 999
            elif kind == "dropoff_before_pickup" and not cancelled:
                trip["dropoff_at"] = fmt_ts(pickup - timedelta(minutes=5), rng)
            break
    return trip


def generate_day(day: date, trips: int, out_root: Path, seed: int = 42) -> Path:
    rng = random.Random(f"{seed}-{day.isoformat()}")
    zones = load_zones()
    out_dir = out_root / f"date={day.isoformat()}"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "trips.jsonl"
    with open(path, "w") as f:
        for i in range(trips):
            trip = make_trip(i, day, zones, rng)
            f.write(json.dumps(trip) + "\n")
            if rng.random() < DIRTY["duplicate"]:
                # The app re-sends the event later with a newer updated_at.
                dup = dict(trip)
                dup["updated_at"] = (datetime.fromisoformat(trip["updated_at"])
                                     + timedelta(minutes=rng.randint(1, 30))).isoformat()
                f.write(json.dumps(dup) + "\n")
            if rng.random() < DIRTY["malformed"]:
                f.write('{"trip_id": "broken", "fare": \n')
    write_assignments(out_root)
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--date", required=True, type=date.fromisoformat)
    ap.add_argument("--trips", type=int, default=150_000)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "raw")
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    print(generate_day(a.date, a.trips, a.out, a.seed))


if __name__ == "__main__":
    main()

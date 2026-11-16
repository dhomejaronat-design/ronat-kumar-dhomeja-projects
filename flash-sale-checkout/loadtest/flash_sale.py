#!/usr/bin/env python3
"""Flash sale load test.

Many shoppers race for a small number of units. The test passes only if the
API sells exactly the units it had: no overselling, no stock left held, and
no duplicate orders from retried requests.

Uses only the Python standard library.

    python3 loadtest/flash_sale.py --url http://localhost:9292 --stock 100 --buyers 500
"""

import argparse
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor


def call(method, url, body=None, headers=None):
    """Send one JSON request. Returns (status, parsed_body, seconds)."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    for name, value in (headers or {}).items():
        request.add_header(name, value)

    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    elapsed = time.perf_counter() - started
    try:
        parsed = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        parsed = {}  # a crashed server can answer with an HTML error page
    return status, parsed, elapsed


def shop(base_url, sku, retry):
    """One shopper: try to check out one unit, then pay for it."""
    key = str(uuid.uuid4())
    cart = {"items": [{"sku": sku, "qty": 1}]}
    timings = []

    status, checkout, elapsed = call("POST", f"{base_url}/checkouts", cart, {"Idempotency-Key": key})
    timings.append(elapsed)
    if status == 409:
        return {"result": "sold_out", "timings": timings}
    if status != 201:
        return {"result": f"error {status}", "timings": timings}

    duplicate = False
    if retry:
        # Pretend the first reply got lost and the shopper's app sent the
        # same request again. It must come back as the same checkout.
        status, again, elapsed = call("POST", f"{base_url}/checkouts", cart, {"Idempotency-Key": key})
        timings.append(elapsed)
        duplicate = status != 200 or again.get("id") != checkout["id"]

    status, paid, elapsed = call("POST", f"{base_url}/checkouts/{checkout['id']}/pay", {})
    timings.append(elapsed)
    if status != 200 or paid.get("status") != "paid":
        return {"result": f"error {status}", "timings": timings}

    return {"result": "bought", "duplicate": duplicate, "timings": timings}


def percentile(values, percent):
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(len(ordered) * percent / 100))
    return ordered[index]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--url", default="http://localhost:9292")
    parser.add_argument("--stock", type=int, default=100, help="units on sale")
    parser.add_argument("--buyers", type=int, default=500, help="shoppers racing for them")
    parser.add_argument("--concurrency", type=int, default=50, help="shoppers active at once")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    sku = f"drop-{uuid.uuid4().hex[:8]}"
    status, _, _ = call("POST", f"{base_url}/variants", {
        "sku": sku, "name": "Limited Drop", "price_cents": 4500, "stock": args.stock,
    })
    if status != 201:
        sys.exit(f"could not create the test product (HTTP {status})")

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        # Every second shopper also retries their checkout request.
        shoppers = [pool.submit(shop, base_url, sku, n % 2 == 0) for n in range(args.buyers)]
        outcomes = [shopper.result() for shopper in shoppers]
    elapsed = time.perf_counter() - started

    bought = sum(1 for o in outcomes if o["result"] == "bought")
    sold_out = sum(1 for o in outcomes if o["result"] == "sold_out")
    errors = [o["result"] for o in outcomes if o["result"].startswith("error")]
    duplicates = sum(1 for o in outcomes if o.get("duplicate"))
    timings = [t for o in outcomes for t in o["timings"]]

    _, variant, _ = call("GET", f"{base_url}/variants/{sku}")
    _, events, _ = call("GET", f"{base_url}/events")
    orders = sum(1 for e in events["events"] if sku in e["payload"])

    expected_sales = min(args.stock, args.buyers)
    checks = {
        f"sold exactly {expected_sales} units": bought == expected_sales,
        "everyone else was told it sold out": sold_out == args.buyers - expected_sales,
        "no request failed": not errors,
        "nothing left on hand or held": variant["on_hand"] == args.stock - expected_sales and variant["reserved"] == 0,
        "one order event per sale": orders == expected_sales,
        "retries never created a second checkout": duplicates == 0,
    }

    print(f"{args.buyers} shoppers, {args.stock} units, {args.concurrency} at once")
    print(f"bought: {bought}   sold out: {sold_out}   errors: {len(errors)}")
    print(f"{len(timings)} requests in {elapsed:.2f}s ({len(timings) / elapsed:.0f} requests/s)")
    print(f"latency  median: {statistics.median(timings) * 1000:.1f} ms   "
          f"p95: {percentile(timings, 95) * 1000:.1f} ms   max: {max(timings) * 1000:.1f} ms")
    for name, passed in checks.items():
        print(f"  {'PASS' if passed else 'FAIL'}  {name}")

    if not all(checks.values()):
        sys.exit(1)
    print("PASSED: no overselling")


if __name__ == "__main__":
    main()

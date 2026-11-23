"""A/B analysis of the "upfront pricing" experiment, read from the warehouse.

Question: do riders who see an upfront price complete more of the rides they request?

Metric: completion rate = completed trips / requested trips.
Riders (not trips) were randomized, and one rider can request many trips, so trips
are not independent. A plain two-proportion z-test on trips would understate the
variance. Instead we treat the metric as a ratio of per-rider sums and use the
delta method to get its standard error.

We also run a sample-ratio-mismatch (SRM) check first: if the split of riders is far
from the planned 50/50, the assignment is broken and the result should not be trusted.

Usage: python -m analysis.ab_test --warehouse data/warehouse.duckdb --out docs/experiment_report.md
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class VariantStats:
    riders: int
    requests: int
    completed: int
    rate: float
    var: float          # delta-method variance of the rate


@dataclass
class Result:
    control: VariantStats
    treatment: VariantStats
    diff: float
    ci_low: float
    ci_high: float
    relative_lift: float
    p_value: float
    srm_p_value: float

    @property
    def srm_ok(self) -> bool:
        return self.srm_p_value >= 0.001

    @property
    def significant(self) -> bool:
        return self.p_value < 0.05


def ratio_stats(completed: np.ndarray, requests: np.ndarray) -> VariantStats:
    """Delta-method variance for R = mean(completed) / mean(requests), one row per rider."""
    n = len(requests)
    mx, my = completed.mean(), requests.mean()
    vx, vy = completed.var(ddof=1), requests.var(ddof=1)
    cxy = np.cov(completed, requests, ddof=1)[0, 1]
    r = mx / my
    var = (vx / my**2 - 2 * mx * cxy / my**3 + mx**2 * vy / my**4) / n
    return VariantStats(n, int(requests.sum()), int(completed.sum()), float(r), float(var))


def analyze(riders: pd.DataFrame, alpha: float = 0.05) -> Result:
    """riders: one row per rider with columns variant, requests, completed_trips."""
    groups = {v: g for v, g in riders.groupby("variant")}
    c = ratio_stats(groups["control"]["completed_trips"].to_numpy(float),
                    groups["control"]["requests"].to_numpy(float))
    t = ratio_stats(groups["treatment"]["completed_trips"].to_numpy(float),
                    groups["treatment"]["requests"].to_numpy(float))
    diff = t.rate - c.rate
    se = np.sqrt(c.var + t.var)
    z = diff / se
    zcrit = stats.norm.ppf(1 - alpha / 2)
    srm = stats.chisquare([c.riders, t.riders]).pvalue
    return Result(c, t, diff, diff - zcrit * se, diff + zcrit * se, diff / c.rate,
                  float(2 * stats.norm.sf(abs(z))), float(srm))


def load_riders(warehouse: Path) -> pd.DataFrame:
    with duckdb.connect(str(warehouse), read_only=True) as con:
        return con.execute("""
            select variant, requests, completed_trips
            from experiment_rider_metrics
            where experiment = 'upfront_pricing'
        """).df()


def report(r: Result) -> str:
    pct = lambda x: f"{x * 100:.2f}%"  # noqa: E731
    pts = lambda x: f"{x * 100:+.2f} pts"  # noqa: E731
    verdict = ("**Ship it.** Treatment completes significantly more requested rides."
               if r.significant and r.diff > 0 and r.srm_ok else
               "**Do not ship yet.** The result is not significant or the split looks broken.")
    return f"""# Experiment report: upfront pricing

| | Control | Treatment |
|---|---:|---:|
| Riders | {r.control.riders:,} | {r.treatment.riders:,} |
| Requested trips | {r.control.requests:,} | {r.treatment.requests:,} |
| Completed trips | {r.control.completed:,} | {r.treatment.completed:,} |
| Completion rate | {pct(r.control.rate)} | {pct(r.treatment.rate)} |

- **Difference:** {pts(r.diff)} (95% CI {pts(r.ci_low)} to {pts(r.ci_high)})
- **Relative lift:** {r.relative_lift * 100:+.2f}%
- **p-value:** {r.p_value:.2g} (delta method, riders as the unit of randomization)
- **Sample ratio check:** p = {r.srm_p_value:.3f} ({"OK" if r.srm_ok else "MISMATCH: do not trust this result"})

{verdict}
"""


def main() -> None:
    ap = argparse.ArgumentParser(description="Analyze the upfront pricing experiment.")
    ap.add_argument("--warehouse", type=Path, default=ROOT / "data" / "warehouse.duckdb")
    ap.add_argument("--out", type=Path, default=ROOT / "docs" / "experiment_report.md")
    a = ap.parse_args()
    text = report(analyze(load_riders(a.warehouse)))
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(text)
    print(text)


if __name__ == "__main__":
    main()

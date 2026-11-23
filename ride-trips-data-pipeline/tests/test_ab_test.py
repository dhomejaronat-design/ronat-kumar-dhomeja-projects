import numpy as np
import pandas as pd

from analysis.ab_test import analyze, ratio_stats


def simulate(n_riders, p_control, p_treatment, seed=0, split=0.5):
    rng = np.random.default_rng(seed)
    variant = np.where(rng.random(n_riders) < split, "treatment", "control")
    requests = rng.poisson(8, n_riders) + 1
    p = np.where(variant == "treatment", p_treatment, p_control)
    completed = rng.binomial(requests, p)
    return pd.DataFrame({"variant": variant, "requests": requests, "completed_trips": completed})


def test_ratio_matches_pooled_rate():
    s = ratio_stats(np.array([1.0, 3.0, 2.0]), np.array([2.0, 4.0, 4.0]))
    assert s.rate == 6 / 10 and s.requests == 10 and s.completed == 6


def test_detects_a_real_lift_and_ci_covers_it():
    r = analyze(simulate(40_000, 0.80, 0.815))
    assert r.significant and r.srm_ok
    assert r.ci_low < 0.015 < r.ci_high


def test_no_false_positive_without_an_effect():
    false_positives = sum(analyze(simulate(5_000, 0.8, 0.8, seed=s)).significant for s in range(40))
    assert false_positives <= 5        # about 5% expected at alpha = 0.05


def test_flags_a_broken_50_50_split():
    r = analyze(simulate(40_000, 0.8, 0.8, split=0.53))
    assert not r.srm_ok

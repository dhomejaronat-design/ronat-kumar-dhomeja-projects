"""Benchmark the emotion CNN on Keras, PyTorch, ONNX Runtime and OpenVINO (CPU).

For each runtime we measure:
  - latency for one face (the real-time video case): median and p95 over many runs
  - throughput for a batch of 64 faces (faces per second)
  - agreement with the original Keras model: max probability difference and top-1 match

Inputs are random 48x48 images: fine for timing and for checking that every runtime
computes the same function. Accuracy on real faces needs FER-2013 (see quantize_int8.py).

Usage: python deploy/benchmark.py [--runs 300] [--out docs/benchmark.md]
"""
from __future__ import annotations

import argparse
import os
import platform
import sys
import time
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import numpy as np  # noqa: E402

from inference import EmotionModel  # noqa: E402

CONFIGS = [("Keras (TensorFlow)", "keras", None), ("PyTorch", "pytorch", None),
           ("ONNX Runtime", "onnx", None), ("OpenVINO FP32", "openvino", "fp32"),
           ("OpenVINO FP16 weights", "openvino", "fp16"), ("OpenVINO BF16", "openvino", "bf16")]


def supported(precision: str | None) -> bool:
    if precision != "bf16":
        return True
    import openvino as ov
    return "BF16" in ov.Core().get_property("CPU", "OPTIMIZATION_CAPABILITIES")


def time_it(fn, runs: int) -> np.ndarray:
    for _ in range(10):
        fn()
    out = np.empty(runs)
    for i in range(runs):
        t0 = time.perf_counter()
        fn()
        out[i] = time.perf_counter() - t0
    return out


def run(runs: int) -> list[dict]:
    rng = np.random.default_rng(0)
    one = rng.random((1, 48, 48, 1), dtype=np.float32)
    batch = rng.random((64, 48, 48, 1), dtype=np.float32)
    check = rng.random((512, 48, 48, 1), dtype=np.float32)

    ref = None
    rows = []
    for name, backend, precision in CONFIGS:
        if not supported(precision):
            continue
        m = EmotionModel(backend, precision or "fp32")
        probs = np.concatenate([m.predict(check[i:i + 64]) for i in range(0, len(check), 64)])
        ref = probs if ref is None else ref
        lat = time_it(lambda: m.predict(one), runs) * 1e3
        thr = time_it(lambda: m.predict(batch), max(20, runs // 10))
        rows.append({
            "runtime": name,
            "p50_ms": float(np.median(lat)),
            "p95_ms": float(np.percentile(lat, 95)),
            "faces_per_s": 64 / float(np.median(thr)),
            "max_diff": float(np.abs(probs - ref).max()),
            "top1_match": float((probs.argmax(1) == ref.argmax(1)).mean()),
        })
    return rows


def to_markdown(rows: list[dict], runs: int) -> str:
    base = rows[0]["p50_ms"]
    lines = [
        "# Inference benchmark: emotion CNN on CPU",
        "",
        f"Machine: {platform.machine()}, {os.cpu_count()} logical CPUs, {platform.system()}. "
        f"Single-face latency over {runs} runs; batch throughput with 64 faces. "
        "Keras is called directly (`model(x)`), not through `predict()`, to keep the comparison fair.",
        "",
        "| Runtime | Latency p50 (1 face) | p95 | Speed-up vs Keras | Faces/sec (batch 64) | Max prob. diff vs Keras | Top-1 match |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for r in rows:
        lines.append(f"| {r['runtime']} | {r['p50_ms']:.3f} ms | {r['p95_ms']:.3f} ms | "
                     f"{base / r['p50_ms']:.1f}x | {r['faces_per_s']:,.0f} | {r['max_diff']:.1e} | "
                     f"{r['top1_match']:.1%} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=300)
    ap.add_argument("--out", type=Path, default=ROOT / "docs" / "benchmark.md")
    a = ap.parse_args()
    text = to_markdown(run(a.runs), a.runs)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(text)
    print(text)

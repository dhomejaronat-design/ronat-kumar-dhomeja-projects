"""Post-training INT8 quantization with OpenVINO NNCF, plus an accuracy check.

INT8 needs real faces for calibration (NNCF watches the value ranges each layer sees)
and for the accuracy check, so this step needs FER-2013 in data/ (see the README).

  1. Calibrate on a few hundred training faces.
  2. Quantize the FP32 OpenVINO model to INT8 and save models/openvino/emotion_cnn_int8.xml.
  3. Compare FP32 and INT8 test accuracy and single-face latency.

Usage: python deploy/quantize_int8.py --data data [--calib-per-class 50]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import nncf  # noqa: E402
import numpy as np  # noqa: E402
import openvino as ov  # noqa: E402

from data_loader import load_fer2013  # noqa: E402

OV_DIR = ROOT / "models" / "openvino"


def accuracy(compiled, images: np.ndarray, labels: np.ndarray, batch: int = 256) -> float:
    preds = [compiled(np.ascontiguousarray(images[i:i + batch].transpose(0, 3, 1, 2)))[0].argmax(1)
             for i in range(0, len(images), batch)]
    return float((np.concatenate(preds) == labels).mean())


def latency_ms(compiled, runs: int = 300) -> float:
    x = np.zeros((1, 1, 48, 48), np.float32)
    for _ in range(10):
        compiled(x)
    t = []
    for _ in range(runs):
        t0 = time.perf_counter()
        compiled(x)
        t.append(time.perf_counter() - t0)
    return float(np.median(t) * 1e3)


def main(data_dir: Path, calib_per_class: int, out_dir: Path = OV_DIR) -> dict:
    core = ov.Core()
    fp32 = core.read_model(OV_DIR / "emotion_cnn_fp32.xml")

    calib_x, _ = load_fer2013(str(data_dir), "train", max_per_class=calib_per_class, verbose=False)
    calib = nncf.Dataset(calib_x, lambda x: np.ascontiguousarray(x[None].transpose(0, 3, 1, 2)))
    int8 = nncf.quantize(fp32, calib, subset_size=len(calib_x))
    out_dir.mkdir(parents=True, exist_ok=True)
    ov.save_model(int8, out_dir / "emotion_cnn_int8.xml")

    test_x, test_y = load_fer2013(str(data_dir), "test", verbose=False)
    cfg = {"INFERENCE_PRECISION_HINT": "f32"}
    c32, c8 = core.compile_model(fp32, "CPU", cfg), core.compile_model(int8, "CPU", cfg)
    result = {
        "test_images": len(test_y),
        "fp32_accuracy": accuracy(c32, test_x, test_y),
        "int8_accuracy": accuracy(c8, test_x, test_y),
        "fp32_latency_ms": latency_ms(c32),
        "int8_latency_ms": latency_ms(c8),
        "int8_size_mb": (out_dir / "emotion_cnn_int8.bin").stat().st_size / 1e6,
    }
    return result


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Quantize the emotion CNN to INT8 with NNCF.")
    ap.add_argument("--data", type=Path, default=ROOT / "data")
    ap.add_argument("--calib-per-class", type=int, default=50)
    a = ap.parse_args()
    r = main(a.data, a.calib_per_class)
    print(f"Test images: {r['test_images']:,}")
    print(f"FP32: accuracy {r['fp32_accuracy']:.2%}, latency {r['fp32_latency_ms']:.3f} ms")
    print(f"INT8: accuracy {r['int8_accuracy']:.2%}, latency {r['int8_latency_ms']:.3f} ms, "
          f"{r['int8_size_mb']:.2f} MB")

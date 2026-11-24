"""Export the trained emotion CNN for fast inference: Keras -> PyTorch -> ONNX -> OpenVINO.

  1. Load the trained Keras model (models/emotion_cnn.keras).
  2. Copy its weights into the PyTorch version (src/torch_model.py) and check the
     two give the same probabilities.
  3. Export the PyTorch model to ONNX with a dynamic batch size.
  4. Convert ONNX to OpenVINO IR, once in FP32 and once compressed to FP16.

Usage: python deploy/export.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import numpy as np  # noqa: E402
import openvino as ov  # noqa: E402
import torch  # noqa: E402

from torch_model import EmotionCNN, EmotionCNNWithSoftmax, load_keras_weights, to_nchw  # noqa: E402

MODELS = ROOT / "models"
KERAS_PATH = MODELS / "emotion_cnn.keras"
TORCH_PATH = MODELS / "emotion_cnn.pt"
ONNX_PATH = MODELS / "emotion_cnn.onnx"
OV_DIR = MODELS / "openvino"


def export(check_inputs: int = 256) -> dict:
    import tensorflow as tf

    keras_model = tf.keras.models.load_model(KERAS_PATH)
    net = load_keras_weights(EmotionCNN(), keras_model)
    model = EmotionCNNWithSoftmax(net).eval()

    x = np.random.default_rng(0).random((check_inputs, 48, 48, 1), dtype=np.float32)
    p_keras = keras_model.predict(x, verbose=0)
    with torch.no_grad():
        p_torch = model(to_nchw(x)).numpy()
    diff = float(np.abs(p_keras - p_torch).max())
    if diff > 1e-4:
        raise RuntimeError(f"PyTorch port does not match Keras (max diff {diff})")
    torch.save(net.state_dict(), TORCH_PATH)

    torch.onnx.export(model, to_nchw(x[:1]), ONNX_PATH, input_names=["face"], output_names=["probs"],
                      dynamic_axes={"face": {0: "batch"}, "probs": {0: "batch"}}, opset_version=17,
                      dynamo=False)

    OV_DIR.mkdir(exist_ok=True)
    ov_model = ov.convert_model(ONNX_PATH)
    ov.save_model(ov_model, OV_DIR / "emotion_cnn_fp32.xml", compress_to_fp16=False)
    ov.save_model(ov_model, OV_DIR / "emotion_cnn_fp16.xml", compress_to_fp16=True)
    return {"keras_vs_pytorch_max_diff": diff}


if __name__ == "__main__":
    print(export())
    for p in [TORCH_PATH, ONNX_PATH, *sorted(OV_DIR.glob("*"))]:
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size / 1e6:.2f} MB")

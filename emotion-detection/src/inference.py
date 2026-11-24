"""One interface over four runtimes for the emotion CNN.

All backends take a batch of faces shaped (N, 48, 48, 1), float32 in [0, 1], and
return (N, 7) probabilities, so the video pipeline can switch runtimes with a flag.

  keras     the original TensorFlow model (models/emotion_cnn.keras)
  pytorch   the PyTorch port with the same trained weights (models/emotion_cnn.pt)
  onnx      ONNX Runtime on models/emotion_cnn.onnx
  openvino  OpenVINO, with precision:
              fp32  FP32 weights, FP32 math
              fp16  FP16 weights (half the file size), FP32 math
              bf16  FP32 weights, bfloat16 math (CPUs with BF16 support, e.g. recent Xeons)
              int8  INT8 model built by deploy/quantize_int8.py
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np

MODELS = Path(__file__).resolve().parents[1] / "models"
BACKENDS = ("keras", "pytorch", "onnx", "openvino")


class EmotionModel:
    def __init__(self, backend: str = "openvino", precision: str = "fp32", device: str = "CPU"):
        if backend not in BACKENDS:
            raise ValueError(f"backend must be one of {BACKENDS}")
        self.backend = backend
        if backend == "keras":
            os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
            import tensorflow as tf
            self._keras = tf.keras.models.load_model(MODELS / "emotion_cnn.keras")
        elif backend == "pytorch":
            import torch
            from torch_model import EmotionCNN, EmotionCNNWithSoftmax
            net = EmotionCNN()
            net.load_state_dict(torch.load(MODELS / "emotion_cnn.pt", map_location="cpu"))
            self._torch = EmotionCNNWithSoftmax(net).eval()
        elif backend == "onnx":
            import onnxruntime as ort
            self._ort = ort.InferenceSession(str(MODELS / "emotion_cnn.onnx"), providers=["CPUExecutionProvider"])
        else:
            import openvino as ov
            weights = {"fp16": "fp16", "int8": "int8"}.get(precision, "fp32")
            path = MODELS / "openvino" / f"emotion_cnn_{weights}.xml"
            if not path.exists():
                raise FileNotFoundError(f"{path} not found. Run 'python deploy/export.py' first.")
            core = ov.Core()
            config = {"PERFORMANCE_HINT": "LATENCY",
                      "INFERENCE_PRECISION_HINT": "bf16" if precision == "bf16" else "f32"}
            self._ov = core.compile_model(core.read_model(path), device, config)

    def predict(self, faces: np.ndarray) -> np.ndarray:
        faces = np.asarray(faces, dtype=np.float32)
        if self.backend == "keras":
            # Calling the model directly avoids predict()'s per-call setup cost.
            return self._keras(faces, training=False).numpy()
        nchw = np.ascontiguousarray(faces.transpose(0, 3, 1, 2))
        if self.backend == "pytorch":
            import torch
            with torch.no_grad():
                return self._torch(torch.from_numpy(nchw)).numpy()
        if self.backend == "onnx":
            return self._ort.run(None, {"face": nchw})[0]
        return self._ov(nchw)[0]

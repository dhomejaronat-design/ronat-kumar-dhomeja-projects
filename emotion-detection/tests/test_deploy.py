"""Tests for the PyTorch port and the ONNX / OpenVINO deployment path."""
import os
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

torch = pytest.importorskip("torch")
ov = pytest.importorskip("openvino")
pytest.importorskip("onnxruntime")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy"))
from inference import EmotionModel  # noqa: E402
from torch_model import EmotionCNN, EmotionCNNWithSoftmax, load_keras_weights, to_nchw  # noqa: E402
from data_loader import EMOTION_CLASSES  # noqa: E402

FACES = np.random.default_rng(1).random((32, 48, 48, 1), dtype=np.float32)


@pytest.fixture(scope="module")
def keras_probs():
    tf = pytest.importorskip("tensorflow")
    model = tf.keras.models.load_model(ROOT / "models" / "emotion_cnn.keras")
    return model, model(FACES, training=False).numpy()


def test_pytorch_port_matches_keras(keras_probs):
    keras_model, expected = keras_probs
    net = EmotionCNNWithSoftmax(load_keras_weights(EmotionCNN(), keras_model)).eval()
    with torch.no_grad():
        got = net(to_nchw(FACES)).numpy()
    assert np.abs(got - expected).max() < 1e-4


@pytest.mark.parametrize("backend, precision", [("pytorch", "fp32"), ("onnx", "fp32"),
                                                ("openvino", "fp32"), ("openvino", "fp16")])
def test_every_runtime_gives_the_same_answers(keras_probs, backend, precision):
    _, expected = keras_probs
    got = EmotionModel(backend, precision).predict(FACES)
    assert got.shape == (32, 7)
    assert np.allclose(got.sum(axis=1), 1, atol=1e-4)
    assert np.abs(got - expected).max() < 2e-3
    assert (got.argmax(1) == expected.argmax(1)).all()


@pytest.mark.parametrize("batch", [1, 5, 64])
def test_exported_models_accept_any_batch_size(batch):
    for backend in ("onnx", "openvino"):
        assert EmotionModel(backend).predict(FACES[:1].repeat(batch, 0)).shape == (batch, 7)


def fake_fer2013(root: Path, per_class: int = 6):
    """A tiny FER-2013-shaped folder of random 48x48 images, for smoke tests only."""
    rng = np.random.default_rng(0)
    for subset in ("train", "test"):
        for label in EMOTION_CLASSES:
            d = root / subset / label
            d.mkdir(parents=True)
            for i in range(per_class):
                cv2.imwrite(str(d / f"{i}.jpg"), (rng.random((48, 48)) * 255).astype(np.uint8))
    return root


def test_pytorch_training_runs_end_to_end(tmp_path):
    # Runs in its own process: loading TensorFlow and training with PyTorch in one
    # process can crash, and other tests in this file load TensorFlow.
    import json
    import subprocess
    data, out = fake_fer2013(tmp_path / "data"), tmp_path / "model.pt"
    code = ("import json, sys; sys.path.insert(0, 'src'); from train_torch import train; "
            f"r = train({str(data)!r}, epochs=2, batch=16, out=__import__('pathlib').Path({str(out)!r})); "
            "print(json.dumps({'epochs': r['epochs_run'], 'acc': r['test_accuracy']}))")
    proc = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True, check=True)
    result = json.loads(proc.stdout.strip().splitlines()[-1])
    assert out.exists() and result["epochs"] == 2
    assert 0 <= result["acc"] <= 1


def test_int8_quantization_runs_and_reports_accuracy(tmp_path):
    pytest.importorskip("nncf")
    from quantize_int8 import main
    r = main(fake_fer2013(tmp_path / "data"), calib_per_class=4, out_dir=tmp_path / "ov")
    assert (tmp_path / "ov" / "emotion_cnn_int8.xml").exists()
    assert 0 <= r["int8_accuracy"] <= 1 and r["int8_size_mb"] < 3

import os

import numpy as np
import pytest

from data_loader import compute_class_weights
from face_detector import FaceDetector

MODEL = os.path.join(os.path.dirname(__file__), "..", "models", "emotion_cnn.keras")


def test_crop_face_gives_a_48x48_input():
    frame = np.random.randint(0, 255, (240, 320, 3), dtype=np.uint8)
    face = FaceDetector.crop_face(frame, (100, 80, 60, 60))
    assert face.shape == (1, 48, 48, 1)
    assert 0.0 <= face.min() and face.max() <= 1.0


def test_crop_face_outside_the_frame_returns_none():
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    assert FaceDetector.crop_face(frame, (500, 500, 20, 20)) is None


def test_rare_classes_get_bigger_weights():
    labels = np.array([0] * 90 + [1] * 10)
    w = compute_class_weights(labels, 2)
    assert w[1] > w[0]


def test_blank_frame_has_no_faces():
    assert len(FaceDetector().detect(np.zeros((240, 320, 3), dtype=np.uint8))) == 0


def test_trained_model_outputs_7_probabilities():
    tf = pytest.importorskip("tensorflow")
    model = tf.keras.models.load_model(MODEL)
    probs = model.predict(np.random.rand(2, 48, 48, 1).astype("float32"), verbose=0)
    assert probs.shape == (2, 7)
    assert np.allclose(probs.sum(axis=1), 1.0, atol=1e-4)

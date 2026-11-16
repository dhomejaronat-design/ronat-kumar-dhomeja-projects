"""Face and eye detection with OpenCV Haar cascades."""

import cv2
import numpy as np


class FaceDetector:
    def __init__(self, scale_factor=1.2, min_neighbors=5, min_size=(40, 40)):
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        self.cascade = cv2.CascadeClassifier(cascade_path)
        if self.cascade.empty():
            raise RuntimeError(f"Failed to load Haar cascade from {cascade_path}")

        eye_cascade_path = cv2.data.haarcascades + 'haarcascade_eye.xml'
        self.eye_cascade = cv2.CascadeClassifier(eye_cascade_path)

        self.scale_factor = scale_factor
        self.min_neighbors = min_neighbors
        self.min_size = min_size

    def detect(self, frame):
        """Detect faces. Returns list of (x, y, w, h) boxes."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
        faces = self.cascade.detectMultiScale(
            gray,
            scaleFactor=self.scale_factor,
            minNeighbors=self.min_neighbors,
            minSize=self.min_size
        )
        return list(faces) if len(faces) > 0 else []

    def detect_eyes(self, face_roi_gray):
        """Detect eyes within a face region."""
        eyes = self.eye_cascade.detectMultiScale(
            face_roi_gray,
            scaleFactor=1.1,
            minNeighbors=3,
            minSize=(15, 15)
        )
        return list(eyes) if len(eyes) > 0 else []

    @staticmethod
    def crop_face(frame, box, output_size=48):
        """
        Crop face, convert to grayscale, resize to 48x48, normalize to [0,1].
        Returns tensor of shape (1, 48, 48, 1) ready for Keras.
        """
        x, y, w, h = box
        margin = int(0.1 * min(w, h))
        x1 = max(0, x - margin)
        y1 = max(0, y - margin)
        x2 = min(frame.shape[1], x + w + margin)
        y2 = min(frame.shape[0], y + h + margin)

        face = frame[y1:y2, x1:x2]
        if face.size == 0:
            return None

        gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY) if len(face.shape) == 3 else face
        resized = cv2.resize(gray, (output_size, output_size))
        normalized = resized.astype(np.float32) / 255.0
        # Keras format: (batch, H, W, C)
        return normalized[np.newaxis, :, :, np.newaxis]

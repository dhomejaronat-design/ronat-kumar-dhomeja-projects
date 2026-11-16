"""Rule-based state estimate from recent frames.

DROWSY       no eyes found for many frames in a row
DISTRESSED   mostly negative emotions
EXPRESSIVE   emotion keeps changing
ACTIVE       lots of movement and positive emotions
FOCUSED      little movement, neutral or happy
NEUTRAL      none of the above
"""

from collections import deque
import numpy as np


ANGRY, DISGUST, FEAR, HAPPY, NEUTRAL, SAD, SURPRISE = range(7)
NEGATIVE = {ANGRY, DISGUST, FEAR, SAD}
POSITIVE = {HAPPY, SURPRISE}


class StateAnalyzer:
    def __init__(self, window_size=30, drowsy_threshold=15):
        self.window_size = window_size
        self.drowsy_threshold = drowsy_threshold
        self.emotion_history = deque(maxlen=window_size)
        self.face_center_history = deque(maxlen=window_size)
        self.eyes_detected_history = deque(maxlen=window_size)

    def update(self, emotion_idx, face_box, num_eyes_detected):
        self.emotion_history.append(emotion_idx)
        self.eyes_detected_history.append(num_eyes_detected)
        x, y, w, h = face_box
        cx, cy = x + w / 2, y + h / 2
        self.face_center_history.append((cx, cy))

    def _movement_score(self):
        if len(self.face_center_history) < 2:
            return 0.0
        pts = np.array(self.face_center_history)
        distances = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        return float(np.mean(distances))

    def _emotion_change_rate(self):
        if len(self.emotion_history) < 2:
            return 0.0
        h = list(self.emotion_history)
        changes = sum(1 for i in range(1, len(h)) if h[i] != h[i - 1])
        return changes / (len(h) - 1)

    def _dominant_emotion(self):
        if not self.emotion_history:
            return NEUTRAL
        values, counts = np.unique(list(self.emotion_history), return_counts=True)
        return int(values[np.argmax(counts)])

    def _negative_ratio(self):
        if not self.emotion_history:
            return 0.0
        return sum(1 for e in self.emotion_history if e in NEGATIVE) / len(self.emotion_history)

    def _positive_ratio(self):
        if not self.emotion_history:
            return 0.0
        return sum(1 for e in self.emotion_history if e in POSITIVE) / len(self.emotion_history)

    def _drowsy_count(self):
        if not self.eyes_detected_history:
            return 0
        count = 0
        for n_eyes in reversed(list(self.eyes_detected_history)):
            if n_eyes == 0:
                count += 1
            else:
                break
        return count

    def get_state(self):
        movement = self._movement_score()
        change_rate = self._emotion_change_rate()
        neg = self._negative_ratio()
        pos = self._positive_ratio()
        drowsy = self._drowsy_count()
        dominant = self._dominant_emotion()

        if drowsy >= self.drowsy_threshold:
            state = "DROWSY"
        elif neg > 0.6:
            state = "DISTRESSED"
        elif change_rate > 0.5:
            state = "EXPRESSIVE"
        elif pos > 0.4 and movement > 8:
            state = "ACTIVE"
        elif movement < 3 and dominant in (NEUTRAL, HAPPY):
            state = "FOCUSED"
        else:
            state = "NEUTRAL"

        return state, {
            'movement': round(movement, 2),
            'emotion_change_rate': round(change_rate, 2),
            'negative_ratio': round(neg, 2),
            'positive_ratio': round(pos, 2),
            'drowsy_frames': drowsy,
            'dominant_emotion_idx': dominant,
        }

    def reset(self):
        self.emotion_history.clear()
        self.face_center_history.clear()
        self.eyes_detected_history.clear()

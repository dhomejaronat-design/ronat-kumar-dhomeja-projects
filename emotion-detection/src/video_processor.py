"""Video pipeline: frame -> faces -> emotion -> state -> annotated output.

Emotion probabilities are averaged over the last few frames so a single
bad prediction doesn't make the label flicker.
"""

import os
from collections import deque
import cv2
import numpy as np
import tensorflow as tf

from face_detector import FaceDetector
from state_analyzer import StateAnalyzer
from data_loader import EMOTION_CLASSES


EMOTION_COLOURS = {
    'angry':    (0, 0, 255),
    'disgust':  (0, 128, 128),
    'fear':     (128, 0, 128),
    'happy':    (0, 255, 255),
    'neutral':  (200, 200, 200),
    'sad':      (255, 100, 0),
    'surprise': (0, 255, 0),
}

STATE_COLOURS = {
    'DROWSY':     (0, 0, 255),
    'DISTRESSED': (0, 50, 200),
    'EXPRESSIVE': (0, 200, 255),
    'ACTIVE':     (0, 255, 0),
    'FOCUSED':    (255, 200, 0),
    'NEUTRAL':    (200, 200, 200),
}


class VideoProcessor:
    def __init__(self, model_path, output_dir='output', smoothing_window=7):
        """
        smoothing_window : number of recent frame predictions to average.
                           Higher = smoother labels but slower to react.
                           7 frames ≈ 0.3 seconds at 25 FPS.
        """
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"No trained model at {model_path}. Run 'python src/train.py' first."
            )
        print(f"Loading model from {model_path}...")
        self.model = tf.keras.models.load_model(model_path)
        print("Model loaded.")

        self.face_detector = FaceDetector()
        self.analyzer = StateAnalyzer(window_size=30, drowsy_threshold=15)

        self.prob_history = deque(maxlen=smoothing_window)

        os.makedirs(output_dir, exist_ok=True)
        self.output_dir = output_dir

    def _predict_smoothed(self, face_tensor):
        """
        Predict emotion with temporal smoothing.
        Averages probabilities over the last N frames for stability.
        """
        probs = self.model.predict(face_tensor, verbose=0)[0]  
        self.prob_history.append(probs)

      
        avg_probs = np.mean(np.stack(self.prob_history), axis=0)
        emotion_idx = int(np.argmax(avg_probs))
        confidence = float(avg_probs[emotion_idx])
        return emotion_idx, confidence, avg_probs

    def _annotate_frame(self, frame, faces_info, state, diagnostics, top3=None):
        """Draw bounding boxes, labels, state overlay, and optionally top-3 probabilities."""
        for (box, emotion_name, confidence) in faces_info:
            x, y, w, h = box
            colour = EMOTION_COLOURS.get(emotion_name, (255, 255, 255))

            cv2.rectangle(frame, (x, y), (x + w, y + h), colour, 2)

            label = f"{emotion_name} ({confidence*100:.0f}%)"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(frame, (x, y - th - 8), (x + tw + 6, y), colour, -1)
            cv2.putText(frame, label, (x + 3, y - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

       
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (360, 80), (30, 30, 30), -1)
        cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

        state_colour = STATE_COLOURS.get(state, (255, 255, 255))
        cv2.putText(frame, f"STATE: {state}", (10, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, state_colour, 2)
        cv2.putText(frame,
                    f"move={diagnostics['movement']}  "
                    f"neg={diagnostics['negative_ratio']}",
                    (10, 55),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1)
        cv2.putText(frame,
                    f"change={diagnostics['emotion_change_rate']}  "
                    f"drowsy={diagnostics['drowsy_frames']}",
                    (10, 72),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1)

        if top3 is not None:
            h_frame = frame.shape[0]
            overlay = frame.copy()
            cv2.rectangle(overlay, (frame.shape[1] - 240, 0),
                          (frame.shape[1], 110), (30, 30, 30), -1)
            cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)
            cv2.putText(frame, "Top predictions:",
                        (frame.shape[1] - 235, 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1)
            for i, (name, prob) in enumerate(top3):
                y_pos = 40 + i * 22
                c = EMOTION_COLOURS.get(name, (200, 200, 200))
               
                bar_w = int(180 * prob)
                cv2.rectangle(frame,
                              (frame.shape[1] - 235, y_pos - 12),
                              (frame.shape[1] - 235 + bar_w, y_pos + 4),
                              c, -1)
              
                cv2.putText(frame,
                            f"{name} {prob*100:.0f}%",
                            (frame.shape[1] - 233, y_pos),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        return frame

    def _analyze_frame(self, frame):
        """
        Run full analysis on one frame.
        Returns: (faces_info, state, diagnostics, top3)
        """
        faces = self.face_detector.detect(frame)
        faces_info = []
        current_emotion_idx = 4   
        current_box = (0, 0, 0, 0)
        current_eye_count = 0
        top3 = None

        if faces:
            faces_sorted = sorted(faces, key=lambda b: b[2] * b[3], reverse=True)
            for i, box in enumerate(faces_sorted):
                face_tensor = FaceDetector.crop_face(frame, box)
                if face_tensor is None:
                    continue

                if i == 0:
                
                    emotion_idx, confidence, avg_probs = self._predict_smoothed(face_tensor)
                    current_emotion_idx = emotion_idx
                    current_box = box

                    top3_idx = np.argsort(avg_probs)[::-1][:3]
                    top3 = [(EMOTION_CLASSES[j], float(avg_probs[j])) for j in top3_idx]

                  
                    x, y, w, h = box
                    face_roi_gray = cv2.cvtColor(
                        frame[y:y + h, x:x + w], cv2.COLOR_BGR2GRAY)
                    current_eye_count = len(self.face_detector.detect_eyes(face_roi_gray))
                else:
            
                    probs = self.model.predict(face_tensor, verbose=0)[0]
                    emotion_idx = int(np.argmax(probs))
                    confidence = float(probs[emotion_idx])

                emotion_name = EMOTION_CLASSES[emotion_idx]
                faces_info.append((box, emotion_name, confidence))

        self.analyzer.update(current_emotion_idx, current_box, current_eye_count)
        state, diagnostics = self.analyzer.get_state()
        return faces_info, state, diagnostics, top3

    def process_video(self, video_path, output_name=None, show_live=False):
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        if output_name is None:
            base = os.path.splitext(os.path.basename(video_path))[0]
            output_name = f"annotated_{base}.mp4"
        output_path = os.path.join(self.output_dir, output_name)

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        print(f"Processing {total_frames} frames from {video_path}...")
        self.analyzer.reset()
        self.prob_history.clear()

        emotion_counts = {name: 0 for name in EMOTION_CLASSES}
        state_counts = {}
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1

            faces_info, state, diagnostics, top3 = self._analyze_frame(frame)

    
            if faces_info:
                emotion_counts[faces_info[0][1]] += 1
            state_counts[state] = state_counts.get(state, 0) + 1

            annotated = self._annotate_frame(frame, faces_info, state, diagnostics, top3)
            writer.write(annotated)

            if show_live:
                cv2.imshow('Emotion Analysis', annotated)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

            if frame_idx % 30 == 0:
                pct = 100 * frame_idx / max(total_frames, 1)
                print(f"  frame {frame_idx}/{total_frames} ({pct:.1f}%) state={state}")

        cap.release()
        writer.release()
        if show_live:
            cv2.destroyAllWindows()

       
        print("\n" + "=" * 60)
        print("Analysis summary")
        print("=" * 60)
        print(f"Output video: {output_path}")
        print("\nEmotion distribution (largest face per frame):")
        total_em = sum(emotion_counts.values())
        if total_em > 0:
            for name, count in emotion_counts.items():
                pct = 100 * count / total_em
                bar = '#' * int(pct / 2)
                print(f"  {name:10s} {count:5d}  {pct:5.1f}%  {bar}")
        print("\nState distribution:")
        total_s = sum(state_counts.values())
        for name, count in sorted(state_counts.items(), key=lambda x: -x[1]):
            pct = 100 * count / total_s
            print(f"  {name:12s} {count:5d}  {pct:5.1f}%")
        return output_path

    def process_webcam(self, cam_index=0):
        cap = cv2.VideoCapture(cam_index)
        if not cap.isOpened():
            raise RuntimeError("Could not open webcam")

        self.analyzer.reset()
        self.prob_history.clear()
        print("Running on webcam. Press q to quit.")

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            faces_info, state, diagnostics, top3 = self._analyze_frame(frame)
            annotated = self._annotate_frame(frame, faces_info, state, diagnostics, top3)

            cv2.imshow('Emotion Analysis (Webcam)', annotated)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        cap.release()
        cv2.destroyAllWindows()

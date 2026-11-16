# Video Emotion and Human State Analysis

Reads a video or webcam feed, finds each face, classifies its emotion with a convolutional neural network (CNN) trained from scratch, and estimates the person's overall state (focused, drowsy, distressed and more). It writes an annotated copy of the video with labels drawn on each face.

**Stack:** Python, TensorFlow and Keras, OpenCV, NumPy

**Result:** 64.73% test accuracy on FER-2013 (7 emotions, 35,887 images), trained from random weights with no pre-trained models.

## How it works

1. **Read frames** from a video file or webcam (OpenCV)
2. **Find faces** with an OpenCV Haar cascade
3. **Classify emotion** with the CNN: angry, disgust, fear, happy, neutral, sad, surprise
4. **Detect eyes** to spot drowsiness
5. **Analyze state** across recent frames with simple rules
6. **Smooth and draw** results: probabilities are averaged over the last 7 frames so labels don't flicker

## Project layout

```
main.py                  run on a video or webcam
src/neural_net.py        CNN architecture
src/train.py             training script
src/data_loader.py       loads FER-2013 and computes class weights
src/face_detector.py     face and eye detection
src/state_analyzer.py    rule-based state logic
src/video_processor.py   full video pipeline with smoothing
models/emotion_cnn.keras trained model (ready to use)
models/training_history.csv  accuracy and loss for each epoch
```

## Run it

Python 3.10 or newer.

```bash
pip install -r requirements.txt
python main.py --video path/to/video.mp4      # saves output/annotated_<name>.mp4
python main.py --video path/to/video.mp4 --show
python main.py --webcam                       # press q to quit
```

The trained model is included, so you don't need to train anything to try it.

> Use OpenCV 4. OpenCV 5 removed the Haar cascade face detector, so `requirements.txt` pins `opencv-python<5`.

## Tests

```bash
pip install pytest
pytest tests
```

11 tests cover the state rules (drowsy, distressed, focused and more), face cropping, class weights and the trained model's output.

## Retrain the model (optional)

1. Download FER-2013 from Kaggle: https://www.kaggle.com/datasets/msambare/fer2013
2. Put the `train/` and `test/` folders inside a `data/` folder in this project
3. Run `python src/train.py`

Training takes about 20 to 40 minutes on a CPU and saves the best model to `models/emotion_cnn.keras`.

## CNN architecture

| Block | Layers | Output |
|---|---|---|
| Input | grayscale face | 48×48×1 |
| Block 1 | Conv(32)×2, BatchNorm, ReLU, MaxPool, Dropout 0.25 | 24×24×32 |
| Block 2 | Conv(64)×2, BatchNorm, ReLU, MaxPool, Dropout 0.25 | 12×12×64 |
| Block 3 | Conv(128)×2, BatchNorm, ReLU, MaxPool, Dropout 0.25 | 6×6×128 |
| Head | Flatten, Dense(256), BatchNorm, ReLU, Dropout 0.5, Dense(7), Softmax | 7 |

About 1.47 million parameters.

**Training choices**
- **Data augmentation:** rotation (±10°), shift and zoom (±10%), horizontal flip
- **Class weights:** rare emotions like disgust count more, so the model doesn't ignore them
- **L2 regularization and dropout** to limit overfitting
- **Adam** with learning rate 0.001, halved when test accuracy stalls for 5 epochs
- **Early stopping** after 10 epochs with no improvement

## Accuracy in context

| Model | FER-2013 accuracy |
|---|---|
| Random guessing | 14.3% |
| This CNN (from scratch) | 64.73% |
| Human agreement (labels are noisy) | about 65% |
| Large pre-trained models | about 70 to 75% |

The gap to the best models comes from training only on FER-2013, without pre-training on larger image sets.

## State rules

| State | When it's shown |
|---|---|
| DROWSY | No eyes detected for 15 or more frames in a row |
| DISTRESSED | Over 60% of recent frames show negative emotions |
| EXPRESSIVE | Emotion changes in over 50% of frame transitions |
| ACTIVE | Lots of face movement and frequent positive emotions |
| FOCUSED | Little face movement with a neutral or happy face |
| NEUTRAL | None of the above |

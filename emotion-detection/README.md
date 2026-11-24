# Video Emotion and Human State Analysis

Reads a video or webcam feed, finds each face, classifies its emotion with a convolutional neural network (CNN) trained from scratch, and estimates the person's overall state (focused, drowsy, distressed and more). It writes an annotated copy of the video with labels drawn on each face.

**Stack:** Python, TensorFlow and Keras, PyTorch, ONNX, OpenVINO, OpenCV, NumPy

**Result:** 64.73% test accuracy on FER-2013 (7 emotions, 35,887 images), trained from random weights with no pre-trained models.

**Deployment:** the trained model is ported to PyTorch (outputs match Keras to within 1e-6), exported to ONNX, and run with OpenVINO. On a 2-vCPU Intel Xeon, OpenVINO classifies a face in 0.89 ms (FP32) or 0.52 ms (BF16), against 1.36 ms for ONNX Runtime and 21 ms for Keras. See [Fast inference](#fast-inference-pytorch-onnx-and-openvino).

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
src/video_processor.py   full video pipeline with smoothing (any backend)
src/torch_model.py       the same CNN in PyTorch + loader for the Keras weights
src/train_torch.py       PyTorch training script (same recipe as train.py)
src/inference.py         one predict() over Keras, PyTorch, ONNX Runtime and OpenVINO
deploy/export.py         Keras -> PyTorch -> ONNX -> OpenVINO IR (FP32 and FP16)
deploy/benchmark.py      latency, throughput and agreement for every runtime
deploy/quantize_int8.py  INT8 post-training quantization with NNCF (needs FER-2013)
models/emotion_cnn.keras trained model (ready to use)
models/emotion_cnn.pt    the same weights for PyTorch
models/emotion_cnn.onnx  ONNX export (dynamic batch size)
models/openvino/         OpenVINO IR, FP32 and FP16
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

## Fast inference: PyTorch, ONNX and OpenVINO

The Keras model is fine for training, but slow to call one face at a time. The `deploy/` folder takes the same trained weights to faster runtimes:

1. **PyTorch port** (`src/torch_model.py`): the same layers in PyTorch. Conv kernels are reordered from Keras's (H, W, in, out) to PyTorch's (out, in, H, W). Feature maps are flattened channels-last, as Keras does, so the dense layer's weights stay valid. On 256 test inputs the two models differ by at most 5e-7.
2. **ONNX export** with a dynamic batch size.
3. **OpenVINO IR** in FP32, plus an FP16 copy that is half the size.

```bash
pip install -r requirements-deploy.txt
python deploy/export.py          # writes models/emotion_cnn.pt, .onnx and models/openvino/
python deploy/benchmark.py       # writes docs/benchmark.md
python main.py --webcam --backend openvino            # FP32
python main.py --webcam --backend openvino --precision bf16
```

### Results (2-vCPU Intel Xeon, CPU only)

| Runtime | Latency per face (p50) | vs Keras | Faces/sec (batch 64) | Max diff vs Keras | Top-1 match |
|---|---:|---:|---:|---:|---:|
| Keras (TensorFlow) | 20.97 ms | 1.0x | 639 | 0 | 100% |
| PyTorch | 1.98 ms | 10.6x | 1,419 | 7e-7 | 100% |
| ONNX Runtime | 1.36 ms | 15.5x | 875 | 8e-7 | 100% |
| OpenVINO FP32 | 0.89 ms | 23.5x | 1,510 | 7e-7 | 100% |
| OpenVINO FP16 weights | 0.93 ms | 22.6x | 1,732 | 3e-4 | 100% |
| OpenVINO BF16 | 0.52 ms | 40.7x | 4,711 | 7e-3 | 99.6% |

- **FP32** is numerically identical to Keras.
- **FP16 weights** halve the model file (2.9 MB) with no change in predictions.
- **BF16** is the fastest. It uses the CPU's bfloat16 units, but its top-1 match on random inputs drops slightly to 99.6%.

Timings come from 1,000 single-face runs after warm-up. Keras is called directly (`model(x)`) rather than through `predict()`, which would add per-call overhead. Numbers vary between runs and machines; `deploy/benchmark.py` reproduces them.

### INT8 quantization

`deploy/quantize_int8.py` quantizes the OpenVINO model to INT8 with NNCF post-training quantization. It calibrates on a few hundred training faces, then compares FP32 and INT8 accuracy on the test set. It needs FER-2013 in `data/` (see below); the tests check that it runs on a small stand-in dataset.

### Training in PyTorch

`src/train_torch.py` trains the network from scratch in PyTorch with the same recipe as the Keras version:

- class-weighted loss;
- flip, shift and rotation augmentation;
- learning-rate halving and early stopping.

It needs FER-2013. The tests run it for two epochs on a small stand-in dataset.

## Tests

```bash
pip install pytest
pytest tests
```

21 tests cover the state rules (drowsy, distressed, focused and more), face cropping, class weights and the trained model's output. They also check that:

- the PyTorch port matches Keras;
- every runtime gives the same answers;
- the exported models accept any batch size;
- PyTorch training and INT8 quantization run end to end.

The deployment tests are skipped unless `requirements-deploy.txt` is installed.

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

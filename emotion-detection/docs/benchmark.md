# Inference benchmark: emotion CNN on CPU

Machine: x86_64, 2 logical CPUs, Linux. Single-face latency over 1000 runs; batch throughput with 64 faces. Keras is called directly (`model(x)`), not through `predict()`, to keep the comparison fair.

| Runtime | Latency p50 (1 face) | p95 | Speed-up vs Keras | Faces/sec (batch 64) | Max prob. diff vs Keras | Top-1 match |
|---|---:|---:|---:|---:|---:|---:|
| Keras (TensorFlow) | 20.966 ms | 27.563 ms | 1.0x | 639 | 0.0e+00 | 100.0% |
| PyTorch | 1.978 ms | 2.494 ms | 10.6x | 1,419 | 6.6e-07 | 100.0% |
| ONNX Runtime | 1.355 ms | 1.923 ms | 15.5x | 875 | 7.5e-07 | 100.0% |
| OpenVINO FP32 | 0.891 ms | 1.191 ms | 23.5x | 1,510 | 7.2e-07 | 100.0% |
| OpenVINO FP16 weights | 0.929 ms | 1.241 ms | 22.6x | 1,732 | 3.1e-04 | 100.0% |
| OpenVINO BF16 | 0.516 ms | 0.756 ms | 40.7x | 4,711 | 7.0e-03 | 99.6% |

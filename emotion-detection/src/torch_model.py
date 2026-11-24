"""PyTorch version of the emotion CNN, with a loader for the trained Keras weights.

The layer stack is the same as src/neural_net.py: three conv blocks (32, 64, 128
filters), each with two conv layers, batch norm and max pooling, then a dense
layer and a 7-way output.

Two details matter when moving weights from Keras to PyTorch:
  - Conv kernels are stored as (H, W, in, out) in Keras and (out, in, H, W) in PyTorch.
  - Keras flattens feature maps in (H, W, C) order and PyTorch in (C, H, W) order,
    so we permute to channels-last before flattening. That keeps the first dense
    layer's weights valid without reshuffling them.
"""
from __future__ import annotations

import numpy as np
import torch
from torch import nn

KERAS_BN_EPS = 1e-3  # Keras BatchNormalization default; PyTorch's default is 1e-5


def conv_block(c_in: int, c_out: int) -> list[nn.Module]:
    return [
        nn.Conv2d(c_in, c_out, 3, padding=1), nn.BatchNorm2d(c_out, eps=KERAS_BN_EPS), nn.ReLU(),
        nn.Conv2d(c_out, c_out, 3, padding=1), nn.BatchNorm2d(c_out, eps=KERAS_BN_EPS), nn.ReLU(),
        nn.MaxPool2d(2), nn.Dropout(0.25),
    ]


class EmotionCNN(nn.Module):
    """Input: (N, 1, 48, 48) grayscale faces scaled to [0, 1]. Output: logits for 7 emotions."""

    def __init__(self, num_classes: int = 7):
        super().__init__()
        self.features = nn.Sequential(*conv_block(1, 32), *conv_block(32, 64), *conv_block(64, 128))
        self.fc = nn.Linear(6 * 6 * 128, 256)
        self.fc_bn = nn.BatchNorm1d(256, eps=KERAS_BN_EPS)
        self.dropout = nn.Dropout(0.5)
        self.out = nn.Linear(256, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = x.permute(0, 2, 3, 1).flatten(1)        # channels-last flatten, same order as Keras
        x = self.dropout(torch.relu(self.fc_bn(self.fc(x))))
        return self.out(x)


class EmotionCNNWithSoftmax(nn.Module):
    """Wraps the network so exported models return probabilities, like the Keras model."""

    def __init__(self, net: EmotionCNN):
        super().__init__()
        self.net = net

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.softmax(self.net(x), dim=1)


def load_keras_weights(net: EmotionCNN, keras_model) -> EmotionCNN:
    """Copy trained weights from the Keras model into the PyTorch network."""
    k_layers = [l for l in keras_model.layers if l.get_weights()]
    t_layers = [m for m in net.modules() if isinstance(m, (nn.Conv2d, nn.BatchNorm2d, nn.BatchNorm1d, nn.Linear))]
    if len(k_layers) != len(t_layers):
        raise ValueError(f"layer count mismatch: Keras {len(k_layers)} vs PyTorch {len(t_layers)}")

    with torch.no_grad():
        for k, t in zip(k_layers, t_layers):
            w = [torch.from_numpy(np.asarray(x, dtype=np.float32)) for x in k.get_weights()]
            if isinstance(t, nn.Conv2d):
                t.weight.copy_(w[0].permute(3, 2, 0, 1))      # HWIO -> OIHW
                t.bias.copy_(w[1])
            elif isinstance(t, nn.Linear):
                t.weight.copy_(w[0].T)                        # (in, out) -> (out, in)
                t.bias.copy_(w[1])
            else:                                             # gamma, beta, moving mean, moving variance
                t.weight.copy_(w[0]); t.bias.copy_(w[1])
                t.running_mean.copy_(w[2]); t.running_var.copy_(w[3])
    return net.eval()


def to_nchw(batch: np.ndarray) -> torch.Tensor:
    """(N, 48, 48, 1) float array, as the Keras pipeline uses, -> (N, 1, 48, 48) tensor."""
    return torch.from_numpy(np.ascontiguousarray(batch.transpose(0, 3, 1, 2), dtype=np.float32))

"""Train the emotion CNN in PyTorch on FER-2013 (same recipe as src/train.py).

  - Class-weighted cross-entropy, because FER-2013 has very few 'disgust' faces.
  - Augmentation: random horizontal flips, small shifts and rotations.
  - Adam, learning rate halved when validation loss stalls, early stopping.
  - Saves the best weights to models/emotion_cnn_torch_trained.pt.

You can also skip training: deploy/export.py loads the trained Keras weights into
the same PyTorch network, and the two give matching outputs.

Usage: python src/train_torch.py --data data [--epochs 50]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset, random_split

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_loader import compute_class_weights, load_fer2013  # noqa: E402
from torch_model import EmotionCNN  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def augment(x: torch.Tensor) -> torch.Tensor:
    """Random flip, shift (up to 4 px) and rotation (up to 10 degrees) on a (N, 1, 48, 48) batch."""
    flip = torch.rand(x.size(0)) < 0.5
    x = torch.where(flip[:, None, None, None], x.flip(-1), x)
    angle = (torch.rand(x.size(0)) - 0.5) * (20 * torch.pi / 180)
    shift = (torch.rand(x.size(0), 2) - 0.5) * (8 / 24)
    cos, sin = angle.cos(), angle.sin()
    theta = torch.stack([torch.stack([cos, -sin, shift[:, 0]], 1),
                         torch.stack([sin, cos, shift[:, 1]], 1)], 1)
    grid = nn.functional.affine_grid(theta, x.shape, align_corners=False)
    return nn.functional.grid_sample(x, grid, padding_mode="border", align_corners=False)


def evaluate(net: nn.Module, loader: DataLoader, loss_fn) -> tuple[float, float]:
    net.eval()
    total, correct, loss = 0, 0, 0.0
    with torch.no_grad():
        for xb, yb in loader:
            out = net(xb)
            loss += loss_fn(out, yb).item() * len(yb)
            correct += (out.argmax(1) == yb).sum().item()
            total += len(yb)
    return loss / total, correct / total


def train(data_dir: Path, epochs: int = 50, batch: int = 64, patience: int = 8,
          max_per_class: int | None = None, out: Path = ROOT / "models" / "emotion_cnn_torch_trained.pt",
          seed: int = 0) -> dict:
    torch.manual_seed(seed)
    x, y = load_fer2013(str(data_dir), "train", max_per_class=max_per_class, verbose=False)
    tx, ty = load_fer2013(str(data_dir), "test", max_per_class=max_per_class, verbose=False)
    to_t = lambda a: torch.from_numpy(np.ascontiguousarray(a.transpose(0, 3, 1, 2)))  # noqa: E731
    full = TensorDataset(to_t(x), torch.from_numpy(y).long())
    n_val = max(1, len(full) // 10)
    tr, va = random_split(full, [len(full) - n_val, n_val], generator=torch.Generator().manual_seed(seed))
    train_dl = DataLoader(tr, batch_size=batch, shuffle=True)
    val_dl = DataLoader(va, batch_size=256)
    test_dl = DataLoader(TensorDataset(to_t(tx), torch.from_numpy(ty).long()), batch_size=256)

    weights = compute_class_weights(y, 7)
    w = torch.tensor([weights[i] for i in range(7)], dtype=torch.float32)
    loss_fn = nn.CrossEntropyLoss(weight=w)
    eval_loss = nn.CrossEntropyLoss()
    net = EmotionCNN()
    opt = torch.optim.Adam(net.parameters(), lr=1e-3, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, factor=0.5, patience=3)

    best, bad, history = float("inf"), 0, []
    for epoch in range(1, epochs + 1):
        net.train()
        for xb, yb in train_dl:
            opt.zero_grad()
            loss_fn(net(augment(xb)), yb).backward()
            opt.step()
        val_loss, val_acc = evaluate(net, val_dl, eval_loss)
        sched.step(val_loss)
        history.append({"epoch": epoch, "val_loss": val_loss, "val_acc": val_acc})
        print(f"epoch {epoch:3d}  val_loss {val_loss:.4f}  val_acc {val_acc:.2%}")
        if val_loss < best:
            best, bad = val_loss, 0
            out.parent.mkdir(parents=True, exist_ok=True)
            torch.save(net.state_dict(), out)
        else:
            bad += 1
            if bad >= patience:
                break

    net.load_state_dict(torch.load(out))
    _, test_acc = evaluate(net, test_dl, eval_loss)
    print(f"test accuracy: {test_acc:.2%}")
    return {"epochs_run": len(history), "test_accuracy": test_acc, "history": history}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Train the emotion CNN in PyTorch on FER-2013.")
    ap.add_argument("--data", type=Path, default=ROOT / "data")
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--batch", type=int, default=64)
    a = ap.parse_args()
    train(a.data, a.epochs, a.batch)

"""Loads FER-2013 images into numpy arrays.

Expects data/train/<emotion>/*.jpg and data/test/<emotion>/*.jpg
for the 7 emotions: angry, disgust, fear, happy, neutral, sad, surprise.
"""

import os
import numpy as np
import cv2

EMOTION_CLASSES = ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise']


def load_fer2013(data_dir, subset='train', max_per_class=None, verbose=True):
    """
    Load FER-2013 images from folder structure.

    data_dir       : root path containing train/ and test/
    subset         : 'train' or 'test'
    max_per_class  : cap images per class (None = use all)

    Returns: (images, labels)
      images: (N, 48, 48, 1) float32 in [0, 1]   (channels last)
      labels: (N,) int32
    """
    subset_dir = os.path.join(data_dir, subset)
    if not os.path.isdir(subset_dir):
        raise FileNotFoundError(
            f"Dataset folder not found: {subset_dir}\n"
            f"Download FER-2013 from Kaggle and extract into 'data/' folder."
        )

    images_list = []
    labels_list = []

    for class_idx, class_name in enumerate(EMOTION_CLASSES):
        class_folder = os.path.join(subset_dir, class_name)
        if not os.path.isdir(class_folder):
            if verbose:
                print(f"  [warn] folder missing: {class_folder}")
            continue

        files = sorted(os.listdir(class_folder))
        if max_per_class is not None:
            files = files[:max_per_class]

        if verbose:
            print(f"  loading {class_name:10s} ({len(files)} images)...")

        for fname in files:
            fpath = os.path.join(class_folder, fname)
            img = cv2.imread(fpath, cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            if img.shape != (48, 48):
                img = cv2.resize(img, (48, 48))
            images_list.append(img)
            labels_list.append(class_idx)

    if not images_list:
        raise RuntimeError("No images loaded. Check your dataset folder.")


    images = np.array(images_list, dtype=np.float32) / 255.0
    images = images[..., np.newaxis]  
    labels = np.array(labels_list, dtype=np.int32)

    if verbose:
        print(f"  Total: {len(labels)} images, shape={images.shape}")
    return images, labels


def compute_class_weights(labels, num_classes):
    """
    Compute balanced class weights to handle imbalanced classes.
    Higher weight = class is rarer, gets more training attention.
    Returns dict suitable for Keras's class_weight argument.
    """
    counts = np.array([np.sum(labels == c) for c in range(num_classes)])
    counts = np.maximum(counts, 1)
    total = len(labels)
    weights = total / (num_classes * counts)
    return {c: float(weights[c]) for c in range(num_classes)}

"""Train the emotion CNN on FER-2013.

    python src/train.py

Uses data augmentation, class weights for rare emotions, early stopping
and learning rate reduction. Saves the best model to models/emotion_cnn.keras.
"""

import os
import sys
import numpy as np
import tensorflow as tf
from tensorflow.keras import callbacks, optimizers
from tensorflow.keras.preprocessing.image import ImageDataGenerator

sys.path.insert(0, os.path.dirname(__file__))

from neural_net import build_emotion_cnn
from data_loader import load_fer2013, compute_class_weights, EMOTION_CLASSES



DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'models', 'emotion_cnn.keras')

EPOCHS = 50                 
BATCH_SIZE = 128
LEARNING_RATE = 0.001
MAX_PER_CLASS = None        
SEED = 42


def main():
    np.random.seed(SEED)
    tf.random.set_seed(SEED)


    print("=" * 60)
    print("Loading training data...")
    X_train, y_train = load_fer2013(DATA_DIR, subset='train', max_per_class=MAX_PER_CLASS)

    print("\nLoading test data...")
    X_test, y_test = load_fer2013(DATA_DIR, subset='test', max_per_class=MAX_PER_CLASS)

    class_weights = compute_class_weights(y_train, len(EMOTION_CLASSES))
    print("\nClass weights (higher = class is underrepresented):")
    for i, name in enumerate(EMOTION_CLASSES):
        count = int(np.sum(y_train == i))
        print(f"  {name:10s} count={count:5d}  weight={class_weights[i]:.3f}")

    # Augment training images only. brightness_range is left out because it
    # doesn't play well with images already scaled to [0, 1].
    train_datagen = ImageDataGenerator(
        rotation_range=10,           # +/- 10 degrees
        width_shift_range=0.1,       # up to 10% horizontal shift
        height_shift_range=0.1,      # up to 10% vertical shift
        zoom_range=0.1,              # up to 10% zoom in/out
        horizontal_flip=True,        # random left-right flip
        fill_mode='nearest'
    )

    print("\n" + "=" * 60)
    print("Building model...")
    model = build_emotion_cnn(num_classes=len(EMOTION_CLASSES))
    model.summary()

    model.compile(
        optimizer=optimizers.Adam(learning_rate=LEARNING_RATE),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )

    cbs = [
        # Save the best model to disk (judged by test accuracy)
        callbacks.ModelCheckpoint(
            MODEL_PATH,
            monitor='val_accuracy',
            save_best_only=True,
            verbose=1
        ),
        # Stop training if test accuracy hasn't improved in 10 epochs
        callbacks.EarlyStopping(
            monitor='val_accuracy',
            patience=10,
            restore_best_weights=True,
            verbose=1
        ),
        # Reduce learning rate when accuracy plateaus
        callbacks.ReduceLROnPlateau(
            monitor='val_accuracy',
            factor=0.5,
            patience=5,
            min_lr=1e-6,
            verbose=1
        ),
        # Save training history as CSV for later plotting
        callbacks.CSVLogger(
            os.path.join(os.path.dirname(MODEL_PATH), 'training_history.csv')
        ),
    ]


    print("\n" + "=" * 60)
    print(f"Training for up to {EPOCHS} epochs (early stopping enabled)")
    print(f"Batch size: {BATCH_SIZE}, Learning rate: {LEARNING_RATE}")
    print("=" * 60)

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)

    history = model.fit(
        train_datagen.flow(X_train, y_train, batch_size=BATCH_SIZE, seed=SEED),
        validation_data=(X_test, y_test),
        epochs=EPOCHS,
        class_weight=class_weights,
        callbacks=cbs,
        verbose=1
    )

    print("\n" + "=" * 60)
    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"Final test accuracy: {test_acc:.4f}")
    print(f"Best model saved to: {MODEL_PATH}")
    print("=" * 60)


if __name__ == '__main__':
    main()

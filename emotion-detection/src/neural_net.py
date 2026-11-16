"""CNN for 7-class emotion recognition on 48x48 grayscale faces.

Three conv blocks (32, 64, 128 filters), each with two conv layers,
batch norm, max pooling and dropout, then a dense layer and softmax.
Weights start random and are learned only from FER-2013.
"""

import tensorflow as tf
from tensorflow.keras import layers, models, regularizers


def build_emotion_cnn(num_classes=7, input_shape=(48, 48, 1)):
    """
    Build the emotion CNN with random starting weights.
    """
    model = models.Sequential(name='EmotionCNN')

    model.add(layers.Input(shape=input_shape))
    model.add(layers.Conv2D(32, (3, 3), padding='same',
                             kernel_regularizer=regularizers.l2(1e-5)))
    model.add(layers.BatchNormalization())
    model.add(layers.Activation('relu'))

    model.add(layers.Conv2D(32, (3, 3), padding='same',
                             kernel_regularizer=regularizers.l2(1e-5)))
    model.add(layers.BatchNormalization())
    model.add(layers.Activation('relu'))

    model.add(layers.MaxPooling2D(pool_size=(2, 2)))
    model.add(layers.Dropout(0.25))

 
    model.add(layers.Conv2D(64, (3, 3), padding='same',
                             kernel_regularizer=regularizers.l2(1e-5)))
    model.add(layers.BatchNormalization())
    model.add(layers.Activation('relu'))

    model.add(layers.Conv2D(64, (3, 3), padding='same',
                             kernel_regularizer=regularizers.l2(1e-5)))
    model.add(layers.BatchNormalization())
    model.add(layers.Activation('relu'))

    model.add(layers.MaxPooling2D(pool_size=(2, 2)))
    model.add(layers.Dropout(0.25))

 
    model.add(layers.Conv2D(128, (3, 3), padding='same',
                             kernel_regularizer=regularizers.l2(1e-5)))
    model.add(layers.BatchNormalization())
    model.add(layers.Activation('relu'))

    model.add(layers.Conv2D(128, (3, 3), padding='same',
                             kernel_regularizer=regularizers.l2(1e-5)))
    model.add(layers.BatchNormalization())
    model.add(layers.Activation('relu'))

    model.add(layers.MaxPooling2D(pool_size=(2, 2)))
    model.add(layers.Dropout(0.25))

    model.add(layers.Flatten())
    model.add(layers.Dense(256, kernel_regularizer=regularizers.l2(1e-5)))
    model.add(layers.BatchNormalization())
    model.add(layers.Activation('relu'))
    model.add(layers.Dropout(0.5))

    model.add(layers.Dense(num_classes, activation='softmax'))

    return model


if __name__ == '__main__':
   
    model = build_emotion_cnn()
    model.summary()

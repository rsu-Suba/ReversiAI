import tensorflow as tf
import os

model_path = './Database/models/2G_6-28-25.keras'

print(f"Attempting to load model from: {model_path}")

if not os.path.exists(model_path):
    print(f"Error: Model file does not exist at {model_path}")
else:
    try:
        model = tf.keras.models.load_model(model_path)
        print('Model loaded successfully in test script.')
    except Exception as e:
        print(f'Error loading model in test script: {e}')

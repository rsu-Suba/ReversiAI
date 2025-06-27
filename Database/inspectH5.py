import tensorflow as tf
import numpy as np
import os

MODEL_PATH = './Database/model_6-24-25.h5'

def inspect_model(model_path):
    print(f"--- Inspecting Model: {model_path} ---")
    if not os.path.exists(model_path):
        print(f"Error: Model file not found at '{model_path}'")
        return
    try:
        model = tf.keras.models.load_model(model_path)
        print("Model loaded successfully. File is not corrupted.")
        print("\n--- Model Summary ---")
        model.summary()

        print("\n--- Inspecting Weights of a Sample Layer ---")
        try:
            target_layer_name = 'value_output'
            target_layer = model.get_layer(name=target_layer_name)
            weights = target_layer.get_weights()
            
            if weights:
                print(f"Layer '{target_layer_name}' has {len(weights)} weight array(s).")
                print(f"  - Weights matrix shape: {weights[0].shape}")
                print(f"  - Sample weights: {weights[0].flatten()[:5]}")
                print(f"  - Bias vector shape: {weights[1].shape}")
                print(f"  - Sample bias: {weights[1].flatten()[:5]}")
                print("\n===> Weights have been loaded successfully.")
            else:
                print(f"Layer '{target_layer_name}' has no weights.")

        except ValueError:
            print(f"Error: Layer with name '{target_layer_name}' not found in the model.")


    except Exception as e:
        print(f"\n--- An error occurred while loading the model ---")
        print(f"The file '{model_path}' might be corrupted or incompatible.")
        print(f"Error details: {e}")

if __name__ == '__main__':
    inspect_model(MODEL_PATH)
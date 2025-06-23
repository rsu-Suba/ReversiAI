# inspect_model.py
import tensorflow as tf
import numpy as np
import os

# --- 設定 ---
MODEL_PATH = './Database/model_6-24-25.h5' # 確認したい.h5ファイルへのパス

def inspect_model(model_path):
    print(f"--- Inspecting Model: {model_path} ---")

    # 1. ファイルが存在するか確認
    if not os.path.exists(model_path):
        print(f"Error: Model file not found at '{model_path}'")
        return

    try:
        # 2. モデルを読み込む (この時点でファイルが破損していればエラーが出る)
        model = tf.keras.models.load_model(model_path)
        print("Model loaded successfully. File is not corrupted.")

        # 3. モデルの全体構造を表示
        print("\n--- Model Summary ---")
        model.summary()

        # 4. 特定の層の重み（学習結果）を覗き見る
        print("\n--- Inspecting Weights of a Sample Layer ---")
        # 例として、最後の出力層(value_output)の重みを確認
        try:
            target_layer_name = 'value_output' # model.summary()で確認できる層の名前
            target_layer = model.get_layer(name=target_layer_name)
            weights = target_layer.get_weights()
            
            if weights:
                # 重みは[重み行列, バイアス]のリストになっている
                print(f"Layer '{target_layer_name}' has {len(weights)} weight array(s).")
                # 最初の重み行列の形状と、最初の5つの値を表示
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
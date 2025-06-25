# api_server.py (メモリ効率最適化・最終完成版)
import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify
import os

# TensorFlowからの情報ログを抑制
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2' 

# --- 設定 ---
MODEL_PATH = './Database/models/model_6-24-25_G1.h5'

# --- Flaskアプリケーションの準備 ---
app = Flask(__name__)

# --- 学習済みモデルのロード ---
print(f"Loading trained model from {MODEL_PATH}...")
model = tf.keras.models.load_model(MODEL_PATH)
print("Model loaded successfully.")

# ▼▼▼【ここからが新しい部分】▼▼▼

# 予測を行うコアな関数を、@tf.functionでコンパイルする
# これにより、実行が高速化され、メモリリークが防止される
@tf.function
def serve_prediction(input_tensor):
    return model(input_tensor, training=False)

def board_to_input_planes(board_data):
    """ JavaScriptから受け取った盤面データを、モデルの入力形式に変換する """
    black_board = int(board_data['blackBoard'], 16)
    white_board = int(board_data['whiteBoard'], 16)
    player = board_data['currentPlayer']

    if player == 1:
        player_plane = np.array(list(f'{black_board:064b}')).astype(np.float32).reshape(8, 8)
        opponent_plane = np.array(list(f'{white_board:064b}')).astype(np.float32).reshape(8, 8)
    else:
        player_plane = np.array(list(f'{white_board:064b}')).astype(np.float32).reshape(8, 8)
        opponent_plane = np.array(list(f'{black_board:064b}')).astype(np.float32).reshape(8, 8)
        
    input_array = np.stack([player_plane, opponent_plane], axis=-1)
    # TensorFlowが期待する形式 (バッチサイズ, 高さ, 幅, チャンネル数) に変換
    return tf.convert_to_tensor(np.expand_dims(input_array, axis=0), dtype=tf.float32)

# ▲▲▲


# --- APIのエンドポイント定義 ---
@app.route('/predict', methods=['POST'])
def predict():
    try:
        board_data = request.json
        if not board_data:
            return jsonify({'error': 'Invalid input'}), 400

        # 1. データをTensorFlowのテンソル形式に変換
        input_tensor = board_to_input_planes(board_data)
        
        # 2. コンパイル済みの関数で、高速に予測を実行
        policy_output, value_output = serve_prediction(input_tensor)

        # 3. 結果をPythonの標準的なデータ型に変換して返す
        policy = policy_output[0].numpy().tolist()
        value = float(value_output[0][0].numpy())

        return jsonify({'policy': policy, 'value': value})

    except Exception as e:
        print(f"Error during prediction: {e}")
        return jsonify({'error': 'An error occurred on the server'}), 500

# --- サーバーの実行 ---
if __name__ == '__main__':
    print("Server is ready and listening on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000)
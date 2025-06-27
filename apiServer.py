import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify
import os

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2' 
MODEL_PATH = './Database/models/1G_6-24-25.h5'

app = Flask(__name__)

print(f"Loading trained model from {MODEL_PATH}...")
model = tf.keras.models.load_model(MODEL_PATH)
print("Model loaded successfully.")

@tf.function
def serve_prediction(input_tensor):
    return model(input_tensor, training=False)

def board_to_input_planes(board_data):
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
    return tf.convert_to_tensor(np.expand_dims(input_array, axis=0), dtype=tf.float32)

@app.route('/predict', methods=['POST'])
def predict():
    try:
        board_data = request.json
        if not board_data:
            return jsonify({'error': 'Invalid input'}), 400

        input_tensor = board_to_input_planes(board_data)
        policy_output, value_output = serve_prediction(input_tensor)
        policy = policy_output[0].numpy().tolist()
        value = float(value_output[0][0].numpy())

        return jsonify({'policy': policy, 'value': value})

    except Exception as e:
        print(f"Error during prediction: {e}")
        return jsonify({'error': 'An error occurred on the server'}), 500

if __name__ == '__main__':
    print("Server is ready and listening on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000)
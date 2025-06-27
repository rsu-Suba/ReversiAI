import numpy as np
import msgpack
import tensorflow as tf

from createModel import create_dual_resnet_model

MSGPACK_FILE_PATH = './Database/mcts_2-5M.msgpack'
MODEL_SAVE_PATH = 'model.h5'
EPOCHS = 10
BATCH_SIZE = 32

def board_to_input_planes(node_data):
    black_board = int(node_data['b'], 16)
    white_board = int(node_data['w'], 16)
    player = node_data['c']

    if player == 1:
        player_plane = np.array(list(f'{black_board:064b}')).astype(np.float32).reshape(8, 8)
        opponent_plane = np.array(list(f'{white_board:064b}')).astype(np.float32).reshape(8, 8)
    else:
        player_plane = np.array(list(f'{white_board:064b}')).astype(np.float32).reshape(8, 8)
        opponent_plane = np.array(list(f'{black_board:064b}')).astype(np.float32).reshape(8, 8)
    return np.stack([player_plane, opponent_plane], axis=-1)

def get_targets(node_data):
    value_target = node_data['wi'] / node_data['v'] if node_data['v'] > 0 else 0.0

    policy_target = np.zeros(64, dtype=np.float32)
    if node_data['v'] > 0 and node_data['ch']:
        for move_str, child_data in node_data['ch'].items():
            move_index = int(move_str)
            policy_target[move_index] = child_data['v'] / node_data['v']
    if np.sum(policy_target) > 0:
        policy_target /= np.sum(policy_target)

    return policy_target, value_target

with open(MSGPACK_FILE_PATH, 'rb') as f:
    packed_data = f.read()
root_node_data = msgpack.unpackb(packed_data)

X_train, Y_policy, Y_value = [], [], []
queue = [root_node_data]
visited_keys = set()

print("Extracting training data from msgpack file...")
while queue:
    node = queue.pop(0)
    if node['v'] < 10: 
        continue
        
    key = f"{node['b']}_{node['w']}_{node['c']}"
    if key in visited_keys:
        continue
    visited_keys.add(key)
    input_plane = board_to_input_planes(node)
    policy, value = get_targets(node)

    X_train.append(input_plane)
    Y_policy.append(policy)
    Y_value.append(value)
    
    for child in node['ch'].values():
        queue.append(child)

print(f"Data extraction complete. Found {len(X_train)} training samples.")

X_train = np.array(X_train)
Y_policy = np.array(Y_policy)
Y_value = np.array(Y_value)

model = create_dual_resnet_model()
model.compile(
    optimizer=tf.keras.optimizers.Adam(),
    loss={
        'policy_output': 'categorical_crossentropy',
        'value_output': 'mean_squared_error'
    },
    metrics={
        'policy_output': 'accuracy',
        'value_output': 'mean_absolute_error'
    }
)

print("\n--- Starting Model Training ---")
model.fit(
    X_train, 
    {'policy_output': Y_policy, 'value_output': Y_value},
    epochs=EPOCHS,
    batch_size=BATCH_SIZE,
    validation_split=0.1
)

print("\n--- Training Finished. Saving model... ---")
model.save(MODEL_SAVE_PATH)
print(f"Model saved successfully to {MODEL_SAVE_PATH}")
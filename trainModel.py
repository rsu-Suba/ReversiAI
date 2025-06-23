# train_model.py
import numpy as np
import msgpack
import tensorflow as tf

# 以前作成した、モデルの設計図をインポート
from createModel import create_dual_resnet_model

# --- 設定 ---
MSGPACK_FILE_PATH = './Database/mcts_2-5M.msgpack' # 入力となる学習データ
MODEL_SAVE_PATH = 'model.h5'    # 出力される学習済みモデル
EPOCHS = 10                             # 学習を繰り返す回数
BATCH_SIZE = 32                         # 一度に学習するデータ量

# --- データ変換関数 ---

def board_to_input_planes(node_data):
    """ MCTSノードの盤面データを、ニューラルネットワークの入力形式(8, 8, 2)に変換する """
    # 盤面データをBigIntとして正しく解釈
    black_board = int(node_data['b'], 16)
    white_board = int(node_data['w'], 16)
    player = node_data['c']

    # 自分の石の平面と、相手の石の平面を作成
    if player == 1: # 現在のプレイヤーが黒の場合
        player_plane = np.array(list(f'{black_board:064b}')).astype(np.float32).reshape(8, 8)
        opponent_plane = np.array(list(f'{white_board:064b}')).astype(np.float32).reshape(8, 8)
    else: # 現在のプレイヤーが白の場合
        player_plane = np.array(list(f'{white_board:064b}')).astype(np.float32).reshape(8, 8)
        opponent_plane = np.array(list(f'{black_board:064b}')).astype(np.float32).reshape(8, 8)
        
    # (8, 8, 2) の形式にスタックして返す
    return np.stack([player_plane, opponent_plane], axis=-1)

def get_targets(node_data):
    """ MCTSノードから、ポリシーとバリューの「正解データ」を抽出する """
    # 1. バリューターゲット (この局面の勝率)
    value_target = node_data['wi'] / node_data['v'] if node_data['v'] > 0 else 0.0

    # 2. ポリシータルゲット (各手の有望度)
    policy_target = np.zeros(64, dtype=np.float32)
    if node_data['v'] > 0 and node_data['ch']:
        for move_str, child_data in node_data['ch'].items():
            move_index = int(move_str)
            # 訪問回数が多い手ほど、有望な手とする
            policy_target[move_index] = child_data['v'] / node_data['v']
    
    # 確率分布にするために正規化
    if np.sum(policy_target) > 0:
        policy_target /= np.sum(policy_target)

    return policy_target, value_target


# --- メインの実行部分 ---

# 1. msgpackファイルを読み込み、デコードする
with open(MSGPACK_FILE_PATH, 'rb') as f:
    packed_data = f.read()
root_node_data = msgpack.unpackb(packed_data)

# 2. ツリーを走査して、学習データセットを作成する
X_train, Y_policy, Y_value = [], [], []
queue = [root_node_data]
visited_keys = set()

print("Extracting training data from msgpack file...")
while queue:
    node = queue.pop(0)
    
    # あまりに訪問回数が少ないノードは、ノイズになる可能性があるので除外
    if node['v'] < 10: 
        continue
        
    key = f"{node['b']}_{node['w']}_{node['c']}"
    if key in visited_keys:
        continue
    visited_keys.add(key)

    # 入力データと正解データを抽出
    input_plane = board_to_input_planes(node)
    policy, value = get_targets(node)

    X_train.append(input_plane)
    Y_policy.append(policy)
    Y_value.append(value)
    
    for child in node['ch'].values():
        queue.append(child)

print(f"Data extraction complete. Found {len(X_train)} training samples.")

# Numpy配列に変換
X_train = np.array(X_train)
Y_policy = np.array(Y_policy)
Y_value = np.array(Y_value)


# 3. モデルを作成し、コンパイルする
model = create_dual_resnet_model()
model.compile(
    optimizer=tf.keras.optimizers.Adam(),
    loss={
        'policy_output': 'categorical_crossentropy', # ポリシーの損失関数
        'value_output': 'mean_squared_error'       # バリューの損失関数
    },
    metrics={
        'policy_output': 'accuracy',         # ポリシーヘッドの性能は「正解率」で評価
        'value_output': 'mean_absolute_error' # バリューヘッドの性能は「平均絶対誤差」で評価
    }
)

# 4. モデルの学習を実行
print("\n--- Starting Model Training ---")
model.fit(
    X_train, 
    {'policy_output': Y_policy, 'value_output': Y_value},
    epochs=EPOCHS,
    batch_size=BATCH_SIZE,
    validation_split=0.1 # 10%のデータを検証用に使う
)

# 5. 学習済みのモデルを保存
print("\n--- Training Finished. Saving model... ---")
model.save(MODEL_SAVE_PATH)
print(f"Model saved successfully to {MODEL_SAVE_PATH}")
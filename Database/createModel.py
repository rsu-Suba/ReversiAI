import tensorflow as tf
from tensorflow.keras import layers, models

# --- モデルの設計図 ---
def create_dual_resnet_model(input_shape=(8, 8, 2), num_residual_blocks=5):
    inputs = layers.Input(shape=input_shape)

    # --- 共通ボディ部分 (盤面の特徴を抽出) ---
    # 最初の畳み込み層
    x = layers.Conv2D(64, (3, 3), padding='same')(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.ReLU()(x)

    # 残差ブロック (Residual Blocks) を重ねる
    # これがネットワークの「深さ」と「賢さ」の源泉
    for _ in range(num_residual_blocks):
        residual = x
        x = layers.Conv2D(64, (3, 3), padding='same')(x)
        x = layers.BatchNormalization()(x)
        x = layers.ReLU()(x)
        x = layers.Conv2D(64, (3, 3), padding='same')(x)
        x = layers.BatchNormalization()(x)
        x = layers.add([x, residual]) # スキップ接続
        x = layers.ReLU()(x)

    # --- 2つの頭脳（ヘッド）に分岐 ---

    # 1. ポリシーヘッド (「直感」を出力)
    policy_head = layers.Conv2D(2, (1, 1), padding='same')(x)
    policy_head = layers.BatchNormalization()(policy_head)
    policy_head = layers.ReLU()(policy_head)
    policy_head = layers.Flatten()(policy_head)
    # 最終的に、64マスそれぞれの「有望度」を確率として出力
    policy_head = layers.Dense(64, activation='softmax', name='policy_output')(policy_head)

    # 2. バリューヘッド (「大局観」を出力)
    value_head = layers.Conv2D(1, (1, 1), padding='same')(x)
    value_head = layers.BatchNormalization()(value_head)
    value_head = layers.ReLU()(value_head)
    value_head = layers.Flatten()(value_head)
    value_head = layers.Dense(64, activation='relu')(value_head)
    # 最終的に、「勝利の確率 (-1:負け 〜 +1:勝ち)」を一つの数値として出力
    value_head = layers.Dense(1, activation='tanh', name='value_output')(value_head)
    
    # モデル全体を定義
    model = models.Model(inputs=inputs, outputs=[policy_head, value_head])
    
    return model

# --- 実行部分 ---
if __name__ == '__main__':
    # モデルを作成
    othello_ai_model = create_dual_resnet_model()

    # モデルの構造をコンソールに表示して確認
    print("--- AI Model Architecture ---")
    othello_ai_model.summary()
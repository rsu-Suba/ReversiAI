import numpy as np
import tensorflow as tf
import math
import random
import time
import os
import msgpack
import multiprocessing
import json

from reversi_bitboard_cpp import ReversiBitboard
from reversi_mcts_cpp import MCTS as MCTS_CPP

def _print_numpy_board(board_1d):
    print("  0 1 2 3 4 5 6 7")
    print("-----------------")
    for r in range(8):
        row_str = f"{r}|"
        for c in range(8):
            piece = board_1d[r * 8 + c]
            if piece == 1: row_str += "🔴"
            elif piece == 2: row_str += "⚪️"
            else: row_str += "🟩"
        print(row_str)
    print("-----------------")

gpus = tf.config.experimental.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
        logical_gpus = tf.config.experimental.list_logical_devices('GPU')
        print(len(gpus), "Physical GPUs,", len(logical_gpus), "Logical GPUs")
    except RuntimeError as e:
        print(e)

from config import (
    NUM_PARALLEL_GAMES,
    SIMS_N,
    C_PUCT,
    TOTAL_GAMES,
    TRAINING_HOURS,
    TRAINING_DATA_DIR,
    CURRENT_GENERATION_DATA_SUBDIR,
    SAVE_DATA_EVERY_N_GAMES,
    SELF_PLAY_MODEL_PATH,
    MCTS_PREDICT_BATCH_SIZE
)

def board_to_input_planes_tf(board_1d_batch_tf, current_player_batch_tf):
    batch_size = tf.shape(board_1d_batch_tf)[0]
    player_plane = tf.zeros((batch_size, 8, 8), dtype=tf.float32)
    opponent_plane = tf.zeros((batch_size, 8, 8), dtype=tf.float32)
    board_2d_batch_tf = tf.reshape(board_1d_batch_tf, (batch_size, 8, 8))
    current_player_batch_expanded = tf.expand_dims(tf.expand_dims(current_player_batch_tf, -1), -1)
    current_player_mask = tf.cast(tf.equal(board_2d_batch_tf, current_player_batch_expanded), tf.float32)
    opponent_player_mask = tf.cast(tf.equal(board_2d_batch_tf, 3 - current_player_batch_expanded), tf.float32)

    player_plane += current_player_mask
    opponent_plane += opponent_player_mask

    return tf.stack([player_plane, opponent_plane], axis=-1)

class ModelWrapper:
    def __init__(self, model_path):
        self.model = tf.keras.models.load_model(model_path, compile=False)
        self._predict_internal_cpp = tf.function(
            self._predict_for_cpp,
            input_signature=[
                tf.TensorSpec(shape=[None, 64], dtype=tf.int8),
                tf.TensorSpec(shape=[None], dtype=tf.int32)
            ]
        )

    def _predict_for_cpp(self, board_batch_tensor, player_batch_tensor):
        input_planes_batch = board_to_input_planes_tf(tf.cast(board_batch_tensor, tf.int32), tf.cast(player_batch_tensor, tf.int32))
        
        policy, value = self.model(input_planes_batch, training=False)
        return policy, tf.squeeze(value, axis=-1)

def run_self_play_game_worker(game_id, model_path, sims_n, c_puct):
    print(f"G{game_id}: Game start")
    seed = (os.getpid() + int(time.time() * 1000) + game_id) % (2**32)
    random.seed(seed)
    np.random.seed(seed)
    
    try:
        model_wrapper = ModelWrapper(model_path)
    except Exception as e:
        print(f"G{game_id}: Model load error: {e}")
        return None

    game_board = ReversiBitboard()
    game_board.history = []
    current_player = 1
    game_board.current_player = current_player

    mcts_ai = MCTS_CPP(model_wrapper, c_puct=c_puct, batch_size=MCTS_PREDICT_BATCH_SIZE)

    game_history = []

    while not game_board.is_game_over():
        legal_moves = game_board.get_legal_moves()
        if not legal_moves:
            game_board.apply_move(-1)
            current_player = game_board.current_player
            continue

        add_noise = len(game_board.history) < 30
        root_node = mcts_ai.search(game_board, current_player, sims_n, add_noise)

        policy_target = np.zeros(64, dtype=np.float32)
        if root_node.children:
            total_visits = 0
            for move, child in root_node.children.items():
                total_visits += child.n_visits
            if total_visits > 0:
                for move, child in root_node.children.items():
                    policy_target[move] = child.n_visits / total_visits

        game_history.append({
            'board': game_board.board_to_numpy().tolist(),
            'player': current_player,
            'policy': policy_target.tolist()
        })

        if len(game_board.history) < 30:
            moves = list(root_node.children.keys())
            visits = [child.n_visits for child in root_node.children.values()]
            if sum(visits) == 0:
                best_move = random.choice(legal_moves)
            else:
                probabilities = np.array(visits, dtype=np.float32) / sum(visits)
                best_move = np.random.choice(moves, p=probabilities)
        else:
            best_move = max(root_node.children.items(), key=lambda item: item[1].n_visits)[0]

        game_board.apply_move(best_move)
        current_player = game_board.current_player

    winner = game_board.get_winner()
    print(f"G{game_id}: Game finish, winner: {winner}")
    for record in game_history:
        if winner == 0:
            record['value'] = 0.0
        elif record['player'] == winner:
            record['value'] = 1.0
        else:
            record['value'] = -1.0
            
    return game_history

def _worker_wrapper(args):
    return run_self_play_game_worker(*args)

def train_model_main():
    game_results_buffer = []
    training_start_time = time.time()
    games_played = 0

    generation_data_path = os.path.join(TRAINING_DATA_DIR, CURRENT_GENERATION_DATA_SUBDIR)
    os.makedirs(generation_data_path, exist_ok=True)

    ctx = multiprocessing.get_context("spawn")
    with ctx.Pool(NUM_PARALLEL_GAMES) as pool:
        game_args = [(i + 1, SELF_PLAY_MODEL_PATH, SIMS_N, C_PUCT) for i in range(TOTAL_GAMES)]

        for game_history_result in pool.imap_unordered(_worker_wrapper, game_args):
            if game_history_result is None:
                print(f"Main process: Skiped game due to worker error.")
                continue

            game_results_buffer.extend(game_history_result)
            games_played += 1

            if games_played > 0 and games_played % SAVE_DATA_EVERY_N_GAMES == 0:
                data_filename = f"mcts_tree_{games_played}.msgpack"
                data_filepath = os.path.join(generation_data_path, data_filename)
                with open(data_filepath, "wb") as f:
                    msgpack.pack(game_results_buffer, f)
                print(f"{len(game_results_buffer)} states from {games_played} games saved -> {data_filepath}")
                game_results_buffer.clear()

            if TRAINING_HOURS > 0 and (time.time() - training_start_time) / 3600 >= TRAINING_HOURS:
                print("Reaching finish time")
                break
            if TOTAL_GAMES > 0 and games_played >= TOTAL_GAMES:
                print("Reaching finish games")
                break

    print(f"Train finish, Games: {games_played}")

    if game_results_buffer:
        final_data_filename = f"mcts_tree_{games_played}.msgpack"
        final_data_filepath = os.path.join(generation_data_path, final_data_filename)
        with open(final_data_filepath, "wb") as f:
            msgpack.pack(game_results_buffer, f)
        print(f"Final save: {len(game_results_buffer)} states saved -> {final_data_filepath}")
    else:
        print("No final data to save")

    print("Self-play data created")

if __name__ == "__main__":
    train_model_main()
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
    VS_RANDOM,
    TRAINING_DATA_DIR,
    CURRENT_GENERATION_DATA_SUBDIR,
    SAVE_DATA_EVERY_N_GAMES,
    SELF_PLAY_MODEL_PATH,
    EPOCHS,
    BATCH_SIZE
)

def board_to_input_planes_tf(board_1d_tf, current_player_tf):
    player_plane = tf.zeros((8, 8), dtype=tf.float32)
    opponent_plane = tf.zeros((8, 8), dtype=tf.float32)
    board_2d_tf = tf.reshape(board_1d_tf, (8, 8))
    current_player_mask = tf.cast(tf.equal(board_2d_tf, current_player_tf), tf.float32)
    opponent_player_mask = tf.cast(tf.equal(board_2d_tf, 3 - current_player_tf), tf.float32)
    player_plane += current_player_mask
    opponent_plane += opponent_player_mask
    return tf.stack([player_plane, opponent_plane], axis=-1)

class MCTSNode:
    def __init__(self, game_board: ReversiBitboard, player, parent=None, move=None, prior_p=0.0):
        self.game_board = game_board
        self.player = player
        self.parent = parent
        self.move = move
        self.prior_p = prior_p
        self.children = {}
        self.n_visits = 0
        self.q_value = 0.0
        self.sum_value = 0.0
        self._legal_moves = None

    def _get_legal_moves(self):
        if self._legal_moves is None:
            self._legal_moves = self.game_board.get_legal_moves()
        return self._legal_moves

    def ucb_score(self, c_puct):
        if self.n_visits == 0: return float('inf')
        return -self.q_value + c_puct * self.prior_p * math.sqrt(self.parent.n_visits) / (1 + self.n_visits)

    def select_child(self, c_puct):
        return max(self.children.values(), key=lambda child: child.ucb_score(c_puct))

    def is_fully_expanded(self):
        return len(self.children) == len(self._get_legal_moves())

    def update(self, value):
        self.n_visits += 1
        self.sum_value += value
        self.q_value = self.sum_value / self.n_visits

    def get_policy_distribution(self, temperature=2.0):
        if not self.children: return np.zeros(64)
        visits = np.array([child.n_visits for child in self.children.values()])
        moves = list(self.children.keys())
        if temperature == 0:
            best_move_idx = np.argmax(visits)
            policy = np.zeros(64)
            policy[moves[best_move_idx]] = 1.0
            return policy

        max_visits = np.max(visits)
        exp_visits = np.exp((visits - max_visits) / temperature)
        probabilities = exp_visits / np.sum(exp_visits)

        full_policy = np.zeros(64)
        for i, move in enumerate(moves):
            full_policy[move] = probabilities[i]
        return full_policy

    def to_dict(self):
        children_dict = {str(move): child.to_dict() for move, child in self.children.items()}
        return {
            'b': self.game_board.black_board,
            'w': self.game_board.white_board,
            'p': self.player,
            'h': self.game_board.history,
            'v': self.n_visits,
            'q': float(self.q_value),
            'pr': float(self.prior_p),
            'ch': children_dict
        }

    @classmethod
    def from_dict(cls, data, parent=None):
        node = cls(ReversiBitboard(), data['p'], parent=parent, move=None, prior_p=data['pr'])
        node.game_board.black_board = data['b']
        node.game_board.white_board = data['w']
        node.game_board.history = data.get('h', [])
        node.n_visits = data['v']
        node.q_value = data['q']
        node.sum_value = node.q_value * node.n_visits
        if 'ch' in data:
            for move_str, child_data in data['ch'].items():
                node.children[int(move_str)] = MCTSNode.from_dict(child_data, parent=node)
        return node

class MCTS:
    def __init__(self, model, c_puct=C_PUCT):
        self.model = model
        self.c_puct = c_puct
        self.root = None
        self.initial_root = None
        self._predict_graph = tf.function(
            self._predict_internal,
            input_signature=[
                tf.TensorSpec(shape=[64], dtype=tf.int8),
                tf.TensorSpec(shape=(), dtype=tf.int8)
            ]
        )

    def get_initial_root_for_serialization(self):
        return self.initial_root.to_dict() if self.initial_root else None

    def _predict_internal(self, board_tensor, player_tensor):
        input_planes = board_to_input_planes_tf(board_tensor, player_tensor)
        input_tensor_batch = tf.expand_dims(input_planes, axis=0)
        policy, value = self.model(input_tensor_batch, training=False)
        return policy[0], value[0][0]

    def _predict(self, board_numpy, player):
        board_tensor = tf.convert_to_tensor(board_numpy, dtype=tf.int8)
        player_tensor = tf.convert_to_tensor(player, dtype=tf.int8)
        policy, value = self._predict_graph(board_tensor, player_tensor)
        return policy.numpy(), value.numpy()

    def update_root(self, move):
        if move in self.root.children:
            self.root = self.root.children[move]
            self.root.parent = None
        else:
            self.root = MCTSNode(self.root.game_board, self.root.player)

    def search(self, game_board: ReversiBitboard, player, num_simulations):
        if self.root is None:
            self.root = MCTSNode(game_board, player)
        if self.initial_root is None:
            self.initial_root = self.root

        for _ in range(num_simulations):
            node = self.root
            sim_game_board = ReversiBitboard()
            sim_game_board.black_board = game_board.black_board
            sim_game_board.white_board = game_board.white_board
            sim_game_board.current_player = game_board.current_player
            sim_game_board.passed_last_turn = game_board.passed_last_turn
            sim_player = player
            path = [node]

            while node.is_fully_expanded() and node.children and not sim_game_board.is_game_over():
                selected_child = node.select_child(self.c_puct)
                sim_game_board.apply_move(selected_child.move)
                sim_player = sim_game_board.current_player
                node = selected_child
                path.append(node)

            value = 0
            if not sim_game_board.is_game_over():
                policy, value = self._predict(sim_game_board.board_to_numpy(), sim_player)
                valid_moves = sim_game_board.get_legal_moves()
                if valid_moves:
                    sum_policy = sum(policy[m] for m in valid_moves)
                    if sum_policy <= 0 or np.isnan(sum_policy) or np.isinf(sum_policy):
                        sum_policy = 1e-9

                    for move in valid_moves:
                        if move not in node.children:
                            new_game_board = ReversiBitboard()
                            new_game_board.black_board = sim_game_board.black_board
                            new_game_board.white_board = sim_game_board.white_board
                            new_game_board.current_player = sim_game_board.current_player
                            new_game_board.passed_last_turn = sim_game_board.passed_last_turn
                            new_game_board.history = sim_game_board.history[:]
                            new_game_board.apply_move(move)
                            prior = policy[move] / sum_policy
                            node.children[move] = MCTSNode(new_game_board, new_game_board.current_player, parent=node, move=move, prior_p=prior)
            else:
                winner = sim_game_board.get_winner()
                value = 0 if winner == 0 else (1 if winner == sim_player else -1)

            current_value_for_node = value
            for node_in_path in reversed(path):
                node_in_path.update(current_value_for_node)
                current_value_for_node = -current_value_for_node

        return self.root

def run_self_play_game_worker(game_id, model_path, sims_n, c_puct):
    print(f"G{game_id}: Game start")
    seed = (os.getpid() + int(time.time() * 1000) + game_id) % (2**32)
    random.seed(seed)
    np.random.seed(seed)
    try:
        model = tf.keras.models.load_model(model_path)
    except Exception as e:
        print(f"G{game_id}: Model load error: {e}")
        return {'error': True, 'message': str(e)}

    game_board = ReversiBitboard()
    game_board.history = []
    current_player = random.choice([1, 2])
    game_board.current_player = current_player

    mcts_ai = MCTS(model, c_puct=c_puct)
    mcts_ai.root = MCTSNode(game_board, current_player)
    mcts_ai.initial_root = mcts_ai.root

    while not game_board.is_game_over():
        legal_moves = game_board.get_legal_moves()
        if not legal_moves:
            game_board.apply_move(-1)
            current_player = game_board.current_player
            continue

        root_node = mcts_ai.search(game_board, current_player, sims_n)
        if not root_node.children:
            best_move = random.choice(legal_moves)
        else:
            moves = list(root_node.children.keys())
            visit_counts = np.array([child.n_visits for child in root_node.children.values()])
            if len(game_board.history) < 30:
                probabilities = visit_counts / np.sum(visit_counts)
                best_move = np.random.choice(moves, p=probabilities)
            else:
                best_move = moves[np.argmax(visit_counts)]

        game_board.apply_move(best_move)
        mcts_ai.update_root(best_move)
        current_player = game_board.current_player

    winner = game_board.get_winner()
    print(f"G{game_id}: Game finish, winner: {winner}")
    return mcts_ai.get_initial_root_for_serialization()

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

        for game_tree_result in pool.imap_unordered(_worker_wrapper, game_args):
            if game_tree_result is None or 'error' in game_tree_result:
                error_message = game_tree_result.get('message', 'error') if game_tree_result else "Worker returned None"
                print(f"Main process: Skiped game due to worker error: {error_message}")
                continue

            game_results_buffer.append(game_tree_result)
            games_played += 1

            if games_played > 0 and games_played % SAVE_DATA_EVERY_N_GAMES == 0:
                tree_filename = f"mcts_tree_{games_played}.msgpack"
                tree_filepath = os.path.join(generation_data_path, tree_filename)
                with open(tree_filepath, "wb") as f:
                    for game_tree in game_results_buffer:
                        msgpack.pack(game_tree, f)
                print(f"{len(game_results_buffer)} game trees saved -> {tree_filepath}")
                game_results_buffer.clear()

            if TRAINING_HOURS > 0 and (time.time() - training_start_time) / 3600 >= TRAINING_HOURS:
                print("Reaching finish time")
                break
            if TOTAL_GAMES > 0 and games_played >= TOTAL_GAMES:
                print("Reaching finish games")
                break

    print(f"Train finish, Games: {games_played}")

    if game_results_buffer:
        final_tree_filename = f"mcts_tree_{games_played}.msgpack"
        final_tree_filepath = os.path.join(generation_data_path, final_tree_filename)
        with open(final_tree_filepath, "wb") as f:
            for game_tree in game_results_buffer:
                msgpack.pack(game_tree, f)
        print(f"Final save: {len(game_results_buffer)} game trees saved -> {final_tree_filepath}")
    else:
        print("No final trees")

    print("Trained data created")

if __name__ == "__main__":
    train_model_main()

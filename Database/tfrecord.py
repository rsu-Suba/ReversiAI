import os
import sys
import glob
import random
import collections
import numpy as np
import msgpack
import tensorflow as tf
import multiprocessing
from tqdm import tqdm

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config import TRAINING_DATA_DIR, CURRENT_GENERATION_DATA_SUBDIR, NUM_PARALLEL_GAMES
from reversi_bitboard_cpp import ReversiBitboard

def _bytes_feature(value):
    if isinstance(value, type(tf.constant(0))):
        value = value.numpy()
    return tf.train.Feature(bytes_list=tf.train.BytesList(value=[value]))

def _float_feature(value):
    return tf.train.Feature(float_list=tf.train.FloatList(value=[value]))

def serialize_sample(input_planes, policy, value):
    feature = {
        'input_planes': _bytes_feature(tf.io.serialize_tensor(input_planes)),
        'policy': _bytes_feature(tf.io.serialize_tensor(policy)),
        'value': _float_feature(value),
    }
    example_proto = tf.train.Example(features=tf.train.Features(feature=feature))
    return example_proto.SerializeToString()

def process_and_write_file(args):
    msgpack_path, output_path = args
    dummy_board = ReversiBitboard()
    sample_count = 0

    try:
        with tf.io.TFRecordWriter(output_path) as writer:
            with open(msgpack_path, 'rb') as f:
                unpacker = msgpack.Unpacker(f, raw=False, use_list=True)
                for root_node_dict in unpacker:
                    if not root_node_dict: continue

                    queue = collections.deque([root_node_dict])
                    while queue:
                        node_dict = queue.popleft()

                        children = node_dict.get('ch', {})
                        if not children or node_dict.get('v', 0) == 0: continue

                        value = np.float32(node_dict.get('q'))
                        if np.isnan(value) or np.isinf(value): continue

                        moves = [int(k) for k in children.keys()]
                        visits = np.array([child.get('v', 0) for child in children.values()], dtype=np.float32)

                        if np.sum(visits) <= 0: continue

                        temperature = 2.0
                        scaled_visits = visits / temperature
                        max_scaled_visits = np.max(scaled_visits)
                        exp_visits = np.exp(scaled_visits - max_scaled_visits)
                        probabilities = exp_visits / np.sum(exp_visits)
                        policy = np.zeros(64, dtype=np.float32)
                        for move, prob in zip(moves, probabilities):
                            policy[move] = prob

                        if np.any(np.isnan(policy)) or not np.isclose(np.sum(policy), 1.0): continue

                        dummy_board.black_board = node_dict.get('b')
                        dummy_board.white_board = node_dict.get('w')
                        player = node_dict.get('p')
                        input_planes = dummy_board.board_to_input_planes(player)

                        if np.any(np.isnan(input_planes)) or np.any(np.isinf(input_planes)): continue

                        serialized_sample = serialize_sample(input_planes, policy, value)
                        writer.write(serialized_sample)
                        sample_count += 1

                        for child_dict in children.values():
                            queue.append(child_dict)
    except Exception as e:
        print(f"File error {os.path.basename(msgpack_path)}: {e}")
        return 0

    return sample_count

if __name__ == "__main__":
    multiprocessing.set_start_method('spawn', force=True)

    print("Start convert to TFRecord")

    source_dir = os.path.join(TRAINING_DATA_DIR, CURRENT_GENERATION_DATA_SUBDIR)
    output_dir = os.path.join(source_dir, 'tfrecords')

    train_output_dir = os.path.join(output_dir, 'train')
    val_output_dir = os.path.join(output_dir, 'val')
    os.makedirs(train_output_dir, exist_ok=True)
    os.makedirs(val_output_dir, exist_ok=True)

    for old_file in glob.glob(os.path.join(train_output_dir, "*.tfrecord")): os.remove(old_file)
    for old_file in glob.glob(os.path.join(val_output_dir, "*.tfrecord")): os.remove(old_file)
    print(f"Deleted old tfrecord -> {train_output_dir}, {val_output_dir}")

    msgpack_files = glob.glob(os.path.join(source_dir, 'mcts_tree_*.msgpack'))
    if not msgpack_files:
        print(f"No msgpack ->{source_dir}")
        exit()

    random.shuffle(msgpack_files)

    val_split = int(len(msgpack_files) * 0.1)
    if len(msgpack_files) > 1 and val_split == 0: val_split = 1
    train_files = msgpack_files[val_split:]
    val_files = msgpack_files[:val_split]

    num_workers = NUM_PARALLEL_GAMES
    print(f"Parallel : {num_workers}")

    with multiprocessing.Pool(num_workers) as pool:
        print(f"\nTrained data : {len(train_files)}")
        train_tasks = [(fp, os.path.join(train_output_dir, f"part_{i:05d}.tfrecord")) for i, fp in enumerate(train_files)]

        total_train_samples = 0
        with tqdm(total=len(train_tasks), desc="Train") as pbar:
            for sample_count in pool.imap_unordered(process_and_write_file, train_tasks):
                total_train_samples += sample_count
                pbar.update(1)
        print(f"Train converted : {total_train_samples} samples")

        print(f"\nVal data : {len(val_files)}")
        val_tasks = [(fp, os.path.join(val_output_dir, f"part_{i:05d}.tfrecord")) for i, fp in enumerate(val_files)]

        total_val_samples = 0
        with tqdm(total=len(val_tasks), desc="Val") as pbar:
            for sample_count in pool.imap_unordered(process_and_write_file, val_tasks):
                total_val_samples += sample_count
                pbar.update(1)
        print(f"Val converted: {total_val_samples} samples")

    print("\nConvert successful to TFRecord.")


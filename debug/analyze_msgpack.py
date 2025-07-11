import numpy as np
import msgpack
import collections

def analyze_msgpack_data(file_path):
    try:
        with open(file_path, 'rb') as f:
            packed_data = f.read()
        root_node_data = msgpack.unpackb(packed_data, raw=False) # raw=False for string keys

        total_nodes = 0
        total_visits = 0
        total_win_values = 0
        total_children_count = 0
        max_depth = 0
        depth_counts = collections.defaultdict(int)
        
        queue = collections.deque([(root_node_data, 0)]) # (node, depth)
        visited_keys = set()

        print(f"\n--- Analyzing {file_path} ---")

        while queue:
            node, depth = queue.popleft()
            
            # Create a unique key for the node (board state + current player)
            node_key = f"{node['b']}_{node['w']}_{node['c']}"
            if node_key in visited_keys:
                continue
            visited_keys.add(node_key)

            total_nodes += 1
            total_visits += node['v']
            total_win_values += node['wi']
            max_depth = max(max_depth, depth)
            depth_counts[depth] += 1

            if 'ch' in node and node['ch']:
                total_children_count += len(node['ch'])
                for child_data in node['ch'].values():
                    queue.append((child_data, depth + 1))
        
        print(f"Total Unique Nodes: {total_nodes}")
        print(f"Total Visits (sum of all node visits): {total_visits}")
        print(f"Average Visits per Node: {total_visits / total_nodes:.2f}")
        print(f"Average Win Rate (sum of wi / sum of v): {total_win_values / total_visits:.4f}")
        print(f"Max Depth: {max_depth}")
        print(f"Average Children per Node: {total_children_count / total_nodes:.2f}")
        
        print("Depth Distribution:")
        for d in sorted(depth_counts.keys()):
            print(f"  Depth {d}: {depth_counts[d]} nodes")

    except Exception as e:
        print(f"Error analyzing {file_path}: {e}")

if __name__ == "__main__":
    analyze_msgpack_data('./Database/models/1G_2M.msgpack')
    analyze_msgpack_data('./Database/models/2G_1M.msgpack')

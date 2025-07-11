import os
import msgpack
import numpy as np
import collections
import sys

def analyze_training_data(directory_path):
    if not os.path.isdir(directory_path):
        print(f"Error: Directory not found at {directory_path}")
        return

    msgpack_files = [f for f in os.listdir(directory_path) if f.endswith('.msgpack')]
    if not msgpack_files:
        print(f"No .msgpack files found in {directory_path}")
        return

    player_counts = collections.Counter()
    outcome_counts = collections.Counter()
    total_states = 0
    total_games = 0

    print(f"--- Analyzing Training Data in {directory_path} ---")

    for filename in msgpack_files:
        file_path = os.path.join(directory_path, filename)
        try:
            with open(file_path, 'rb') as f:
                game_data = msgpack.unpack(f, raw=False)
            
            if not game_data:
                print(f"Warning: {filename} is empty.")
                continue

            total_games += 1
            total_states += len(game_data)

            for record in game_data:
                player_counts[record['player']] += 1
                # Round the value to handle potential float inaccuracies
                outcome_counts[round(record['value'])] += 1

        except Exception as e:
            print(f"Error processing {filename}: {e}")

    print("\n--- Overall Statistics ---")
    print(f"Total Games Analyzed: {total_games}")
    print(f"Total Game States: {total_states}")
    if total_games > 0:
        print(f"Average States per Game: {total_states / total_games:.2f}")

    print("\n--- Player Distribution (whose turn it was) ---")
    if not player_counts:
        print("No player data found.")
    else:
        total_player_entries = sum(player_counts.values())
        for player, count in player_counts.items():
            percentage = (count / total_player_entries) * 100 if total_player_entries > 0 else 0
            player_name = 'Black (P1)' if player == 1 else 'White (P2)'
            print(f"  {player_name}: {count} states ({percentage:.2f}%)")

    print("\n--- Outcome Distribution (value from the player's perspective) ---")
    if not outcome_counts:
        print("No outcome data found.")
    else:
        total_outcomes = sum(outcome_counts.values())
        for outcome, count in sorted(outcome_counts.items()):
            percentage = (count / total_outcomes) * 100 if total_outcomes > 0 else 0
            outcome_name = 'Win' if outcome == 1 else 'Loss' if outcome == -1 else 'Draw'
            print(f"  {outcome_name}: {count} states ({percentage:.2f}%)")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_directory = sys.argv[1]
    else:
        # Default directory if none is provided
        target_directory = './Database/training_data/1G/'
        print(f"No directory provided. Using default: {target_directory}")
    
    analyze_training_data(target_directory)

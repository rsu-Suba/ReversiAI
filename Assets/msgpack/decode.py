import msgpack
import json
import sys

def convert_msgpack_to_jsonl(input_path, output_path):
    print("--- Starting MsgPack to JSONL Converter (Python) ---")
    print(f"Input MsgPack file: {input_path}")
    print(f"Output JSONL file: {output_path}")

    try:
        with open(input_path, 'rb') as input_file:
            with open(output_path, 'w', encoding='utf-8') as output_file:
                unpacker = msgpack.Unpacker(input_file, raw=False)
                object_count = 0
                for obj in unpacker:
                    json.dump(obj, output_file, ensure_ascii=False)
                    output_file.write('\n')
                    object_count += 1
                
                print(f"\nSuccessfully converted {object_count} object(s).")

    except Exception as e:
        print(f"\nAn error occurred: {e}", file=sys.stderr)
    finally:
        print("--- Converter Finished ---")


if __name__ == '__main__':
    input_file_path = '/home/suba/ReversiAI/Database/mcts.msgpack'
    output_file_path = '/home/suba/ReversiAI/Database/mcts.json'
    
    convert_msgpack_to_jsonl(input_file_path, output_file_path)
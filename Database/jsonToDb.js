// export_db_to_msgpack.js
//Not working
import { MCTSNode } from "../MCTSNode.mjs";
import { DatabaseManager } from "../DatabaseManager.mjs";
import { config } from "../config.mjs";
import { Encoder } from "@msgpack/msgpack";
import * as fs from "fs/promises";

// --- 設定 ---
// config.mjsから入力ファイルと出力ファイルの名前を読み込む
const DB_INPUT_PATH = config.dbInputPath || "mcts.sqlite";
const MSGPACK_OUTPUT_PATH = config.treeSavePath || "tree_from_db.msgpack";

async function main() {
   console.log(`--- Starting SQLite to Msgpack Converter ---`);
   console.log(`Input SQLite file: ${DB_INPUT_PATH}`);
   console.log(`Output Msgpack file: ${MSGPACK_OUTPUT_PATH}`);

   // --- 1. データベースに接続し、全ノードデータを取得 ---
   const dbManager = new DatabaseManager(DB_INPUT_PATH);
   const allNodesData = dbManager.getAllNodes();
   dbManager.close();
   if (!allNodesData || allNodesData.length === 0) {
      console.error("No nodes found in the database.");
      return;
   }
   console.log(`Found ${allNodesData.length} nodes in the database.`);

   // --- 2. バラバラのデータから、メモリ上に木構造を再構築 ---
   console.log("Reconstructing MCTS tree in memory...");
   const nodeMap = new Map();
   let rootNode = null;

   // まず、全てのノードをインスタンス化して、Mapに格納
   for (const row of allNodesData) {
      const node = new MCTSNode(
         BigInt("0x" + row.black_board),
         BigInt("0x" + row.white_board),
         row.current_player,
         null, // parentは後で設定
         row.move ? BigInt(row.move) : null
      );
      node.wins = row.wins;
      node.visits = row.visits;
      nodeMap.set(row.key, node);
   }

   // 次に、もう一度ループして、親子関係を繋ぎ直す
   for (const row of allNodesData) {
      const node = nodeMap.get(row.key);
      if (row.parent_key) {
         const parentNode = nodeMap.get(row.parent_key);
         if (parentNode) {
            node.parent = parentNode;
            if (node.move !== null) {
               parentNode.children[node.move.toString()] = node;
            }
         }
      } else {
         // parent_keyがnullのものが、木の根（ルート）
         rootNode = node;
      }
   }

   if (!rootNode) {
      console.error("Could not determine the root node of the tree.");
      return;
   }
   console.log("Tree reconstruction complete.");

   // --- 3. 復元した木をMsgpack形式で保存 ---
   console.log("Saving tree to Msgpack file...");
   const serializableTree = rootNode.toSerializableObject();
   const encoder = new Encoder({ maxDepth: 1000 }); // 深い木構造に対応
   const encodedData = encoder.encode(serializableTree);
   await fs.writeFile(MSGPACK_OUTPUT_PATH, encodedData);

   console.log(`--- Conversion complete! ---`);
   console.log(`Tree successfully saved to ${MSGPACK_OUTPUT_PATH}`);
}

main();

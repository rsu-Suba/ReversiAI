// export_db_to_json.js
import { DatabaseManager } from "../../DatabaseManager.mjs";
import { config } from "../../config.mjs";
import * as fs from "fs/promises";

const DB_PATH = config.inputFile;
const JSON_OUTPUT_PATH = config.outputFile;

async function exportData() {
   console.log(`--- Exporting data from ${DB_PATH} to ${JSON_OUTPUT_PATH} ---`);

   const dbManager = new DatabaseManager(DB_PATH);
   await dbManager.init();

   // データベースから全てのノードデータを取得
   const allNodes = await dbManager.db.all("SELECT * FROM mcts_nodes");

   await dbManager.close();

   // JSONファイルとして書き出し
   await fs.writeFile(JSON_OUTPUT_PATH, JSON.stringify(allNodes));

   console.log(`Export complete! ${allNodes.length} nodes saved to ${JSON_OUTPUT_PATH}`);
}

exportData();

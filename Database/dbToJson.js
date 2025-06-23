// dbToJson.js (ストリーミング対応・最終完成版)

import { DatabaseManager } from "../DatabaseManager.mjs";
import { config } from "../config.mjs";
import * as fs from "fs";

// --- 設定を読み込み ---
const DB_INPUT_PATH = config.dbInputPath || "mcts_master.sqlite";
const JSON_OUTPUT_PATH = config.dbOutputPath || "mcts_master.json";

function main() {
   console.log(`--- Starting SQLite to JSON Streaming Converter ---`);
   console.log(`Input: ${DB_INPUT_PATH}`);
   console.log(`Output: ${JSON_OUTPUT_PATH}`);

   try {
      // 1. データベースに接続
      if (!fs.existsSync(DB_INPUT_PATH)) {
         console.error(`Error: Input database file not found at "${DB_INPUT_PATH}"`);
         return;
      }
      const dbManager = new DatabaseManager(DB_INPUT_PATH);

      // 2. 書き込み先のファイルストリームを開く
      const writeStream = fs.createWriteStream(JSON_OUTPUT_PATH);

      console.log("Reading from database and writing to JSON...");

      // 3. JSON配列の開始文字を書き込む
      writeStream.write("[\n");

      // 4. better-sqlite3のiteratorを使い、1行ずつデータを処理する
      const stmt = dbManager.db.prepare("SELECT * FROM mcts_nodes");
      let isFirstRow = true;
      for (const row of stmt.iterate()) {
         if (!isFirstRow) {
            // 2行目以降は、オブジェクトの前にカンマを追加
            writeStream.write(",\n");
         }
         // 1行分のデータだけを文字列に変換して書き込む
         writeStream.write(JSON.stringify(row, null, 2));
         isFirstRow = false;
      }

      // 5. JSON配列の終了文字を書き込む
      writeStream.write("\n]");
      writeStream.end(); // ストリームを閉じて、ファイル書き込みを完了させる

      console.log(`Successfully converted and saved JSON to: ${JSON_OUTPUT_PATH}`);

      dbManager.close();
   } catch (error) {
      console.error(`Error converting SQLite to JSON:`, error);
   } finally {
      console.log(`--- Converter Finished ---`);
   }
}

main();

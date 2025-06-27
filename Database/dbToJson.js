import { DatabaseManager } from "../DatabaseManager.mjs";
import { config } from "../config.mjs";
import * as fs from "fs";

const DB_INPUT_PATH = config.dbInputPath || "mcts_master.sqlite";
const JSON_OUTPUT_PATH = config.dbOutputPath || "mcts_master.json";

function main() {
   console.log(`--- Starting SQLite to JSON Streaming Converter ---`);
   console.log(`Input: ${DB_INPUT_PATH}`);
   console.log(`Output: ${JSON_OUTPUT_PATH}`);

   try {
      if (!fs.existsSync(DB_INPUT_PATH)) {
         console.error(`Error: Input database file not found at "${DB_INPUT_PATH}"`);
         return;
      }
      const dbManager = new DatabaseManager(DB_INPUT_PATH);
      const writeStream = fs.createWriteStream(JSON_OUTPUT_PATH);
      console.log("Reading from database and writing to JSON...");
      writeStream.write("[\n");
      const stmt = dbManager.db.prepare("SELECT * FROM mcts_nodes");
      let isFirstRow = true;
      for (const row of stmt.iterate()) {
         if (!isFirstRow) {
            writeStream.write(",\n");
         }
         writeStream.write(JSON.stringify(row, null, 2));
         isFirstRow = false;
      }
      writeStream.write("\n]");
      writeStream.end();

      console.log(`Successfully converted and saved JSON to: ${JSON_OUTPUT_PATH}`);

      dbManager.close();
   } catch (error) {
      console.error(`Error converting SQLite to JSON:`, error);
   } finally {
      console.log(`--- Converter Finished ---`);
   }
}

main();

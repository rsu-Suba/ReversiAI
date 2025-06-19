import { DatabaseManager } from "./DatabaseManager.mjs";
import { config } from "./config.mjs";
import * as fs from "fs";

const MASTER_DB_PATH = config.treeLoadPath;
const NUM_WORKERS = config.parallel;

async function mergeDatabases() {
   console.log("--- Starting database merge process ---");
   if (fs.existsSync(MASTER_DB_PATH)) {
      fs.unlinkSync(MASTER_DB_PATH);
      console.log(`Removed old master database: ${MASTER_DB_PATH}`);
   }
   const masterDb = new DatabaseManager(MASTER_DB_PATH);
   await masterDb.init();
   console.log(`Master database ready at ${MASTER_DB_PATH}`);

   for (let i = 0; i < NUM_WORKERS; i++) {
      const workerDbPath = `./mcts/mcts_w${i}.sqlite`;
      if (fs.existsSync(workerDbPath)) {
         console.log(`Merging ${workerDbPath}...`);
         const workerDb = new DatabaseManager(workerDbPath);
         await workerDb.init();
         const workerNodes = await workerDb.db.all("SELECT * FROM mcts_nodes");
         await workerDb.close();
         if (workerNodes.length > 0) {
            await masterDb.db.run("BEGIN TRANSACTION");
            try {
               for (const workerNode of workerNodes) {
                  const existingNode = await masterDb.getNode(workerNode.key);
                  if (existingNode) {
                     const newWins = existingNode.wins + workerNode.wins;
                     const newVisits = existingNode.visits + workerNode.visits;
                     await masterDb.db.run("UPDATE mcts_nodes SET wins = ?, visits = ? WHERE key = ?", [
                        newWins,
                        newVisits,
                        workerNode.key,
                     ]);
                  } else {
                     await masterDb.db.run(
                        `INSERT INTO mcts_nodes (key, parent_key, move, wins, visits, children_keys, black_board, white_board, current_player)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                           workerNode.key,
                           workerNode.parent_key,
                           workerNode.move,
                           workerNode.wins,
                           workerNode.visits,
                           workerNode.children_keys,
                           workerNode.black_board,
                           workerNode.white_board,
                           workerNode.current_player,
                        ]
                     );
                  }
               }
               await masterDb.db.run("COMMIT");
               console.log(`  ${workerNodes.length} nodes merged from ${workerDbPath}.`);
            } catch (e) {
               console.error(`  Transaction failed for ${workerDbPath}. Rolling back.`, e);
               await masterDb.db.run("ROLLBACK");
            }
         }
      } else {
         console.warn(`Warning: Worker database ${workerDbPath} not found. Skipping.`);
      }
   }
   const totalNodes = await masterDb.getNodeCount();
   console.log(`Nodes merged -> ${totalNodes} nodes`);
   await masterDb.close();

   console.log("--- Cleaning up temporary files... ---");
   const filesToDelete = [`${MASTER_DB_PATH}-shm`, `${MASTER_DB_PATH}-wal`];
   for (let i = 0; i < NUM_WORKERS; i++) {
      const workerDbPath = `mcts_w${i}.sqlite`;
      filesToDelete.push(`./mcts/${workerDbPath}-shm`, `./mcts/${workerDbPath}-wal`);
   }

   filesToDelete.forEach((file) => {
      if (fs.existsSync(file)) {
         try {
            fs.unlinkSync(file);
         } catch (err) {
            console.error(`  Failed to remove ${file}:`, err);
         }
      }
   });

   console.log("--- Merge process completed successfully! ---");
}

mergeDatabases().catch(console.error);

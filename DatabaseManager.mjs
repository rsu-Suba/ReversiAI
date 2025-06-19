import sqlite3 from "sqlite3";
import { open } from "sqlite";

export class DatabaseManager {
   constructor(dbFilePath) {
      this.dbFilePath = dbFilePath;
      this.db = null;
   }
   async init() {
      this.db = await open({ filename: this.dbFilePath, driver: sqlite3.Database });
      await this.db.run("PRAGMA journal_mode = WAL;");
      await this.db.run("PRAGMA busy_timeout = 5000;");
      await this.db.exec(`
            CREATE TABLE IF NOT EXISTS mcts_nodes (
                key TEXT PRIMARY KEY, parent_key TEXT, move TEXT,
                wins REAL NOT NULL, visits INTEGER NOT NULL, children_keys TEXT NOT NULL,
                black_board TEXT NOT NULL, white_board TEXT NOT NULL, current_player INTEGER NOT NULL
            )`);
   }
   async close() {
      if (this.db) await this.db.close();
   }
   async getNode(key) {
      const row = await this.db.get("SELECT * FROM mcts_nodes WHERE key = ?", key);
      if (!row) return null;
      return {
         key: row.key,
         parent_key: row.parent_key,
         move: row.move ? BigInt(row.move) : null,
         wins: row.wins,
         visits: row.visits,
         children_keys: JSON.parse(row.children_keys),
         blackBoard: BigInt("0x" + row.black_board),
         whiteBoard: BigInt("0x" + row.white_board),
         currentPlayer: row.current_player,
      };
   }
   async saveNode(node) {
      const key = node.getBoardStateKey();
      const parent_key = node.parent_key;
      const move = node.move ? node.move.toString() : null;
      const children_keys_json = JSON.stringify(node.children_keys);
      const black_board_hex = node.blackBoard.toString(16);
      const white_board_hex = node.whiteBoard.toString(16);
      const current_player = node.currentPlayer;
      await this.db.run(
         `INSERT OR REPLACE INTO mcts_nodes (key, parent_key, move, wins, visits, children_keys, black_board, white_board, current_player)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
         [
            key,
            parent_key,
            move,
            node.wins,
            node.visits,
            children_keys_json,
            black_board_hex,
            white_board_hex,
            current_player,
         ]
      );
   }

   async batchUpdateNodes(nodesToUpdate) {
      if (!this.db || nodesToUpdate.length === 0) return;
      const sql = `UPDATE mcts_nodes SET wins = ?, visits = ? WHERE key = ?`;
      try {
         await this.db.run("BEGIN TRANSACTION");
         for (const nodeData of nodesToUpdate) {
            await this.db.run(sql, [nodeData.wins, nodeData.visits, nodeData.key]);
         }
         await this.db.run("COMMIT");
      } catch (error) {
         console.error("[DB] Transaction failed, rolling back.", error);
         await this.db.run("ROLLBACK");
         throw error;
      }
   }

   async getNodeCount() {
      if (!this.db) {
         console.warn("[DB] getNodeCount called before DB initialization.");
         return 0;
      }
      try {
         const result = await this.db.get("SELECT COUNT(*) as count FROM mcts_nodes");
         return result.count;
      } catch (error) {
         console.error("[DB] Failed to get node count:", error);
         return 0;
      }
   }
}

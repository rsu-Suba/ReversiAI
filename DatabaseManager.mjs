import Database from "better-sqlite3";

export class DatabaseManager {
   constructor(dbFilePath) {
      this.db = new Database(dbFilePath);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("busy_timeout = 5000");
      this.db.exec(`
            CREATE TABLE IF NOT EXISTS mcts_nodes (
                key TEXT PRIMARY KEY,
                parent_key TEXT,
                move TEXT,
                wins REAL NOT NULL,
                visits INTEGER NOT NULL,
                children_keys TEXT NOT NULL,
                black_board TEXT NOT NULL,
                white_board TEXT NOT NULL,
                current_player INTEGER NOT NULL
            )`);
      this.upsertNodeStmt = this.db.prepare(
         `INSERT INTO mcts_nodes (key, parent_key, move, wins, visits, children_keys, black_board, white_board, current_player)
             VALUES (@key, @parent_key, @move, @wins, @visits, @children_keys, @black_board, @white_board, @current_player)
             ON CONFLICT(key) DO UPDATE SET
                 wins = excluded.wins,
                 visits = excluded.visits,
                 children_keys = excluded.children_keys`
      );
      this.getNodeStmt = this.db.prepare("SELECT * FROM mcts_nodes WHERE key = ?");
      this.countStmt = this.db.prepare("SELECT COUNT(*) as count FROM mcts_nodes");
   }

   close() {
      if (this.db) {
         this.db.close();
      }
   }

   batchSaveNodes(nodes) {
      if (nodes.length === 0) return;
      const transaction = this.db.transaction((nodesToSave) => {
         for (const node of nodesToSave) {
            this.upsertNodeStmt.run({
               key: node.getBoardStateKey(),
               parent_key: node.parent ? node.parent.getBoardStateKey() : null,
               move: node.move ? node.move.toString() : null,
               wins: node.wins,
               visits: node.visits,
               children_keys: JSON.stringify(Object.values(node.children).map((child) => child.getBoardStateKey())),
               black_board: node.blackBoard.toString(16),
               white_board: node.whiteBoard.toString(16),
               current_player: node.currentPlayer,
            });
         }
      });
      transaction(nodes);
   }

   batchSaveNodesMerge(nodesToSave) {
      if (!nodesToSave || nodesToSave.length === 0) return;
      const transaction = this.db.transaction((nodes) => {
         for (const nodeData of nodes) {
            this.upsertNodeStmt.run({
               key: nodeData.key,
               parent_key: nodeData.parent_key,
               move: nodeData.move,
               wins: nodeData.wins,
               visits: nodeData.visits,
               children_keys: nodeData.children_keys,
               black_board: nodeData.black_board,
               white_board: nodeData.white_board,
               current_player: nodeData.current_player,
            });
         }
      });
      transaction(nodesToSave);
   }

   batchSaveNodesFromData(nodesData) {
      if (nodesData.length === 0) return;
      const transaction = this.db.transaction((nodes) => {
         for (const nodeData of nodes) {
            this.upsertNodeStmt.run({
               key: nodeData.key,
               parent_key: nodeData.parent_key,
               move: nodeData.move,
               wins: nodeData.wins,
               visits: nodeData.visits,
               children_keys: nodeData.children_keys,
               black_board: nodeData.black_board,
               white_board: nodeData.white_board,
               current_player: nodeData.current_player,
            });
         }
      });
      transaction(nodesData);
   }

   getAllNodes() {
      if (!this.db) {
         console.error("Database not initialized.");
         return [];
      }
      return this.db.prepare("SELECT * FROM mcts_nodes").all();
   }

   getNodeCount() {
      if (!this.db) {
         console.warn("[DB] getNodeCount called before DB initialization.");
         return 0;
      }
      try {
         const result = this.db.prepare("SELECT COUNT(*) as count FROM mcts_nodes").get();
         return result.count;
      } catch (error) {
         console.error("[DB] Failed to get node count:", error);
         return 0;
      }
   }

   getNode(key) {
      const row = this.getNodeStmt.get(key);
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
}

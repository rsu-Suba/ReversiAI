import { config } from "./config.mjs";

export class MCTSNode {
   constructor(blackBoard, whiteBoard, currentPlayer, parent_key = null, move = null) {
      this.blackBoard = blackBoard;
      this.whiteBoard = whiteBoard;
      this.currentPlayer = currentPlayer;
      this.parent_key = parent_key;
      this.move = move;
      this.visits = 0;
      this.wins = 0;
      this.children_keys = [];
   }

   getBoardStateKey() {
      return `${this.blackBoard.toString(16)}_${this.whiteBoard.toString(16)}_${this.currentPlayer}`;
   }

   addChildKey(key) {
      if (!this.children_keys.includes(key)) {
         this.children_keys.push(key);
      }
   }

   bestChild(C_param = config.cP, children_nodes) {
      let bestScore = -Infinity;
      let bestChildKey = null;
      for (const child of children_nodes) {
         if (child.visits === 0) {
            return child.getBoardStateKey();
         }
         const exploitation = child.wins / child.visits;
         const exploration = this.visits > 1 ? C_param * Math.sqrt(Math.log(this.visits) / child.visits) : Infinity;
         const uctScore = exploitation + exploration;
         if (uctScore > bestScore) {
            bestScore = uctScore;
            bestChildKey = child.getBoardStateKey();
         }
      }
      return bestChildKey;
   }
}

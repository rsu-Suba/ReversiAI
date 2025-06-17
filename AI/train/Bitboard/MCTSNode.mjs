import { OthelloBoard } from "./OthelloBoard.mjs";
import { config } from "./config.mjs";

export class MCTSNode {
   constructor(blackBoard, whiteBoard, currentPlayer, parent = null, move = null, depth = 0, passedLastTurn = false) {
      this.blackBoard = blackBoard;
      this.whiteBoard = whiteBoard;
      this.currentPlayer = currentPlayer;
      this.parent = parent;
      this.move = move;
      this.visits = 0;
      this.wins = 0;
      this.children = {};
      this.depth = depth;
      this.passedLastTurn = passedLastTurn;
      this.untriedMoves = null;
   }

   bestChild(C_param = config.cP, rng = Math.random) {
      let bestScore = -Infinity;
      let bestMoves = [];
      if (Object.keys(this.children).length === 0) {
         return null;
      }
      if (this.visits < 2) {
         let minVisits = Infinity;
         for (const moveBitStr in this.children) {
            const child = this.children[moveBitStr];
            if (child.visits < minVisits) {
               minVisits = child.visits;
               bestMoves = [BigInt(moveBitStr)];
            } else if (child.visits === minVisits) {
               bestMoves.push(BigInt(moveBitStr));
            }
         }
         return bestMoves[Math.floor(rng() * bestMoves.length)];
      }

      for (const moveBitStr in this.children) {
         if (Object.prototype.hasOwnProperty.call(this.children, moveBitStr)) {
            const child = this.children[moveBitStr];
            if (child.visits === 0) {
               return BigInt(moveBitStr);
            }
            const exploitation = child.wins / child.visits;
            const exploration = C_param * Math.sqrt(Math.log(this.visits) / child.visits);
            const uctScore = exploitation + exploration;

            if (uctScore > bestScore) {
               bestScore = uctScore;
               bestMoves = [BigInt(moveBitStr)];
            } else if (uctScore === bestScore) {
               bestMoves.push(BigInt(moveBitStr));
            }
         }
      }

      if (bestMoves.length === 0) return null;
      return bestMoves[Math.floor(rng() * bestMoves.length)];
   }

   isFullyExpanded(gameBoardInstance) {
      gameBoardInstance.setBoardState(this.blackBoard, this.whiteBoard, this.currentPlayer, 0, this.passedLastTurn);
      const legalMovesBitboard = gameBoardInstance.getLegalMovesBitboard();
      for (let i = 0n; i < BigInt(OthelloBoard.boardSize); i++) {
         if (((legalMovesBitboard >> i) & 1n) !== 0n) {
            if (!(i.toString() in this.children)) {
               return false;
            }
         }
      }
      return true;
   }

   toSerializableObject() {
      const childrenSerializable = {};
      for (const moveBitStr in this.children) {
         if (Object.prototype.hasOwnProperty.call(this.children, moveBitStr)) {
            childrenSerializable[moveBitStr] = this.children[moveBitStr].toSerializableObject();
         }
      }
      return {
         b: this.blackBoard.toString(16),
         w: this.whiteBoard.toString(16),
         c: this.currentPlayer,
         m: this.move ? this.move.toString(16) : null,
         v: this.visits,
         wi: this.wins,
         ch: childrenSerializable,
         d: this.depth,
         p: this.passedLastTurn,
      };
   }

   static fromSerializableObject(serializableNodeData) {
      const node = new MCTSNode(
         BigInt("0x" + serializableNodeData.b),
         BigInt("0x" + serializableNodeData.w),
         serializableNodeData.c,
         null,
         serializableNodeData.m ? BigInt("0x" + serializableNodeData.m) : null,
         serializableNodeData.d,
         serializableNodeData.p !== undefined ? serializableNodeData.p : false
      );
      node.visits = serializableNodeData.v;
      node.wins = serializableNodeData.wi;
      node.untriedMoves = null;

      for (const moveBitStr in serializableNodeData.ch) {
         const childNode = MCTSNode.fromSerializableObject(serializableNodeData.ch[moveBitStr]);
         node.children[moveBitStr] = childNode;
      }
      return node;
   }

   merge(otherNode) {
      if (!otherNode) return;
      this.wins += otherNode.wins;
      this.visits += otherNode.visits;
      this.untriedMoves = null;

      for (const moveBitStr in otherNode.children) {
         if (Object.prototype.hasOwnProperty.call(otherNode.children, moveBitStr)) {
            const otherChild = otherNode.children[moveBitStr];
            if (this.children[moveBitStr]) {
               this.children[moveBitStr].merge(otherChild);
            } else {
               this.children[moveBitStr] = MCTSNode.fromSerializableObject(otherChild.toSerializableObject());
            }
         }
      }
   }

   getBoardStateKey() {
      return `${this.blackBoard.toString(16)}_${this.whiteBoard.toString(16)}_${this.currentPlayer}_${
         this.passedLastTurn
      }`;
   }

   prune(maxDepth, newNodeMap = new Map(), currentDepth = 0) {
      const newNode = new MCTSNode(
         this.blackBoard,
         this.whiteBoard,
         this.currentPlayer,
         this.parent,
         this.move,
         this.wins,
         this.visits,
         this.isTerminal,
         this.passCount,
         []
      );
      newNodeMap.set(newNode.getBoardStateKey(), newNode);
      if (currentDepth < maxDepth) {
         for (const child of this.children) {
            const newChild = child.prune(maxDepth, newNodeMap, currentDepth + 1);
            newNode.children.push(newChild);
         }
      }

      return newNode;
   }
}

import { OthelloBoard } from "./OthelloBoard.mjs";
import { config } from "./config.mjs";

export class MCTSNode {
   constructor(blackBoard, whiteBoard, currentPlayer, parent = null, move = null) {
      this.blackBoard = blackBoard;
      this.whiteBoard = whiteBoard;
      this.currentPlayer = currentPlayer;
      this.parent = parent;
      this.move = move;
      this.wins = 0;
      this.visits = 0;
      this.children = {};
      this.untriedMoves = null;
      this.priorProbability = 0;
   }

   getBoardStateKey() {
      return `${this.blackBoard.toString(16)}_${this.whiteBoard.toString(16)}_${this.currentPlayer}`;
   }

   bestChild(C_param = config.cP) {
      let bestScore = -Infinity;
      let bestChild = null;
      for (const child of Object.values(this.children)) {
         const qValue = child.visits > 0 ? child.wins / child.visits : 0;
         const uValue = C_param * child.priorProbability * (Math.sqrt(this.visits) / (1 + child.visits));
         const puctScore = qValue + uValue;

         if (puctScore > bestScore) {
            bestScore = puctScore;
            bestChild = child;
         }
      }
      return bestChild;
   }

   getUntriedMoves(gameBoardInstance) {
      if (this.untriedMoves === null) {
         gameBoardInstance.setBoardState(this.blackBoard, this.whiteBoard, this.currentPlayer);
         this.untriedMoves = gameBoardInstance.getLegalMoves();
      }
      return this.untriedMoves;
   }

   isFullyExpanded(gameBoardInstance) {
      return this.getUntriedMoves(gameBoardInstance).length === 0;
   }

   isTerminal(gameBoardInstance) {
      gameBoardInstance.setBoardState(this.blackBoard, this.whiteBoard, this.currentPlayer);
      return gameBoardInstance.isGameOver();
   }

   toSerializableObject() {
      const childrenSerializable = {};
      for (const moveStr in this.children) {
         childrenSerializable[moveStr] = this.children[moveStr].toSerializableObject();
      }
      return {
         b: this.blackBoard.toString(16),
         w: this.whiteBoard.toString(16),
         c: this.currentPlayer,
         m: this.move ? this.move.toString() : null,
         wi: this.wins,
         v: this.visits,
         ch: childrenSerializable,
      };
   }

   static fromSerializableObject(serializableNodeData, parentNode = null) {
      const node = new MCTSNode(
         BigInt("0x" + serializableNodeData.b),
         BigInt("0x" + serializableNodeData.w),
         serializableNodeData.c,
         parentNode,
         serializableNodeData.m ? BigInt("0x" + serializableNodeData.m) : null
      );
      node.visits = serializableNodeData.v;
      node.wins = serializableNodeData.wi;

      for (const moveBitStr in serializableNodeData.ch) {
         const childNode = MCTSNode.fromSerializableObject(serializableNodeData.ch[moveBitStr], node);
         node.children[moveBitStr] = childNode;
      }
      return node;
   }

   merge(otherNode) {
      this.wins += otherNode.wins;
      this.visits += otherNode.visits;
      for (const moveStr in otherNode.children) {
         const otherChild = otherNode.children[moveStr];
         if (this.children[moveStr]) {
            this.children[moveStr].merge(otherChild);
         } else {
            this.children[moveStr] = MCTSNode.fromSerializableObject(otherChild.toSerializableObject(), this);
         }
      }
   }
}

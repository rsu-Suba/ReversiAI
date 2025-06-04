import { config } from "./config.mjs";

export class MCTSNode {
   constructor(boardState, currentPlayer, parent = null, move = null, depth = 0, passedLastTurn = false) {
      this.boardState = boardState.map((row) => [...row]);
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
      for (const moveStr in this.children) {
         const child = this.children[moveStr];
         const uctScore =
            child.visits === 0
               ? Infinity
               : child.wins / child.visits + C_param * Math.sqrt(Math.log(this.visits) / child.visits);
         if (uctScore > bestScore) {
            bestScore = uctScore;
            bestMoves = [JSON.parse(moveStr)];
         } else if (uctScore === bestScore) {
            bestMoves.push(JSON.parse(moveStr));
         }
      }

      return bestMoves[Math.floor(rng() * bestMoves.length)];
   }

   isFullyExpanded(gameBoardInstance) {
      gameBoardInstance.setBoardState(this.boardState, this.currentPlayer, this.passedLastTurn);
      const legalMoves = gameBoardInstance.getLegalMoves();
      return legalMoves.every((move) => JSON.stringify(move) in this.children);
   }

   toSerializableObject() {
      const childrenSerializable = {};
      for (const moveStr in this.children) {
         childrenSerializable[moveStr] = this.children[moveStr].toSerializableObject();
      }
      return {
         boardState: this.boardState,
         currentPlayer: this.currentPlayer,
         move: this.move,
         visits: this.visits,
         wins: this.wins,
         children: childrenSerializable,
         depth: this.depth,
         passedLastTurn: this.passedLastTurn,
      };
   }

   static fromSerializableObject(serializableNodeData) {
      const node = new MCTSNode(
         serializableNodeData.boardState,
         serializableNodeData.currentPlayer,
         null,
         serializableNodeData.move,
         serializableNodeData.depth,
         serializableNodeData.passedLastTurn !== undefined ? serializableNodeData.passedLastTurn : false
      );
      node.visits = serializableNodeData.visits;
      node.wins = serializableNodeData.wins;
      node.untriedMoves = null;

      for (const moveStr in serializableNodeData.children) {
         const childNode = MCTSNode.fromSerializableObject(serializableNodeData.children[moveStr]);
         node.children[moveStr] = childNode;
         childNode.parent = node;
      }
      return node;
   }

   merge(otherNode) {
      if (!otherNode) return;
      this.wins += otherNode.wins;
      this.visits += otherNode.visits;
      this.untriedMoves = null;

      for (const moveStr in otherNode.children) {
         if (Object.prototype.hasOwnProperty.call(otherNode.children, moveStr)) {
            const otherChild = otherNode.children[moveStr];
            if (this.children[moveStr]) {
               this.children[moveStr].merge(otherChild);
            } else {
               //this.children[moveStr] = MCTSNode.fromSerializableObject(otherChild.toSerializableObject(), this);
               this.children[moveStr] = MCTSNode.fromSerializableObject(otherChild.toSerializableObject());
            }
         }
      }
   }

   getBoardStateKey() {
      return JSON.stringify(this.boardState) + "_" + this.currentPlayer + "_" + this.passedLastTurn;
   }
}

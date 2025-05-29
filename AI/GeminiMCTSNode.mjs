export class MCTSNode {
   constructor(boardState, currentPlayer, parent = null, move = null) {
      this.boardState = boardState;
      this.currentPlayer = currentPlayer;
      this.parent = parent;
      this.move = move;
      this.visits = 0;
      this.wins = 0;
      this.children = {};
      this.depth = parent ? parent.depth + 1 : 0;
   }

   bestChild(C_param = 3.5, rng = Math.random) {
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
      gameBoardInstance.setBoardState(this.boardState, this.currentPlayer);
      const legalMoves = gameBoardInstance.getLegalMoves();
      return legalMoves.every((move) => JSON.stringify(move) in this.children);
   }

   toSerializableObject() {
      const childrenSerializable = {};
      for (const moveStr in this.children) {
         if (this.children[moveStr] instanceof MCTSNode) {
            childrenSerializable[moveStr] = this.children[moveStr].toSerializableObject();
         } else {
            console.warn(`Non-MCTSNode child found at move ${moveStr}. Skipping serialization.`);
         }
      }
      return {
         boardState: this.boardState,
         currentPlayer: this.currentPlayer,
         move: this.move,
         visits: this.visits,
         wins: this.wins,
         children: childrenSerializable,
         depth: this.depth,
      };
   }

   static fromSerializableObject(serializableNodeData) {
      const node = new MCTSNode(
         serializableNodeData.boardState,
         serializableNodeData.currentPlayer,
         null,
         serializableNodeData.move
      );
      node.visits = serializableNodeData.visits;
      node.wins = serializableNodeData.wins;
      node.depth = serializableNodeData.depth;

      for (const moveStr in serializableNodeData.children) {
         const childNode = MCTSNode.fromSerializableObject(serializableNodeData.children[moveStr]);
         node.children[moveStr] = childNode;
         childNode.parent = node;
      }
      return node;
   }

   merge(otherNode) {
      if (this === otherNode) return;
      this.visits += otherNode.visits;
      this.wins += otherNode.wins;
      for (const moveStr in otherNode.children) {
         const otherChild = otherNode.children[moveStr];
         if (this.children[moveStr]) {
            //Same child node, merge child node
            this.children[moveStr].merge(otherChild);
         } else {
            // No same node, add node
            this.children[moveStr] = otherChild;
            otherChild.parent = this;
         }
      }
   }
}

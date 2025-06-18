export class MergeMCTSNode {
   constructor(boardState, currentPlayer, move = null, depth = 0, passedLastTurn = false) {
      this.boardState = boardState;
      this.currentPlayer = currentPlayer;
      this.move = move;
      this.children = {};
      this.winCount = 0;
      this.visitCount = 0;
      this.depth = depth;
      this.passedLastTurn = passedLastTurn;
      this.boardStateKey = this.generateBoardStateKey(boardState, currentPlayer, passedLastTurn);
   }

   generateBoardStateKey(boardState, currentPlayer, passedLastTurn) {
      return JSON.stringify(boardState) + "_" + currentPlayer + "_" + passedLastTurn;
   }

   getBoardStateKey() {
      return this.boardStateKey;
   }

   toSerializableObject() {
      const serializableChildren = {};
      for (const moveKey in this.children) {
         if (Object.prototype.hasOwnProperty.call(this.children, moveKey)) {
            serializableChildren[moveKey] = this.children[moveKey].toSerializableObject();
         }
      }
      return {
         boardState: this.boardState,
         currentPlayer: this.currentPlayer,
         move: this.move,
         visits: this.visitCount,
         wins: this.winCount,
         children: serializableChildren,
         depth: this.depth,
         passedLastTurn: this.passedLastTurn,
      };
   }

   static fromSerializableObject(obj) {
      const node = new MergeMCTSNode(
         obj.boardState,
         obj.currentPlayer,
         obj.move,
         obj.depth,
         obj.passedLastTurn !== undefined ? obj.passedLastTurn : false
      );
      node.winCount = obj.wins;
      node.visitCount = obj.visits;
      for (const moveKey in obj.children) {
         if (Object.prototype.hasOwnProperty.call(obj.children, moveKey)) {
            node.children[moveKey] = MergeMCTSNode.fromSerializableObject(obj.children[moveKey]);
         }
      }
      return node;
   }

   merge(otherNode) {
      if (!otherNode) return;
      this.wins += otherNode.wins;
      this.visitCount += otherNode.visitCount;
      for (const moveStr in otherNode.children) {
         if (Object.prototype.hasOwnProperty.call(otherNode.children, moveStr)) {
            const otherChild = otherNode.children[moveStr];
            if (this.children[moveStr]) {
               this.children[moveStr].merge(otherChild);
            } else {
               this.children[moveStr] = MergeMCTSNode.fromSerializableObject(otherChild.toSerializableObject());
            }
         }
      }
   }
}

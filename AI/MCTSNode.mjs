export class MCTSNode {
   constructor(boardState, currentPlayer, parent = null, move = null) {
      this.boardState = boardState;
      this.currentPlayer = currentPlayer;
      this.parent = parent;
      this.move = move;
      this.visits = 0;
      this.wins = 0;
      this.children = {};
      this._legalMoves = null;
   }

   getLegalMoves(gameBoardInstance) {
      if (this._legalMoves === null) {
         const originalBoardState = gameBoardInstance.getBoardState();
         const originalPlayer = gameBoardInstance.currentPlayer;
         gameBoardInstance.setBoardState(this.boardState, this.currentPlayer);
         this._legalMoves = gameBoardInstance.getLegalMoves();

         if (this._legalMoves.length === 0) {
            const nextPlayer = this.currentPlayer === 1 ? -1 : 1;
            gameBoardInstance.setBoardState(this.boardState, nextPlayer); // 相手の盤面でチェック
            const opponentLegalMoves = gameBoardInstance.getLegalMoves();
            if (opponentLegalMoves.length === 0) {
            } else {
               this._legalMoves = [null];
            }
         }
         gameBoardInstance.setBoardState(originalBoardState, originalPlayer); // 元に戻す
      }
      return this._legalMoves;
   }

   isFullyExpanded(gameBoardInstance) {
      return this.getLegalMoves(gameBoardInstance).length === Object.keys(this.children).length;
   }

   bestChild(C_param = Math.sqrt(100)) {
      let bestScore = -Infinity;
      let bestMove = null;

      for (const moveStr in this.children) {
         const child = this.children[moveStr];
         if (child.visits === 0) return JSON.parse(moveStr);

         const exploitation = child.wins / child.visits;
         const exploration = C_param * Math.sqrt(Math.log(this.visits) / child.visits);
         const ucbScore = exploitation + exploration;

         if (ucbScore > bestScore) {
            bestScore = ucbScore;
            bestMove = JSON.parse(moveStr);
         }
      }
      return bestMove;
   }

   toSerializableObject() {
      const serializableChildren = {};
      for (const moveStr in this.children) {
         serializableChildren[moveStr] = this.children[moveStr].toSerializableObject();
      }

      return {
         boardState: this.boardState,
         currentPlayer: this.currentPlayer,
         move: this.move,
         visits: this.visits,
         wins: this.wins,
         children: serializableChildren,
      };
   }

   static fromSerializableObject(obj, parent = null) {
      const node = new MCTSNode(obj.boardState, obj.currentPlayer, parent, obj.move);
      node.visits = obj.visits;
      node.wins = obj.wins;

      for (const moveStr in obj.children) {
         node.children[moveStr] = MCTSNode.fromSerializableObject(obj.children[moveStr], node);
      }
      return node;
   }
}

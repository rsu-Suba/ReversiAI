import { MCTSNode } from "./AI/MCTSNode.mjs";

export class MCTS {
   constructor(gameBoardInstance) {
      this.gameBoard = gameBoardInstance;
      this.root = null;
   }

   run(initialBoardState, initialPlayer, numSimulations) {
      this.root = new MCTSNode(initialBoardState, initialPlayer);
      for (let i = 0; i < numSimulations; i++) {
         this.gameBoard.setBoardState(this.root.boardState, this.root.currentPlayer);
         let node = this.select(this.root);
         let winner;
         if (this.gameBoard.isGameOver()) {
            winner = this.gameBoard.getWinner();
         } else {
            node = this.expand(node);
            winner = this.simulate(node);
         }
         this.backpropagate(node, winner);
      }

      let bestMove = null;
      let maxVisits = -1;
      if (Object.keys(this.root.children).length === 0) return null;

      for (const moveStr in this.root.children) {
         const child = this.root.children[moveStr];
         if (child.visits > maxVisits) {
            maxVisits = child.visits;
            bestMove = JSON.parse(moveStr);
         }
      }
      return bestMove;
   }

   select(node) {
      while (!this.gameBoard.isGameOver() && node.isFullyExpanded(this.gameBoard)) {
         const bestChildMove = node.bestChild();
         node = node.children[JSON.stringify(bestChildMove)];

         this.gameBoard.setBoardState(node.boardState, node.currentPlayer);
      }
      return node;
   }

   expand(node) {
      if (this.gameBoard.isGameOver()) return node;

      const legalMoves = node.getLegalMoves(this.gameBoard);
      const unexpandedMoves = legalMoves.filter((move) => !(JSON.stringify(move) in node.children));

      if (unexpandedMoves.length === 0) return node;

      const moveToExpand = unexpandedMoves[Math.floor(Math.random() * unexpandedMoves.length)];

      const nextBoard = new this.gameBoard.constructor();
      nextBoard.setBoardState(node.boardState, node.currentPlayer);
      nextBoard.applyMove(moveToExpand);

      const newNode = new MCTSNode(nextBoard.getBoardState(), nextBoard.currentPlayer, node, moveToExpand);
      node.children[JSON.stringify(moveToExpand)] = newNode;

      this.gameBoard.setBoardState(newNode.boardState, newNode.currentPlayer);

      return newNode;
   }

   simulate(node) {
      const simulationBoard = new this.gameBoard.constructor();
      simulationBoard.setBoardState(node.boardState, node.currentPlayer);

      while (!simulationBoard.isGameOver()) {
         const legalMoves = simulationBoard.getLegalMoves();

         if (legalMoves.length === 0) {
            simulationBoard.applyMove(null);
         } else {
            const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            simulationBoard.applyMove(randomMove);
         }
      }

      return simulationBoard.getWinner();
   }

   backpropagate(node, winner) {
      let currentNode = node;
      while (currentNode !== null) {
         currentNode.visits++;

         if (winner === this.root.currentPlayer) {
            currentNode.wins++;
         } else if (winner === (this.root.currentPlayer === 1 ? -1 : 1)) {
            currentNode.wins--;
         }

         currentNode = currentNode.parent;
      }
   }
}

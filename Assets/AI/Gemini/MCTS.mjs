import { MCTSNode } from "./MCTSNode.mjs";
import * as fs from "fs/promises";

export class MCTS {
   constructor(gameBoardInstance) {
      this.gameBoard = gameBoardInstance;
      this.root = null;
   }

   run(currentBoardState, currentPlayer, numSimulations) {
      if (
         !this.root ||
         JSON.stringify(this.root.boardState) !== JSON.stringify(currentBoardState) ||
         this.root.currentPlayer !== currentPlayer
      ) {
         console.log("MCTS.run: MCTS root node mismatch. Setting root to current game state.");
         this.root = new MCTSNode(currentBoardState, currentPlayer);
      }
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

   updateRoot(move) {
      if (!this.root) {
         console.warn("Can't update root");
         return;
      }
      const moveStr = JSON.stringify(move);
      if (this.root.children[moveStr]) {
         this.root = this.root.children[moveStr];
         this.root.parent = null;
         //console.log(`MCTS root updated : ${moveStr}`);
      } else {
         console.warn(`Move ${moveStr} 404 in MCTS tree`);
         this.gameBoard.setBoardState(this.root.boardState, this.root.currentPlayer);
         if (move !== null) {
            this.gameBoard.applyMove(move);
         } else {
            this.gameBoard.applyMove(null);
         }
         this.root = new MCTSNode(this.gameBoard.getBoardState(), this.gameBoard.currentPlayer);
      }
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

         if (winner === currentNode.currentPlayer) {
            currentNode.wins++;
         } else if (winner === (currentNode.currentPlayer === 1 ? -1 : 1)) {
            currentNode.wins--;
         }

         currentNode = currentNode.parent;
      }
   }

   async saveTree(filePath) {
      if (!this.root) {
         console.warn("MCTS Tree empty.");
         return;
      }
      try {
         const serializableRoot = this.root.toSerializableObject();
         const jsonString = JSON.stringify(serializableRoot, null, 4);
         await fs.writeFile(filePath, jsonString, "utf8");
         console.log(`MCTS Tree saved -> ${filePath}`);
      } catch (error) {
         console.error(`Error: ${filePath}`, error);
      }
   }

   async loadTree(filePath) {
      try {
         const jsonString = await fs.readFile(filePath, "utf8");
         const serializableRoot = JSON.parse(jsonString);
         this.root = MCTSNode.fromSerializableObject(serializableRoot);
         console.log(`MCTS Tree loaded <- ${filePath}`);
         return true;
      } catch (error) {
         if (error.code === "ENOENT") {
            console.warn(`MCTS Tree 404: ${filePath}`);
         } else {
            console.error(`Error: ${filePath}`, error);
         }
         this.root = null;
         return false;
      }
   }
}

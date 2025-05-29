import { MCTSNode } from "./GeminiMCTSNode.mjs";
import * as fs from "fs/promises";
import { OthelloBoard } from "./GeminiOthelloBoard.mjs";
import { decode, Encoder } from "@msgpack/msgpack";

export class MCTS {
   constructor(rng = Math.random) {
      this.nodeMap = new Map();
      this.persistentRoot = null;
      this.currentRoot = null;
      this.simGameBoard = new OthelloBoard();
      this.rng = rng;
   }

   async loadTree(filePath) {
      try {
         const buffer = await fs.readFile(filePath);
         const serializableRoot = decode(buffer);

         if (!serializableRoot) {
            console.warn(`MCTS Tree loaded from ${filePath} was empty. Starting fresh.`);
            this.nodeMap.clear();
            this.persistentRoot = null;
            this.currentRoot = null;
            return false;
         }
         this.persistentRoot = MCTSNode.fromSerializableObject(serializableRoot);
         this.currentRoot = this.persistentRoot;
         this._rebuildNodeMap(this.persistentRoot);

         console.log(`MCTS Tree loaded <- ${filePath} with ${this.nodeMap.size} nodes.`);
         return true;
      } catch (error) {
         if (error.code === "ENOENT") {
            console.warn(`MCTS Tree 404: ${filePath} (creating new tree)`);
         } else {
            console.error(`Error loading MCTS Tree from ${filePath}:`, error);
         }
         this.nodeMap.clear();
         this.persistentRoot = null;
         this.currentRoot = null;
         return false;
      }
   }

   _rebuildNodeMap(rootNode) {
      this.nodeMap.clear();
      if (!rootNode) return;
      const queue = [rootNode];
      const visitedKeys = new Set();

      while (queue.length > 0) {
         const node = queue.shift();
         if (!node) continue;
         const boardKey = JSON.stringify(node.boardState) + "_" + node.player;
         if (!visitedKeys.has(boardKey)) {
            this.nodeMap.set(boardKey, node);
            visitedKeys.add(boardKey);
         }
         for (const childNode of Object.values(node.children)) {
            if (childNode instanceof MCTSNode) {
               queue.push(childNode);
            }
         }
      }
   }

   async saveTree(filePath) {
      if (!this.persistentRoot) {
         console.warn("MCTS Tree is empty. Nothing to save.");
         return false;
      }
      try {
         const serializableRoot = this.persistentRoot.toSerializableObject();
         const encoder = new Encoder({ maxDepth: 200 });
         const encoded = encoder.encode(serializableRoot);
         await fs.writeFile(filePath, encoded);
         console.log(`MCTS Tree saved -> ${filePath}`);
         return true;
      } catch (error) {
         console.error(`Error saving MCTS Tree to ${filePath}:`, error);
         return false;
      }
   }

   run(currentBoardState, currentPlayer, numSimulations) {
      if (!this.persistentRoot) {
         const initialBoard = new OthelloBoard();
         this.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
         this.currentRoot = this.persistentRoot;
      } else if (
         !this.currentRoot ||
         JSON.stringify(this.currentRoot.boardState) !== JSON.stringify(currentBoardState) ||
         this.currentRoot.currentPlayer !== currentPlayer
      ) {
         // find correct node
         let foundNode = this.findNodeByState(this.persistentRoot, currentBoardState, currentPlayer);
         if (foundNode) {
            this.currentRoot = foundNode;
         } else {
            // create new node
            this.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
         }
      }

      for (let i = 0; i < numSimulations; i++) {
         this.simGameBoard.setBoardState(this.currentRoot.boardState, this.currentRoot.currentPlayer);
         let selectedNode = this.select(this.currentRoot);
         let expandedNode = selectedNode;
         if (!this.simGameBoard.isGameOver()) {
            expandedNode = this.expand(selectedNode);
         }
         this.simGameBoard.setBoardState(expandedNode.boardState, expandedNode.currentPlayer);
         let winner = this.simulate(expandedNode);
         this.backpropagate(expandedNode, winner);
      }
      let bestMove = null;
      let maxVisits = -1;

      this.simGameBoard.setBoardState(currentBoardState, currentPlayer);
      const legalMovesForCurrentState = this.simGameBoard.getLegalMoves();
      if (legalMovesForCurrentState.length === 0) {
         return null; //can't plot pass
      }
      if (Object.keys(this.currentRoot.children).length === 0) {
         return legalMovesForCurrentState[Math.floor(this.rng() * legalMovesForCurrentState.length)];
      }
      for (const moveStr in this.currentRoot.children) {
         const child = this.currentRoot.children[moveStr];
         if (child.visits > maxVisits) {
            maxVisits = child.visits;
            bestMove = JSON.parse(moveStr);
         }
      }
      return bestMove;
   }

   findNodeByState(startNode, targetBoardState, targetPlayer) {
      const targetBoardString = JSON.stringify(targetBoardState);
      const queue = [startNode];
      const visited = new Set();
      while (queue.length > 0) {
         const tempNode = queue.shift();
         if (JSON.stringify(tempNode.boardState) === targetBoardString && tempNode.currentPlayer === targetPlayer) {
            return tempNode;
         }
         if (visited.has(tempNode)) {
            continue;
         }
         visited.add(tempNode);
         for (const moveStr in tempNode.children) {
            const child = tempNode.children[moveStr];
            if (child instanceof MCTSNode) {
               queue.push(child);
            }
         }
      }
      return null;
   }

   select(node) {
      while (!this.simGameBoard.isGameOver() && node.isFullyExpanded(this.simGameBoard)) {
         const bestChildMove = node.bestChild(1.4, this.rng);
         if (!bestChildMove) {
            break;
         }
         node = node.children[JSON.stringify(bestChildMove)];
         this.simGameBoard.setBoardState(node.boardState, node.currentPlayer);
      }
      return node;
   }

   expand(node) {
      const maxTreeDepth = 60;
      if (node.depth >= maxTreeDepth) {
         return node;
      }
      this.simGameBoard.setBoardState(node.boardState, node.currentPlayer);
      if (this.simGameBoard.isGameOver()) return node;
      const legalMoves = this.simGameBoard.getLegalMoves();
      const unexpandedMoves = legalMoves.filter((move) => !(JSON.stringify(move) in node.children));
      if (unexpandedMoves.length === 0) {
         return node;
      }
      const moveToExpand = unexpandedMoves[Math.floor(this.rng() * unexpandedMoves.length)]; // ★
      const nextBoard = new OthelloBoard();
      nextBoard.setBoardState(node.boardState, node.currentPlayer);
      nextBoard.applyMove(moveToExpand);
      const newNode = new MCTSNode(nextBoard.getBoardState(), nextBoard.currentPlayer, node, moveToExpand);
      node.children[JSON.stringify(moveToExpand)] = newNode;
      this.simGameBoard.setBoardState(newNode.boardState, newNode.currentPlayer);

      return newNode;
   }

   simulate(node) {
      const simulationBoard = new OthelloBoard();
      const maxSimulationDepth = 60;
      let currentSimulationDepth = 0;
      simulationBoard.setBoardState(node.boardState, node.currentPlayer);
      while (!simulationBoard.isGameOver() && currentSimulationDepth < maxSimulationDepth) {
         const legalMoves = simulationBoard.getLegalMoves();
         if (legalMoves.length === 0) {
            simulationBoard.applyMove(null);
         } else {
            const randomMove = legalMoves[Math.floor(this.rng() * legalMoves.length)];
            simulationBoard.applyMove(randomMove);
         }
         currentSimulationDepth++;
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

   updateRoot(move) {
      if (!this.currentRoot) {
         console.error("updateRoot called but currentRoot is null.");
         return;
      }
      let nextRootNode = null;
      if (move !== null) {
         const moveStr = JSON.stringify(move);
         if (this.currentRoot.children[moveStr]) {
            nextRootNode = this.currentRoot.children[moveStr];
         } else {
            const nextBoard = new OthelloBoard();
            nextBoard.setBoardState(this.currentRoot.boardState, this.currentRoot.currentPlayer);
            nextBoard.applyMove(move);
            nextRootNode = new MCTSNode(nextBoard.getBoardState(), nextBoard.currentPlayer, this.currentRoot, move);
            this.currentRoot.children[moveStr] = nextRootNode;
         }
      }
      if (nextRootNode) {
         this.currentRoot = nextRootNode;
      }
   }
}

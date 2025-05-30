import { MCTSNode } from "./MCTSNode.mjs";
import * as fs from "fs/promises";
import { OthelloBoard } from "./OthelloBoard.mjs";
import { decode, Encoder } from "@msgpack/msgpack";
import seedrandom from "seedrandom";

export class MCTS {
   constructor(cP = 1.4, rng = Math.random) {
      this.persistentRoot = null;
      this.currentRoot = null;
      this.simGameBoard = new OthelloBoard();
      this.rng = rng;
      this.nodeMap = new Map();
      this.shouldStopSimulations = false;
      this.cP = cP;
   }

   requestStop() {
      this.shouldStopSimulations = true;
   }

   async loadTree(filePath) {
      try {
         const buffer = await fs.readFile(filePath);
         const serializableRoot = decode(buffer);
         this.persistentRoot = MCTSNode.fromSerializableObject(serializableRoot);
         this.currentRoot = this.persistentRoot;
         this._rebuildNodeMap(this.persistentRoot);
         return true;
      } catch (error) {
         console.error(`Error loading MCTS Tree from ${filePath}:`, error);
         this.persistentRoot = null;
         this.currentRoot = null;
         this.nodeMap.clear();
         return false;
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
         return true;
      } catch (error) {
         console.error(`Error saving MCTS Tree to ${filePath}:`, error);
         return false;
      }
   }

   _rebuildNodeMap(rootNode) {
      this.nodeMap.clear();
      const queue = [rootNode];
      while (queue.length > 0) {
         const node = queue.shift();
         const boardKey = JSON.stringify(node.boardState) + "_" + node.currentPlayer;
         this.nodeMap.set(boardKey, node);
         for (const moveStr in node.children) {
            queue.push(node.children[moveStr]);
         }
      }
   }

   run(currentBoardState, currentPlayer, numSimulations) {
      this.shouldStopSimulations = false;
      const boardKey = JSON.stringify(currentBoardState) + "_" + currentPlayer;

      let initialNode = this.nodeMap.get(boardKey);
      if (initialNode) {
         this.currentRoot = initialNode;
      } else {
         this.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
         this.nodeMap.set(boardKey, this.currentRoot);
         if (!this.persistentRoot) {
            this.persistentRoot = this.currentRoot;
         }
      }

      for (let i = 0; i < numSimulations; i++) {
         if (this.shouldStopSimulations) {
            console.log("MCTS.run: Stopping simulations early due as requested.");
            break;
         }
         this.simGameBoard.setBoardState(this.currentRoot.boardState, this.currentRoot.currentPlayer);
         let selectedNode = this.select(this.currentRoot);
         let expandedNode = selectedNode;
         if (!this.simGameBoard.isGameOver()) {
            expandedNode = this.expand(selectedNode);
         }
         this.simGameBoard.setBoardState(expandedNode.boardState, expandedNode.currentPlayer);
         const simulationResult = this.simulate(expandedNode);
         this.backpropagate(expandedNode, simulationResult.winner, simulationResult.scores);
      }

      let bestMove = null;
      let maxScore = -Infinity;

      this.simGameBoard.setBoardState(currentBoardState, currentPlayer);
      const legalMovesForCurrentState = this.simGameBoard.getLegalMoves();

      if (legalMovesForCurrentState.length === 0) return null;
      if (Object.keys(this.currentRoot.children).length === 0) {
         return legalMovesForCurrentState[Math.floor(this.rng() * legalMovesForCurrentState.length)];
      }

      for (const moveStr in this.currentRoot.children) {
         if (Object.prototype.hasOwnProperty.call(this.currentRoot.children, moveStr)) {
            const child = this.currentRoot.children[moveStr];
            const winRate = child.visits > 0 ? child.wins / child.visits : -Infinity;
            if (winRate > maxScore) {
               maxScore = winRate;
               bestMove = JSON.parse(moveStr);
            }
         }
      }

      if (!bestMove && legalMovesForCurrentState.length > 0) {
         console.warn("MCTS.run: No best move found among children, picking a random legal move.");
         bestMove = legalMovesForCurrentState[Math.floor(this.rng() * legalMovesForCurrentState.length)];
      }

      return bestMove;
   }

   select(node) {
      while (!this.simGameBoard.isGameOver() && node.isFullyExpanded(this.simGameBoard)) {
         const bestChildMove = node.bestChild(this.cP, this.rng);
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
      if (node.depth >= maxTreeDepth) return node;

      this.simGameBoard.setBoardState(node.boardState, node.currentPlayer);
      if (this.simGameBoard.isGameOver()) return node;

      const legalMoves = this.simGameBoard.getLegalMoves();
      const unexpandedMoves = legalMoves.filter((move) => !(JSON.stringify(move) in node.children));
      if (unexpandedMoves.length === 0) return node;

      const moveToExpand = unexpandedMoves[Math.floor(this.rng() * unexpandedMoves.length)];
      const nextBoard = new OthelloBoard();
      nextBoard.setBoardState(node.boardState, node.currentPlayer);
      nextBoard.applyMove(moveToExpand);

      const newNode = new MCTSNode(nextBoard.getBoardState(), nextBoard.currentPlayer, node, moveToExpand);
      node.children[JSON.stringify(moveToExpand)] = newNode;
      this.nodeMap.set(JSON.stringify(newNode.boardState) + "_" + newNode.currentPlayer, newNode);
      this.simGameBoard.setBoardState(newNode.boardState, newNode.currentPlayer);

      return newNode;
   }

   simulate(node) {
      const simulationBoard = new OthelloBoard();
      simulationBoard.setBoardState(node.boardState, node.currentPlayer);

      const maxSimulationDepth = 60;
      let currentSimulationDepth = 0;

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
      const scores = simulationBoard.getScores();
      const winner = simulationBoard.getWinner();

      return { winner: winner, scores: scores };
   }

   backpropagate(node, winner, scores) {
      let currentNode = node;
      while (currentNode !== null) {
         currentNode.visits++;

         let reward = 0;
         const blackStones = scores.black;
         const whiteStones = scores.white;

         if (winner === currentNode.player) {
            reward++;
            if (currentNode.player === 1) {
               reward = (blackStones - whiteStones) / 64;
            } else {
               reward = (whiteStones - blackStones) / 64;
            }
         } else if (winner === 0) {
            reward = 0;
         } else {
            reward--;
            if (currentNode.player === 1) {
               reward = (blackStones - whiteStones) / 64;
            } else {
               reward = (whiteStones - blackStones) / 64;
            }
         }
         currentNode.wins += reward;
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
            this.nodeMap.set(JSON.stringify(nextRootNode.boardState) + "_" + nextRootNode.currentPlayer, nextRootNode);
         }
      }
      if (nextRootNode) {
         this.currentRoot = nextRootNode;
      }
   }

   mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2) {
      if (this.persistentRoot && workerRootNodeAI1) {
         this.persistentRoot.merge(workerRootNodeAI1);
      } else if (workerRootNodeAI1) {
         this.persistentRoot = workerRootNodeAI1;
      }

      // workerRandom.mjs では AI2 (ランダムボット) のツリーデータは null が送信されるため、
      // workerRootNodeAI2 が存在しない可能性が高いです。
      // もし存在すればマージを試みるが、基本的には AI1 のツリーのみをマージします。
      if (this.persistentRoot && workerRootNodeAI2) {
         this.persistentRoot.merge(workerRootNodeAI2);
      } else if (workerRootNodeAI2) {
         // persistentRoot がなく、AI2のツリーがある場合 (通常は発生しない想定)
         this.persistentRoot = workerRootNodeAI2;
      }
      this._rebuildNodeMap(this.persistentRoot);
   }
}

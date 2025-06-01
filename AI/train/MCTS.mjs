import { MCTSNode } from "./MCTSNode.mjs";
import { OthelloBoard } from "./OthelloBoard.mjs";
import { config } from "./config.mjs";
import { decode, Encoder } from "@msgpack/msgpack";
import { parentPort  } from "worker_threads";
import seedrandom from "seedrandom";
import * as fs from "fs/promises";

export class MCTS {
   constructor(cP = config.cP, rng = Math.random, workerSlotId = "unknown") {
      this.persistentRoot = null;
      this.currentRoot = null;
      this.simGameBoard = new OthelloBoard();
      this.rng = rng;
      this.nodeMap = new Map();
      this.shouldStopSimulations = false;
      this.cP = cP;
      this.lastTurnPassedState = false;
      this.workerSlotId = workerSlotId;
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
         this.currentRoot = new MCTSNode(currentBoardState, currentPlayer, null, null, 0, this.lastTurnPassedState);
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
         if (i % 10 === 0) {
            const memoryUsage = process.memoryUsage();
            const heapUsed = memoryUsage.heapUsed;
            const thresholdBytes = config.Mem_Heap_Size * 1024 * 1024 * config.Mem_Worker_Threshold_Per;
            if (parentPort) {
               parentPort.postMessage({
                  type: "worker_status_update",
                  workerSlotId: this.workerSlotId,
                  heapUsedMB: Math.floor(heapUsed / 1024 / 1024),
               });
            }
            if (heapUsed > thresholdBytes) {
               console.warn(
                  `W${this.workerSlotId}: MCTS.run internal memory limit over. Current: ${Math.floor(
                     heapUsed / 1024 / 1024
                  )}MB. Threshold: ${Math.floor(thresholdBytes / 1024 / 1024)}MB.`
               );
               this.shouldStopSimulations = true;
               break;
            }
         }
         this.simGameBoard.setBoardState(
            this.currentRoot.boardState,
            this.currentRoot.currentPlayer,
            this.currentRoot.passedLastTurn
         );
         let selectedNode = this.select(this.currentRoot);
         let expandedNode = selectedNode;
         if (!this.simGameBoard.isGameOver()) {
            expandedNode = this.expand(selectedNode);
         }
         this.simGameBoard.setBoardState(
            expandedNode.boardState,
            expandedNode.currentPlayer,
            expandedNode.passedLastTurn
         );
         const simulationResult = this.simulate(expandedNode);
         this.backpropagate(expandedNode, simulationResult.winner, simulationResult.scores);
      }

      let bestMove = null;
      let maxScore = -Infinity;

      this.simGameBoard.setBoardState(
         this.currentRoot.boardState,
         this.currentRoot.currentPlayer,
         this.currentRoot.passedLastTurn
      );
      const legalMovesForCurrentState = this.simGameBoard.getLegalMoves();
      if (legalMovesForCurrentState.length === 0) return null;

      if (Object.keys(this.currentRoot.children).length === 0) {
         console.warn("MCTS.run: Root node has no children after simulations. Picking a random legal move.");
         return legalMovesForCurrentState[Math.floor(this.rng() * legalMovesForCurrentState.length)];
      }

      for (const moveStr in this.currentRoot.children) {
         if (Object.prototype.hasOwnProperty.call(this.currentRoot.children, moveStr)) {
            const child = this.currentRoot.children[moveStr];
            const uctScore =
               child.visits === 0
                  ? Infinity
                  : child.wins / child.visits + this.cP * Math.sqrt(Math.log(this.currentRoot.visits) / child.visits);

            if (uctScore > maxScore) {
               maxScore = uctScore;
               bestMove = JSON.parse(moveStr);
            } else if (uctScore === maxScore) {
               if (this.rng() < 0.5) {
                  bestMove = JSON.parse(moveStr);
               }
            }
         }
      }

      if (bestMove === null) {
         console.warn("MCTS.run: No best move found among children after UCT selection. Picking a random legal move.");
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
         this.simGameBoard.setBoardState(node.boardState, node.currentPlayer, node.passedLastTurn);
      }
      return node;
   }

   expand(node) {
      const maxTreeDepth = 60;
      if (node.depth >= maxTreeDepth) return node;

      this.simGameBoard.setBoardState(node.boardState, node.currentPlayer, node.passedLastTurn);
      if (this.simGameBoard.isGameOver()) return node;

      const legalMoves = this.simGameBoard.getLegalMoves();
      const unexpandedMoves = legalMoves.filter((move) => !(JSON.stringify(move) in node.children));
      if (unexpandedMoves.length === 0) return node;

      const moveToExpand = unexpandedMoves[Math.floor(this.rng() * unexpandedMoves.length)];
      const nextBoard = new OthelloBoard();
      nextBoard.setBoardState(node.boardState, node.currentPlayer, node.passedLastTurn);
      nextBoard.applyMove(moveToExpand);

      const newNode = new MCTSNode(
         nextBoard.getBoardState(),
         nextBoard.currentPlayer,
         node,
         moveToExpand,
         node.depth + 1,
         nextBoard.passedLastTurn
      );
      node.children[JSON.stringify(moveToExpand)] = newNode;
      this.nodeMap.set(JSON.stringify(newNode.boardState) + "_" + newNode.currentPlayer, newNode);
      this.simGameBoard.setBoardState(newNode.boardState, newNode.currentPlayer, newNode.passedLastTurn);

      return newNode;
   }

   simulate(node) {
      const simulationBoard = new OthelloBoard();
      simulationBoard.setBoardState(node.boardState, node.currentPlayer, node.passedLastTurn);

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

         const blackStones = scores.black;
         const whiteStones = scores.white;

         let winLossReward = 0;
         if (winner === currentNode.currentPlayer) {
            winLossReward = 1;
         } else if (winner === -currentNode.currentPlayer) {
            winLossReward = -1;
         } else if (winner === 0) {
            winLossReward = -0.5;
         } else {
            winLossReward = 0;
         }

         let stoneDiffReward = 0;
         if (currentNode.currentPlayer === 1) {
            stoneDiffReward = (blackStones - whiteStones) / 64;
         } else {
            stoneDiffReward = (whiteStones - blackStones) / 64;
         }

         const finalReward = (winLossReward * 2 + stoneDiffReward * 1) / 3;

         currentNode.wins += finalReward;
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
            nextBoard.setBoardState(
               this.currentRoot.boardState,
               this.currentRoot.currentPlayer,
               this.currentRoot.passedLastTurn
            );
            nextBoard.applyMove(move);
            nextRootNode = new MCTSNode(
               nextBoard.getBoardState(),
               nextBoard.currentPlayer,
               this.currentRoot,
               move,
               this.currentRoot.depth + 1,
               nextBoard.passedLastTurn
            );
            this.currentRoot.children[moveStr] = nextRootNode;
            this.nodeMap.set(
               JSON.stringify(nextRootNode.boardState) +
                  "_" +
                  nextRootNode.currentPlayer +
                  "_" +
                  nextRootNode.passedLastTurn,
               nextRootNode
            );
         }
      }
      if (nextRootNode) {
         this.currentRoot = nextRootNode;
      }
   }

   mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2) {
      if (workerRootNodeAI1) {
         if (!this.persistentRoot) {
            this.persistentRoot = workerRootNodeAI1;
            console.log(`MCTS: New root.`);
         } else {
            this.persistentRoot.merge(workerRootNodeAI1);
         }
      }

      if (workerRootNodeAI2) {
         if (!this.persistentRoot) {
            this.persistentRoot = workerRootNodeAI2;
            console.log(`MCTS: New root.`);
         } else {
            this.persistentRoot.merge(workerRootNodeAI2);
         }
      }

      const finalBeforeRebuildNodes = this.nodeMap.size;
      this._rebuildNodeMap(this.persistentRoot);
      console.log(`MCTS: Node merged ${finalBeforeRebuildNodes} -> ${this.nodeMap.size}`);
   }
}

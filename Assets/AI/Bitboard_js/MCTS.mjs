import { MCTSNode } from "./MCTSNode.mjs";
import { OthelloBoard } from "./OthelloBoard.mjs";
import { decode, Encoder } from "@msgpack/msgpack";
import * as fs from "fs/promises";
import fetch from "node-fetch";
import { config } from "./config.mjs";

const API_URL = "http://localhost:5000/predict";

export class MCTS {
   constructor(cP, rng) {
      this.cP = cP;
      this.rng = rng || Math.random;
      this.nodeMap = new Map();
      this.simGameBoard = new OthelloBoard();
      this.root = new MCTSNode(OthelloBoard.blackInitBoard, OthelloBoard.whiteInitBoard, 1);
      this.nodeMap.set(this.root.getBoardStateKey(), this.root);
   }

   async getPrediction(board) {
      try {
         const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               blackBoard: board.blackBoard.toString(16),
               whiteBoard: board.whiteBoard.toString(16),
               currentPlayer: board.currentPlayer,
            }),
         });
         if (!response.ok) return null;
         return await response.json();
      } catch (error) {
         console.error("API call failed:", error.message);
         return null;
      }
   }

   async saveTree(filePath) {
      try {
         const serializableRoot = this.root.toSerializableObject();
         const encoder = new Encoder({ maxDepth: 500 });
         const encoded = encoder.encode(serializableRoot);
         await fs.writeFile(filePath, encoded);
         return true;
      } catch (error) {
         console.error(`Error saving MCTS tree to ${filePath}:`, error);
         return false;
      }
   }

   async loadTree(filePath) {
      try {
         const buffer = await fs.readFile(filePath);
         const serializableRoot = decode(buffer);
         this.root = MCTSNode.fromSerializableObject(serializableRoot);
         this._rebuildNodeMap(this.root);
         return true;
      } catch (error) {
         console.error(`Failed to load tree from ${filePath}:`, error);
         return false;
      }
   }

   _rebuildNodeMap(rootNode) {
      this.nodeMap.clear();
      if (!rootNode) return;
      const queue = [rootNode];
      while (queue.length > 0) {
         const node = queue.shift();
         const key = node.getBoardStateKey();
         if (!this.nodeMap.has(key)) {
            this.nodeMap.set(key, node);
            for (const move in node.children) {
               queue.push(node.children[move]);
            }
         }
      }
   }

   getSerializableTree() {
      if (this.root) {
         return this.root.toSerializableObject();
      }
      return null;
   }

   async run(blackBoard, whiteBoard, currentPlayer, passedLastTurn, numSimulations, turnCount) {
      const timeLimit = 30000;
      const startTime = Date.now();
      const boardKey = `${blackBoard.toString(16)}_${whiteBoard.toString(16)}_${currentPlayer}`;
      let rootNode = this.nodeMap.get(boardKey);

      if (!rootNode) {
         rootNode = new MCTSNode(blackBoard, whiteBoard, currentPlayer);
         this.nodeMap.set(boardKey, rootNode);
      }

      const prediction = await this.getPrediction(rootNode);
      if (prediction) {
         this.simGameBoard.setBoardState(rootNode.blackBoard, rootNode.whiteBoard, rootNode.currentPlayer);
         const legalMoves = this.simGameBoard.getLegalMoves();
         const noise = this.dirichletNoise(legalMoves.length);
         const noisyPolicy = [...prediction.policy];
         legalMoves.forEach((move, index) => {
            const moveIndex = move[0] * 8 + move[1];
            noisyPolicy[moveIndex] = noisyPolicy[moveIndex] * 0.75 + noise[index] * 0.25;
         });

         this.expand(rootNode, noisyPolicy);
      } else {
         console.error("Initial prediction failed. Cannot start MCTS.");
         return null;
      }

      for (let i = 0; i < numSimulations; i++) {
         /*
         if (Date.now() - startTime > timeLimit) {
            console.warn(`MCTS >${timeLimit}ms. Finishing move.`);
            break;
         }
            */
         let node = this.select(rootNode);
         this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
         let value;
         if (this.simGameBoard.isGameOver()) {
            const winner = this.simGameBoard.getWinner();
            value = winner === 0 ? 0.0 : winner === node.currentPlayer ? 1.0 : -1.0;
         } else {
            const leafPrediction = await this.getPrediction(this.simGameBoard);
            if (leafPrediction) {
               value = leafPrediction.value;
               this.expand(node, leafPrediction.policy);
            } else {
               value = 0;
            }
         }
         this.backpropagate(node, value);
      }
      if (Object.keys(rootNode.children).length === 0) return null;
      const temperature = turnCount < config.temperatureThreshold ? config.temperature : 0.01;
      let bestMove = null;
      if (temperature === 0) {
         let maxVisits = -1;
         for (const move in rootNode.children) {
            const child = rootNode.children[move];
            if (child.visits > maxVisits) {
               maxVisits = child.visits;
               bestMove = BigInt(move);
            }
         }
      } else {
         const moves = [];
         const visitCounts = [];
         for (const move in rootNode.children) {
            moves.push(BigInt(move));
            visitCounts.push(rootNode.children[move].visits);
         }
         const probabilities = visitCounts.map((v) => Math.pow(v, 1 / temperature));
         const sumProbabilities = probabilities.reduce((a, b) => a + b, 0);
         if (sumProbabilities === 0) {
            bestMove = moves[Math.floor(this.rng() * moves.length)];
         } else {
            const normalizedProbabilities = probabilities.map((p) => p / sumProbabilities);
            let cumulativeProbability = 0;
            const randomValue = this.rng();
            for (let i = 0; i < moves.length; i++) {
               cumulativeProbability += normalizedProbabilities[i];
               if (randomValue < cumulativeProbability) {
                  bestMove = moves[i];
                  break;
               }
            }
            if (bestMove === null && moves.length > 0) {
               bestMove = moves[moves.length - 1];
            }
         }
      }
      return bestMove;
   }

   select(rootNode) {
      let node = rootNode;
      let path = [node.getBoardStateKey()];

      while (true) {
         this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
         const bestChildMove = node.bestChild(this.cP, this.rng);
         if (this.simGameBoard.isGameOver() || !node.isFullyExpanded(this.simGameBoard) || bestChildMove === null) {
            break;
         }
         node = node.children[bestChildMove.toString()];
         path.push(node.getBoardStateKey());

         if (path.length > 100) {
            break;
         }
      }

      return node;
   }

   expand(node, policy) {
      this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      const legalMoves = this.simGameBoard.getLegalMoves();
      if (legalMoves.length === 0 || this.simGameBoard.isGameOver()) return node;

      const unexpandedMoves = legalMoves.filter((move) => {
         const moveBit = BigInt(move[0] * 8 + move[1]);
         return !node.children[moveBit.toString()];
      });

      if (unexpandedMoves.length === 0) return node;

      const moveCoords = unexpandedMoves[Math.floor(this.rng() * unexpandedMoves.length)];
      const moveBit = BigInt(moveCoords[0] * 8 + moveCoords[1]);

      const nextBoard = new OthelloBoard();
      nextBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      nextBoard.applyMove(moveBit);

      const newNode = new MCTSNode(nextBoard.blackBoard, nextBoard.whiteBoard, nextBoard.currentPlayer, node, moveBit);
      newNode.priorProbability = policy[Number(moveBit)];
      node.children[moveBit.toString()] = newNode;
      this.nodeMap.set(newNode.getBoardStateKey(), newNode);
      return newNode;
   }

   simulate(node) {
      const simBoard = new OthelloBoard();
      simBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      for (let turn = 0; turn < 64; turn++) {
         if (simBoard.isGameOver()) {
            break;
         }
         const moves = simBoard.getLegalMoves();
         if (moves.length === 0) {
            simBoard.applyMove(null);
            continue;
         }
         const randomMove = moves[Math.floor(this.rng() * moves.length)];
         const moveBit = BigInt(randomMove[0] * 8 + randomMove[1]);
         simBoard.applyMove(moveBit);
      }

      return { winner: simBoard.getWinner(), scores: simBoard.getScores() };
   }

   backpropagate(node, value) {
      let tempNode = node;
      while (tempNode) {
         tempNode.visits++;
         tempNode.wins += tempNode.currentPlayer === tempNode.currentPlayer ? value : -value;
         tempNode = tempNode.parent;
      }
   }

   dirichletNoise(count) {
      let samples = Array.from({ length: count }, () => -Math.log(1.0 - this.rng()));
      const sum = samples.reduce((a, b) => a + b, 0);
      if (sum === 0) return Array(count).fill(1 / count);
      return samples.map((s) => s / sum);
   }
}

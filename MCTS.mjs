import { MCTSNode } from "./MCTSNode.mjs";
import { OthelloBoard } from "./OthelloBoard.mjs";
import fetch from "node-fetch";

const API_URL = "http://localhost:5000/predict";

export class MCTS {
   constructor(cP, rng) {
      this.cP = cP;
      this.rng = rng || Math.random;
      this.simGameBoard = new OthelloBoard();
      this.nodeMap = new Map();
      this.root = null;
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

   async run(blackBoard, whiteBoard, currentPlayer, numSimulations, turnCount) {
      const boardKey = `${blackBoard.toString(16)}_${whiteBoard.toString(16)}_${currentPlayer}`;
      this.root = this.nodeMap.get(boardKey) || new MCTSNode(blackBoard, whiteBoard, currentPlayer);
      if (!this.nodeMap.has(boardKey)) this.nodeMap.set(boardKey, this.root);

      const prediction = await this.getPrediction(this.root);
      if (prediction) {
         this.simGameBoard.setBoardState(this.root.blackBoard, this.root.whiteBoard, this.root.currentPlayer);
         const legalMoves = this.simGameBoard.getLegalMoves();
         const noise = this.dirichletNoise(legalMoves.length);
         const noisyPolicy = [...prediction.policy];
         legalMoves.forEach((move, index) => {
            const moveIndex = move[0] * 8 + move[1];
            noisyPolicy[moveIndex] = noisyPolicy[moveIndex] * 0.75 + noise[index] * 0.25;
         });

         this.expand(this.root, noisyPolicy)
      } else {
         console.error("Initial prediction failed. Cannot start MCTS.");
         return null;
      }
      for (let i = 0; i < numSimulations; i++) {
         let node = this.select(this.root);
         this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
         let value;
         if (this.simGameBoard.isGameOver()) {
            const winner = this.simGameBoard.getWinner();
            value = winner === 0 ? 0.0 : winner === this.root.currentPlayer ? 1.0 : -1.0;
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
      return this.chooseBestMove(this.root, turnCount);
   }

   select(node) {
      let currentNode = node;
      while (Object.keys(currentNode.children).length > 0) {
         this.simGameBoard.setBoardState(currentNode.blackBoard, currentNode.whiteBoard, currentNode.currentPlayer);
         if (this.simGameBoard.isGameOver()) break;
         currentNode = currentNode.bestChild(this.cP);
         if (!currentNode) return node;
      }
      return currentNode;
   }

   expand(node, policy) {
      this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      const legalMoves = this.simGameBoard.getLegalMoves();
      for (const move of legalMoves) {
         const moveBit = BigInt(move[0] * 8 + move[1]);
         const moveIndex = Number(moveBit);
         if (node.children[moveBit.toString()]) continue;
         const nextBoard = new OthelloBoard();
         nextBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
         nextBoard.applyMove(moveBit);
         const newNode = new MCTSNode(
            nextBoard.blackBoard,
            nextBoard.whiteBoard,
            nextBoard.currentPlayer,
            node,
            moveBit
         );
         newNode.priorProbability = policy[moveIndex];
         node.children[moveBit.toString()] = newNode;
         this.nodeMap.set(newNode.getBoardStateKey(), newNode);
      }
   }

   backpropagate(node, value) {
      let tempNode = node;
      while (tempNode) {
         tempNode.visits++;
         tempNode.wins += tempNode.currentPlayer === this.root.currentPlayer ? value : -value;
         tempNode = tempNode.parent;
      }
   }

   chooseBestMove(rootNode, turnCount) {
      const temperature = turnCount < 30 ? 1.0 : 0.01;
      if (temperature === 0) {
         let bestMove = null,
            maxVisits = -1;
         for (const move in rootNode.children) {
            const child = rootNode.children[move];
            if (child.visits > maxVisits) {
               maxVisits = child.visits;
               bestMove = BigInt(move);
            }
         }
         return bestMove;
      } else {
         const moves = Object.values(rootNode.children).map((c) => c.move);
         const visits = Object.values(rootNode.children).map((c) => c.visits ** (1 / temperature));
         const sumVisits = visits.reduce((a, b) => a + b, 0);
         if (sumVisits === 0) return moves[Math.floor(this.rng() * moves.length)];
         const probabilities = visits.map((v) => v / sumVisits);
         const randomSample = this.rng();
         let cumulativeProb = 0;
         for (let i = 0; i < probabilities.length; i++) {
            cumulativeProb += probabilities[i];
            if (randomSample < cumulativeProb) {
               return moves[i];
            }
         }
         return moves[moves.length - 1];
      }
   }

   dirichletNoise(count, rng) {
      let samples = Array.from({ length: count }, () => -Math.log(1.0 - this.rng));
      const sum = samples.reduce((a, b) => a + b, 0);
      if (sum === 0) return Array(count).fill(1 / count);
      return samples.map((s) => s / sum);
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
}

import { MCTSNode } from "./MCTSNode.mjs";
import { OthelloBoard } from "./OthelloBoard.mjs";
import fetch from "node-fetch";

const API_URL = "http://localhost:5000/predict";

export class MCTS {
   constructor(cP, rng) {
      this.cP = cP;
      this.rng = rng || Math.random;
      this.nodeMap = new Map();
      this.simGameBoard = new OthelloBoard();
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
         console.error("API call to Python server failed:", error.message);
         return null;
      }
   }

   async run(blackBoard, whiteBoard, currentPlayer) {
      const board = new OthelloBoard();
      board.setBoardState(blackBoard, whiteBoard, currentPlayer);
      const prediction = await this.getPrediction(board);

      if (!prediction || !prediction.policy) {
          console.warn("Could not get prediction from Python server.");
          return null;
      }
      const legalMoves = board.getLegalMoves();
      if (legalMoves.length === 0) return null;
      let bestMove = null;
      let maxProbability = -Infinity;
      for (const move of legalMoves) {
          const moveBit = BigInt(move[0] * 8 + move[1]);
          const moveIndex = Number(moveBit);
          const moveProbability = prediction.policy[moveIndex];

          if (moveProbability > maxProbability) {
              maxProbability = moveProbability;
              bestMove = moveBit;
          }
      }
      return bestMove;
  }

   select(node) {
      let currentNode = node;
      while (true) {
         this.simGameBoard.setBoardState(currentNode.blackBoard, currentNode.whiteBoard, currentNode.currentPlayer);
         if (this.simGameBoard.isGameOver()) {
            break;
         }
         if (Object.keys(currentNode.children).length === 0) {
            break;
         }
         const bestChildNode = currentNode.bestChild(this.cP);
         if (bestChildNode === null) {
            break;
         }
         currentNode = bestChildNode;
      }
      return currentNode;
   }

   expand(node, policy) {
      this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      const legalMoves = this.simGameBoard.getLegalMoves();

      for (const move of legalMoves) {
         const moveBit = BigInt(move[0] * 8 + move[1]);
         const moveIndex = Number(moveBit);

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
      return node;
   }

   backpropagate(node, value) {
      let tempNode = node;
      while (tempNode) {
         tempNode.visits++;
         tempNode.wins += tempNode.parent && tempNode.parent.currentPlayer === tempNode.currentPlayer ? -value : value;
         tempNode = tempNode.parent;
      }
   }

   async getNode(key) {
      const nodeData = this.dbManager.getNode(key);
      if (!nodeData) {
         return null;
      }
      const node = new MCTSNode(nodeData.blackBoard, nodeData.whiteBoard, nodeData.currentPlayer, null, nodeData.move);
      node.wins = nodeData.wins;
      node.visits = nodeData.visits;

      this.nodeMap.set(key, node);
      return node;
   }

   async getChildrenNodes(node) {
      const nodeData = this.dbManager.getNode(node.getBoardStateKey());
      if (!nodeData || !nodeData.children) return [];
      const children = [];
      const childrenKeys = nodeData.children_keys;
      for (const childKey of childrenKeys) {
         const childNode = await this.getNode(childKey);
         if (childNode) children.push(childNode);
      }
      return children;
   }
}

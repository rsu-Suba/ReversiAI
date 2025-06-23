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

   async run(blackBoard, whiteBoard, currentPlayer, passedLastTurn, numSimulations) {
      const boardKey = `${blackBoard.toString(16)}_${whiteBoard.toString(16)}_${currentPlayer}`;
      let rootNode = this.nodeMap.get(boardKey);
      if (!rootNode) {
         rootNode = new MCTSNode(blackBoard, whiteBoard, currentPlayer);
         this.nodeMap.set(boardKey, rootNode);
      }
      this.root = rootNode;

      // 最初の展開（ルートノードの子を展開しておく）
      if (Object.keys(this.root.children).length === 0) {
         const prediction = await this.getPrediction(this.root);
         if (prediction) this.expand(this.root, prediction.policy);
      }

      for (let i = 0; i < numSimulations; i++) {
         let node = this.select(this.root);

         this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
         if (this.simGameBoard.isGameOver()) {
            const winner = this.simGameBoard.getWinner();
            this.backpropagate(node, winner === node.currentPlayer ? 1.0 : -1.0);
            continue;
         }

         const prediction = await this.getPrediction(node);
         let value;
         if (prediction) {
            this.expand(node, prediction.policy);
            value = prediction.value;
         } else {
            value = 0; // API失敗時は中立的な価値を返す
         }
         this.backpropagate(node, value);
      }

      let bestMove = null,
         maxVisits = -1;
      for (const move in this.root.children) {
         const child = this.root.children[move];
         if (child.visits > maxVisits) {
            maxVisits = child.visits;
            bestMove = BigInt(move);
         }
      }
      return bestMove;
   }

   select(node) {
      let currentNode = node;
      while (Object.keys(currentNode.children).length > 0) {
         this.simGameBoard.setBoardState(currentNode.blackBoard, currentNode.whiteBoard, currentNode.currentPlayer);
         if (this.simGameBoard.isGameOver()) break;
         currentNode = currentNode.bestChild(this.cP);
         if (!currentNode) return node; // bestChildがnullを返す場合
      }
      return currentNode;
   }

   expand(node, policy) {
      this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      const legalMoves = this.simGameBoard.getLegalMoves();
      if (legalMoves.length === 0) return node;

      for (const move of legalMoves) {
         const moveBit = BigInt(move[0] * 8 + move[1]);
         if (node.children[moveBit.toString()]) continue; // 既に展開済み

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
         newNode.priorProbability = policy[Number(moveBit)];
         node.children[moveBit.toString()] = newNode;
         this.nodeMap.set(newNode.getBoardStateKey(), newNode);
      }
      return node;
   }

   backpropagate(node, value) {
      let tempNode = node;
      while (tempNode) {
         tempNode.visits++;
         tempNode.wins += tempNode.currentPlayer === this.root.currentPlayer ? value : -value;
         tempNode = tempNode.parent;
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
}

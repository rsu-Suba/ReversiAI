import { MCTSNode } from "./MCTSNode.mjs";
import { OthelloBoard } from "./OthelloBoard.mjs";
import { decode, Encoder } from "@msgpack/msgpack";
import * as fs from "fs/promises";

export class MCTS {
   constructor(cP, rng) {
      this.cP = cP;
      this.rng = rng || Math.random;
      this.nodeMap = new Map();
      this.simGameBoard = new OthelloBoard();
      this.root = new MCTSNode(OthelloBoard.blackInitBoard, OthelloBoard.whiteInitBoard, 1, null, null, 0, false);
      this.nodeMap.set(this.root.getBoardStateKey(), this.root);
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

   run(blackBoard, whiteBoard, currentPlayer, passedLastTurn, numSimulations) {
      const timeLimit = 30000;
      const startTime = Date.now();
      const boardKey = `${blackBoard.toString(16)}_${whiteBoard.toString(16)}_${currentPlayer}_${passedLastTurn}`;
      let rootNode = this.nodeMap.get(boardKey);

      if (!rootNode) {
         rootNode = new MCTSNode(blackBoard, whiteBoard, currentPlayer, null, null, 0, passedLastTurn);
         this.nodeMap.set(boardKey, rootNode);
      }

      for (let i = 0; i < numSimulations; i++) {
         if (Date.now() - startTime > timeLimit) {
            console.warn(`MCTS >${timeLimit}ms. Finishing move.`);
            break;
         }
         let node = this.select(rootNode);
         let expandedNode = this.expand(node);
         let result = this.simulate(expandedNode);
         this.backpropagate(expandedNode, result.winner);
      }
      if (Object.keys(rootNode.children).length === 0) return null;
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
   }

   select(rootNode) {
      let node = rootNode;
      let path = [node.getBoardStateKey()];

      while (true) {
         this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, 0, node.passedLastTurn);
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

   expand(node) {
      this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, node.passedLastTurn);
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
      nextBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, node.passedLastTurn);
      nextBoard.applyMove(moveBit);

      const newNode = new MCTSNode(
         nextBoard.blackBoard,
         nextBoard.whiteBoard,
         nextBoard.currentPlayer,
         node,
         moveBit,
         node.depth + 1,
         nextBoard.passedLastTurn
      );
      node.children[moveBit.toString()] = newNode;
      this.nodeMap.set(newNode.getBoardStateKey(), newNode);
      return newNode;
   }

   simulate(node) {
      const simBoard = new OthelloBoard();
      simBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, node.passedLastTurn);
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

   backpropagate(node, winner) {
      let tempNode = node;
      while (tempNode) {
         tempNode.visits++;
         if (tempNode.currentPlayer !== winner) {
            tempNode.wins++;
         }
         tempNode = tempNode.parent;
      }
   }
}

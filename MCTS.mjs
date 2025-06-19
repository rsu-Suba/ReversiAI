import { MCTSNode } from "./MCTSNode.mjs";
import { OthelloBoard } from "./OthelloBoard.mjs";

export class MCTS {
   constructor(dbManager, cP, rng) {
      this.dbManager = dbManager;
      this.cP = cP;
      this.rng = rng || Math.random;
      this.nodeMap = new Map();
      this.simGameBoard = new OthelloBoard();
   }

   async run(blackBoard, whiteBoard, currentPlayer, numSimulations, isTraining = true) {
      const boardKey = `${blackBoard.toString(16)}_${whiteBoard.toString(16)}_${currentPlayer}`;
      let rootNode = await this.getNode(boardKey);

      if (!rootNode) {
         rootNode = new MCTSNode(blackBoard, whiteBoard, currentPlayer);
         this.nodeMap.set(boardKey, rootNode);
         if (isTraining) await this.dbManager.saveNode(rootNode);
      }

      for (let i = 0; i < numSimulations; i++) {
         let node = await this.select(rootNode);
         let expandedNode = await this.expand(node, isTraining);
         let result = this.simulate(expandedNode);
         if (isTraining) {
            await this.backpropagate(expandedNode, result.winner);
         }
      }

      const childrenNodes = await this.getChildrenNodes(rootNode);
      if (childrenNodes.length === 0) return null;

      let bestMove = null;
      let maxVisits = -1;
      for (const child of childrenNodes) {
         if (child.visits > maxVisits) {
            maxVisits = child.visits;
            bestMove = child.move;
         }
      }
      return bestMove;
   }

   async select(node) {
      let currentNode = node;
      while (currentNode) {
         this.simGameBoard.setBoardState(currentNode.blackBoard, currentNode.whiteBoard, currentNode.currentPlayer);
         if (this.simGameBoard.isGameOver()) break;

         const legalMoves = this.simGameBoard.getLegalMoves();
         const childrenNodes = await this.getChildrenNodes(currentNode);

         if (childrenNodes.length < legalMoves.length) break;
         if (legalMoves.length === 0) break;

         const bestChildKey = currentNode.bestChild(this.cP, childrenNodes);
         if (bestChildKey === null) break;

         currentNode = await this.getNode(bestChildKey);
      }
      return currentNode || node;
   }

   async expand(node, isTraining = true) {
      this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      const legalMoves = this.simGameBoard.getLegalMoves();
      if (this.simGameBoard.isGameOver() || legalMoves.length === 0) return node;

      const childrenNodes = await this.getChildrenNodes(node);
      const expandedMoveStrings = childrenNodes.map((c) => c.move.toString());

      const unexpandedMoves = legalMoves.filter((move) => {
         const moveBit = BigInt(move[0] * 8 + move[1]);
         return !expandedMoveStrings.includes(moveBit.toString());
      });

      if (unexpandedMoves.length === 0) return node;

      const moveCoords = unexpandedMoves[Math.floor(this.rng() * unexpandedMoves.length)];
      const moveBit = BigInt(moveCoords[0] * 8 + moveCoords[1]);

      const nextBoard = new OthelloBoard();
      nextBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      nextBoard.applyMove(moveBit);

      const newNode = new MCTSNode(
         nextBoard.blackBoard,
         nextBoard.whiteBoard,
         nextBoard.currentPlayer,
         node.getBoardStateKey(),
         moveBit
      );

      node.addChildKey(newNode.getBoardStateKey());
      this.nodeMap.set(newNode.getBoardStateKey(), newNode);

      if (isTraining) {
         await this.dbManager.saveNode(node);
         await this.dbManager.saveNode(newNode);
      }
      return newNode;
   }

   async backpropagate(node, winner) {
      const updates = [];
      let tempNode = node;
      while (tempNode) {
         tempNode.visits++;
         //if (tempNode.currentPlayer !== winner) tempNode.wins++;
         if (winner === 0) tempNode.wins++;
         updates.push({
            key: tempNode.getBoardStateKey(),
            wins: tempNode.wins,
            visits: tempNode.visits,
         });
         if (!tempNode.parent_key) break;
         tempNode = await this.getNode(tempNode.parent_key);
      }
      if (updates.length > 0) await this.dbManager.batchUpdateNodes(updates);
   }

   simulate(node) {
      const simBoard = new OthelloBoard();
      simBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      for (let turn = 0; turn < 100; turn++) {
         if (simBoard.isGameOver()) break;
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

   async getNode(key) {
      if (this.nodeMap.has(key)) return this.nodeMap.get(key);
      const nodeData = await this.dbManager.getNode(key);
      if (!nodeData) return null;

      const node = new MCTSNode(
         nodeData.blackBoard,
         nodeData.whiteBoard,
         nodeData.currentPlayer,
         nodeData.parent_key,
         nodeData.move
      );
      node.wins = nodeData.wins;
      node.visits = nodeData.visits;
      node.children_keys = nodeData.children_keys;

      this.nodeMap.set(key, node);
      return node;
   }

   async getChildrenNodes(node) {
      const children = [];
      for (const childKey of node.children_keys) {
         const childNode = await this.getNode(childKey);
         if (childNode) children.push(childNode);
      }
      return children;
   }
}

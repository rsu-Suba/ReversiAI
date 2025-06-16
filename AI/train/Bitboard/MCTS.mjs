import { MCTSNode } from "./MCTSNode.mjs";
import { OthelloBoard } from "./OthelloBoard.mjs";
import { config } from "./config.mjs";
import { decode, Encoder } from "@msgpack/msgpack";
import { parentPort } from "worker_threads";
import seedrandom from "seedrandom";
import * as fs from "fs/promises";

export class MCTS {
   constructor(
      cP = config.cP,
      rng = Math.random,
      workerSlotId = "unknown",
      initialBlackDiscs = OthelloBoard.blackInitBoard,
      initialWhiteDiscs = OthelloBoard.whiteInitBoard,
      initialCurrentPlayer = 1,
      initialPassedLastTurn = false
   ) {
      const initialBoard = new OthelloBoard();
      this.persistentRoot = new MCTSNode(
         initialBlackDiscs,
         initialWhiteDiscs,
         initialCurrentPlayer,
         null,
         null,
         0,
         initialPassedLastTurn
      );
      this.currentRoot = this.persistentRoot;
      this.simGameBoard = new OthelloBoard();
      this.rng = rng;
      this.nodeMap = new Map();
      this.shouldStopSimulations = false;
      this.cP = cP;
      this.lastTurnPassedState = false;
      this.workerSlotId = workerSlotId;
      this._rebuildNodeMap(this.persistentRoot);
   }

   requestStop() {
      this.shouldStopSimulations = true;
   }

   async loadTree(filePath) {
      try {
         const buffer = await fs.readFile(filePath);
         const serializableRoot = decode(buffer);
         const loadedRoot = MCTSNode.fromSerializableObject(serializableRoot);
         if (this.persistentRoot.visits === 0 && Object.keys(this.persistentRoot.children).length === 0) {
            this.persistentRoot = loadedRoot;
         } else {
            this.persistentRoot.merge(loadedRoot);
         }
         this.currentRoot = this.persistentRoot;
         this._rebuildNodeMap(this.persistentRoot);
         return true;
      } catch (error) {
         console.log("Loading tree error");
         this.currentRoot = this.persistentRoot;
         this.nodeMap.clear();
         this._rebuildNodeMap(this.persistentRoot);
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

      if (!rootNode || !(rootNode instanceof MCTSNode)) {
         console.warn("Attempted to rebuild node map with a null or invalid root node. Clearing map.");
         return;
      }
      const queue = [rootNode];
      const rootKey = rootNode.getBoardStateKey();
      if (!this.nodeMap.has(rootKey)) {
         this.nodeMap.set(rootKey, rootNode);
      }
      let nodesProcessed = 0;
      while (queue.length > 0) {
         const node = queue.shift();
         if (!node || !(node instanceof MCTSNode)) {
            console.warn(`[Rebuild Warning] Skipped invalid node in queue. Type: ${typeof node}, Value: ${node}`);
            continue;
         }
         for (const moveBitStr in node.children) {
            if (Object.prototype.hasOwnProperty.call(node.children, moveBitStr)) {
               const child = node.children[moveBitStr];
               if (child && child instanceof MCTSNode) {
                  const childKey = child.getBoardStateKey();
                  if (!this.nodeMap.has(childKey)) {
                     this.nodeMap.set(childKey, child);
                     queue.push(child);
                     nodesProcessed++;
                  }
               } else {
                  console.warn(
                     `[Rebuild Warning] Invalid child found for key "${moveBitStr}" in node "${node.getBoardStateKey()}". Skipping.`
                  );
               }
            }
         }
      }
   }

   run(currentBlackBoard, currentWhiteBoard, currentPlayer, numSimulations, currentPassedLastTurn = false) {
      this.shouldStopSimulations = false;
      const currentBoard = new OthelloBoard();
      currentBoard.setBoardState(currentBlackBoard, currentWhiteBoard, currentPlayer, 0, false);
      const tempNodeForInitialKey = new MCTSNode(
         currentBlackBoard,
         currentWhiteBoard,
         currentPlayer,
         null,
         null,
         0,
         currentPassedLastTurn
      );
      const boardKey = tempNodeForInitialKey.getBoardStateKey();

      let initialNode = this.nodeMap.get(boardKey);
      if (initialNode) {
         this.currentRoot = initialNode;
      } else {
         throw new Error(
            `MCTS.run: Initial node for board state "${boardKey}" not found in nodeMap. Please ensure the board state is merged into the tree before calling run.`
         );
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
            this.currentRoot.blackBoard,
            this.currentRoot.whiteBoard,
            this.currentRoot.currentPlayer,
            0,
            this.currentRoot.passedLastTurn
         );
         let selectedNode = this.select(this.currentRoot);
         let expandedNode = selectedNode;
         if (!this.simGameBoard.isGameOver()) {
            expandedNode = this.expand(selectedNode);
         }
         this.simGameBoard.setBoardState(
            expandedNode.currentBlackBoard,
            expandedNode.currentWhiteBoard,
            expandedNode.currentPlayer,
            0,
            expandedNode.passedLastTurn
         );
         const simulationResult = this.simulate(expandedNode);
         this.backpropagate(expandedNode, simulationResult.winner, simulationResult.scores);
      }

      let bestMove = null;
      let maxScore = -Infinity;

      this.simGameBoard.setBoardState(
         this.currentRoot.currentBlackBoard,
         this.currentRoot.currentWhiteBoard,
         this.currentRoot.currentPlayer,
         0,
         this.currentRoot.passedLastTurn
      );
      const legalMovesArray = this.simGameBoard.getLegalMoves();
      if (legalMovesArray.length === 0) return null;

      if (Object.keys(this.currentRoot.children).length === 0) {
         console.warn("MCTS.run: Root node has no children after simulations. Picking a random legal move.");
         const randomMoveCoords = legalMovesArray[Math.floor(this.rng() * legalMovesArray.length)];
         return BigInt(randomMoveCoords[0] * OthelloBoard.boardLength + randomMoveCoords[1]);
      }

      for (const moveBitStr in this.currentRoot.children) {
         if (Object.prototype.hasOwnProperty.call(this.currentRoot.children, moveBitStr)) {
            const child = this.currentRoot.children[moveBitStr];
            const uctScore =
               child.visits === 0
                  ? Infinity
                  : child.wins / child.visits + this.cP * Math.sqrt(Math.log(this.currentRoot.visits) / child.visits);
            if (uctScore > maxScore) {
               maxScore = uctScore;
               bestMoveBit = BigInt(moveBitStr);
            } else if (uctScore === maxScore) {
               if (this.rng() < 0.5) {
                  bestMoveBit = BigInt(moveBitStr);
               }
            }
         }
      }

      if (bestMoveBit === null) {
         console.warn("MCTS.run: No best move found among children after UCT selection. Picking a random legal move.");
         const randomMoveCoords = legalMovesArray[Math.floor(this.rng() * legalMovesArray.length)];
         bestMoveBit = BigInt(randomMoveCoords[0] * OthelloBoard.boardLength + randomMoveCoords[1]);
      }

      return bestMoveBit;
   }

   select(node) {
      //console.log(`[DEBUG MCTS Select] W${this.workerSlotId}: Starting selection from node ${node.getBoardStateKey()}`); // このログはループ開始時に毎回OK
      let pathNodes = [node.getBoardStateKey()]; // 辿ったパスを記録したい場合 (任意)

      while (!this.simGameBoard.isGameOver() && node.isFullyExpanded(this.simGameBoard)) {
         const bestChildMoveBit = node.bestChild(this.cP, this.rng);

         if (bestChildMoveBit == null) {
            /*
            console.log(
               `[DEBUG MCTS Select] W${
                  this.workerSlotId
               }: No best child found (null move). Loop break. Path: ${pathNodes.join(" -> ")}`
            ); // 任意*/
            break;
         }

         // ★修正点: bestChildMoveBitがnullでないことを確認してからログ出力★
         /*
         console.log(
            `[DEBUG MCTS Select] W${
               this.workerSlotId
            }: Selected child ${bestChildMoveBit.toString()}. New node depth: ${node.depth}`
         );*/
         // ★修正終わり★

         node = node.children[bestChildMoveBit.toString()];
         pathNodes.push(node.getBoardStateKey()); // 任意
         this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, 0, node.passedLastTurn);
      } /*
      console.log(
         `[DEBUG MCTS Select] W${this.workerSlotId}: Select loop ended. Final node depth: ${
            node.depth
         }. Is fully expanded: ${node.isFullyExpanded(this.simGameBoard)}`
      );*/
      return node;
   }
   // MCTS.mjs の expand メソッド

   expand(node) {
      const maxTreeDepth = 100;
      if (node.depth >= maxTreeDepth) {
         //console.log(`[DEBUG MCTS Expand] W${this.workerSlotId}: Max depth reached (${node.depth}). Returning.`);
         return node;
      }

      this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, 0, node.passedLastTurn);
      if (this.simGameBoard.isGameOver()) {
         //console.log(`[DEBUG MCTS Expand] W${this.workerSlotId}: Game Over at node ${node.getBoardStateKey()}. Returning.`);
         return node;
      }

      const legalMovesBitboard = this.simGameBoard.getLegalMovesBitboard();
      const unexpandedMovesBit = [];
      for (let i = 0n; i < BigInt(OthelloBoard.boardSize); i++) {
         if (((legalMovesBitboard >> i) & 1n) !== 0n) {
            // 合法手ビットボードの各ビットをチェック
            if (!(i.toString() in node.children)) {
               // 未展開の合法手のみ追加
               unexpandedMovesBit.push(i);
            }
         }
      }

      //console.log(`[DEBUG MCTS Expand] W${this.workerSlotId}: Expanding node ${node.getBoardStateKey()}`);
      //console.log(`[DEBUG MCTS Expand] Legal moves count (from OthelloBoard): ${this.simGameBoard.getLegalMoves().length}`); // 配列で数を確認
      //console.log(`[DEBUG MCTS Expand] Unexpanded moves count: ${unexpandedMovesBit.length}`);

      if (unexpandedMovesBit.length === 0) {
         //console.log(`[DEBUG MCTS Expand] W${this.workerSlotId}: Node fully expanded, or no legal moves from OthelloBoard. Returning.`);
         // ★ MCTSNode.isFullyExpanded が true を返しているのと同じ状態
         // ここで問題がある可能性が高い。本当に合法手がないか、isFullyExpandedが誤判定
         return node;
      }

      const moveToExpandBit = unexpandedMovesBit[Math.floor(this.rng() * unexpandedMovesBit.length)];
      const nextBoard = new OthelloBoard();
      nextBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, 0, node.passedLastTurn);
      nextBoard.applyMove(moveToExpandBit); // この中でnextBoardのpassCountが更新される

      const newNode = new MCTSNode(
         nextBoard.blackBoard,
         nextBoard.whiteBoard,
         nextBoard.currentPlayer,
         node, // 親ノードを設定
         moveToExpandBit,
         node.depth + 1,
         nextBoard.passedLastTurn // OthelloBoardのpassCountから変換
      );
      // 新しいノードを親（node）の子として追加
      node.children[moveToExpandBit.toString()] = newNode;
      // nodeMapにも追加
      this.nodeMap.set(newNode.getBoardStateKey(), newNode);
      // simGameBoard の状態を newNode に更新
      this.simGameBoard.setBoardState(
         newNode.blackBoard,
         newNode.whiteBoard,
         newNode.currentPlayer,
         0,
         newNode.passedLastTurn
      );
      /*
      console.log(
         `[DEBUG MCTS Expand] W${this.workerSlotId}: Expanded move ${moveToExpandBit.toString()} (row:${Math.floor(
            Number(moveToExpandBit) / OthelloBoard.boardLength
         )}, col:${Number(moveToExpandBit) % OthelloBoard.boardLength}) to new node. Node map size: ${
            this.nodeMap.size
         }. New node depth: ${newNode.depth}`
      );
      */
      return newNode;
   }

   simulate(node) {
      const simulationBoard = new OthelloBoard();
      simulationBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, 0, node.passedLastTurn);

      const maxSimulationDepth = 100;
      let currentSimulationDepth = 0;

      while (!simulationBoard.isGameOver() && currentSimulationDepth < maxSimulationDepth) {
         const legalMovesBitboard = simulationBoard.getLegalMovesBitboard();
         const legalMovesArray = [];
         for (let i = 0n; i < BigInt(OthelloBoard.boardSize); i++) {
            if (((legalMovesBitboard >> i) & 1n) !== 0n) {
               legalMovesArray.push(i);
            }
         }
         if (legalMovesArray.length === 0) {
            simulationBoard.applyMove(null);
         } else {
            const randomMove = legalMovesArray[Math.floor(this.rng() * legalMovesArray.length)];
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
         const blackStones = Number(scores.black);
         const whiteStones = Number(scores.white);
         let winLossReward = 0;
         if (winner === currentNode.currentPlayer) {
            winLossReward = 1;
         } else if (winner === -currentNode.currentPlayer) {
            winLossReward = -1;
         } else if (winner === 0) {
            winLossReward = 0;
         }

         let stoneDiffReward = 0;
         if (currentNode.currentPlayer === 1) {
            stoneDiffReward = (blackStones - whiteStones) / OthelloBoard.boardSize;
         } else {
            stoneDiffReward = (whiteStones - blackStones) / OthelloBoard.boardSize;
         }
         const stoneDifferenceWeight = 5;
         const winLossWeight = 1;
         const finalReward =
            (winLossReward * winLossWeight + stoneDiffReward * stoneDifferenceWeight) /
            (winLossWeight + stoneDifferenceWeight);

         currentNode.wins += finalReward;
         currentNode = currentNode.parent;
      }
   }

   updateRoot(moveBit) {
      if (!this.currentRoot) {
         console.error("updateRoot called but currentRoot is null.");
         return;
      }

      let nextRootNode = null;
      const moveBitStr = moveBit.toString();

      if (this.currentRoot.children[moveBitStr]) {
         nextRootNode = this.currentRoot.children[moveBitStr];
      } else {
         const nextBoard = new OthelloBoard();
         nextBoard.setBoardState(
            this.currentRoot.blackBoard,
            this.currentRoot.whiteBoard,
            this.currentRoot.currentPlayer,
            0,
            this.currentRoot.passedLastTurn
         );
         nextBoard.applyMove(moveBit);
         nextRootNode = new MCTSNode(
            nextBoard.blackBoard,
            nextBoard.whiteBoard,
            nextBoard.currentPlayer,
            this.currentRoot,
            moveBit,
            this.currentRoot.depth + 1,
            nextBoard.passedLastTurn
         );
         this.currentRoot.children[moveBitStr] = nextRootNode;
         this.nodeMap.set(nextRootNode.getBoardStateKey(), nextRootNode);
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

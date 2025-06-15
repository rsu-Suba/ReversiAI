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
      // initialPassedLastTurn は train.js から渡されるのでそのまま

      const initialBoard = new OthelloBoard(); // このinitialBoardはあくまで一時的なもので、MCTSNode初期化には使われない
      // MCTSNodeには引数として渡されたinitialBlackDiscsなどを使う
      this.persistentRoot = new MCTSNode(
         initialBlackDiscs,
         initialWhiteDiscs,
         initialCurrentPlayer,
         null, // parent
         null, // move
         0, // depth
         initialPassedLastTurn // ★修正: train.jsから渡されるinitialPassedLastTurnを使う★
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
         return; // 無効なルートノードの場合は処理を中止
      }

      const queue = [rootNode];

      // ルートノードを最初にnodeMapに登録（必須）
      const rootKey = rootNode.getBoardStateKey();
      if (!this.nodeMap.has(rootKey)) {
         this.nodeMap.set(rootKey, rootNode);
      }

      let nodesProcessed = 0; // デバッグ用カウンター

      while (queue.length > 0) {
         const node = queue.shift();

         // ここでもう一度厳密なチェック (キューから取り出したノードが有効か)
         if (!node || !(node instanceof MCTSNode)) {
            console.warn(`[Rebuild Warning] Skipped invalid node in queue. Type: ${typeof node}, Value: ${node}`);
            continue;
         }

         // ノードの子を処理
         for (const moveBitStr in node.children) {
            if (Object.prototype.hasOwnProperty.call(node.children, moveBitStr)) {
               const child = node.children[moveBitStr];

               // 子ノードが有効なMCTSNodeインスタンスであることを確認
               if (child && child instanceof MCTSNode) {
                  const childKey = child.getBoardStateKey();
                  // nodeMap にない場合のみ追加し、キューに入れる
                  if (!this.nodeMap.has(childKey)) {
                     this.nodeMap.set(childKey, child);
                     queue.push(child); // 新しく追加した子をキューに追加して、さらにその子孫を探索
                     nodesProcessed++; // カウンターを増やす
                  }
               } else {
                  // 不正な子ノードが見つかった場合は警告を出す
                  console.warn(
                     `[Rebuild Warning] Invalid child found for key "${moveBitStr}" in node "${node.getBoardStateKey()}". Skipping.`
                  );
               }
            }
         }
      }
   }

   run(currentBlackBoard, currentWhiteBoard, currentPlayer, numSimulations) {
      this.shouldStopSimulations = false;
      const currentBoard = new OthelloBoard();
      currentBoard.setBoardState(currentBlackBoard, currentWhiteBoard, currentPlayer, 0, false); // passCount はMCTSNodeが持つのでここでは初期値false
      const tempNodeForInitialKey = new MCTSNode(
         currentBlackBoard,
         currentWhiteBoard,
         currentPlayer,
         null,
         null,
         0,
         currentBoard.passedLastTurn
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
            this.currentRoot.currentBlackBoard,
            this.currentRoot.currentWhiteBoard,
            this.currentRoot.currentPlayer,
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
      while (!this.simGameBoard.isGameOver() && node.isFullyExpanded(this.simGameBoard)) {
         const bestChildMoveBit = node.bestChild(this.cP, this.rng);
         if (bestChildMoveBit == null) {
            break;
         }
         node = node.children[bestChildMoveBit.toString()];
         this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, node.passedLastTurn);
      }
      return node;
   }

   expand(node) {
      const maxTreeDepth = 100;
      if (node.depth >= maxTreeDepth) return node;
      this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, node.passedLastTurn);
      if (this.simGameBoard.isGameOver()) return node;
      const legalMovesBitboard = this.simGameBoard.getLegalMovesBitboard();
      const unexpandedMovesBit = [];
      for (let i = 0n; i < BigInt(OthelloBoard.boardSize); i++) {
         if (((legalMovesBitboard >>> i) & 1n) !== 0n) {
            if (!(i.toString() in node.children)) {
               unexpandedMovesBit.push(i);
            }
         }
      }
      if (unexpandedMovesBit.length === 0) return node;
      const moveToExpandBit = unexpandedMovesBit[Math.floor(this.rng() * unexpandedMovesBit.length)]; // BigInt
      const nextBoard = new OthelloBoard();
      nextBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, node.passedLastTurn);
      nextBoard.applyMove(moveToExpandBit);
      const newNode = new MCTSNode(
         nextBoard.blackBoard,
         nextBoard.whiteBoard,
         nextBoard.currentPlayer,
         node,
         moveToExpandBit,
         node.depth + 1,
         nextBoard.passedLastTurn
      );
      node.children[moveToExpandBit.toString()] = newNode;
      this.nodeMap.set(newNode.getBoardStateKey(), newNode);
      this.simGameBoard.setBoardState(
         newNode.blackBoard,
         newNode.whiteBoard,
         newNode.currentPlayer,
         newNode.passedLastTurn
      );

      return newNode;
   }

   simulate(node) {
      const simulationBoard = new OthelloBoard();
      simulationBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer, node.passedLastTurn);

      const maxSimulationDepth = 100;
      let currentSimulationDepth = 0;

      while (!simulationBoard.isGameOver() && currentSimulationDepth < maxSimulationDepth) {
         const legalMovesBitboard = simulationBoard.getLegalMovesBitboard(); // ビットボードで合法手を取得
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
         //console.log(`Win rate: ${Math.round((currentNode.wins/currentNode.visits) * 100) / 100}`);
         currentNode = currentNode.parent;
      }
   }

   updateRoot(moveBit) {
      if (!this.currentRoot) {
         console.error("updateRoot called but currentRoot is null.");
         return;
      }

      let nextRootNode = null;
      const moveBitStr = moveBit.toString(); // キーはBigIntの文字列化

      if (this.currentRoot.children[moveBitStr]) {
         // 子ノードが既存の場合
         nextRootNode = this.currentRoot.children[moveBitStr];
      } else {
         // ★★★子ノードが存在しない場合、新しく作成してツリーに連結する★★★
         const nextBoard = new OthelloBoard();
         nextBoard.setBoardState(
            this.currentRoot.blackBoard,
            this.currentRoot.whiteBoard,
            this.currentRoot.currentPlayer,
            this.currentRoot.passedLastTurn
         );
         nextBoard.applyMove(moveBit); // 手を適用して次の盤面を計算

         // 新しいMCTSNodeを作成
         nextRootNode = new MCTSNode(
            nextBoard.blackBoard,
            nextBoard.whiteBoard,
            nextBoard.currentPlayer,
            this.currentRoot, // 親を現在のルートに設定
            moveBit, // この手で到達した
            this.currentRoot.depth + 1,
            nextBoard.passedLastTurn // OthelloBoardのpassCountから変換
         );

         // 新しいノードを親（currentRoot）の子として追加
         this.currentRoot.children[moveBitStr] = nextRootNode;
         // nodeMap にも追加
         this.nodeMap.set(nextRootNode.getBoardStateKey(), nextRootNode);
         // ★★★修正終わり★★★
      }

      if (nextRootNode) {
         this.currentRoot = nextRootNode; // currentRootを新しいノードに移動
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

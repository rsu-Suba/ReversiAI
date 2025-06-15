import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { config } from "./config.mjs";
import { formatCurrentDateTime } from "./module.mjs";
import { parentPort, workerData } from "worker_threads";
import seedrandom from "seedrandom";

let currentWorkerGameNumber = workerData.gameNumber;

const simsN = workerData.simsN;
const cP = workerData.cP;
const workerSlotId = workerData.workerSlotId;
const vsRandom = workerData.vsRandom;

const MEMORY_CHECK_INTERVAL_MS = config.Mem_Worker_Check_Interval;
const MEMORY_THRESHOLD_PERCENT = config.Mem_Worker_Threshold_Per;
const MAX_HEAP_SIZE_MB = config.Mem_Heap_Size;
const MAX_HEAP_SIZE_BYTES_WORKER = MAX_HEAP_SIZE_MB * 1024 * 1024;
const MEMORY_THRESHOLD_BYTES_WORKER = MAX_HEAP_SIZE_BYTES_WORKER * MEMORY_THRESHOLD_PERCENT;

let workerMemoryCheckInterval;
let isGracefulShutdown = false;

const rng = seedrandom(`seed-${workerSlotId}-${Date.now()}-${Math.random()}`);
console.log(
   `[DEBUG MCTS Init] OthelloBoard.blackInitBoard type: ${typeof OthelloBoard.blackInitBoard}, value: ${
      OthelloBoard.blackInitBoard
   }`
);
console.log(
   `[DEBUG MCTS Init] OthelloBoard.whiteInitBoard type: ${typeof OthelloBoard.whiteInitBoard}, value: ${
      OthelloBoard.whiteInitBoard
   }`
);

let mcts = new MCTS(
   cP,
   rng,
   workerSlotId,
   OthelloBoard.blackInitBoard, // ★ここ
   OthelloBoard.whiteInitBoard, // ★ここ
   1,
   false
);

if (workerData.treeData) {
   try {
      const rootObject = JSON.parse(workerData.treeData);
      mcts.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
      mcts._rebuildNodeMap(mcts.persistentRoot);
      mcts.currentRoot = mcts.persistentRoot;
      console.log(`--- Loaded initial tree -> W${workerSlotId} (${mcts.nodeMap.size} nodes) ---`);
   } catch (e) {
      console.error(`W${workerSlotId}: Failed to load initial treeData:`, e);
      // ロードエラー時は、MCTSの初期ボードを使ってノードを再初期化
      const initialBoard = new OthelloBoard();
      mcts.persistentRoot = new MCTSNode(
         initialBoard.blackBoard,
         initialBoard.whiteBoard,
         initialBoard.currentPlayer,
         null,
         null,
         0,
         initialBoard.passCount > 0
      );
      mcts._rebuildNodeMap(mcts.persistentRoot);
      mcts.currentRoot = mcts.persistentRoot;
   }
} else {
   const initialBoard = new OthelloBoard();
   mcts.persistentRoot = new MCTSNode(
      initialBoard.blackBoard,
      initialBoard.whiteBoard,
      initialBoard.currentPlayer,
      null,
      null,
      0,
      initialBoard.passCount > 0
   );
   mcts._rebuildNodeMap(mcts.persistentRoot);
   mcts.currentRoot = mcts.persistentRoot;
}

function checkWorkerMemoryUsage() {
   const memoryUsage = process.memoryUsage();
   const heapUsed = memoryUsage.heapUsed;
   parentPort.postMessage({
      type: "worker_status_update",
      workerSlotId: workerSlotId,
      heapUsedMB: Math.floor(heapUsed / 1024 / 1024),
   });
}

parentPort.on("message", (msg) => {
   if (msg.type === "terminate_now") {
      console.log(`W${workerSlotId}: Terminated.`);
      process.exit(0);
   } else if (msg.type === "start_game") {
      currentWorkerGameNumber = msg.gameNumber;
      console.log(
         `--- Worker start -> W${workerSlotId} (G${currentWorkerGameNumber}) : ${formatCurrentDateTime()} ---`
      );

      if (msg.treeData) {
         try {
            const rootObject = JSON.parse(msg.treeData);
            mcts.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
            mcts._rebuildNodeMap(mcts.persistentRoot);
            mcts.currentRoot = mcts.persistentRoot;
            console.log(`W${workerSlotId}: Loaded updated MCTS tree (${mcts.nodeMap.size} nodes).`);
         } catch (e) {
            console.error(`W${workerSlotId}: Failed to load updated treeData:`, e);
            const initialBoard = new OthelloBoard();
            mcts.persistentRoot = new MCTSNode(
               initialBoard.blackBoard,
               initialBoard.whiteBoard,
               initialBoard.currentPlayer,
               null,
               null,
               0,
               initialBoard.passedLastTurn
            );
            mcts._rebuildNodeMap(mcts.persistentRoot);
            mcts.currentRoot = mcts.persistentRoot;
         }
      }
      runSelfPlayGame();
   }
});

async function runSelfPlayGame() {
   let board = new OthelloBoard();
   const gameInitialBoard = new OthelloBoard(); // 新しいボードインスタンスで真の初期盤面を取得
   board.setBoardState(
      gameInitialBoard.blackBoard, // ★MCTSNode.initialBlackDiscs ではなく、OthelloBoard の真の初期盤面★
      gameInitialBoard.whiteBoard, // ★MCTSNode.initialWhiteDiscs ではなく、OthelloBoard の真の初期盤面★
      gameInitialBoard.currentPlayer,
      gameInitialBoard.passCount > 0 // passedLastTurn の初期状態は false
   );
   const trueInitialMCTSNode = new MCTSNode(
      gameInitialBoard.blackBoard,
      gameInitialBoard.whiteBoard,
      gameInitialBoard.currentPlayer,
      null,
      null,
      0,
      gameInitialBoard.passCount > 0
   );
   let existingTrueInitialNode = mcts.nodeMap.get(trueInitialMCTSNode.getBoardStateKey());

   if (!existingTrueInitialNode) {
      // 真の初期盤面ノードが nodeMap にない場合（通常はMCTSコンストラクタで入るはずだが、念のため）
      mcts.persistentRoot.merge(trueInitialMCTSNode); // 統計情報マージ
      mcts._rebuildNodeMap(mcts.persistentRoot); // nodeMapを更新
      existingTrueInitialNode = mcts.nodeMap.get(trueInitialMCTSNode.getBoardStateKey()); // 再取得
   }
   // MCTSのcurrentRootを真の初期盤面ノードに設定
   mcts.currentRoot = existingTrueInitialNode;
   isGracefulShutdown = false;
   try {
      while (!board.isGameOver() && !isGracefulShutdown && !mcts.shouldStopSimulations) {
         if (isGracefulShutdown) {
            console.log(
               `W${workerSlotId}: Skipping game G${currentWorkerGameNumber} due to graceful shutdown in progress.`
            );
            return;
         }
         const currentPlayer = board.currentPlayer;
         const validMovesBit = [];
         for (const moveCoords of board.getLegalMoves()) {
            validMovesBit.push(BigInt(moveCoords[0] * OthelloBoard.boardLength + moveCoords[1]));
         }

         if (validMovesBit.length === 0) {
            board.applyMove(null);
            continue;
         }

         let bestMove;
         if (vsRandom && currentPlayer === -1) {
            bestMove = validMovesBit[Math.floor(rng() * validMovesBit.length)];
         } else {
            const currentBoardStateForMCTS = board.getBoardState();
            const tempNodeForMCTS = new MCTSNode(
               currentBoardStateForMCTS.blackBoard,
               currentBoardStateForMCTS.whiteBoard,
               currentPlayer,
               null,
               null,
               0,
               currentBoardStateForMCTS.passedLastTurn
            );

            let existingNode = mcts.nodeMap.get(tempNodeForMCTS.getBoardStateKey());
            if (!existingNode) {
               // ★このifブロックが重要★
               // ノードが存在しない場合、persistentRootにマージする
               console.warn(
                  `W${workerSlotId}: Node for key "${tempNodeForMCTS.getBoardStateKey()}" not found initially. Adding it.`
               );
               mcts.nodeMap.set(tempNodeForMCTS.getBoardStateKey(), tempNodeForMCTS);
               existingNode = tempNodeForMCTS;
            }
            mcts.currentRoot = existingNode;
            bestMove = mcts.run(
               currentBoardStateForMCTS.blackBoard,
               currentBoardStateForMCTS.whiteBoard,
               currentPlayer,
               simsN
            );

            if (mcts.shouldStopSimulations) {
               console.log(
                  `W${workerSlotId}: Game G${currentWorkerGameNumber} terminated early because MCTS.run hit memory limit.`
               );
               isGracefulShutdown = true;
               break;
            }
            if (bestMove === null) {
               bestMove = validMovesBit[Math.floor(rng() * validMovesBit.length)];
            }
         }
         board.applyMove(bestMove); // 実際にボードの状態を更新
         // ★修正: MCTS.updateRoot(bestMove) は、AIが打った手 (AIの手番) の後にのみ呼び出す ★
         // AIが打った手で MCTS の currentRoot を更新し、ノードをツリーに接続
         if (!(vsRandom && currentPlayer === -1)) {
            // ランダムボットの手番でなければ
            mcts.updateRoot(bestMove);
         }
      }
      clearInterval(workerMemoryCheckInterval);

      const scores = board.getScores();
      const winner = board.getWinner();
      const serializedTree = JSON.stringify(mcts.persistentRoot.toSerializableObject());
      const finalMemoryUsage = process.memoryUsage();
      const finalHeapUsedMB = Math.floor(finalMemoryUsage.heapUsed / 1024 / 1024);

      parentPort.postMessage({
         type: "game_finished",
         workerSlotId: workerSlotId,
         gameNumber: currentWorkerGameNumber,
         blackStones: Number(scores.black),
         whiteStones: Number(scores.white),
         winner: winner,
         treeDataAI1: serializedTree,
         treeDataAI2: null,
         finalBoard: board.getBoardState(),
         finalHeapUsedMB: finalHeapUsedMB,
      });
   } catch (error) {
      clearInterval(workerMemoryCheckInterval);
      console.error(`W${workerSlotId}: Error G${currentWorkerGameNumber}:`, error);
      parentPort.postMessage({
         type: "game_error",
         workerSlotId: workerSlotId,
         gameNumber: currentWorkerGameNumber,
         errorMessage: error.message,
         currentBoardState: board.getBoardState(),
         currentPlayer: board.currentPlayer,
      });
      process.exit(1);
   }
}

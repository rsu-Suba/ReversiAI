import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { config } from "./config.mjs";
import { formatCurrentDateTime } from "./module.mjs";
import { parentPort, workerData } from "worker_threads";
import seedrandom from "seedrandom";
import * as fs from "fs";

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

const LOG_FILE_PATH = `./worker_${workerSlotId}_game_log.txt`;

let workerMemoryCheckInterval;
let isGracefulShutdown = false;

const rng = seedrandom(`seed-${workerSlotId}-${Date.now()}-${Math.random()}`);

let mcts = new MCTS(
   cP,
   rng,
   workerSlotId,
   OthelloBoard.blackInitBoard,
   OthelloBoard.whiteInitBoard,
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
   const gameInitialBoard = new OthelloBoard();
   board.setBoardState(
      gameInitialBoard.blackBoard,
      gameInitialBoard.whiteBoard,
      gameInitialBoard.currentPlayer,
      0,
      gameInitialBoard.passCount > 0
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
      mcts.persistentRoot.merge(trueInitialMCTSNode);
      mcts._rebuildNodeMap(mcts.persistentRoot);
      existingTrueInitialNode = mcts.nodeMap.get(trueInitialMCTSNode.getBoardStateKey());
   }
   mcts.currentRoot = existingTrueInitialNode;
   isGracefulShutdown = false;
   try {
      while (!board.isGameOver() && !isGracefulShutdown && !mcts.shouldStopSimulations) {
         const currentBoardData = board.getBoardState();
         const tempNodeForCurrentKey = new MCTSNode(
            currentBoardData.blackBoard,
            currentBoardData.whiteBoard,
            currentBoardData.currentPlayer,
            null,
            null,
            0,
            currentBoardData.passedLastTurn
         );
         const currentTurnBoardKey = tempNodeForCurrentKey.getBoardStateKey();
         fs.appendFileSync(
            LOG_FILE_PATH,
            `\n--- W${workerSlotId} G${currentWorkerGameNumber} - Turn ${
               board.getScores().black + board.getScores().white - 4
            } (Player: ${board.currentPlayer === 1 ? "Black" : "White"}) ---\n`
         );
         fs.appendFileSync(LOG_FILE_PATH, `Current board key: "${currentTurnBoardKey}"\n`);
         fs.appendFileSync(LOG_FILE_PATH, `Key found in nodeMap? ${mcts.nodeMap.has(currentTurnBoardKey)}\n`);
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
            const afterPassBoardData = board.getBoardState();
            const afterPassNode = new MCTSNode(
               afterPassBoardData.blackBoard,
               afterPassBoardData.whiteBoard,
               afterPassBoardData.currentPlayer,
               null,
               null,
               0,
               afterPassBoardData.passedLastTurn
            );
            console.log(
               `W${workerSlotId}: Player ${
                  currentPlayer === 1 ? "Black" : "White"
               } passed. New board key: "${afterPassNode.getBoardStateKey()}"`
            );
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
               simsN,
               currentBoardStateForMCTS.passedLastTurn
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
         board.applyMove(bestMove);
         mcts.updateRoot(bestMove);
         fs.fsyncSync(fs.openSync(LOG_FILE_PATH, "a"));
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

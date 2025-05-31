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
let mcts = new MCTS(cP, rng, workerSlotId);

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
         initialBoard.getBoardState(),
         initialBoard.currentPlayer,
         null,
         null,
         0,
         false
      );
      mcts._rebuildNodeMap(mcts.persistentRoot);
      mcts.currentRoot = mcts.persistentRoot;
   }
} else {
   const initialBoard = new OthelloBoard();
   mcts.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer, null, null, 0, false);
   mcts._rebuildNodeMap(mcts.persistentRoot);
   mcts.currentRoot = mcts.persistentRoot;
}

function checkWorkerMemoryUsage() {
   const memoryUsage = process.memoryUsage();
   const heapUsed = memoryUsage.heapUsed;

   if (heapUsed > MEMORY_THRESHOLD_BYTES_WORKER) {
      console.warn(`W${workerSlotId}: Memory limit over. Current: ${Math.floor(heapUsed / 1024 / 1024)}MB`);
      isGracefulShutdown = true;
      clearInterval(workerMemoryCheckInterval);
      parentPort.postMessage({
         type: "worker_memory_alert",
         workerSlotId: workerSlotId,
         treeDataAI1: JSON.stringify(mcts.persistentRoot.toSerializableObject()),
         treeDataAI2: null,
         reason: "high_memory_usage_worker",
      });

      setTimeout(() => {
         console.log(`W${workerSlotId}: Memory limit -> forced terminate.`);
         process.exit(1);
      }, 500);
   }
}

parentPort.on("message", (msg) => {
   if (msg.type === "terminate_now") {
      console.log(`W${workerSlotId}: Terminated.`);
      clearInterval(workerMemoryCheckInterval);
      console.log(`W${workerSlotId}: Terminated.`);
      clearInterval(workerMemoryCheckInterval);
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
            console.error(`W${workerSlotId}: Failed to load updated treeData:`, e);
            const initialBoard = new OthelloBoard();
            mcts.persistentRoot = new MCTSNode(
               initialBoard.getBoardState(),
               initialBoard.currentPlayer,
               null,
               null,
               0,
               false
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
   board.setBoardState(
      mcts.persistentRoot.boardState,
      mcts.persistentRoot.currentPlayer,
      mcts.persistentRoot.passedLastTurn
   );

   if (workerMemoryCheckInterval) {
      clearInterval(workerMemoryCheckInterval);
   }
   workerMemoryCheckInterval = setInterval(checkWorkerMemoryUsage, MEMORY_CHECK_INTERVAL_MS);
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
         const validMoves = board.getLegalMoves();

         if (validMoves.length === 0) {
            board.passTurn();
            continue;
         }

         let bestMove;
         if (vsRandom && currentPlayer === -1) {
            const randomMove = validMoves[Math.floor(rng() * validMoves.length)];
            bestMove = randomMove;
         } else {
            let foundNode = null;
            const currentBoardKey = JSON.stringify(board.getBoardState()) + "_" + board.currentPlayer;
            const checkNode = mcts.nodeMap.get(currentBoardKey);
            if (checkNode && checkNode.passedLastTurn === board.passedLastTurn) {
               foundNode = checkNode;
            }

            if (foundNode) {
               mcts.currentRoot = foundNode;
            } else {
               const newNode = new MCTSNode(
                  board.getBoardState(),
                  board.currentPlayer,
                  null,
                  null,
                  0,
                  board.passedLastTurn
               );
               mcts.currentRoot = newNode;
               mcts.nodeMap.set(currentBoardKey, newNode);
            }
            bestMove = mcts.run(board.getBoardState(), currentPlayer, simsN);
            if (mcts.shouldStopSimulations) {
               console.log(
                  `W${workerSlotId}: Game G${currentWorkerGameNumber} terminated early because MCTS.run hit memory limit.`
               );
               isGracefulShutdown = true;
               break;
            }

            if (bestMove) {
               mcts.updateRoot(bestMove);
            } else {
               const randomMove = validMoves[Math.floor(rng() * validMoves.length)];
               bestMove = randomMove;
            }
         }

         board.applyMove(bestMove);
      }

      clearInterval(workerMemoryCheckInterval);

      const scores = board.getScores();
      const winner = scores.black > scores.white ? 1 : scores.white > scores.black ? -1 : 0;
      const finalBoardState = board.getBoardState();
      const serializedTree = JSON.stringify(mcts.persistentRoot.toSerializableObject());

      parentPort.postMessage({
         type: "game_finished",
         workerSlotId: workerSlotId,
         gameNumber: currentWorkerGameNumber,
         blackStones: scores.black,
         whiteStones: scores.white,
         winner: winner,
         treeDataAI1: serializedTree,
         treeDataAI2: null,
         finalBoard: finalBoardState,
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

import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { config } from "./config.mjs";
import { parentPort, workerData } from "worker_threads";
import seedrandom from "seedrandom";

const { simsN, cP, workerSlotId, gameNumber, treeData, vsRandom } = workerData;

const MEMORY_CHECK_INTERVAL_MS = config.Mem_Worker_Check_Interval;
const MEMORY_THRESHOLD_PERCENT = config.Mem_Worker_Threshold_Per;
const MAX_HEAP_SIZE_MB = config.Mem_Heap_Size;
const MAX_HEAP_SIZE_BYTES_WORKER = MAX_HEAP_SIZE_MB * 1024 * 1024;
const MEMORY_THRESHOLD_BYTES_WORKER = MAX_HEAP_SIZE_BYTES_WORKER * MEMORY_THRESHOLD_PERCENT;

let workerMemoryCheckInterval;
let isGracefulShutdown = false;

const rng = seedrandom(`seed-${workerSlotId}-${Date.now()}-${Math.random()}`);
let mcts = new MCTS(cP, rng);

if (treeData) {
   try {
      const rootObject = JSON.parse(treeData);
      mcts.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
      mcts._rebuildNodeMap(mcts.persistentRoot);
      mcts.currentRoot = mcts.persistentRoot;
      console.log(`--- Loaded tree -> W${workerSlotId} (${mcts.nodeMap.size} nodes) ---`);
   } catch (e) {
      console.error(`W${workerSlotId}: Failed to load treeData:`, e);
      const initialBoard = new OthelloBoard();
      mcts.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
      mcts._rebuildNodeMap(mcts.persistentRoot);
      mcts.currentRoot = mcts.persistentRoot;
   }
} else {
   const initialBoard = new OthelloBoard();
   mcts.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
   mcts._rebuildNodeMap(mcts.persistentRoot);
   mcts.currentRoot = mcts.persistentRoot;
}

function checkWorkerMemoryUsage() {
   const memoryUsage = process.memoryUsage();
   const heapUsed = memoryUsage.heapUsed;

   if (heapUsed > MEMORY_THRESHOLD_BYTES_WORKER && !isGracefulShutdown) {
      console.warn(`W${workerSlotId}: Memory limit over.`);
      isGracefulShutdown = true;
      clearInterval(workerMemoryCheckInterval);
      parentPort.postMessage({
         type: "worker_memory_alert",
         workerSlotId: workerSlotId,
         treeDataAI1: JSON.stringify(mctsAI1.persistentRoot.toSerializableObject()),
         treeDataAI2: JSON.stringify(mctsAI2.persistentRoot.toSerializableObject()),
         reason: "high_memory_usage_worker",
      });

      setTimeout(() => {
         console.log(`W${workerSlotId}: Memory limit -> terminate.`);
         process.exit(0);
      }, 500);
   }
}

parentPort.on("message", (msg) => {
   if (msg.type === "terminate_now") {
      console.log(`W${workerSlotId}: Terminated.`);
      clearInterval(workerMemoryCheckInterval);
      process.exit(0);
   } else if (msg.type === "start_game") {
      if (msg.treeData) {
         try {
            const rootObject = JSON.parse(msg.treeData);
            mcts = new MCTS(cP, seedrandom(`seed-${workerSlotId}-${Date.now()}-${Math.random()}`));
            mcts.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
            mcts._rebuildNodeMap(mcts.persistentRoot);
            mcts.currentRoot = mcts.persistentRoot;
            console.log(`W${workerSlotId}: Loaded updated MCTS tree ${mcts.nodeMap.size} nodes.`);
         } catch (e) {
            console.error(`W${workerSlotId}: Failed to load updated treeData:`, e);
            const initialBoard = new OthelloBoard();
            mcts = new MCTS(cP, seedrandom(`seed-${workerSlotId}-${Date.now()}-${Math.random()}`));
            mcts.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
            mcts._rebuildNodeMap(mcts.persistentRoot);
            mcts.currentRoot = mcts.persistentRoot;
         }
      }
      runSelfPlayGame();
   }
});

async function runSelfPlayGame() {
   let board = new OthelloBoard();
   workerMemoryCheckInterval = setInterval(checkWorkerMemoryUsage, MEMORY_CHECK_INTERVAL_MS);
   const nowDate = new Date();
   console.log("");
   console.log(
      `--- Game start -> W${workerSlotId} : ${nowDate.getHours()}:${nowDate.getMinutes()}:${nowDate.getSeconds()} at ${
         nowDate.getMonth() + 1
      }/${nowDate.getDate()}/${nowDate.getFullYear()} ---`
   );
   try {
      while (!board.isGameOver()) {
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
            bestMove = mcts.run(board.getBoardState(), currentPlayer, simsN);
            if (bestMove) {
               mcts.updateRoot(bestMove);
            } else {
               const randomMove = validMoves[Math.floor(rng() * validMoves.length)];
               bestMove = randomMove;
               console.warn(`W${workerSlotId}: No best move.`);
            }
         }

         board.applyMove(bestMove);
      }
      console.log(`Mem: ${Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
      clearInterval(workerMemoryCheckInterval);

      const scores = board.getScores();
      const winner = scores.black > scores.white ? 1 : scores.white > scores.black ? -1 : 0;
      const finalBoardState = board.getBoardState();
      const serializedTree = JSON.stringify(mcts.persistentRoot.toSerializableObject());

      parentPort.postMessage({
         type: "game_finished",
         workerSlotId: workerSlotId,
         gameNumber: workerData.gameNumber,
         blackStones: scores.black,
         whiteStones: scores.white,
         winner: winner,
         treeDataAI1: serializedTree,
         treeDataAI2: null,
         finalBoard: finalBoardState,
      });
   } catch (error) {
      clearInterval(workerMemoryCheckInterval);
      console.error(`W${workerSlotId}: Error G${workerData.gameNumber}:`, error);
      parentPort.postMessage({
         type: "game_error",
         workerSlotId: workerSlotId,
         gameNumber: workerData.gameNumber,
         errorMessage: error.message,
         currentBoardState: board.getBoardState(),
         currentPlayer: board.currentPlayer,
      });
   }
}

runSelfPlayGame();

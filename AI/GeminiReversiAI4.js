import { Worker } from "worker_threads";
import { OthelloBoard } from "./GeminiOthelloBoard.mjs";
import { MCTS } from "./GeminiMCTS.mjs";
import { MCTSNode } from "./GeminiMCTSNode.mjs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const saveFileName = "mcts_tree.msgpack";
const saveFilePath = path.join(__dirname, saveFileName);

const numParallelGames = 4;
const simsN = 50;
const totalGames = 40;

let gamesStartedCount = 0;
let gamesFinishedCount = 0;
const activeWorkers = new Map();

const mcts = new MCTS();

async function startSelfPlay() {
   console.log("--- Starting Parallel Self-Play ---");
   console.log(`Sim:${simsN}, Parallel:${numParallelGames}, Matches:${totalGames}`);
   console.log(`MCTS tree will be saved to: ${saveFilePath}`);

   if (!mcts.persistentRoot) {
      const initialBoard = new OthelloBoard();
      mcts.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
      mcts.currentRoot = mcts.persistentRoot;
      console.log("Main Thread: Initialized a new MCTS persistent tree.");
   }

   //Start worker
   for (let i = 0; i < numParallelGames; i++) {
      if (gamesStartedCount < totalGames) {
         startNewGameInWorker(i);
      } else {
         break;
      }
   }
}

async function startNewGameInWorker(workerSlotId) {
   if (gamesStartedCount >= totalGames) return;
   gamesStartedCount++;
   const currentGlobalGameNumber = gamesStartedCount;
   console.log(`Main Thread: Starting game ${currentGlobalGameNumber} with Worker ${workerSlotId}`);

   const worker = new Worker("./worker.mjs", {
      workerData: {
         simsN: simsN,
         saveFilePath: saveFilePath,
         workerSlotId: workerSlotId,
         gameNumber: currentGlobalGameNumber,
      },
   });

   activeWorkers.set(workerSlotId, worker);
   worker.on("message", async (msg) => {
      if (msg.type === "game_finished") {
         console.log(`\n--- Game ${msg.gameNumber}/${totalGames} Finished (Worker ${msg.workerSlotId}) ---`);
         console.log(`Winner: ${msg.winner === 1 ? "Black" : msg.winner === -1 ? "White" : "Draw"}.`);
         console.log(`Scores: Black: ${msg.blackStones}, White: ${msg.whiteStones}.`);

         // Display last board
         const finalBoardDisplay = new OthelloBoard();
         finalBoardDisplay.setBoardState(msg.finalBoard, 0);
         finalBoardDisplay.display();

         // Merge last node
         const workerRootNodeAI1 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI1));
         const workerRootNodeAI2 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI2));
         mcts.persistentRoot.merge(workerRootNodeAI1);
         mcts.persistentRoot.merge(workerRootNodeAI2);

         gamesFinishedCount++;

         if (
            gamesFinishedCount % Math.ceil(totalGames / numParallelGames / 2) === 0 ||
            gamesFinishedCount === totalGames
         ) {
            await mcts.saveTree(saveFilePath);
            console.log(`MCTS tree updated and saved after ${gamesFinishedCount} games.`);
         }

         //kill worker
         worker.terminate();
         activeWorkers.delete(msg.workerSlotId);

         if (gamesStartedCount < totalGames) {
            await startNewGameInWorker(msg.workerSlotId);
         } else if (activeWorkers.size === 0) {
            console.log("Main Thread: All games completed. Final MCTS tree saved.");
            await mcts.saveTree(saveFilePath); //All finish
         }
      }
   });

   worker.on("error", (err) => {
      console.error(`Main Thread: Worker ${workerSlotId} encountered an error:`, err);
      worker.terminate();
      activeWorkers.delete(workerSlotId);
      gamesFinishedCount++;

      if (gamesStartedCount < totalGames) {
         startNewGameInWorker(workerSlotId);
      } else if (activeWorkers.size === 0) {
         console.log("Main Thread: All games completed (with errors). Final MCTS tree saved.");
         mcts.saveTree(saveFilePath);
      }
   });

   worker.on("exit", (code) => {
      if (code !== 0) {
         console.error(`Main Thread: Worker ${workerSlotId} exited with code ${code}`);
      }
   });
}

startSelfPlay();

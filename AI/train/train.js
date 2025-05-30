import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import * as path from "path";
import seedrandom from "seedrandom";

const numParallelGames = 4;
const simsN = 1000;
const cP = 1.7;
const learningDurationHours = 0;
const totalGames = 100;
const vsRandom = false;

let workerPath = "./workerAI.mjs";
if (vsRandom) workerPath = "./workerRandom.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const saveFileName = "mcts_tree.msgpack";
const saveFilePath = path.join(__dirname, saveFileName);

const startTime = Date.now();
const endTime = startTime + learningDurationHours * 60 * 60 * 1000;

let gamesStartedCount = 0;
let gamesFinishedCount = 0;
const activeWorkers = new Map();
let isTerminating = false;

const mainMCTSRng = seedrandom(`main-mcts-seed-${Date.now()}-${Math.random()}`);
const mcts = new MCTS(cP, mainMCTSRng);

function isLearningActive() {
   if (learningDurationHours > 0) {
      return Date.now() < endTime;
   } else {
      return gamesStartedCount < totalGames;
   }
}

async function initiateTermination(reason = "unknown") {
   if (isTerminating) {
      console.warn(`Main Thread: Termination already ${reason}`);
      return;
   }
   isTerminating = true;
   console.log(`\nMain Thread: Initiating termination ${reason}`);

   activeWorkers.forEach((worker, id) => {
      console.log(`Main Thread: Terminate started -> W${id}.`);
      worker.postMessage({ type: "terminate_now" });
   });

   const workerExitPromises = [];
   activeWorkers.forEach((worker, id) => {
      workerExitPromises.push(
         new Promise((resolve) => {
            worker.once("exit", (code) => {
               console.log(`Main Thread: W${id} exited -> ${code}`);
               activeWorkers.delete(id);
               resolve();
            });
            worker.once("error", (err) => {
               console.error(`Main Thread: W${id} error in terminating:`, err);
               activeWorkers.delete(id);
               resolve();
            });
         })
      );
   });

   const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => {
         console.log("Main Thread: Wait end -> Timed out 10s");
         resolve();
      }, 10000)
   );

   await Promise.race([Promise.all(workerExitPromises), timeoutPromise]);
   await mcts.saveTree(saveFilePath);
   console.log("MCTS tree saved.");

   activeWorkers.forEach((w, id) => {
      console.log(`Main Thread: Force terminate W${id}.`);
      w.terminate();
   });
   activeWorkers.clear();
   console.log("Main Thread: Exit main -> All W ended.");
   process.exit(0);
}
async function startSelfPlay() {
   console.log("--- Starting Parallel Self-Play ---");
   console.log(`Sim:${simsN}, Parallel:${numParallelGames}, Matches:${totalGames}`);

   if (learningDurationHours > 0) {
      console.log(`Learning: ${learningDurationHours} hrs -> (${new Date(endTime).toLocaleString()}).`);
      startTime = Date.now();
      learningEndTime = startTime + learningDurationHours * 60 * 60 * 1000;
   } else {
      console.log(`Total Games: ${totalGames}`);
   }
   console.log(`MCTS tree saved: ${saveFilePath}`);

   const loaded = await mcts.loadTree(saveFilePath);
   if (!loaded) {
      if (!mcts.persistentRoot) {
         const initialBoard = new OthelloBoard();
         mcts.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
         mcts._rebuildNodeMap(mcts.persistentRoot);
         console.log("Main Thread: New MCTS tree.");
      }
   }

   process.on("SIGINT", () => initiateTermination("Ctrl+C OK"));

   for (let i = 0; i < numParallelGames; i++) {
      if (isLearningActive()) {
         startNewGameInWorker(i);
      } else {
         console.log(`Main Thread: No new W.`);
         break;
      }
   }
}

async function startNewGameInWorker(workerSlotId) {
   if (isTerminating || !isLearningActive()) return;
   gamesStartedCount++;
   const currentGlobalGameNumber = gamesStartedCount;
   console.log(`Main Thread: Game start ${currentGlobalGameNumber} -> W${workerSlotId}`);
   const worker = new Worker(workerPath, {
      workerData: {
         simsN: simsN,
         cP: cP,
         workerSlotId: workerSlotId,
         gameNumber: currentGlobalGameNumber,
         treeData: JSON.stringify(mcts.persistentRoot.toSerializableObject()),
      },
   });

   activeWorkers.set(workerSlotId, worker);
   worker.on("message", async (msg) => {
      if (isTerminating) {
         console.log(`Main Thread: W${msg.workerSlotId} ignore -> terminating.`);
         return;
      }

      if (msg.type === "game_finished") {
         gamesFinishedCount++;
         console.log(`\n--- Game set W${msg.workerSlotId} -> ${gamesFinishedCount} ---`);
         console.log(`Winner: ${msg.winner === 1 ? "Black" : msg.winner === -1 ? "White" : "Draw"}.`);
         console.log(`Scores: Black: ${msg.blackStones}, White: ${msg.whiteStones}.`);
         const progressInfo =
            learningDurationHours > 0
               ? `Now: ${new Date().toLocaleString()}, End: ${Math.max(0, endTime - Date.now()) / 1000}s`
               : `Progress: ${gamesFinishedCount} / ${totalGames} games`;
         console.log(progressInfo);
         if (msg.finalBoard) {
            const finalBoardDisplay = new OthelloBoard();
            finalBoardDisplay.setBoardState(msg.finalBoard, 0);
            console.log("Final Board State:");
            finalBoardDisplay.display();
         } else {
            console.warn(`Warning: No final board W${msg.workerSlotId}.`);
         }

         const workerRootNodeAI1 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI1));
         let workerRootNodeAI2 = null;
         if (!vsRandom) workerRootNodeAI2 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI2));
         mcts.mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2);

         const saveIntervalGames = Math.max(1, Math.ceil(totalGames / (numParallelGames * 5)));
         if (gamesFinishedCount % saveIntervalGames === 0 || gamesFinishedCount === totalGames) {
            await mcts.saveTree(saveFilePath);
            console.log(`MCTS tree updated ${gamesFinishedCount} games.`);
         }

         worker.terminate();
         activeWorkers.delete(msg.workerSlotId);

         if (isLearningActive()) {
            startNewGameInWorker(msg.workerSlotId);
         } else if (activeWorkers.size === 0) {
            initiateTermination("learning target reached");
         }
      } else if (msg.type === "game_error") {
         console.error(`\n--- Game Error (W${msg.workerSlotId}, Game ${msg.gameNumber}) ---`);
         console.error(`Error: ${msg.errorMessage}`);
         worker.terminate();
         activeWorkers.delete(msg.workerSlotId);
         if (isLearningActive()) {
            console.log(`Main Thread: Resuming game W${msg.workerSlotId} despite error.`);
            startNewGameInWorker(msg.workerSlotId);
         } else if (activeWorkers.size === 0) {
            initiateTermination("learning target reached error");
         }
      }
   });

   worker.on("error", (err) => {
      console.error(`Main Thread: Error -> W${workerSlotId}:`, err);
      worker.terminate();
      activeWorkers.delete(workerSlotId);
      if (isLearningActive()) {
         startNewGameInWorker(workerSlotId);
      } else if (activeWorkers.size === 0) {
         initiateTermination("learning target reached error");
      }
   });

   worker.on("exit", (code) => {
      if (code !== 0) {
         console.error(`Main Thread: Exited non-zero -> W${workerSlotId}, code : ${code}`);
      }
   });
}

startSelfPlay();

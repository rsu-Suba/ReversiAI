import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { config } from "./config.mjs";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import * as path from "path";
import seedrandom from "seedrandom";

const numParallelGames = config.parallel;
const simsN = config.simsN;
const cP = config.cP;
const trainingHours = config.trainingHours;
const totalGames = config.matches;
const vsRandom = config.vsRandom;
const MEMORY_CHECK_INTERVAL_MS = config.Mem_Check_Interval;
const MEMORY_THRESHOLD_PERCENT = config.Mem_Threshold_Per;
const MAX_HEAP_SIZE_MB = config.Mem_Heap_Size;
const saveFileName = config.treeSavePath;
const backupFileName = config.treeBackupPath;

let workerPath = "./workerAI.mjs";
if (vsRandom) workerPath = "./workerRandom.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const saveFilePath = path.join(__dirname, saveFileName);
const backupFilePath = path.join(__dirname, backupFileName);

let trainingStartTime = Date.now();
let trainingEndTime;

let gamesStartedCount = 0;
let gamesFinishedCount = 0;
const activeWorkers = new Map();
let isTerminating = false;

const mainMCTSRng = seedrandom(`main-mcts-seed-${Date.now()}-${Math.random()}`);
const mcts = new MCTS(cP, mainMCTSRng);

const MAX_HEAP_SIZE_BYTES = MAX_HEAP_SIZE_MB * 1024 * 1024;
const MEMORY_THRESHOLD_BYTES = MAX_HEAP_SIZE_BYTES * MEMORY_THRESHOLD_PERCENT;

let memoryCheckInterval;

function isLearningActive() {
   if (trainingHours > 0) {
      return Date.now() < trainingEndTime;
   } else {
      return gamesStartedCount < totalGames;
   }
}

async function initiateTermination(reason = "unknown") {
   if (isTerminating) {
      return;
   }
   isTerminating = true;
   console.log(`\n--- Termination (${reason}) ---`);

   clearInterval(memoryCheckInterval);

   activeWorkers.forEach((worker, id) => {
      worker.postMessage({ type: "terminate_now" });
   });

   const workerExitPromises = [];
   activeWorkers.forEach((worker, id) => {
      workerExitPromises.push(
         new Promise((resolve) => {
            worker.once("exit", (code) => {
               activeWorkers.delete(id);
               resolve();
            });
            worker.once("error", (err) => {
               activeWorkers.delete(id);
               resolve();
            });
         })
      );
   });

   const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => {
         resolve();
      }, 10000)
   );

   await Promise.race([Promise.all(workerExitPromises), timeoutPromise]);

   try {
      await mcts.saveTree(saveFilePath);
      await mcts.saveTree(backupFilePath);
      console.log("MCTS tree saved.");
   } catch (error) {
      console.error("Failed to save MCTS tree (termination):", error);
   } finally {
      activeWorkers.forEach((w) => {
         w.terminate();
      });
      activeWorkers.clear();
      console.log("All workers terminated.");
      process.exit(0);
   }
}

function checkMemoryUsage() {
   const memoryUsage = process.memoryUsage();
   const heapUsed = memoryUsage.heapUsed;

   if (heapUsed > MEMORY_THRESHOLD_BYTES) {
      console.warn(
         `\n--- WARNING: Memory usage (${Math.round(heapUsed / 1024 / 1024)}MB) > ${
            MEMORY_THRESHOLD_PERCENT * 100
         }% ---`
      );
      initiateTermination("high_memory_usage");
   }
}

async function startSelfPlay() {
   console.log("--- Starting Parallel Self-Play ---");
   console.log(`Sim:${simsN}, Parallel:${numParallelGames}, Matches:${totalGames}`);

   if (trainingHours > 0) {
      console.log(
         `Training: ${trainingHours} hrs -> (${new Date(
            trainingStartTime + trainingHours * 60 * 60 * 1000
         ).toLocaleString()}).`
      );
      trainingEndTime = trainingStartTime + trainingHours * 60 * 60 * 1000;
   } else {
      console.log(`Total Games: ${totalGames}`);
   }
   console.log(`Loading MCTS tree save path: ${saveFileName}`);

   const loaded = await mcts.loadTree(saveFilePath);
   if (!loaded) {
      if (!mcts.persistentRoot) {
         const initialBoard = new OthelloBoard();
         mcts.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
         mcts._rebuildNodeMap(mcts.persistentRoot);
         console.log("New MCTS tree created.");
      }
   } else {
      console.log("MCTS tree loaded. -> Ready to traning.");
   }

   memoryCheckInterval = setInterval(checkMemoryUsage, MEMORY_CHECK_INTERVAL_MS);

   process.on("SIGINT", () => initiateTermination("Ctrl+C"));

   for (let i = 0; i < numParallelGames; i++) {
      if (isLearningActive()) {
         startNewGameInWorker(i);
      } else {
         break;
      }
   }
}

async function startNewGameInWorker(workerSlotId) {
   if (isTerminating || !isLearningActive()) return;
   gamesStartedCount++;
   const currentGlobalGameNumber = gamesStartedCount;
   const worker = new Worker(workerPath, {
      workerData: {
         simsN: simsN,
         cP: cP,
         workerSlotId: workerSlotId,
         gameNumber: currentGlobalGameNumber,
         treeData: JSON.stringify(mcts.persistentRoot.toSerializableObject()),
         vsRandom: vsRandom,
      },
   });

   activeWorkers.set(workerSlotId, worker);
   worker.on("message", async (msg) => {
      if (isTerminating) {
         return;
      }

      if (msg.type === "game_finished") {
         gamesFinishedCount++;
         console.log(`\n--- Game completed -> W${msg.workerSlotId} (${gamesFinishedCount}/${totalGames}) ---`);
         console.log(`Scores: Black: ${msg.blackStones}, White: ${msg.whiteStones}.`);
         console.log(`Winner: ${msg.winner === 1 ? "Black" : msg.winner === -1 ? "White" : "Draw"}. `);
         const progressInfo =
            trainingHours > 0
               ? (() => {
                    const remainingMs = Math.max(0, trainingEndTime - Date.now());
                    const totalSeconds = Math.floor(remainingMs / 1000);
                    const hours = Math.floor(totalSeconds / 3600);
                    const minutes = Math.floor((totalSeconds % 3600) / 60);
                    const seconds = totalSeconds % 60;
                    const pad = (num) => String(num).padStart(2, "0");
                    const estimatedEndTime = new Date(trainingEndTime);
                    const endHours = pad(estimatedEndTime.getHours());
                    const endMinutes = pad(estimatedEndTime.getMinutes());
                    const endSeconds = pad(estimatedEndTime.getSeconds());
                    const endMonth = pad(estimatedEndTime.getMonth() + 1);
                    const endDate = pad(estimatedEndTime.getDate());
                    const endYear = pad(estimatedEndTime.getFullYear());

                    return `Remaining: ${pad(hours)}:${pad(minutes)}:${pad(
                       seconds
                    )} | End: ${endHours}:${endMinutes}:${endSeconds} at ${endMonth}/${endDate}/${endYear}`;
                 })()
               : `Progress: ${gamesFinishedCount} / ${totalGames} games`;

         console.log(progressInfo);

         const workerRootNodeAI1 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI1));
         let workerRootNodeAI2 = null;
         if (!vsRandom && msg.treeDataAI2) {
            workerRootNodeAI2 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI2));
         }
         mcts.mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2);

         const saveIntervalGames = Math.max(1, Math.ceil(totalGames / (numParallelGames * 5)));
         if (gamesFinishedCount % saveIntervalGames === 0 || gamesFinishedCount === totalGames) {
            await mcts.saveTree(saveFilePath);
            await mcts.saveTree(backupFilePath);
            console.log(`MCTS tree saved G${gamesFinishedCount}.`);
         }

         worker.terminate();
         activeWorkers.delete(msg.workerSlotId);

         if (isLearningActive()) {
            startNewGameInWorker(msg.workerSlotId);
         } else if (activeWorkers.size === 0) {
            initiateTermination("learning_target_reached");
         }
      } else if (msg.type === "game_error") {
         console.error(`\n--- Game Error (W${msg.workerSlotId}, G${msg.gameNumber}) ---`);
         console.error(`Error: ${msg.errorMessage}`);
         worker.terminate();
         activeWorkers.delete(msg.workerSlotId);
         if (isLearningActive()) {
            startNewGameInWorker(msg.workerSlotId);
         } else if (activeWorkers.size === 0) {
            initiateTermination("learning_target_reached_with_error");
         }
      } else if (msg.type === "worker_memory_alert") {
         console.warn(`\n--- Main Thread: W${msg.workerSlotId} -> Mem alert. ---`);
         clearInterval(memoryCheckInterval);
         isTerminating = true;
         try {
            const workerRootNodeAI1 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI1));
            let workerRootNodeAI2 = null;
            if (!vsRandom && msg.treeDataAI2) {
               workerRootNodeAI2 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI2));
            }
            mcts.mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2);
            console.log(`Main Thread: Merged tree <- W${msg.workerSlotId}.`);
         } catch (e) {
            console.error(`Main Thread: Error merging tree <- W${msg.workerSlotId} during alert:`, e);
         }
         activeWorkers.forEach((w, id) => {
            if (id !== msg.workerSlotId) {
               w.postMessage({ type: "terminate_now" });
            }
         });
         const workerExitPromisesForAlert = [];
         activeWorkers.forEach((w, id) => {
            workerExitPromisesForAlert.push(
               new Promise((resolve) => {
                  w.once("exit", (code) => {
                     activeWorkers.delete(id);
                     resolve();
                  });
                  w.once("error", (err) => {
                     activeWorkers.delete(id);
                     resolve();
                  });
               })
            );
         });

         const alertTimeoutPromise = new Promise((resolve) =>
            setTimeout(() => {
               resolve();
            }, 15000)
         );

         await Promise.race([Promise.all(workerExitPromisesForAlert), alertTimeoutPromise]);
         try {
            await mcts.saveTree(saveFilePath);
            await mcts.saveTree(backupFilePath);
            console.log("MCTS tree save finish.");
         } catch (error) {
            console.error("Failed to save MCTS tree:", error);
         } finally {
            activeWorkers.forEach((w) => {
               w.terminate();
            });
            activeWorkers.clear();
            console.log("Worker memory alert -> exit.");
            process.exit(0);
         }
      }
   });

   worker.on("error", (err) => {
      console.error(`Main Thread: W${workerSlotId} -> error:`, err);
      worker.terminate();
      activeWorkers.delete(workerSlotId);
      if (isLearningActive()) {
         startNewGameInWorker(workerSlotId);
      } else if (activeWorkers.size === 0) {
         initiateTermination("worker_error");
      }
   });

   worker.on("exit", (code) => {
      if (code !== 0) {
         console.error(`Main Thread: W${workerSlotId} exited -> code: ${code}`);
      }
   });
}

startSelfPlay();

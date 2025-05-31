import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { config } from "./config.mjs";
import { formatCurrentDateTime } from "./module.mjs";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import * as path from "path";
import seedrandom from "seedrandom";
import * as fs from "fs/promises";

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
let isSavingTree = false;

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
   for (const [id, worker] of activeWorkers.entries()) {
      workerExitPromises.push(
         new Promise((resolve) => {
            worker.once("exit", (code) => {
               console.log(`Main Thread: W${id} exited code: ${code}`);
               activeWorkers.delete(id);
               resolve();
            });
            worker.once("error", (err) => {
               console.error(`Main Thread: W${id} error <- termination:`, err);
               activeWorkers.delete(id);
               resolve();
            });
         })
      );
   }

   const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 10000));

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
         `\n--- Memory over (${Math.round(heapUsed / 1024 / 1024)}MB) > ${MEMORY_THRESHOLD_PERCENT * 100}% ---`
      );
      initiateTermination("high_memory_usage_main_thread");
   }
}
async function startSelfPlay() {
   console.log("--- Starting Parallel Play ---");
   console.log(`Sim:${simsN}, Parallel:${numParallelGames}, Matches:${totalGames}`);

   if (trainingHours > 0) {
      trainingEndTime = trainingStartTime + trainingHours * 60 * 60 * 1000;
      console.log(`Training: ${trainingHours} hrs -> (${new Date(trainingEndTime).toLocaleString()}).`);
   } else {
      console.log(`Total Games: ${totalGames}`);
   }
   console.log(`Loading MCTS tree <- ${saveFileName}`);

   await loadMCTSTree(mcts, saveFilePath, backupFilePath);

   memoryCheckInterval = setInterval(checkMemoryUsage, MEMORY_CHECK_INTERVAL_MS);

   process.on("SIGINT", () => initiateTermination("Ctrl+C"));

   for (let i = 0; i < numParallelGames; i++) {
      if (isLearningActive()) {
         const worker = new Worker("./workerAI.mjs", {
            workerData: {
               simsN: simsN,
               cP: cP,
               workerSlotId: i,
               vsRandom: vsRandom,
            },
         });
         activeWorkers.set(i, worker);

         worker.on("message", async (msg) => {
            if (isTerminating) return;

            if (msg.type === "game_finished") {
               gamesFinishedCount++;
               console.log(
                  `\n--- Game completed -> W${
                     msg.workerSlotId
                  } (${gamesFinishedCount}/${totalGames}) : ${formatCurrentDateTime()} ---`
               );
               console.log(`Scores: ${msg.blackStones} / ${msg.whiteStones}`);
               console.log(`Winner: ${msg.winner === 1 ? "Black" : msg.winner === -1 ? "White" : "Draw"}. `);
               let progress = "Progress: ${gamesFinishedCount} / ${totalGames} games";
               if (trainingHours > 0) {
                  const timeLeft = trainingEndTime - new Date();
                  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                  const minutes = String(Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0");
                  const seconds = String(Math.floor((timeLeft % (1000 * 60)) / 1000)).padStart(2, "0");
                  progress = `Est : ${hours}:${minutes}:${seconds}`;
               }
               console.log(`${progress}\n`);

               const workerRootNodeAI1 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI1));
               let workerRootNodeAI2 = null;
               if (vsRandom === false && msg.treeDataAI2) {
                  workerRootNodeAI2 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI2));
               }
               mcts.mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2);

               const saveIntervalGames = Math.max(1, Math.ceil(totalGames / (numParallelGames * 5)));
               if (
                  (gamesFinishedCount % saveIntervalGames === 0 || gamesFinishedCount === totalGames) &&
                  !isSavingTree
               ) {
                  isSavingTree = true;
                  try {
                     await mcts.saveTree(saveFilePath);
                     await mcts.saveTree(backupFilePath);
                     console.log(`MCTS tree saved G${gamesFinishedCount}.`);
                  } catch (error) {
                     console.error(`Error saving MCTS tree G${gamesFinishedCount}:`, error);
                  } finally {
                     isSavingTree = false;
                  }
               }

               if (isLearningActive()) {
                  gamesStartedCount++;
                  const currentWorker = activeWorkers.get(msg.workerSlotId);

                  if (currentWorker) {
                     console.log(
                        `\n--- Game start -> W${
                           msg.workerSlotId
                        } (G${gamesStartedCount}) : ${formatCurrentDateTime()} ---`
                     );
                     currentWorker.postMessage({
                        type: "start_game",
                        gameNumber: gamesStartedCount,
                        treeData: mcts.persistentRoot
                           ? JSON.stringify(mcts.persistentRoot.toSerializableObject())
                           : null,
                     });
                  } else {
                     console.error(`Main Thread: Worker ${msg.workerSlotId} not found in activeWorkers.`);
                  }
               } else {
                  const workerToTerminate = activeWorkers.get(msg.workerSlotId);
                  if (workerToTerminate) {
                     workerToTerminate.postMessage({ type: "terminate_now" });
                  }
                  if (activeWorkers.size === 1) {
                     initiateTermination("learning_target_reached");
                  }
               }
            } else if (msg.type === "game_error") {
               console.error(`\n--- Game Error (W${msg.workerSlotId}, G${msg.gameNumber}) ---`);
               console.error(`Error: ${msg.errorMessage}`);
               const erroredWorker = activeWorkers.get(msg.workerSlotId);
               if (erroredWorker) {
                  erroredWorker.terminate();
                  activeWorkers.delete(msg.workerSlotId);
               }
               if (!isTerminating && isLearningActive()) {
                  console.warn(`Main Thread: Restarting worker ${msg.workerSlotId} due to error.`);
                  const newWorker = new Worker("./workerAI.mjs", {
                     workerData: {
                        simsN: simsN,
                        cP: cP,
                        workerSlotId: msg.workerSlotId,
                        vsRandom: vsRandom,
                     },
                  });
                  activeWorkers.set(msg.workerSlotId, newWorker);
                  gamesStartedCount++;
                  console.log(
                     `\n--- Game start -> W${msg.workerSlotId} (G${gamesStartedCount}) : ${formatCurrentDateTime()} ---`
                  );
                  newWorker.postMessage({
                     type: "start_game",
                     gameNumber: gamesStartedCount,
                     treeData: mcts.persistentRoot ? JSON.stringify(mcts.persistentRoot.toSerializableObject()) : null,
                  });
               } else if (activeWorkers.size === 0) {
                  initiateTermination("learning_target_reached_with_error");
               }
            } else if (msg.type === "worker_memory_alert") {
               console.warn(`\n--- Main Thread: W${msg.workerSlotId} -> Memory alert. Terminating worker.`);
               clearInterval(memoryCheckInterval);
               isTerminating = true;

               try {
                  const workerRootNodeAI1 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI1));
                  let workerRootNodeAI2 = null;
                  if (vsRandom === false && msg.treeDataAI2) {
                     workerRootNodeAI2 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI2));
                  }
                  mcts.mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2);
                  console.log(`Main Thread: Merged tree W${msg.workerSlotId} during memory alert.`);
               } catch (e) {
                  console.error(`Main Thread: Error merging tree W${msg.workerSlotId} during alert:`, e);
               }

               activeWorkers.forEach((w) => w.postMessage({ type: "terminate_now" }));
               initiateTermination("worker_memory_alert");
            }
         });

         worker.on("error", (err) => {
            console.error(`Main Thread: W${i} error:`, err);
            activeWorkers.delete(i);
            if (!isTerminating && isLearningActive()) {
               console.warn(`Main Thread: Restarting worker ${i} error.`);
               const newWorker = new Worker("./workerAI.mjs", {
                  workerData: {
                     simsN: simsN,
                     cP: cP,
                     workerSlotId: i,
                     vsRandom: vsRandom,
                  },
               });
               activeWorkers.set(i, newWorker);
               gamesStartedCount++;
               console.log(`\n--- Game start -> W${i} (G${gamesStartedCount}) : ${formatCurrentDateTime()} ---`);
               newWorker.postMessage({
                  type: "start_game",
                  gameNumber: gamesStartedCount,
                  treeData: mcts.persistentRoot ? JSON.stringify(mcts.persistentRoot.toSerializableObject()) : null,
               });
            } else if (activeWorkers.size === 0) {
               initiateTermination("uncaught_error_in_worker");
            }
         });

         worker.on("exit", (code) => {
            if (activeWorkers.has(i)) {
               if (code !== 0) {
                  console.error(`Main Thread: W${i} exited unexpectedly (code: ${code}).`);
               } else {
                  console.log(`Main Thread: W${i} exited (code: ${code}).`);
               }
               activeWorkers.delete(i);
            }

            if (!isTerminating && isLearningActive() && activeWorkers.size === 0) {
               console.warn(`Main Thread: All workers exited, but training is active. Restarting all workers.`);
               for (let j = 0; j < numParallelGames; j++) {
                  startNewGameInWorker(j);
               }
            } else if (activeWorkers.size === 0 && isTerminating) {
               initiateTermination("all_workers_terminated_as_expected");
            }
         });

         gamesStartedCount++;
         console.log(`--- Game start -> W${i} (G${gamesStartedCount}) : ${formatCurrentDateTime()} ---`);
         worker.postMessage({
            type: "start_game",
            gameNumber: gamesStartedCount,
            treeData: mcts.persistentRoot ? JSON.stringify(mcts.persistentRoot.toSerializableObject()) : null,
         });
      } else {
         break;
      }
   }
}

async function loadMCTSTree(mcts, primaryPath, backupPath) {
   let loaded = false;
   try {
      await fs.access(primaryPath, fs.constants.F_OK);
      loaded = await mcts.loadTree(primaryPath);
      if (loaded) {
         console.log("MCTS tree loaded -> Ready to training.");
         return;
      }
   } catch (error) {
      console.warn(`--- Loading error ${primaryPath} ---`);
   }
   try {
      await fs.access(backupPath, fs.constants.F_OK);
      loaded = await mcts.loadTree(backupPath);
      if (loaded) {
         console.log("MCTS tree loaded (backup) -> Ready to training.");
         await mcts.saveTree(primaryPath);
         return;
      }
   } catch (error) {
      console.warn(`--- Loading error (backup) ${backupPath}`);
   }

   if (!loaded) {
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
      console.log("No MCTS tree -> Creating new tree");
   }
}

startSelfPlay();

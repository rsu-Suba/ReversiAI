import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { MergeMCTSTreeManager } from "./MCTSTree.mjs";
import { config } from "./config.mjs";
import { formatCurrentDateTime } from "./module.mjs";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import * as path from "path";
import seedrandom from "seedrandom";
import * as fs from "fs/promises";
import * as os from "os";

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
const workerMemUsage = new Map();
let isTerminating = false;
let isSavingTree = false;

let lastCPUUsage = process.cpuUsage();
let lastCPUTime = process.hrtime.bigint();
let currentCPUUsagePer = 0;
let resCheckInterval;

const mainMCTSRng = seedrandom(`main-mcts-seed-${Date.now()}-${Math.random()}`);
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

const mcts = new MCTS(
   cP,
   mainMCTSRng,
   "main",
   OthelloBoard.blackInitBoard, // ★ここ
   OthelloBoard.whiteInitBoard, // ★ここ
   1,
   false
);
const mainTreeManager = new MergeMCTSTreeManager();

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
   clearInterval(resCheckInterval);

   activeWorkers.forEach((worker, id) => {
      worker.postMessage({ type: "terminate_now" });
   });

   const workerExitPromises = [];
   for (const [id, worker] of activeWorkers.entries()) {
      workerExitPromises.push(
         new Promise((resolve) => {
            worker.once("exit", (code) => {
               console.log(`Main Thread: W${id} exited (code: ${code})`);
               activeWorkers.delete(id);
               workerMemUsage.delete(id);
               resolve();
            });
            worker.once("error", (err) => {
               console.error(`Main Thread: W${id} error <- termination:`, err);
               activeWorkers.delete(id);
               workerMemUsage.delete(id);
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
   console.log("\n--- Starting Parallel Play ---");
   console.log(`Sim:${simsN}, Parallel:${numParallelGames}, Matches:${totalGames}`);
   if (trainingHours > 0) {
      trainingEndTime = trainingStartTime + trainingHours * 60 * 60 * 1000;
      console.log(`Training: ${trainingHours} hrs -> (${new Date(trainingEndTime).toLocaleString()}).`);
   } else {
      console.log(`Total Games: ${totalGames}`);
   }
   console.log(`Loading MCTS tree <- ${saveFileName}`);
   //mainTreeManager.setRootNode(mcts.persistentRoot);
   await loadMCTSTree(mainTreeManager, saveFilePath, backupFilePath);
   mcts.persistentRoot = mainTreeManager.getRootNode();
   mcts._rebuildNodeMap(mcts.persistentRoot); // MCTSのnodeMapも再構築
   logResorceUsage();
   memoryCheckInterval = setInterval(checkMemoryUsage, MEMORY_CHECK_INTERVAL_MS);
   resCheckInterval = setInterval(logResorceUsage, 1000 * 25);
   process.on("SIGINT", () => initiateTermination("Ctrl+C"));
   for (let i = 0; i < numParallelGames; i++) {
      if (isLearningActive()) {
         startNewGameWorker(i);
      } else {
         break;
      }
   }
}

async function startNewGameWorker(slotId) {
   const worker = new Worker("./workerAI.mjs", {
      workerData: {
         simsN: simsN,
         cP: cP,
         workerSlotId: slotId,
         vsRandom: vsRandom,
         treeData: mainTreeManager.getRootNode()
            ? JSON.stringify(mainTreeManager.getRootNode().toSerializableObject())
            : null,
      },
   });
   activeWorkers.set(slotId, worker);
   workerMemUsage.set(slotId, 0);
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
         let progress = `Progress: ${gamesFinishedCount} / ${totalGames} games`;
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
         const tempWorkerTreeManager1 = new MergeMCTSTreeManager();
         tempWorkerTreeManager1.setRootNode(workerRootNodeAI1);
         mainTreeManager.mergeTrees(tempWorkerTreeManager1);

         if (vsRandom === false && workerRootNodeAI2) {
            const tempWorkerTreeManager2 = new MergeMCTSTreeManager();
            tempWorkerTreeManager2.setRootNode(workerRootNodeAI2);
            mainTreeManager.mergeTrees(tempWorkerTreeManager2);
         }
         const saveIntervalGames = Math.max(1, Math.ceil(totalGames / (numParallelGames * 5)));
         if ((gamesFinishedCount % saveIntervalGames === 0 || gamesFinishedCount === totalGames) && !isSavingTree) {
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
                  `\n--- Game start -> W${msg.workerSlotId} (G${gamesStartedCount}) : ${formatCurrentDateTime()} ---`
               );
               currentWorker.postMessage({
                  type: "start_game",
                  gameNumber: gamesStartedCount,
                  treeData: mainTreeManager.getRootNode()
                     ? JSON.stringify(mainTreeManager.getRootNode().toSerializableObject())
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
            workerMemUsage.delete(msg.workerSlotId);
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
               treeData: mainTreeManager.getRootNode()
                  ? JSON.stringify(mainTreeManager.getRootNode().toSerializableObject())
                  : null,
            });
            workerMemUsage.set(msg.workerSlotId, 0);
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
            const tempWorkerTreeManager1 = new MergeMCTSTreeManager();
            tempWorkerTreeManager1.setRootNode(workerRootNodeAI1);
            mainTreeManager.mergeTrees(tempWorkerTreeManager1);

            if (vsRandom === false && workerRootNodeAI2) {
               const tempWorkerTreeManager2 = new MergeMCTSTreeManager();
               tempWorkerTreeManager2.setRootNode(workerRootNodeAI2);
               mainTreeManager.mergeTrees(tempWorkerTreeManager2);
            }
            console.log(`Main Thread: Merged tree W${msg.workerSlotId} during memory alert.`);
         } catch (e) {
            console.error(`Main Thread: Error merging tree W${msg.workerSlotId} during alert:`, e);
         }
         activeWorkers.forEach((w) => w.postMessage({ type: "terminate_now" }));
         initiateTermination("worker_memory_alert");
      } else if (msg.type === "worker_status_update") {
         workerMemUsage.set(msg.workerSlotId, msg.heapUsedMB);
      }
   });
   worker.on("error", (err) => {
      console.error(`Main Thread: W${slotId} error:`, err);
      activeWorkers.delete(slotId);
      workerMemUsage.delete(slotId);
      if (!isTerminating && isLearningActive()) {
         console.warn(`Main Thread: Restarting worker ${slotId} error.`);
         const newWorker = new Worker("./workerAI.mjs", {
            workerData: {
               simsN: simsN,
               cP: cP,
               workerSlotId: slotId,
               vsRandom: vsRandom,
            },
         });
         activeWorkers.set(slotId, newWorker);
         gamesStartedCount++;
         console.log(`\n--- Game start -> W${slotId} (G${gamesStartedCount}) : ${formatCurrentDateTime()} ---`);
         newWorker.postMessage({
            type: "start_game",
            gameNumber: gamesStartedCount,
            treeData: mcts.persistentRoot ? JSON.stringify(mcts.persistentRoot.toSerializableObject()) : null,
         });
         workerMemUsage.set(slotId, 0);
      } else if (activeWorkers.size === 0) {
         initiateTermination("uncaught_error_in_worker");
      }
   });
   worker.on("exit", (code) => {
      if (activeWorkers.has(slotId)) {
         if (code !== 0) {
            console.error(`Main Thread: W${slotId} exited unexpectedly (code: ${code}).`);
         } else {
            console.log(`Main Thread: W${slotId} exited (code: ${code})`);
         }
         activeWorkers.delete(slotId);
         workerMemUsage.delete(slotId);
      }
      if (!isTerminating && isLearningActive() && activeWorkers.size === 0) {
         console.warn(`Main Thread: All workers exited, but training is active. Restarting all workers.`);
         for (let j = 0; j < numParallelGames; j++) {
            startNewGameWorker(j);
         }
      } else if (activeWorkers.size === 0 && isTerminating) {
         initiateTermination("all_workers_terminated_as_expected");
      }
   });
   gamesStartedCount++;
   console.log(`--- Game start -> W${slotId} (G${gamesStartedCount}) : ${formatCurrentDateTime()} ---`);
   worker.postMessage({
      type: "start_game",
      gameNumber: gamesStartedCount,
      treeData: mcts.persistentRoot ? JSON.stringify(mcts.persistentRoot.toSerializableObject()) : null,
   });
   workerMemUsage.set(slotId, 0);
}

function logResorceUsage() {
   const memoryUsage = process.memoryUsage();
   const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
   const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

   const currentCPUUsage = process.cpuUsage(lastCPUUsage);
   const currentCPUTime = process.hrtime.bigint();

   const userCPUTime = currentCPUUsage.user;
   const systemCPUTime = currentCPUUsage.system;
   const totalCPUTime = userCPUTime + systemCPUTime;

   const elapsedTimeNs = Number(currentCPUTime - lastCPUTime);
   const elapsedTimeMs = elapsedTimeNs / 1_000_000;
   const CPUUsageper = (totalCPUTime / (elapsedTimeMs * 1000)) * 100;
   currentCPUUsagePer = Math.min(100, Math.round(CPUUsageper));

   let totalWorkerHeapUsedMB = 0;
   workerMemUsage.forEach((memMB) => {
      totalWorkerHeapUsedMB += memMB;
   });
   const avgWorkerHeapUsedMB = workerMemUsage.size > 0 ? Math.round(totalWorkerHeapUsedMB / workerMemUsage.size) : 0;

   console.log(
      `\n|||Res monitor: RSS: ${rssMB} MB, Main: ${heapUsedMB} MB, Worker: ${avgWorkerHeapUsedMB} MB, CPU: ${currentCPUUsagePer}%|||`
   );
   console.log(
      `|||Threads: ${numParallelGames}, Total nodes: ${
         mainTreeManager.getNodeMap().size
      } (${formatCurrentDateTime()})|||\n`
   );
}
async function loadMCTSTree(treeManagerInstance, primaryPath, backupPath) {
   let loaded = false;
   try {
      await fs.access(primaryPath, fs.constants.F_OK);
      loaded = await treeManagerInstance.loadTree(primaryPath);
      if (loaded) {
         console.log("MCTS tree loaded -> Ready to training.");
         mcts.persistentRoot = treeManagerInstance.getRootNode();
         mcts._rebuildNodeMap(mcts.persistentRoot);
         return;
      }
   } catch (error) {
      console.warn(`--- Loading error ${primaryPath} ---`);
      loaded = false;
   }
   try {
      await fs.access(backupPath, fs.constants.F_FOK);
      loaded = await treeManagerInstance.loadTree(backupPath);
      if (loaded) {
         console.log("MCTS tree loaded (backup) -> Ready to training.");
         await treeManagerInstance.saveTree(primaryPath);
         mcts.persistentRoot = treeManagerInstance.getRootNode();
         mcts._rebuildNodeMap(mcts.persistentRoot);
         return;
      }
   } catch (error) {
      console.warn(`--- Loading error (backup) ${backupPath}---`);
      loaded = false;
   }
   if (!loaded) {
      const initialBoard = new OthelloBoard();
      const initialNode = new MCTSNode(
         initialBoard.blackBoard,
         initialBoard.whiteBoard,
         initialBoard.currentPlayer,
         null,
         null,
         0,
         false
      );
      treeManagerInstance.setRootNode(initialNode);
      mcts.persistentRoot = treeManagerInstance.getRootNode();
      mcts._rebuildNodeMap(mcts.persistentRoot); // MCTSのnodeMapも再構築
      console.log("No MCTS tree -> Creating new tree");
   }
}

startSelfPlay();

import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { MergeMCTSTreeManager } from "./MCTSTree.mjs";
import { config } from "./config.mjs";
import { formatCurrentDateTime } from "./module.mjs";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import * as path from "path";
import * as fs from "fs/promises";

const numParallelGames = config.parallel;
const simsN = config.simsN;
const cP = config.cP;
const totalGames = config.matches;
const vsRandom = config.vsRandom;

const saveFileName = config.treeSavePath;
const backupFileName = config.treeBackupPath;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const saveFilePath = path.join(__dirname, saveFileName);
const backupFilePath = path.join(__dirname, backupFileName);

const MEMORY_CHECK_INTERVAL_MS = config.Mem_Check_Interval || 5000;
const RESOURCE_LOG_INTERVAL_MS = 25000;
const MEMORY_THRESHOLD_PERCENT = config.Mem_Threshold_Per || 0.85;
const MAX_HEAP_SIZE_MB = config.Mem_Heap_Size || 2048;

let gamesStartedCount = 0;
let gamesFinishedCount = 0;
const activeWorkers = new Map();
const workerMemUsage = new Map();
let isTerminating = false;

let lastCPUUsage = process.cpuUsage();
let lastCPUTime = process.hrtime.bigint();
const MAX_HEAP_SIZE_BYTES = MAX_HEAP_SIZE_MB * 1024 * 1024;
const MEMORY_THRESHOLD_BYTES = MAX_HEAP_SIZE_BYTES * MEMORY_THRESHOLD_PERCENT;
let resCheckInterval;
let memoryCheckInterval;

const mainTreeManager = new MergeMCTSTreeManager();

async function startSelfPlay() {
   console.log("\n--- Starting Parallel Play ---");
   console.log(`Sim:${simsN}, Parallel:${numParallelGames}, Matches:${totalGames}`);
   await loadMCTSTree(mainTreeManager, saveFilePath, backupFilePath);
   logResorceUsage();
   resCheckInterval = setInterval(logResorceUsage, RESOURCE_LOG_INTERVAL_MS);
   memoryCheckInterval = setInterval(checkMemoryUsage, MEMORY_CHECK_INTERVAL_MS);
   process.on("SIGINT", () => initiateTermination("Ctrl+C"));
   for (let i = 0; i < numParallelGames; i++) {
      startNewGameWorker(i);
      gamesStartedCount++;
   }
}

function startNewGameWorker(slotId) {
   const worker = new Worker("./workerAI.mjs", {
      workerData: {
         simsN: simsN,
         cP: cP,
         workerSlotId: slotId,
         vsRandom: vsRandom,
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
         let winner = "Draw";
         if (msg.winner == 1) {
            winner = "Black";
         } else if (msg.winner == -1) {
            winner = "White";
         }
         console.log(`Scores: ${msg.blackStones} / ${msg.whiteStones}, Winner: ${winner}`);

         if (msg.treeDataAI1) {
            const workerNode = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI1));
            const tempManager = new MergeMCTSTreeManager();
            tempManager.setRootNode(workerNode);
            mainTreeManager.mergeTrees(tempManager);
         }
         await mainTreeManager.saveTree(path.join(__dirname, saveFileName));
         await mainTreeManager.saveTree(path.join(__dirname, backupFileName));
         console.log(`Tree saved. Total nodes: ${mainTreeManager.getNodeMap().size}`);
         if (gamesFinishedCount >= totalGames) {
            initiateTermination("learning_target_reached");
         } else if (gamesStartedCount < totalGames) {
            gamesStartedCount++;
            worker.postMessage({ type: "start_game" });
         }
      } else if (msg.type === "worker_status_update") {
         workerMemUsage.set(slotId, msg.heapUsedMB);
      } else if (msg.type === "game_error") {
         console.error(`--- Game Error (W${msg.workerSlotId}) ---`);
         console.error(`Error: ${msg.errorMessage}`);
         worker.terminate();
         workerMemUsage.delete(slotId);
         activeWorkers.delete(slotId);
      }
   });

   worker.on("exit", (code) => {
      console.log(`Main Thread: W${slotId} exited (code: ${code})`);
      activeWorkers.delete(slotId);
      if (activeWorkers.size === 0 && !isTerminating) {
         initiateTermination("all_workers_exited");
      }
   });
   worker.postMessage({ type: "start_game" });
}

async function initiateTermination(reason = "unknown") {
   if (isTerminating) return;
   isTerminating = true;
   console.log(`\n--- Termination (${reason}) ---`);
   activeWorkers.forEach((worker) => {
      worker.postMessage({ type: "terminate_now" });
   });
   try {
      await mainTreeManager.saveTree(saveFilePath, saveFileName, true);
      await mainTreeManager.saveTree(backupFilePath, backupFileName, false);
   } catch (error) {
      console.error("Failed to save MCTS tree on termination:", error);
   } finally {
      console.log("All tasks finished. Exiting.");
      process.exit(0);
   }
}

async function loadMCTSTree(treeManager, primaryPath, backupPath) {
   try {
      await fs.access(primaryPath);
      if (await treeManager.loadTree(primaryPath, saveFileName)) {
         console.log("MCTS tree loaded successfully.");
         return;
      }
   } catch (e) {
      console.warn(`Primary tree not found or failed to load from ${primaryPath}. Trying backup...`);
   }

   try {
      await fs.access(backupPath);
      if (await treeManager.loadTree(backupPath, backupFileName)) {
         console.log("Backup MCTS tree loaded successfully.");
         return;
      }
   } catch (e) {
      console.warn(`Backup tree not found or failed to load from ${backupPath}.`);
   }
   console.log("No saved tree found. Creating a new tree.");
}

function checkMemoryUsage() {
   const heapUsed = process.memoryUsage().heapUsed;
   if (heapUsed > MEMORY_THRESHOLD_BYTES) {
      console.warn(`\n--- MAIN THREAD MEMORY LIMIT EXCEEDED --- (${Math.round(heapUsed / 1024 / 1024)}MB)`);
      initiateTermination("high_memory_usage");
   }
}

function logResorceUsage() {
   const memoryUsage = process.memoryUsage();
   const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
   const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

   const currentCPUUsage = process.cpuUsage(lastCPUUsage);
   const currentCPUTime = process.hrtime.bigint();
   const elapsedTimeMs = Number(currentCPUTime - lastCPUTime) / 1_000_000;
   const totalCPUTimeMs = (currentCPUUsage.user + currentCPUUsage.system) / 1000;
   const cpuPercent = Math.min(100, Math.round(((totalCPUTimeMs / elapsedTimeMs) * 100) / numParallelGames));

   lastCPUUsage = process.cpuUsage();
   lastCPUTime = process.hrtime.bigint();

   let totalWorkerHeapUsedMB = 0;
   workerMemUsage.forEach((memMB) => {
      totalWorkerHeapUsedMB += memMB;
   });
   const avgWorkerHeapUsedMB = workerMemUsage.size > 0 ? Math.round(totalWorkerHeapUsedMB / workerMemUsage.size) : 0;

   console.log(
      `\n||| Res monitor: RSS: ${rssMB} MB, Main: ${heapUsedMB} MB, Worker(avg): ${avgWorkerHeapUsedMB} MB, CPU: ${cpuPercent}% |||`
   );
   console.log(
      `||| Threads: ${activeWorkers.size}/${numParallelGames}, Total nodes: ${
         mainTreeManager.getNodeMap().size
      } (${formatCurrentDateTime()}) |||\n`
   );
}

startSelfPlay();

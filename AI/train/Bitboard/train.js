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

let gamesFinishedCount = 0;
const activeWorkers = new Map();
let isTerminating = false;

const mainTreeManager = new MergeMCTSTreeManager();

async function startSelfPlay() {
   console.log("\n--- Starting Parallel Play ---");
   console.log(`Sim:${simsN}, Parallel:${numParallelGames}, Matches:${totalGames}`);
   await loadMCTSTree(mainTreeManager, saveFilePath, backupFilePath);
   process.on("SIGINT", () => initiateTermination("Ctrl+C"));
   for (let i = 0; i < numParallelGames; i++) {
      startNewGameWorker(i);
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
         if (gamesFinishedCount >= totalGames) {
            initiateTermination("learning_target_reached");
         } else {
            worker.postMessage({ type: "start_game" });
         }
      } else if (msg.type === "game_error") {
         console.error(`--- Game Error (W${msg.workerSlotId}) ---`);
         console.error(`Error: ${msg.errorMessage}`);
         worker.terminate();
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

startSelfPlay();

import { OthelloBoard } from "./OthelloBoard.mjs";
import { Worker } from "worker_threads";
import { execSync } from "child_process";
import { config } from "./config.mjs";
import { formatCurrentDateTime } from "./module.mjs";
import * as fs from "fs";

const { parallel: numParallelGames, matches: totalGames } = config;
const RESOURCE_LOG_INTERVAL_MS = 25000;

let gamesFinishedCount = 0;
const activeWorkers = new Map();
let resCheckInterval = null;

async function main() {
   cleanupTempFiles(config.treeLoadPath);
   for (let i = 0; i < numParallelGames; i++) {
      cleanupTempFiles(`./mcts/mcts_w${i}.sqlite`);
   }
   console.log("--- Starting Training ---");
   console.log(`Starting ${numParallelGames} workers to play ${totalGames} total games...`);
   resCheckInterval = setInterval(logResourceUsage, RESOURCE_LOG_INTERVAL_MS);
   const workerPromises = [];
   for (let i = 0; i < numParallelGames; i++) {
      const promise = new Promise((resolve, reject) => {
         const worker = new Worker("./workerAI.mjs", {
            workerData: {
               workerSlotId: i,
               gamesToPlay: Math.ceil(totalGames / numParallelGames),
               simsN: config.simsN,
               cP: config.cP,
            },
         });
         activeWorkers.set(worker.threadId, worker);
         worker.on("message", (msg) => {
            switch (msg.type) {
               case "game_starting":
                  console.log(
                     `--- Game Starting -> W${msg.workerSlotId} (Worker Game ${msg.gameNumberInWorker}/${msg.totalGamesInWorker}) ---`
                  );
                  break;
               case "game_finished":
                  gamesFinishedCount++;
                  const winner = msg.winner === 1 ? "Black" : msg.winner === -1 ? "White" : "Draw";
                  console.log(
                     `\n--- Game completed by W${
                        msg.workerSlotId
                     } (${gamesFinishedCount}/${totalGames}) : ${formatCurrentDateTime()} ---`
                  );
                  const finalBoard = new OthelloBoard();
                  finalBoard.setBoardState(msg.finalBlackBoard, msg.finalWhiteBoard, msg.winner);
                  finalBoard.display();
                  console.log(`Scores: ${msg.scores.black} / ${msg.scores.white}, Winner: ${winner}`);
                  break;
               case "progress":
                  console.log(`[W${i}] ${msg.message}`);
                  break;
            }
         });
         worker.on("error", reject);
         worker.on("exit", (code) => {
            activeWorkers.delete(worker.threadId);
            if (code === 0) {
               console.log(`--- Worker ${i} finished all its games. ---`);
               resolve();
            } else {
               reject(new Error(`Worker ${i} stopped with exit code ${code}`));
            }
         });
      });
      workerPromises.push(promise);
   }

   try {
      await Promise.all(workerPromises);
      console.log("\n\n--- All training games completed successfully! ---");
      runMergeScript();
   } catch (error) {
      console.error("A worker failed during training:", error);
   } finally {
      clearInterval(resCheckInterval);
      console.log("Training session finished.");
   }
}

function logResourceUsage() {
   const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
   const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
   console.log(
      `\n||| Res monitor: RSS: ${rssMB} MB, Main Heap: ${heapUsedMB} MB | Active Workers: ${
         activeWorkers.size
      } | Games: ${gamesFinishedCount}/${totalGames} (${formatCurrentDateTime()}) |||\n`
   );
}

function runMergeScript() {
   console.log("\n--- Automatically starting database merge process... ---");
   try {
      const output = execSync("node merge_dbs.js", { encoding: "utf-8" });
      console.log(output);
   } catch (error) {
      console.error("--- Merge process failed! ---");
      console.error(error.stderr);
   }
}

function cleanupTempFiles(dbPath) {
   const tempFiles = [`${dbPath}-shm`, `${dbPath}-wal`];
   tempFiles.forEach((file) => {
      if (fs.existsSync(file)) {
         try {
            fs.unlinkSync(file);
         } catch (err) {
            console.error(`Failed to remove -> ${file}:`, err);
         }
      }
   });
}

main();

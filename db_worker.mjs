import { parentPort } from "worker_threads";
import { DatabaseManager } from "./DatabaseManager.mjs";

const dbManager = new DatabaseManager("mcts.sqlite");
const taskQueue = [];
let isProcessing = false;

async function processQueue() {
   if (isProcessing) return;
   isProcessing = true;
   while (taskQueue.length > 0) {
      const task = taskQueue.shift();
      try {
         let result = {};
         switch (task.payload.type) {
            case "getNode":
               result.node = await dbManager.getNode(task.payload.key);
               break;
            case "saveNode":
               await dbManager.saveNode(task.payload.node);
               result.success = true;
               break;
            case "batchUpdateNodes":
               await dbManager.batchUpdateNodes(task.payload.nodes);
               result.success = true;
               break;
            case "close":
               await dbManager.close();
               result.closed = true;
               break;
         }
         parentPort.postMessage({
            ...result,
            type: task.payload.type + "Result",
            correlationId: task.payload.correlationId,
         });
      } catch (error) {
         parentPort.postMessage({ type: "error", correlationId: task.payload.correlationId, error: error.message });
      }
   }
   isProcessing = false;
}

parentPort.on("message", (msg) => {
   taskQueue.push(msg);
   processQueue();
});

async function initialize() {
   await dbManager.init();
   parentPort.postMessage({ type: "ready" });
}

initialize();

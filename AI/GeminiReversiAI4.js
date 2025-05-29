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

const numParallelGames = 6;
const simsN = 200;
const totalGames = 100;

let gamesStartedCount = 0;
let gamesFinishedCount = 0;
const activeWorkers = new Map(); // Map<workerSlotId, WorkerInstance>

const mcts = new MCTS(); // メインスレッドのMCTSインスタンス

async function startSelfPlay() {
   console.log("--- Starting Parallel Self-Play ---");
   console.log(`Sim:${simsN}, Parallel:${numParallelGames}, Matches:${totalGames}`);
   console.log(`MCTS tree will be saved to: ${saveFilePath}`);

   const loaded = await mcts.loadTree(saveFilePath);

   if (!mcts.persistentRoot) {
      const initialBoard = new OthelloBoard();
      mcts.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
      // ★ MCTSクラスに nodeMap が追加されていることを前提
      mcts._rebuildNodeMap(mcts.persistentRoot); // 初回マップ構築
      console.log("Main Thread: Initialized a new MCTS persistent tree.");
   } else {
      // ロードした場合もマップを構築し直す
      mcts._rebuildNodeMap(mcts.persistentRoot);
   }

   // 初期起動: numParallelGames の数だけワーカーを起動
   for (let i = 0; i < numParallelGames; i++) {
      const worker = new Worker("./worker.mjs", {
         workerData: {
            simsN: simsN,
            workerSlotId: i,
            totalGames: totalGames, // ★これを追加★
         },
      });

      activeWorkers.set(i, worker);
      // main.mjs (worker.on('message', ...) ハンドラ内)

      // main.mjs (抜粋)

      // ...

      worker.on("message", async (msg) => {
         if (msg.type === "game_finished") {
            console.log(`\n--- Game ${msg.gameNumber}/${totalGames} Finished (Worker ${msg.workerSlotId}) ---`);
            console.log(`Winner: ${msg.winner === 1 ? "Black" : msg.winner === -1 ? "White" : "Draw"}.`);
            console.log(`Scores: Black: ${msg.blackStones}, White: ${msg.whiteStones}.`);

            // ★★★ ここから盤面表示ロジックを追加 ★★★
            if (msg.finalBoard) {
               // finalBoardが存在することを確認
               const finalBoardDisplay = new OthelloBoard();
               // OthelloBoardのsetBoardStateはボード状態と現在のプレイヤーを受け取る想定
               // 最終盤面表示なので、currentPlayerは0やnullでも問題ないでしょう
               finalBoardDisplay.setBoardState(msg.finalBoard, 0);
               console.log("Final Board State:");
               finalBoardDisplay.display();
            } else {
               console.warn(`Warning: Final board state for game ${msg.gameNumber} was not provided by worker.`);
            }
            // ★★★ ここまで追加 ★★★

            const workerRootNodeAI1 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI1));
            const workerRootNodeAI2 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI2));

            mcts.mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2);

            gamesFinishedCount++;

            if (
               gamesFinishedCount % Math.ceil(totalGames / numParallelGames / 2) === 0 ||
               gamesFinishedCount === totalGames
            ) {
               await mcts.saveTree(saveFilePath);
               console.log(`MCTS tree updated and saved after ${gamesFinishedCount} games.`);
            }

            if (gamesFinishedCount === totalGames) {
               console.log("Main Thread: All games completed. Final MCTS tree saved.");
               await mcts.saveTree(saveFilePath);
               activeWorkers.forEach((w) => w.terminate());
               activeWorkers.clear();
               return;
            }

            if (gamesStartedCount < totalGames) {
               gamesStartedCount++;
               const nextGlobalGameNumber = gamesStartedCount;
               console.log(`Main Thread: Resuming game ${nextGlobalGameNumber} with Worker ${msg.workerSlotId}`);
               worker.postMessage({
                  type: "start_game",
                  gameNumber: nextGlobalGameNumber,
                  treeData: JSON.stringify(mcts.persistentRoot.toSerializableObject()),
               });
            }
         } else if (msg.type === "game_error") {
            console.error(
               `Main Thread: Worker ${msg.workerSlotId} reported a game error for game ${msg.gameNumber}: ${msg.errorMessage}`
            );
            if (msg.currentBoardState) {
               // エラー発生時の盤面があれば表示
               console.error("Board state at error:");
               const errorBoardDisplay = new OthelloBoard();
               errorBoardDisplay.setBoardState(msg.currentBoardState, msg.currentPlayer);
               errorBoardDisplay.display();
            }

            gamesFinishedCount++;
            if (gamesFinishedCount === totalGames) {
               console.log("Main Thread: All games completed (some with errors). Final MCTS tree saved.");
               await mcts.saveTree(saveFilePath);
               activeWorkers.forEach((w) => w.terminate());
               activeWorkers.clear();
            } else if (gamesStartedCount < totalGames) {
               gamesStartedCount++;
               const nextGlobalGameNumber = gamesStartedCount;
               console.log(
                  `Main Thread: Starting new game ${nextGlobalGameNumber} in place of failed game with Worker ${msg.workerSlotId}`
               );
               worker.postMessage({
                  type: "start_game",
                  gameNumber: nextGlobalGameNumber,
                  treeData: JSON.stringify(mcts.persistentRoot.toSerializableObject()),
               });
            }
         }
      });

      // ...

      worker.on("error", (err) => {
         console.error(`Main Thread: Worker ${i} encountered an error:`, err);
         activeWorkers.delete(i);
         // エラーが発生したワーカーが終了した場合、そのスロットで新しいワーカーを再起動するか考慮
         // または、残りのゲームが終了するのを待つ
         if (activeWorkers.size === 0 && gamesFinishedCount < totalGames) {
            console.error("All workers terminated unexpectedly. Exiting.");
            process.exit(1); // 異常終了
         }
      });

      worker.on("exit", (code) => {
         if (code !== 0) {
            console.error(`Main Thread: Worker ${i} exited with code ${code}`);
         }
         activeWorkers.delete(i); // 終了したワーカーをマップから削除
         if (activeWorkers.size === 0 && gamesFinishedCount === totalGames) {
            console.log("Main Thread: All workers have exited gracefully.");
         }
      });

      // 初回起動時にもゲーム開始コマンドを送る
      if (gamesStartedCount < totalGames) {
         gamesStartedCount++;
         const initialGlobalGameNumber = gamesStartedCount;
         console.log(`Main Thread: Starting initial game ${initialGlobalGameNumber} with Worker ${i}`);
         worker.postMessage({
            type: "start_game",
            gameNumber: initialGlobalGameNumber,
            treeData: JSON.stringify(mcts.persistentRoot.toSerializableObject()), // 初期のツリーを送る
         });
      }
   }
}

startSelfPlay();

// main.js
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

const learningDurationHours = 24;
const startTime = Date.now();
const endTime = startTime + learningDurationHours * 60 * 60 * 1000;

let gamesStartedCount = 0;
let gamesFinishedCount = 0;
const activeWorkers = new Map();
let isTerminating = false;

const mcts = new MCTS();

// --- 終了処理を一元化する関数 ---
async function initiateTermination(reason = "unknown") {
    if (isTerminating) {
        console.warn(`Main Thread: Termination already in progress (reason: ${reason}). Ignoring new request.`);
        return;
    }
    isTerminating = true;
    console.log(`\nMain Thread: Initiating termination process (reason: ${reason}).`);

    // ワーカーに終了指示を送信
    activeWorkers.forEach((worker, id) => {
        console.log(`Main Thread: Sending 'terminate_now' to Worker ${id}.`);
        worker.postMessage({ type: "terminate_now" });
    });

    // ワーカーの終了を待機するPromiseを作成
    const workerExitPromises = [];
    activeWorkers.forEach((worker, id) => {
        workerExitPromises.push(new Promise(resolve => {
            worker.once('exit', (code) => {
                console.log(`Main Thread: Worker ${id} exited with code ${code}.`);
                activeWorkers.delete(id); // マップから削除
                resolve();
            });
            worker.once('error', (err) => {
                console.error(`Main Thread: Worker ${id} experienced an error during termination:`, err);
                activeWorkers.delete(id); // マップから削除
                resolve();
            });
        }));
    });

    // 全てのワーカーが終了するか、タイムアウトするまで待機
    const timeoutPromise = new Promise(resolve => setTimeout(() => {
        console.log("Main Thread: Timed out waiting for workers to exit gracefully after 10 seconds. Forcing termination.");
        resolve();
    }, 10000)); // 10秒のタイムアウト

    await Promise.race([Promise.all(workerExitPromises), timeoutPromise]);

    // MCTSツリーを保存
    await mcts.saveTree(saveFilePath);
    console.log("MCTS tree saved successfully.");

    // まだアクティブなワーカーがいれば強制終了
    activeWorkers.forEach((w, id) => {
        console.log(`Main Thread: Forcibly terminating remaining Worker ${id}.`);
        w.terminate(); // terminate() は即座にワーカープロセスを終了させる
    });
    activeWorkers.clear(); // マップをクリア

    console.log("Main Thread: All workers processed. Exiting main process.");
    process.exit(0); // 正常終了
}
// --- 終了処理関数ここまで ---


async function startSelfPlay() {
    console.log("--- Starting Parallel Self-Play ---");
    console.log(`Sim:${simsN}, Parallel:${numParallelGames}`);
    console.log(
        `Learning will run for approximately ${learningDurationHours} hours (until ${new Date(
            endTime
        ).toLocaleString()}).`
    );
    console.log(`MCTS tree will be saved to: ${saveFilePath}`);

    const loaded = await mcts.loadTree(saveFilePath);

    if (!mcts.persistentRoot) {
        const initialBoard = new OthelloBoard();
        mcts.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
        mcts._rebuildNodeMap(mcts.persistentRoot);
        console.log("Main Thread: Initialized a new MCTS persistent tree.");
    } else {
        mcts._rebuildNodeMap(mcts.persistentRoot);
    }

    // SIGINTハンドラで終了関数を呼び出す
    process.on("SIGINT", () => initiateTermination("Ctrl+C detected"));

    // 初期起動: numParallelGames の数だけワーカーを起動
    for (let i = 0; i < numParallelGames; i++) {
        const worker = new Worker("./worker.mjs", {
            workerData: {
                simsN: simsN,
                workerSlotId: i,
            },
        });

        activeWorkers.set(i, worker);

        worker.on("message", async (msg) => {
            // 終了処理中の場合は、新たなメッセージを無視する
            if (isTerminating) {
                console.log(`Main Thread: Worker ${msg.workerSlotId} sent a message while terminating. Ignoring.`);
                return;
            }

            if (msg.type === "game_finished") {
                gamesFinishedCount++;

                console.log(`\n--- Game Finished (Worker ${msg.workerSlotId}, Total games finished: ${gamesFinishedCount}) ---`);
                console.log(`Winner: ${msg.winner === 1 ? "Black" : msg.winner === -1 ? "White" : "Draw"}.`);
                console.log(`Scores: Black: ${msg.blackStones}, White: ${msg.whiteStones}.`);
                console.log(`Current Time: ${new Date().toLocaleString()}, End Time: ${new Date(endTime).toLocaleString()}, Remaining: ${(endTime - Date.now()) / 1000}s`);

                if (msg.finalBoard) {
                    const finalBoardDisplay = new OthelloBoard();
                    finalBoardDisplay.setBoardState(msg.finalBoard, 0);
                    console.log("Final Board State:");
                    finalBoardDisplay.display();
                } else {
                    console.warn(`Warning: Final board state for game (Worker ${msg.workerSlotId}) was not provided by worker.`);
                }

                const workerRootNodeAI1 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI1));
                const workerRootNodeAI2 = MCTSNode.fromSerializableObject(JSON.parse(msg.treeDataAI2));

                mcts.mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2);

                if (gamesFinishedCount % 50 === 0) {
                    await mcts.saveTree(saveFilePath);
                    console.log(`MCTS tree updated and saved after ${gamesFinishedCount} games.`);
                }

                // 時間制限チェック：時間切れであれば終了処理を開始
                if (Date.now() >= endTime) {
                    initiateTermination("time limit reached");
                } else {
                    // 時間制限内で、かつ終了処理中でなければ次のゲームを指示
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
                console.error(`\n--- Game Error (Worker ${msg.workerSlotId}, Game ${msg.gameNumber}) ---`);
                console.error(`Error: ${msg.errorMessage}`);
                // エラーが発生した場合も、時間制限または強制終了フラグを見て終了処理を開始
                if (Date.now() >= endTime) {
                    initiateTermination("time limit reached (due to error)");
                } else {
                    // エラーが出たワーカーで次のゲームを開始するか、異常終了するかはプロジェクトの方針による
                    // ここでは一旦、エラーが継続しない限りはゲームを再開する方針にする
                    console.log(`Main Thread: Resuming game for Worker ${msg.workerSlotId} despite error.`);
                    gamesStartedCount++;
                    const nextGlobalGameNumber = gamesStartedCount;
                    worker.postMessage({
                        type: "start_game",
                        gameNumber: nextGlobalGameNumber,
                        treeData: JSON.stringify(mcts.persistentRoot.toSerializableObject()),
                    });
                }
            }
        });

        // ワーカーのエラーと終了イベントを監視 (終了関数に処理を移すため、ここではログとマップからの削除のみ)
        worker.on("error", (err) => {
            console.error(`Main Thread: Worker ${i} experienced an error:`, err);
            // initiateTermination("worker error"); // 必要であれば、ワーカーエラーで即時終了
        });

        worker.on("exit", (code) => {
            if (code !== 0) {
                console.error(`Main Thread: Worker ${i} exited with non-zero code: ${code}`);
            }
            // initiateTermination は exit イベントも待機するため、ここで activeWorkers.delete(i) は不要
            // initiateTermination("worker exited unexpectedly"); // 必要であれば、ワーカーの予期せぬ終了で即時終了
        });

        // 初回起動時にもゲーム開始コマンドを送る
        if (Date.now() < endTime && !isTerminating) {
            gamesStartedCount++;
            const initialGlobalGameNumber = gamesStartedCount;
            console.log(`Main Thread: Starting initial game ${initialGlobalGameNumber} with Worker ${i}`);
            worker.postMessage({
                type: "start_game",
                gameNumber: initialGlobalGameNumber,
                treeData: JSON.stringify(mcts.persistentRoot.toSerializableObject()),
            });
        } else {
            console.log(
                `Main Thread: Not starting worker ${i} as time limit has already been reached or termination requested.`
            );
            worker.terminate();
        }
    }
}

startSelfPlay();
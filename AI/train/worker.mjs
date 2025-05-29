// worker.mjs

import { parentPort, workerData } from "worker_threads";
import { MCTS } from "./GeminiMCTS.mjs";
import { OthelloBoard } from "./GeminiOthelloBoard.mjs";
import { MCTSNode } from "./GeminiMCTSNode.mjs";

const { simsN, workerSlotId } = workerData;

const mctsAI1 = new MCTS();
const mctsAI2 = new MCTS();

let shouldTerminate = false;

// ★★★ parentPort.on('message') のリスナーを一つにまとめる ★★★
parentPort.on("message", async (msg) => { // async は必要なのでこちらで
    if (msg.type === "terminate_now") {
        console.log(`Worker ${workerSlotId}: Termination request received. Finishing current game/sims and exiting.`);
        shouldTerminate = true;
        // ★ MCTS.run 内での早期終了を考慮に入れる場合、ここで MCTS インスタンスにも停止指示を送る ★
        mctsAI1.requestStop(); // GeminiMCTS.mjs に requestStop メソッドを追加している場合
        mctsAI2.requestStop(); // GeminiMCTS.mjs に requestStop メソッドを追加している場合
        return; // これ以上、このメッセージの処理は不要
    }

    if (msg.type === "start_game") {
        // 新しいゲーム開始時はフラグをリセット
        shouldTerminate = false;

        const { gameNumber, treeData } = msg;

        const loadedTree = MCTSNode.fromSerializableObject(JSON.parse(treeData));
        mctsAI1.persistentRoot = loadedTree;
        mctsAI1.currentRoot = loadedTree;
        mctsAI1._rebuildNodeMap(loadedTree);

        mctsAI2.persistentRoot = loadedTree;
        mctsAI2.currentRoot = loadedTree;
        mctsAI2._rebuildNodeMap(loadedTree);

        console.log(`Worker ${workerSlotId}: Starting game ${gameNumber} with updated tree.`);

        const gameBoard = new OthelloBoard();
        let turnCount = 0;
        const maxTurns = 100;

        try {
            const isAI1Black = gameNumber % 2 === 0;

            while (!gameBoard.isGameOver() && turnCount < maxTurns) {
                // ★★★ ループの先頭で終了フラグをチェック ★★★
                if (shouldTerminate) {
                    console.log(`Worker ${workerSlotId}: Terminating game ${gameNumber} early due to termination request.`);
                    return; // ゲームを中断して、このメッセージハンドラを終了
                }

                const currentPlayer = gameBoard.currentPlayer;
                const currentBoardState = gameBoard.getBoardState();
                let chosenMove = null;

                // MCTS.run の中で多くのシミュレーションが行われるため、
                // run メソッドの内部でも shouldTerminate をチェックできるように改造することも考えられますが、
                // 今回はターンごとのチェックで十分なはずです。

                if ((currentPlayer === 1 && isAI1Black) || (currentPlayer === -1 && !isAI1Black)) {
                    mctsAI1.currentRoot = mctsAI1.nodeMap.get(JSON.stringify(currentBoardState) + "_" + currentPlayer);
                    if (!mctsAI1.currentRoot) {
                        mctsAI1.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
                        mctsAI1.nodeMap.set(JSON.stringify(currentBoardState) + "_" + currentPlayer, mctsAI1.currentRoot);
                    }
                    // MCTS.run に shouldTerminate フラグを渡すか、MCTSインスタンスでフラグを監視させる
                    chosenMove = mctsAI1.run(currentBoardState, currentPlayer, simsN);
                } else {
                    mctsAI2.currentRoot = mctsAI2.nodeMap.get(JSON.stringify(currentBoardState) + "_" + currentPlayer);
                    if (!mctsAI2.currentRoot) {
                        mctsAI2.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
                        mctsAI2.nodeMap.set(JSON.stringify(currentBoardState) + "_" + currentPlayer, mctsAI2.currentRoot);
                    }
                    // MCTS.run に shouldTerminate フラグを渡すか、MCTSインスタンスでフラグを監視させる
                    chosenMove = mctsAI2.run(currentBoardState, currentPlayer, simsN);
                }

                const moveApplied = gameBoard.applyMove(chosenMove);
                if (!moveApplied) {
                    console.error(
                        `Worker ${workerSlotId}: Invalid move chosen or applied for game ${gameNumber} at turn ${turnCount}. Chosen: ${JSON.stringify(
                            chosenMove
                        )}`
                    );
                    break;
                }
                turnCount++;
            }

            // ゲーム終了時も終了フラグをチェック。
            // 既に終了要求が出ていたら、結果を送信せずに終了。
            if (shouldTerminate) {
                console.log(
                    `Worker ${workerSlotId}: Skipping final message for game ${gameNumber} as termination requested.`
                );
                return;
            }

            if (turnCount >= maxTurns) {
                console.warn(
                    `Worker ${workerSlotId}: Game ${gameNumber} reached max turns (${maxTurns}). Forcibly ending game.`
                );
            }

            parentPort.postMessage({
                type: "game_finished",
                gameNumber: gameNumber,
                workerSlotId: workerSlotId,
                winner: gameBoard.getWinner(),
                blackStones: gameBoard.getScores().black,
                whiteStones: gameBoard.getScores().white,
                finalBoard: gameBoard.getBoardState(),
                treeDataAI1: JSON.stringify(mctsAI1.persistentRoot.toSerializableObject()),
                treeDataAI2: JSON.stringify(mctsAI2.persistentRoot.toSerializableObject()),
            });
        } catch (error) {
            console.error(`Worker ${workerSlotId}: Error during game ${gameNumber} simulation:`, error);
            // エラー時も終了フラグをチェックし、送信をスキップ
            if (shouldTerminate) {
                console.log(
                    `Worker ${workerSlotId}: Skipping error message for game ${gameNumber} as termination requested.`
                );
                return;
            }
            parentPort.postMessage({
                type: "game_error",
                gameNumber: gameNumber,
                workerSlotId: workerSlotId,
                errorMessage: error.message,
                currentBoardState: gameBoard.getBoardState(),
                currentPlayer: gameBoard.currentPlayer,
            });
        }
    }
});
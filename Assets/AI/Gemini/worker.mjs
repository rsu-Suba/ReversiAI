// worker.mjs (修正案)
import { parentPort, workerData } from "worker_threads";
import { MCTS } from "./GeminiMCTS.mjs";
import { OthelloBoard } from "./GeminiOthelloBoard.mjs";
import { MCTSNode } from "./GeminiMCTSNode.mjs";

const { simsN, workerSlotId, totalGames } = workerData;

const mctsAI1 = new MCTS();
const mctsAI2 = new MCTS();

parentPort.on("message", async (msg) => {
   if (msg.type === "terminate_now") {
      console.log(`Worker ${workerSlotId}: Termination request received. Finishing current game/sims and exiting.`);
      shouldTerminate = true;
      mctsAI1.requestStop();
      mctsAI2.requestStop();
   } else if (msg.type === "start_game") {
      shouldTerminate = false; // 新しいゲーム開始時はフラグをリセット
      const { gameNumber, treeData } = msg;

      const loadedTree = MCTSNode.fromSerializableObject(JSON.parse(treeData));
      mctsAI1.persistentRoot = loadedTree;
      mctsAI1.currentRoot = loadedTree;
      mctsAI1._rebuildNodeMap(loadedTree);

      mctsAI2.persistentRoot = loadedTree;
      mctsAI2.currentRoot = loadedTree;
      mctsAI2._rebuildNodeMap(loadedTree);

      console.log(`Worker ${workerSlotId}: Starting game ${gameNumber}/${totalGames} with updated tree.`);

      const gameBoard = new OthelloBoard();
      let turnCount = 0;
      const maxTurns = 100; // 安全のための最大ターン数

      try {
         // ★★★ try-catch ブロックを追加してエラーを捕捉 ★★★
         // AIの先手後手をランダムに決定 (ここではワーカーごとの乱数ジェネレータがないので、適当に)
         const isAI1Black = gameNumber % 2 === 0;

         while (!gameBoard.isGameOver() && turnCount < maxTurns) {
            const currentPlayer = gameBoard.currentPlayer;
            const currentBoardState = gameBoard.getBoardState();
            let chosenMove = null;

            if ((currentPlayer === 1 && isAI1Black) || (currentPlayer === -1 && !isAI1Black)) {
               // AI1 の手番
               mctsAI1.currentRoot = mctsAI1.nodeMap.get(JSON.stringify(currentBoardState) + "_" + currentPlayer);
               if (!mctsAI1.currentRoot) {
                  mctsAI1.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
                  mctsAI1.nodeMap.set(JSON.stringify(currentBoardState) + "_" + currentPlayer, mctsAI1.currentRoot);
               }
               chosenMove = mctsAI1.run(currentBoardState, currentPlayer, simsN);
               if (chosenMove === undefined) {
                  // runがundefinedを返す可能性も考慮
                  console.warn(
                     `Worker ${workerSlotId}: AI1 chose undefined move for game ${gameNumber} at turn ${turnCount}.`
                  );
                  chosenMove = null; // 強制的にパスとする
               }
            } else {
               // AI2 の手番
               mctsAI2.currentRoot = mctsAI2.nodeMap.get(JSON.stringify(currentBoardState) + "_" + currentPlayer);
               if (!mctsAI2.currentRoot) {
                  mctsAI2.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
                  mctsAI2.nodeMap.set(JSON.stringify(currentBoardState) + "_" + currentPlayer, mctsAI2.currentRoot);
               }
               chosenMove = mctsAI2.run(currentBoardState, currentPlayer, simsN);
               if (chosenMove === undefined) {
                  // runがundefinedを返す可能性も考慮
                  console.warn(
                     `Worker ${workerSlotId}: AI2 chose undefined move for game ${gameNumber} at turn ${turnCount}.`
                  );
                  chosenMove = null; // 強制的にパスとする
               }
            }

            const moveApplied = gameBoard.applyMove(chosenMove);
            if (!moveApplied) {
               // applyMove が false を返した場合 (不正な手)
               console.error(
                  `Worker ${workerSlotId}: Invalid move chosen or applied for game ${gameNumber} at turn ${turnCount}. Chosen: ${JSON.stringify(
                     chosenMove
                  )}`
               );
               // ここで強制的にゲームを終了させるか、エラーを上位に報告する
               // 例えば、break; でループを抜けてゲームを早期終了させる
               break;
            }
            turnCount++;
         }

         // ゲームが最大ターン数に達した場合でも終了とする
         if (turnCount >= maxTurns) {
            console.warn(
               `Worker ${workerSlotId}: Game ${gameNumber} reached max turns (${maxTurns}). Forcibly ending game.`
            );
         }

         // ★★★ ここでデータが確定していることを確認してから送信 ★★★
         parentPort.postMessage({
            type: "game_finished",
            gameNumber: gameNumber,
            workerSlotId: workerSlotId,
            winner: gameBoard.getWinner(), // isGameOver() が true なら勝者が取得できるはず
            blackStones: gameBoard.getScores().black,
            whiteStones: gameBoard.getScores().white,
            finalBoard: gameBoard.getBoardState(), // 盤面状態を確実に渡す
            treeDataAI1: JSON.stringify(mctsAI1.persistentRoot.toSerializableObject()),
            treeDataAI2: JSON.stringify(mctsAI2.persistentRoot.toSerializableObject()),
         });
      } catch (error) {
         console.error(`Worker ${workerSlotId}: Error during game ${gameNumber} simulation:`, error);
         // エラーが発生した場合もメインスレッドに通知する
         parentPort.postMessage({
            type: "game_error", // 新しいメッセージタイプ
            gameNumber: gameNumber,
            workerSlotId: workerSlotId,
            errorMessage: error.message,
            // 必要であれば、現在のボード状態などを送る
            currentBoardState: gameBoard.getBoardState(),
            currentPlayer: gameBoard.currentPlayer,
         });
      }
   }
});

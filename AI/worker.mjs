// worker.mjs
import { parentPort, workerData } from "worker_threads";
import { OthelloBoard } from "./GeminiOthelloBoard.mjs"; // ファイル名を修正
import { MCTS } from "./GeminiMCTS.mjs"; // ファイル名を修正
import seedrandom from "seedrandom";

const { simsN, saveFilePath, workerSlotId, gameNumber } = workerData; // ★ gameNumber を受け取る

async function runSelfPlayGame() {
   const seed1 = `${Date.now()}-${workerSlotId}-ai1-${Math.random()}`;
   const seed2 = `${Date.now()}-${workerSlotId}-ai2-${Math.random()}`;

   const rng1 = seedrandom(seed1);
   const rng2 = seedrandom(seed2);

   const gameBoard = new OthelloBoard();
   const mctsAI1 = new MCTS(rng1);
   const mctsAI2 = new MCTS(rng2);

   // ... (MCTS ツリーのロードと初期化のロジックはそのまま)

   let turnCount = 0;
   const maxTurns = 100;

   while (!gameBoard.isGameOver() && turnCount < maxTurns) {
      const currentPlayer = gameBoard.currentPlayer;
      const currentBoardState = gameBoard.getBoardState();
      let chosenMove = null;

      if (currentPlayer === 1) {
         // 黒AI (mctsAI1) の手番
         chosenMove = mctsAI1.run(currentBoardState, currentPlayer, simsN);
      } else {
         // 白AI (mctsAI2) の手番
         chosenMove = mctsAI2.run(currentBoardState, currentPlayer, simsN);
      }

      if (chosenMove !== null) {
         gameBoard.applyMove(chosenMove);
         if (currentPlayer === 1) {
            mctsAI1.updateRoot(chosenMove);
         } else {
            mctsAI2.updateRoot(chosenMove);
         }
      } else {
         gameBoard.applyMove(null); // パス
      }
      turnCount++;
   }

   const scores = gameBoard.getScores();
   const winner = gameBoard.getWinner();
   const finalBoardState = gameBoard.getBoardState();

   const serializedTreeAI1 = JSON.stringify(mctsAI1.persistentRoot.toSerializableObject());
   const serializedTreeAI2 = JSON.stringify(mctsAI2.persistentRoot.toSerializableObject());

   parentPort.postMessage({
      type: "game_finished",
      workerSlotId: workerSlotId, // ★ workerId を workerSlotId に変更
      gameNumber: gameNumber,
      blackStones: scores.black,
      whiteStones: scores.white,
      winner: winner,
      treeDataAI1: serializedTreeAI1,
      treeDataAI2: serializedTreeAI2,
      finalBoard: finalBoardState,
   });
}

runSelfPlayGame();

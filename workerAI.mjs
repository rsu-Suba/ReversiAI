import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { parentPort, workerData } from "worker_threads";
import seedrandom from "seedrandom";

const { simsN, cP, workerSlotId, vsRandom } = workerData;

async function runSelfPlayGame() {
   console.log(`W${workerSlotId}: Playing now.`);
   const board = new OthelloBoard();
   const rng = seedrandom(`seed-${workerSlotId}-${Date.now()}`);
   const mcts = new MCTS(cP, rng);
   let turn = 0;

   try {
      while (!board.isGameOver()) {
         turn++;
         const legalMoves = board.getLegalMoves();
         if (legalMoves.length === 0) {
            board.applyMove(null);
            continue;
         }

         let bestMoveBit;
         if (vsRandom && board.currentPlayer === -1) {
            const randomMove = legalMoves[Math.floor(rng() * legalMoves.length)];
            bestMoveBit = BigInt(randomMove[0] * 8 + randomMove[1]);
         } else {
            bestMoveBit = await mcts.run(
               board.blackBoard,
               board.whiteBoard,
               board.currentPlayer,
               board.passedLastTurn,
               simsN,
               turn
            );
            if (bestMoveBit === null) {
               const randomMove = legalMoves[Math.floor(rng() * legalMoves.length)];
               bestMoveBit = BigInt(randomMove[0] * 8 + randomMove[1]);
            }
         }
         board.applyMove(bestMoveBit);
         //board.display();
      }
      //board.display();
      parentPort.postMessage({
         type: "game_finished",
         workerSlotId: workerSlotId,
         blackStones: board.getScores().black,
         whiteStones: board.getScores().white,
         winner: board.getWinner(),
         treeDataAI1: JSON.stringify(mcts.getSerializableTree()),
         treeDataAI2: null,
      });
   } catch (error) {
      console.error(`W${workerSlotId}: Error in game loop:`, error);
      parentPort.postMessage({ type: "game_error", workerSlotId, errorMessage: error.message });
   }
}

parentPort.on("message", (msg) => {
   if (msg.type === "start_game") {
      runSelfPlayGame();
   } else if (msg.type === "terminate_now") {
      process.exit(0);
   }
});
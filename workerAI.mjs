import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { DatabaseManager } from "./DatabaseManager.mjs";
import { parentPort, workerData } from "worker_threads";
import seedrandom from "seedrandom";

const { simsN, cP, workerSlotId, gamesToPlay } = workerData;
const DB_FILE_PATH = `./mcts/mcts_w${workerSlotId}.sqlite`;

async function main() {
   const dbManager = new DatabaseManager(DB_FILE_PATH);
   await dbManager.init();
   const rng = seedrandom(`seed-${workerSlotId}-${Date.now()}`);
   const mcts = new MCTS(dbManager, cP, rng);
   for (let i = 0; i < gamesToPlay; i++) {
      parentPort.postMessage({
         type: "game_starting",
         workerSlotId: workerSlotId,
         gameNumberInWorker: i + 1,
         totalGamesInWorker: gamesToPlay,
      });
      const board = new OthelloBoard();
      while (!board.isGameOver()) {
         const legalMoves = board.getLegalMoves();
         if (legalMoves.length === 0) {
            board.applyMove(null);
            continue;
         }
         const legalMoveBits = legalMoves.map((m) => BigInt(m[0] * 8 + m[1]));
         const aiMoveBit = await mcts.run(board.blackBoard, board.whiteBoard, board.currentPlayer, simsN);
         let finalMoveBit;
         if (aiMoveBit !== null && legalMoveBits.includes(aiMoveBit)) {
            finalMoveBit = aiMoveBit;
         } else {
            finalMoveBit = legalMoveBits[Math.floor(rng() * legalMoveBits.length)];
         }
         board.applyMove(finalMoveBit);
      }
      parentPort.postMessage({
         type: "game_finished",
         workerSlotId: workerSlotId,
         scores: board.getScores(),
         winner: board.getWinner(),
         finalBlackBoard: board.blackBoard,
         finalWhiteBoard: board.whiteBoard,
      });
   }
   await dbManager.close();
}

main()
   .then(() => {
      process.exit(0);
   })
   .catch((err) => {
      console.error(`Worker ${workerSlotId} crashed:`, err);
      process.exit(1);
   });

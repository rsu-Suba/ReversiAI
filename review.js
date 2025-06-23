import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTSReview.mjs";
import { DatabaseManager } from "./DatabaseManager.mjs";
import { config } from "./config.mjs";
import { fileURLToPath } from "url";
import * as path from "path";
import seedrandom from "seedrandom";
import * as fs from "fs";

const NUM_GAMES_TO_PLAY = config.reviewMatches;
const MCTS_SIMS_PER_MOVE = config.reviewSimsN;
const DB_FILE_PATH = "./Database/mcts_2-7M.sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cleanupTempFiles(dbPath) {
   const tempFiles = [`${dbPath}-shm`, `${dbPath}-wal`];
   tempFiles.forEach((file) => {
      if (fs.existsSync(file)) {
         try {
            fs.unlinkSync(file);
         } catch (err) {}
      }
   });
}

async function playGames() {
   cleanupTempFiles(DB_FILE_PATH);
   console.log("--- MCTS AI vs Random Bot ---");
   console.log(`Loading learned tree <- ${DB_FILE_PATH}`);

   try {
      const dbManager = new DatabaseManager(DB_FILE_PATH);
      const mctsAI = new MCTS(dbManager, config.cP, seedrandom(`mcts-ai-seed`));
      const totalNodes = dbManager.getNodeCount();
      console.log(`Database connected -> ${totalNodes} nodes`);
      let mctsWins = 0;
      let randomBotWins = 0;
      let draws = 0;
      for (let i = 1; i <= NUM_GAMES_TO_PLAY; i++) {
         const board = new OthelloBoard();
         const randomBotRng = seedrandom(`random-bot-seed-${i}`);
         const isMctsBlack = Math.random() < 0.5;
         console.log(`\n--- Game ${i}/${NUM_GAMES_TO_PLAY} | MCTS -> ${isMctsBlack ? "Black" : "White"} ---`);

         while (!board.isGameOver()) {
            const legalMoves = board.getLegalMoves();
            if (legalMoves.length === 0) {
               board.applyMove(null);
               continue;
            }

            let moveBit;
            const isMctsTurn =
               (board.currentPlayer === 1 && isMctsBlack) || (board.currentPlayer === -1 && !isMctsBlack);

            if (isMctsTurn) {
               //console.log("AI 🤔🤔🤔...");
               moveBit = await mctsAI.run(board.blackBoard, board.whiteBoard, board.currentPlayer, MCTS_SIMS_PER_MOVE);
               const legalMoveBits = legalMoves.map((m) => BigInt(m[0] * 8 + m[1]));
               if (moveBit === null || !legalMoveBits.includes(moveBit)) {
                  console.warn("AI returned an invalid move. Falling back to random.");
                  moveBit = legalMoveBits[Math.floor(randomBotRng() * legalMoves.length)];
               }
            } else {
               const randomMove = legalMoves[Math.floor(randomBotRng() * legalMoves.length)];
               moveBit = BigInt(randomMove[0] * 8 + randomMove[1]);
            }
            board.applyMove(moveBit);
         }
         board.display();
         const winner = board.getWinner();
         if (winner === 0) {
            draws++;
            console.log("Result: Draw");
         } else if ((winner === 1 && isMctsBlack) || (winner === -1 && !isMctsBlack)) {
            mctsWins++;
            console.log("Result: MCTS AI Wins!");
         } else {
            randomBotWins++;
            console.log("Result: Random Bot Wins.");
         }
         console.log(`Scores: ${board.getScores().black} / ${board.getScores().white}`);
      }

      console.log("\n--- Final Results ---");
      console.log(`Total Games: ${NUM_GAMES_TO_PLAY}`);
      console.log(`MCTS AI Wins: ${mctsWins} (${((mctsWins / NUM_GAMES_TO_PLAY) * 100).toFixed(2)}%)`);
      console.log(`Random Bot Wins: ${randomBotWins}`);
      console.log(`Draws: ${draws}`);
   } catch (e) {
      console.error("Failed to run evaluation. Ensure 'mcts.sqlite' exists and is valid.", e);
   }
}
playGames();

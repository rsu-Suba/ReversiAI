import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { config } from "./config.mjs";
import { fileURLToPath } from "url";
import * as path from "path";
import seedrandom from "seedrandom";

const NUM_GAMES_TO_PLAY = config.reviewMatches;
const MCTS_SIMS_PER_MOVE = config.reviewSimsN;
const TREE_FILE_PATH = config.treeLoadPath;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const saveFilePath = path.join(__dirname, TREE_FILE_PATH);

async function playGames() {
   console.log("--- MCTS AI vs Random Bot ---");
   console.log(`Loading learned tree <- ${TREE_FILE_PATH}`);
   const mctsAI = new MCTS(config.cP, seedrandom(`mcts-ai-seed`));
   const loaded = await mctsAI.loadTree(saveFilePath);
   if (!loaded) {
      console.error("FATAL: MCTS tree could not be loaded. Run training script first.");
      return;
   }
   console.log(`Tree loaded -> ${mctsAI.nodeMap.size} nodes.`);

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
         //board.display();
         if (legalMoves.length === 0) {
            board.applyMove(null);
            continue;
         }

         let moveBit;
         const isMctsTurn = (board.currentPlayer === 1 && isMctsBlack) || (board.currentPlayer === -1 && !isMctsBlack);
         if (isMctsTurn) {
            moveBit = mctsAI.run(
               board.blackBoard,
               board.whiteBoard,
               board.currentPlayer,
               board.passedLastTurn,
               MCTS_SIMS_PER_MOVE
            );
            if (moveBit === null) {
               console.warn("MCTS returned null, picking random move.");
               const randomMove = legalMoves[Math.floor(randomBotRng() * legalMoves.length)];
               moveBit = BigInt(randomMove[0] * 8 + randomMove[1]);
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
}
playGames();

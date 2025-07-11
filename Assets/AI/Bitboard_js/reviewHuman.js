import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { config } from "./config.mjs";
import { fileURLToPath } from "url";
import * as path from "path";
import seedrandom from "seedrandom";
import * as readline from "readline";

const MCTS_SIMS_PER_MOVE = config.reviewSimsN;
const TREE_FILE_PATH = config.treeLoadPath;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const saveFilePath = path.join(__dirname, TREE_FILE_PATH);

const rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout,
});

function questionAsync(query) {
   return new Promise((resolve) => {
      rl.question(query, resolve);
   });
}

async function playGame() {
   console.log("--- MCTS AI vs Human ---");
   console.log(`Loading learned tree <- ${TREE_FILE_PATH}`);
   const mctsAI = new MCTS(config.cP, seedrandom(`mcts-ai-seed`));
   const loaded = await mctsAI.loadTree(saveFilePath);
   if (!loaded) {
      console.error("FATAL: MCTS tree could not be loaded. Run training script first.");
      rl.close();
      return;
   }
   console.log(`Tree loaded -> ${mctsAI.nodeMap.size} nodes.`);
   const board = new OthelloBoard();
   const isMctsBlack = Math.random() < 0.5;
   console.log(`\n--- Game Start | You -> ${isMctsBlack ? "White" : "Black"} ---`);

   while (!board.isGameOver()) {
      board.display();
      const legalMoves = board.getLegalMoves();

      if (legalMoves.length === 0) {
         console.log("No legal moves. Passing turn.");
         board.applyMove(null);
         continue;
      }
      let moveBit;
      const isMctsTurn = (board.currentPlayer === 1 && isMctsBlack) || (board.currentPlayer === -1 && !isMctsBlack);
      if (isMctsTurn) {
         console.log("AI 🤔🤔🤔...");
         moveBit = mctsAI.run(
            board.blackBoard,
            board.whiteBoard,
            board.currentPlayer,
            board.passedLastTurn,
            MCTS_SIMS_PER_MOVE
         );
         if (moveBit === null) {
            const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            moveBit = BigInt(randomMove[0] * 8 + randomMove[1]);
         }
         const moveY = Math.floor(Number(moveBit) / 8);
         const moveX = Number(moveBit) % 8;
         console.log(`AI 😓👍: ${"abcdefgh"[moveX]}${moveY}`);
      } else {
         console.log("Your turn🫵 Placeable:");
         const moveOptions = legalMoves.map((m) => `${"abcdefgh"[m[1]]}${m[0]}`);
         console.log(moveOptions.join(", "));

         while (true) {
            const userInput = await questionAsync("Select move: ");
            const moveStr = userInput.toLowerCase();
            if (moveOptions.includes(moveStr)) {
               const x = "abcdefgh".indexOf(moveStr[0]);
               const y = parseInt(moveStr[1]);
               moveBit = BigInt(y * 8 + x);
               break;
            } else {
               console.log("❌Invalid move.");
            }
         }
      }

      board.applyMove(moveBit);
   }

   console.log("\n--- GAME OVER ---");
   const winner = board.getWinner();
   if (winner === 0) {
      console.log("Result: Draw");
   } else if ((winner === 1 && isMctsBlack) || (winner === -1 && !isMctsBlack)) {
      console.log("Result: MCTS AI Wins!");
   } else {
      console.log("Result: You Win!");
   }
   board.display();
   rl.close();
}

playGame();

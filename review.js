import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { DatabaseManager } from "./DatabaseManager.mjs";
import { config } from "./config.mjs";
import * as readline from "readline";
import seedrandom from "seedrandom";
import * as fs from "fs";

const humanPlaysArg = process.argv[2];
const HUMAN_PLAYS = humanPlaysArg === "1";
const DB_FILE_PATH = config.treeLoadPath;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const questionAsync = (query) => new Promise((resolve) => rl.question(query, resolve));

async function runEvaluation() {
   cleanupTempFiles(DB_FILE_PATH);
   console.log(`--- MCTS AI vs ${HUMAN_PLAYS ? "Human" : "Random Bot"} ---`);
   const numGamesToPlay = HUMAN_PLAYS ? 1 : config.reviewMatches;
   console.log(`${numGamesToPlay} game`);
   const dbManager = new DatabaseManager(DB_FILE_PATH);
   await dbManager.init();
   const mctsAI = new MCTS(dbManager, config.cP, seedrandom("mcts-ai-seed"));
   const totalNodes = await dbManager.getNodeCount();
   console.log(`Database connected -> ${totalNodes} nodes`);
   let mctsWins = 0;
   let draws = 0;

   for (let i = 1; i <= numGamesToPlay; i++) {
      const board = new OthelloBoard();
      const isMctsBlack = Math.random() < 0.5;
      console.log(`\n--- Game ${i}/${numGamesToPlay} | MCTS -> ${isMctsBlack ? "Black" : "White"} ---`);
      if (HUMAN_PLAYS) board.display();

      while (!board.isGameOver()) {
         const legalMoves = board.getLegalMoves();
         if (legalMoves.length === 0) {
            if (HUMAN_PLAYS) console.log(`No legal moves ${board.currentPlayer === 1 ? "Black" : "White"}. Auto pass.`);
            board.applyMove(null);
            continue;
         }
         let moveBit;
         const isMctsTurn = (board.currentPlayer === 1 && isMctsBlack) || (board.currentPlayer === -1 && !isMctsBlack);
         if (isMctsTurn) {
            if (HUMAN_PLAYS) console.log("AI 🤔🤔🤔...");
            moveBit = await mctsAI.run(board.blackBoard, board.whiteBoard, board.currentPlayer, config.reviewSimsN, false);
            if (HUMAN_PLAYS) {
               if (moveBit !== null) {
                  const moveIndex = Number(moveBit);
                  const moveX = moveIndex % 8;
                  const moveY = Math.floor(moveIndex / 8);
                  const algebraicMove = "abcdefgh"[moveX] + moveY;
                  console.log(`AI 😓👍: ${algebraicMove}`);
               } else {
                  console.log("AI 😓👍: Pass");
               }
            }
         } else {
            if (HUMAN_PLAYS) {
               console.log("Your turn🫵. Placeable\n", legalMoves.map((m) => `${"abcdefgh"[m[1]]}${m[0]}`).join(", "));
               while (true) {
                  const userInput = (await questionAsync("Select move: ")).toLowerCase();
                  const chosenMove = legalMoves.find((m) => `${"abcdefgh"[m[1]]}${m[0]}` === userInput);
                  if (chosenMove) {
                     moveBit = BigInt(chosenMove[0] * 8 + chosenMove[1]);
                     break;
                  }
                  console.log("❌Invalid move.");
               }
            } else {
               const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
               moveBit = BigInt(randomMove[0] * 8 + randomMove[1]);
            }
         }
         board.applyMove(moveBit);
         if (HUMAN_PLAYS) board.display();
      }
      console.log(`\n--- Game ${i} Finished ---`);
      board.display();
      const winner = board.getWinner();
      const scores = board.getScores();
      console.log(`Scores: ${scores.black} / ${scores.white}`);
      let resultMessage = "Result: Draw";
      if (winner === 0) draws++;
      if ((winner === 1 && isMctsBlack) || (winner === -1 && !isMctsBlack)) {
         mctsWins++;
         resultMessage = "Result: MCTS AI Wins!";
      } else {
         resultMessage = `Result: ${HUMAN_PLAYS ? "You Win!" : "Random Bot Wins."}`;
      }
      console.log(resultMessage);
   }

   if (!HUMAN_PLAYS) {
      console.log("\n\n--- Final Tally ---");
      console.log(`Total Games Played: ${numGamesToPlay}`);
      console.log(`MCTS AI Wins: ${mctsWins}`);
      console.log(`Draws: ${draws}`);
      console.log(`AI Win Rate: ${((mctsWins / numGamesToPlay) * 100).toFixed(2)}%`);
   }
   await dbManager.close();
   rl.close();
}

function cleanupTempFiles(dbPath) {
   const tempFiles = [`${dbPath}-shm`, `${dbPath}-wal`];
   tempFiles.forEach((file) => {
      if (fs.existsSync(file)) {
         try {
            fs.unlinkSync(file);
         } catch (err) {
            console.error(`Failed to remove -> ${file}:`, err);
         }
      }
   });
}

runEvaluation();

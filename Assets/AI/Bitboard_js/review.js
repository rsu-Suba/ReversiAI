import { OthelloBoard } from "./OthelloBoard.mjs";
import { config } from "./config.mjs";
import seedrandom from "seedrandom";
import fetch from "node-fetch";

const NUM_GAMES_TO_PLAY = config.reviewMatches;
const MCTS_SIMS_PER_MOVE = config.reviewSimsN;
const NUM_CONCURRENT_GAMES = config.numConcurrentGames;
const API_URL = "http://127.0.0.1:5000/mcts_move";

// ボードの状態を1次元配列に変換 (0: empty, 1: black, 2: white)
function boardTo1DArray(othelloBoard) {
   const board_1d = new Array(64).fill(0);
   for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
         const idx = r * 8 + c;
         if ((othelloBoard.blackBoard >> BigInt(idx)) & 1n) {
            board_1d[idx] = 1; // Black
         } else if ((othelloBoard.whiteBoard >> BigInt(idx)) & 1n) {
            board_1d[idx] = 2; // White
         }
      }
   }
   return board_1d;
}

async function getMctsMove(board, player, simulations) {
   const board_1d = boardTo1DArray(board);
   const playerNumber = player === 1 ? 1 : 2;

   try {
      const response = await fetch(API_URL, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
            board: board_1d,
            player: playerNumber,
            simulations: simulations,
         }),
      });

      if (!response.ok) {
         console.error("API Error:", response.status, await response.text());
         return null;
      }
      const data = await response.json();
      return data.move !== null ? BigInt(data.move) : null;
   } catch (error) {
      console.error("Failed to fetch MCTS move from API:", error);
      return null;
   }
}

async function playGame(gameId) {
   const board = new OthelloBoard();
   const randomBotRng = seedrandom(`random-bot-seed-${gameId}`);
   const isMctsBlack = Math.random() < 0.5;
   console.log(`\n--- Game ${gameId} | MCTS AI -> ${isMctsBlack ? "Black" : "White"} ---`);

   while (!board.isGameOver()) {
      const legalMoves = board.getLegalMoves();
      if (legalMoves.length === 0) {
         board.applyMove(null);
         continue;
      }

      let moveBit;
      const isMctsTurn = (board.currentPlayer === 1 && isMctsBlack) || (board.currentPlayer === -1 && !isMctsBlack);

      if (isMctsTurn) {
         moveBit = await getMctsMove(board, board.currentPlayer, MCTS_SIMS_PER_MOVE);

         if (moveBit === null) {
            console.warn(`Game ${gameId}: MCTS AI returned no move. Falling back to random.`);
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
   let result = "draw";
   if (winner === 0) {
      result = "draw";
      console.log(`Game ${gameId} Result: Draw`);
   } else if ((winner === 1 && isMctsBlack) || (winner === -1 && !isMctsBlack)) {
      result = "mcts_win";
      console.log(`Game ${gameId} Result: MCTS AI Wins!`);
   } else {
      result = "random_win";
      console.log(`Game ${gameId} Result: Random Bot Wins.`);
   }
   console.log(`Game ${gameId} Scores: ${board.getScores().black} / ${board.getScores().white}`);
   return result;
}

async function playGames() {
   console.log("--- Python MCTS AI vs Random Bot ---");

   let mctsWins = 0;
   let randomBotWins = 0;
   let draws = 0;

   const activeGames = new Set(); // To keep track of currently running games
   let gameCounter = 0; // To assign unique IDs to games

   const processGameResult = (result) => {
       if (result === "mcts_win") {
           mctsWins++;
       } else if (result === "random_win") {
           randomBotWins++;
       } else {
           draws++;
       }
   };

   while (gameCounter < NUM_GAMES_TO_PLAY || activeGames.size > 0) {
       // If we have slots available and games left to start
       if (activeGames.size < NUM_CONCURRENT_GAMES && gameCounter < NUM_GAMES_TO_PLAY) {
           gameCounter++;
           const gamePromise = playGame(gameCounter);
           activeGames.add(gamePromise);

           gamePromise.then(result => {
               processGameResult(result);
               activeGames.delete(gamePromise); // Remove from active set when done
           });
       } else if (activeGames.size > 0) {
           // If no slots available or no more games to start, wait for one to finish
           await Promise.race(activeGames);
       } else {
           // Should not happen if logic is correct, but as a safeguard
           break;
       }
   }

   console.log("\n--- Final Results ---");
   console.log(`Total Games: ${NUM_GAMES_TO_PLAY}`);
   console.log(`MCTS AI Wins: ${mctsWins} (${((mctsWins / NUM_GAMES_TO_PLAY) * 100).toFixed(2)}%)`);
   console.log(`Random Bot Wins: ${randomBotWins}`);
   console.log(`Draws: ${draws}`);
}

playGames();

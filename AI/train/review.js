import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { config } from "./config.mjs";
import { fileURLToPath } from "url";
import * as path from "path";
import seedrandom from "seedrandom";

const NUM_GAMES_TO_PLAY = 10;
const MCTS_SIMS_PER_MOVE = 3000;
const saveFileName = config.treeLoadPath;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const saveFilePath = path.join(__dirname, saveFileName);

async function playVsRandomBot() {
   console.log("--- Starting MCTS AI vs Random Bot Play ---");
   console.log(`Loading Data <- ${saveFileName}`);
   const mcts = new MCTS();
   const loaded = await mcts.loadTree(saveFilePath);
   if (!loaded || !mcts.persistentRoot) {
      console.error("Error: MCTS tree can't load.");
      console.error("Run the self-play script first to generate the tree.");
      return;
   }
   console.log("MCTS tree loaded. Ready to play!");
   let mctsWins = 0;
   let randomBotWins = 0;
   let draws = 0;

   for (let i = 1; i <= NUM_GAMES_TO_PLAY; i++) {
      console.log(`\n--- Game ${i}/${NUM_GAMES_TO_PLAY} ---`);
      const gameBoard = new OthelloBoard();
      const mctsRng = seedrandom(`${Date.now()}-mcts-ai-${i}`);
      const randomBotRng = seedrandom(`${Date.now()}-random-bot-${i}`);
      const mctsPlayer = mcts;
      const randomBotPlayer = {
         run: (boardState, currentPlayer) => {
            const tempBoard = new OthelloBoard();
            tempBoard.setBoardState(boardState, currentPlayer);
            const legalMoves = tempBoard.getLegalMoves();
            if (legalMoves.length === 0) return null;
            return legalMoves[Math.floor(randomBotRng() * legalMoves.length)];
         },
      };

      const isMctsBlack = Math.floor(mctsRng() * 2) === 0;
      console.log(`MCTS AI plays as: ${isMctsBlack ? "Black (先手)" : "White (後手)"}`);

      let turnCount = 0;
      const maxTurns = 100;

      while (!gameBoard.isGameOver() && turnCount < maxTurns) {
         const currentPlayer = gameBoard.currentPlayer;
         const currentBoardState = gameBoard.getBoardState();
         let chosenMove = null;
         if ((currentPlayer === 1 && isMctsBlack) || (currentPlayer === -1 && !isMctsBlack)) {
            const boardKey = JSON.stringify(currentBoardState) + "_" + currentPlayer;
            mctsPlayer.currentRoot = mctsPlayer.nodeMap.get(boardKey);
            if (!mctsPlayer.currentRoot) {
               mctsPlayer.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
               mctsPlayer.nodeMap.set(boardKey, mctsPlayer.currentRoot);
            }
            chosenMove = mctsPlayer.run(currentBoardState, currentPlayer, MCTS_SIMS_PER_MOVE);
            if (chosenMove !== null) mctsPlayer.updateRoot(chosenMove);
         } else {
            chosenMove = randomBotPlayer.run(currentBoardState, currentPlayer);
         }

         if (chosenMove !== null) {
            gameBoard.applyMove(chosenMove);
         } else {
            gameBoard.applyMove(null);
         }
         turnCount++;
         //gameBoard.display();
      }

      const winner = gameBoard.getWinner();

      let resultMessage = "Draw.";
      if (winner === 1) {
         resultMessage = `Winner: Black.${isMctsBlack ? "AI" : "Random"}`;
         if (isMctsBlack) mctsWins++;
         else randomBotWins++;
      } else if (winner === -1) {
         resultMessage = `Winner: White.${isMctsBlack ? "Random" : "AI"}`;
         if (!isMctsBlack) mctsWins++;
         else randomBotWins++;
      } else {
         draws++;
      }
      console.log(resultMessage);
   }

   console.log("\n--- Final Results ---");
   console.log(`Total Games: ${NUM_GAMES_TO_PLAY}`);
   console.log(`MCTS AI Wins: ${mctsWins}`);
   console.log(`Random Bot Wins: ${randomBotWins}`);
   console.log(`Draws: ${draws}`);
   console.log(`MCTS AI Win Rate: ${((mctsWins / NUM_GAMES_TO_PLAY) * 100).toFixed(2)}%`);
}

playVsRandomBot();

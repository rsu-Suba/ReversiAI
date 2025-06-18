//AI vs AI
import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";

async function main() {
   const simsN = 10000;
   const gameBoard = new OthelloBoard();
   const mcts = new MCTS(gameBoard);

   let currentPlayer = 1; //1:B, 2:W
   let currentBoardState = gameBoard.getBoardState();

   while (!gameBoard.isGameOver()) {
      console.log(`Now: ${currentPlayer === 1 ? "Black(AI)" : "White(Random)"}`);
      gameBoard.display([8, 0]);

      let bestMove;
      if (currentPlayer === 1) {
         console.log("AI : 🤔🤔🤔");
         bestMove = mcts.run(currentBoardState, currentPlayer, simsN);
         console.log(`AI : I chose ${bestMove ? String.fromCharCode(97 + bestMove[0]) + (bestMove[1] + 1) : "Pass 🫠"}`);
      } else {
         console.log("Enemy : 🤔🤔🤔");
         bestMove = mcts.run(currentBoardState, currentPlayer, simsN);
         console.log(`Enemy : I chose ${bestMove ? String.fromCharCode(97 + bestMove[0]) + (bestMove[1] + 1) : "Pass 🫠"}`);
      }
      console.log("");

      if (bestMove !== null) {
         gameBoard.setBoardState(currentBoardState, currentPlayer);
         gameBoard.applyMove(bestMove);
      } else {
         gameBoard.setBoardState(currentBoardState, currentPlayer);
         gameBoard.applyMove(null);
      }
      currentBoardState = gameBoard.getBoardState();
      currentPlayer = gameBoard.currentPlayer;

      if (gameBoard.isGameOver()) {
         console.log("\nGame Over!😣😣😣");
         gameBoard.display(bestMove);

         const winner = gameBoard.getWinner();
         console.log(`🔴: ${winner[1]}, ⚪: ${winner[2]}`);
         if (winner[0] === 1) {
            console.log("Win : Black(AI)😎😎😎");
         } else if (winner[0] === -1) {
            console.log("Win : White(Random)🤣🤣🤣");
         } else {
            console.log("Draw🤝🤝🤝");
         }
         break;
      }
   }
}

main();

//AI(Save & Load) vs Random
import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";

const matchN = 50;

async function main() {
   const simsN = 100;
   const saveFilePath = "./mcts_tree.json";
   const gameBoard = new OthelloBoard();
   const mcts = new MCTS(gameBoard);

   const loaded = await mcts.loadTree(saveFilePath);
   if (loaded) {
      console.log("MCTS tree loaded.");
   } else {
      console.log("Failed to load.");
      mcts.root = new MCTSNode(gameBoard.getBoardState(), gameBoard.currentPlayer);
   }

   let currentPlayer = gameBoard.currentPlayer; //1:B, 2:W
   let currentBoardState = gameBoard.getBoardState();

   while (!gameBoard.isGameOver()) {
      console.log(`Turn: ${gameBoard.countStones(1) + gameBoard.countStones(-1)}`);
      console.log(`Now: ${currentPlayer === 1 ? "Black(AI)" : "White(Random)"}`);
      gameBoard.display();

      let bestMove;
      if (currentPlayer === 1) {
         console.log("AI : 🤔🤔🤔");
         bestMove = mcts.run(currentBoardState, currentPlayer, simsN);
         console.log(`AI : I chose ${bestMove ? String.fromCharCode(97 + bestMove[0]) + (bestMove[1] + 1) : "Pass 🫠"}`);
      } else {
         console.log("Enemy : 🤔🤔🤔");
         gameBoard.setBoardState(currentBoardState, currentPlayer);
         const legalMoves = gameBoard.getLegalMoves();
         if (legalMoves.length > 0) {
            bestMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
         } else {
            bestMove = null;
         }
         console.log(
            `Enemy : I chose ${bestMove ? String.fromCharCode(97 + bestMove[0]) + (bestMove[1] + 1) : "Pass 🫠"}`
         );
      }
      console.log("");

      gameBoard.setBoardState(currentBoardState, currentPlayer);
      if (bestMove !== null) {
         gameBoard.applyMove(bestMove);
      } else {
         gameBoard.applyMove(null);
      }
      currentBoardState = gameBoard.getBoardState();
      currentPlayer = gameBoard.currentPlayer;
      console.log("");

      mcts.updateRoot(bestMove);

      if (gameBoard.isGameOver()) {
         console.log("\nGame Over!😣😣😣");
         gameBoard.display(bestMove);

         const blackStones = gameBoard.countStones(1);
         const whiteStones = gameBoard.countStones(-1);

         const winner = gameBoard.getWinner();
         console.log(`🔴: ${blackStones}, ⚪: ${whiteStones}`);
         if (winner === 1) {
            console.log("Win : Black(AI)😎😎😎");
         } else if (winner === -1) {
            console.log("Win : White(Random)🤣🤣🤣");
         } else {
            console.log("Draw🤝🤝🤝");
         }
         await mcts.saveTree(saveFilePath);
         break;
      }
   }
}

//for (let i = 0; i < matchN; i++) {
   main();
//}

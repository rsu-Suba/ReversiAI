//Random vs Random

import {
   getPlayer,
   displayBoard,
   checkBoard,
   randomPlot,
   flipBoard,
   flipAttackBoard,
   isBoardFull,
   checkPlot,
   endGame
} from "./ReversiModule.mjs";
import * as readline from "readline";

const rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout,
});
let playerNum = getPlayer();
let board = [
   [0, 0, 0, 0, 0, 0, 0, 0],
   [0, 0, 0, 0, 0, 0, 0, 0],
   [0, 0, 0, 0, 0, 0, 0, 0],
   [0, 0, 0, 1, -1, 0, 0, 0],
   [0, 0, 0, -1, 1, 0, 0, 0],
   [0, 0, 0, 0, 0, 0, 0, 0],
   [0, 0, 0, 0, 0, 0, 0, 0],
   [0, 0, 0, 0, 0, 0, 0, 0],
];

main();

async function main() {
   let pos = [8, 0];
   let flips = [];
   while (true) {
      displayBoard(board, playerNum, pos);

      pos = randomPlot(board, playerNum);
      flips = checkBoard(pos, board, playerNum);

      const status = checkPlot(board, playerNum, flips);
      if (status == 1) {
         endGame(board, playerNum, pos, rl, false);
         break;
      } else if (status == 2) {
         playerNum *= -1;
         continue;
      } else if (status == 3) {
         continue;
      }

      flipBoard(pos, board, playerNum);
      playerNum = flipAttackBoard(flips, board, playerNum);

      if (isBoardFull(board)) {
         endGame(board, playerNum, pos, rl, false);
         break;
      }
   }
}
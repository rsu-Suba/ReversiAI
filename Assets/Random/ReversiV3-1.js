//Random vs Random(Loop)

import {
   getPlayer,
   displayBoard,
   checkBoard,
   randomPlot,
   flipBoard,
   flipAttackBoard,
   isBoardFull,
   checkPlot,
   endGame,
} from "./ReversiModule.mjs";
import * as readline from "readline";

const Loop = 1000;
let Red = 0;
let White = 0;
let Draw = 0;

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
   for (let i = 0; i < Loop; i++) {
      playerNum = 1;
      board = [
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 1, -1, 0, 0, 0],
         [0, 0, 0, -1, 1, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
      ];

      await battle();
   }
   console.log(`Loop: ${Loop}, Red: ${Red}, White: ${White}, Draw: ${Draw}`);
}

async function battle() {
   let pos = [8, 0];
   let flips = [];
   while (true) {
      pos = randomPlot(board, playerNum);
      flips = checkBoard(pos, board, playerNum);

      const status = checkPlot(board, playerNum, flips);
      if (status == 1) {
         endMatch(pos);
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
         endMatch(pos);
         break;
      }
   }
}

function endMatch(pos) {
   const status = endGame(board, playerNum, pos, rl, true);
   if (status == 1) {
      Red++;
   } else if (status == -1) {
      White++;
   } else if (status == 2) {
      Draw++;
   }
}

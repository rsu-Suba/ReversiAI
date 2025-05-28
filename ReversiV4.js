//Random vs Random(Vector)

import {
   getPlayer,
   checkBoard,
   randomPlot,
   flipBoard,
   flipAttackBoard,
   isBoardFull,
   checkPlot,
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
let xArray = ["a", "b", "c", "d", "e", "f", "g", "h"];

main();

async function main() {
   let pos = [8, 0];
   let flips = [];
   let plotPos = "";
   let counter = 0;
   while (true) {
      counter++;
      pos = randomPlot(board, playerNum);
      plotPos = `${String(counter).padStart(2, " ")}: ${xArray[pos[0]]}${pos[1]}`;
      console.log(plotPos);
      
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

function displayBoardVector(pos) {
   console.log("   a  b  c  d  e  f  g  h");
   let convBoard = [
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
   ];
   for (let i = 0; i < board.length; i++) {
      for (let j = 0; j < board[0].length; j++) {
         convBoard[i][j] = String(board[i][j]).padStart(2, " ");
      }
      console.log(
         i + 1,
         convBoard[i][0],
         convBoard[i][1],
         convBoard[i][2],
         convBoard[i][3],
         convBoard[i][4],
         convBoard[i][5],
         convBoard[i][6],
         convBoard[i][7]
      );
   }
   if (pos[0] != 8) {
      console.log(`Random: (${pos[1] + 1}, ${pos[0] + 1})`);
   }
   console.log(`Now: ${playerNum == 1 ? "🔴" : "⚪️"}`);
   console.log("");
}

function endGame(pos) {
   displayBoardVector(pos);
   let red = 0,
      white = 0;
   let status = 0;
   for (let row of board) {
      for (let cell of row) {
         if (cell === 1) red++;
         else if (cell === -1) white++;
      }
   }

   console.log("Finish！");
   console.log(`🔴: ${red}, ⚪: ${white}`);

   if (red > white) {
      console.log("Win : 🔴");
      status = 1;
   } else if (white > red) {
      console.log("Win : ⚪");
      status = -1;
   } else {
      console.log("Draw!");
      status = 0;
   }

   console.log("");
   rl.close();

   return status;
}

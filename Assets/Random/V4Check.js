//Human vs Human

import {
   getPlayer,
   checkBoard,
   flipBoard,
   flipAttackBoard,
   isBoardFull,
   checkPlot,
   endGame,
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
   while (true) {
      displayBoard(pos);

      pos = await inputSelect();
      flips = checkBoard(pos, board, playerNum);
      if (pos === null) {
         console.log("Exit.");
         rl.close();
         break;
      }

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

function displayBoard(pos) {
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
         let stone = "🟩";
         if (board[i][j] == 1) {
            stone = "🔴";
         } else if (board[i][j] == -1) {
            stone = "⚪";
         }
         convBoard[i][j] = stone;
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

async function inputSelect() {
   while (true) {
      const pos = await questionAsync("Select pos: ");
      if (pos.toLowerCase() === "exit") return null;
      const isValid = /^[a-h][0-7]$/.test(pos);
      if (isValid) {
         const x = parseInt(xArray.indexOf(pos[0]));
         const y = parseInt(pos[1]);
         console.log(x, y);

         if (y >= 0 && y < board.length && x >= 0 && x < board[0].length) {
            if (board[y][x] == 0) {
               return [y, x];
            } else {
               //placed
               console.log("Already placed.");
            }
         } else {
            //out of area
            console.log("Out of area.");
         }
      } else {
         console.log("Invalid.");
      }
   }
}

function questionAsync(query) {
   return new Promise((resolve) => {
      rl.question(query, (answer) => {
         resolve(answer);
      });
   });
}

//Human vs Random

const readline = require("readline");
const rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout,
});
let playerNum = 1;

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
   let pos = [0, 0];
   while (true) {
      displayBoard();

      if (!hasValidMove(1) && !hasValidMove(-1)) {
         console.log("Can't place either.");
         endGame();
         rl.close();
         break;
      }

      if (!hasValidMove(playerNum)) {
         console.log(`${playerNum === 1 ? "🔴" : "⚪"} can't place, Skip.`);
         playerNum *= -1;
         continue;
      }

      if (pos[0] != 0 && playerNum == 1) {
         console.log(`Random: (${pos[1] + 1}, ${pos[0] + 1})`);
      }
      pos = [0, 0];
      let flips = [];
      if (playerNum == 1) {
         pos = await inputSelect();
         console.log(`person: (${pos[1] + 1}, ${pos[0] + 1})`);
      } else {
         pos = randomProt();
      }
      if (pos === null) {
         console.log("Exit.");
         rl.close();
         break;
      }

      flips = checkBoard(pos, playerNum);

      if (flips.length <= 0) {
         console.log("Can't place there.");
         continue;
      }

      flipBoard(pos);
      flipAttackBoard(flips);

      if (isBoardFull()) {
         displayBoard();
         endGame();
         rl.close();
         break;
      }
   }
}

function displayBoard() {
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
   console.log("   1  2  3  4  5  6  7  8");
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
   console.log(`Now: ${playerNum == 1 ? "🔴" : "⚪️"}`);
}

async function inputSelect() {
   while (true) {
      const posX = await questionAsync("Select posX: ");
      if (posX.toLowerCase() === "exit") return null;
      const posY = await questionAsync("Select posY: ");
      if (posY.toLowerCase() === "exit") return null;

      const x = parseInt(posX) - 1;
      const y = parseInt(posY) - 1;

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
   }
}

function questionAsync(query) {
   return new Promise((resolve) => {
      rl.question(query, (answer) => {
         resolve(answer);
      });
   });
}

function checkBoard(pos, player) {
   const dir = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
   ];

   const flips = [];

   for (let d = 0; d < dir.length; d++) {
      //console.log(pos[0]);
      const tmpFlips = [];
      const dy = dir[d][0];
      const dx = dir[d][1];
      let y = pos[0] + dy;
      let x = pos[1] + dx;

      while (y >= 0 && y < board.length && x >= 0 && x < board[0].length) {
         const stone = board[y][x];

         if (stone === 0) {
            break;
         } else if (stone === player) {
            if (tmpFlips.length > 0) {
               flips.push(...tmpFlips);
            }
            break;
         } else {
            tmpFlips.push([x, y]);
         }

         y += dy;
         x += dx;
      }
   }

   return flips;
}

function flipBoard(pos) {
   board[pos[0]][pos[1]] = playerNum;
}

function flipAttackBoard(flips) {
   for (let i = 0; i < flips.length; i++) {
      flipBoard([flips[i][1], flips[i][0]]);
   }
   playerNum *= -1;
}

function hasValidMove(player) {
   for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[y].length; x++) {
         if (board[y][x] === 0) {
            const flips = checkBoard([y, x], player);
            if (flips.length > 0) return true;
         }
      }
   }
   return false;
}

function isBoardFull() {
   for (let row of board) {
      if (row.includes(0)) return false;
   }
   return true;
}

function endGame() {
   let red = 0,
      white = 0;
   for (let row of board) {
      for (let cell of row) {
         if (cell === 1) red++;
         else if (cell === -1) white++;
      }
   }

   console.log("Finish！");
   console.log(`🔴: ${red}, ⚪: ${white}`);
   if (red > white) console.log("Win : 🔴");
   else if (white > red) console.log("Win : ⚪");
   else console.log("Draw!");
}

function randomProt() {
   let flipsTmp = [];
   let flips = [];
   let pos = [0, 0];
   for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
         if (board[i][j] == 0) {
            pos[0] = i;
            pos[1] = j;
            flipsTmp = checkBoard(pos, playerNum);
            if (flipsTmp.length > 0) {
               flips.push([i, j]);
            }
         }
      }
   }
   if (flips.length === 0) return [];
   const selectCell = flips[Math.floor(Math.random() * flips.length)];
   return selectCell;
}

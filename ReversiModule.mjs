function getPlayer() {
   return (-1) ** (Math.round(Math.random()) + 1);
}

function displayBoard(board, playerNum, pos) {
   console.log("   1  2  3  4  5  6  7  8");
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

function displayBoardVector(board, playerNum, pos) {
   console.log("   1  2  3  4  5  6  7  8");
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
         convBoard[i][j] = String(board[i][j]).padStart(2, ' ');
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

function checkBoard(pos, board, player) {
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

async function inputSelect(board, rl) {
   while (true) {
      const posX = await questionAsync("Select posX: ", rl);
      if (posX.toLowerCase() === "exit") return null;
      const posY = await questionAsync("Select posY: ", rl);
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

function questionAsync(query, rl) {
   return new Promise((resolve) => {
      rl.question(query, (answer) => {
         resolve(answer);
      });
   });
}

function randomPlot(board, playerNum) {
   let flipsTmp = [];
   let flips = [];
   let pos = [0, 0];
   for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
         if (board[i][j] == 0) {
            pos[0] = i;
            pos[1] = j;
            flipsTmp = checkBoard(pos, board, playerNum);
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

function flipBoard(pos, board, playerNum) {
   board[pos[0]][pos[1]] = playerNum;
}

function flipAttackBoard(flips, board, playerNum) {
   for (let i = 0; i < flips.length; i++) {
      flipBoard([flips[i][1], flips[i][0]], board, playerNum);
   }
   playerNum *= -1;

   return playerNum;
}

function hasValidMove(player, board) {
   for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[y].length; x++) {
         if (board[y][x] === 0) {
            const flips = checkBoard([y, x], board, player);
            if (flips.length > 0) return true;
         }
      }
   }
   return false;
}

function isBoardFull(board) {
   for (let row of board) {
      if (row.includes(0)) return false;
   }
   return true;
}

function checkPlot(board, playerNum, flips) {
   if (!hasValidMove(1, board) && !hasValidMove(-1, board)) {
      console.log("Can't place either.");
      return 1;
   }

   if (!hasValidMove(playerNum, board)) {
      console.log(`${playerNum === 1 ? "🔴" : "⚪"} can't place, Skip.`);
      return 2;
   }
   if (flips.length <= 0) {
      console.log("Can't place there.");
      return 3;
   }
}

function endGame(board, playerNum, pos, rl) {
   displayBoard(board, playerNum, pos);
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
      status = 2;
   }

   console.log("");
   rl.close();

   return status;
}

export {
   getPlayer,
   displayBoard,
   displayBoardVector,
   checkBoard,
   inputSelect,
   randomPlot,
   flipBoard,
   flipAttackBoard,
   hasValidMove,
   isBoardFull,
   checkPlot,
   endGame,
};

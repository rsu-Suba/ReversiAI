import * as readline from "readline";

const boardLength = 8;
const boardSize = boardLength ** 2;
const AllMask = (1n << BigInt(boardSize)) - 1n;
const uMask = 0xffn;
const bMask = 0xff0000000000n;
const lMask = 0x101010101010101n;
const rMask = 0x2020202020202020n;
let blackBoard = 0x1008000000n;
let whiteBoard = 0x810000000n;
let currentPlayer = 1;
let passCount = 0;

async function main() {
   display(blackBoard, whiteBoard);
   while (true) {
      const blackLegalMoves = getLegalMoves(1, blackBoard, whiteBoard);
      const whiteLegalMoves = getLegalMoves(-1, blackBoard, whiteBoard);
      const currentLegalMoves = currentPlayer === 1 ? blackLegalMoves : whiteLegalMoves;
      if (currentLegalMoves.size === 0) {
         console.log(`${currentPlayer === 1 ? "Black" : "White"} -> Pass`);
         passCount++;
      } else {
         passCount = 0;
      }
      if (isGameOver(blackBoard, whiteBoard, blackLegalMoves.size > 0, whiteLegalMoves.size > 0)) {
         displayFinalScore();
         break;
      }
      const plotPos = await inputSelect(rl, currentPlayer == 1 ? blackLegalMoves : whiteLegalMoves);
      const flipCells = getFlip(plotPos, currentPlayer == 1 ? blackLegalMoves : whiteLegalMoves);
      const newBoard = applyFlips(plotPos, flipCells, currentPlayer, blackBoard, whiteBoard);
      blackBoard = newBoard.black;
      whiteBoard = newBoard.white;
      currentPlayer = changePlayer(currentPlayer);
      display(blackBoard, whiteBoard);
   }
   rl.close();
}

const rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout,
});

async function inputSelect(rl, legalMoves) {
   const alpha = ["a", "b", "c", "d", "e", "f", "g", "h"];
   while (true) {
      console.log(`Player: ${currentPlayer == 1 ? "Black" : "White"}`);
      const pos = await questionAsync("Select pos: ", rl);
      if (pos.toLowerCase() === "exit") return null;
      if (typeof pos !== "string" || pos.length !== 2) {
         console.log("Invaild pos. (a0)");
         continue;
      }
      const pattern = /^([a-h])([0-7])$/;
      const match = pos.match(pattern);
      if (!match) {
         console.log("Invaild match. (a0)");
         continue;
      }
      const x = parseInt(alpha.indexOf(match[1]));
      const y = parseInt(match[2]);
      const plotPos = y * boardLength + x;
      if (legalMoves.get(plotPos) === undefined) {
         console.log("Can't place there");
         continue;
      }

      return plotPos;
   }
}

function questionAsync(query, rl) {
   return new Promise((resolve) => {
      rl.question(query, (answer) => {
         resolve(answer);
      });
   });
}

function display(blackBoard, whiteBoard) {
   let board = Array(boardLength)
      .fill(null)
      .map(() => Array(boardLength).fill("🟩"));
   for (let i = 0; i < boardLength ** 2; i++) {
      const x = i % boardLength;
      const y = Math.floor(i / boardLength);
      const mask = 1n << BigInt(i);

      if ((blackBoard & mask) !== 0n) {
         board[y][x] = "🔴";
      } else if ((whiteBoard & mask) !== 0n) {
         board[y][x] = "⚪️";
      }
   }
   console.log("\n   a b c d e f g h");
   for (let i = 0; i < boardLength; i++) {
      const b = board[i];
      let cons = `${i} `;
      for (let j = 0; j < boardLength; j++) {
         cons += `${b[j]}`;
      }
      console.log(`${cons}`);
   }
   console.log("");
}

function getFlip(pos, legalFlipMask) {
   console.log(`Pos: ${pos}`);
   return legalFlipMask.get(pos);
}

function getLegalMoves(player, blackTempBoard, whiteTempBoard) {
   const flipMask = new Map();
   for (let i = 0; i < boardSize; i++) {
      const mask = 1n << BigInt(i);
      if (((blackBoard | whiteBoard) & mask) == 0n) {
         let tempFlipMask = 0n;
         let playerBoard = player == 1 ? blackTempBoard : whiteTempBoard;
         let enemyBoard = player == 1 ? whiteTempBoard : blackTempBoard;
         const directions = [
            { shift: -1n, edge: lMask },
            { shift: 1n, edge: rMask },
            { shift: -BigInt(boardLength), edge: uMask },
            { shift: BigInt(boardLength), edge: bMask },
            { shift: -(BigInt(boardLength) + 1n), edge: lMask | uMask },
            { shift: -(BigInt(boardLength) - 1n), edge: rMask | uMask },
            { shift: BigInt(boardLength) - 1n, edge: lMask | bMask },
            { shift: BigInt(boardLength) + 1n, edge: rMask | bMask },
         ];
         for (const dir of directions) {
            let currentFlipsInDirection = 0n;
            let currentCheckPos = i + Number(dir.shift);
            let currentCheckMask = 1n << BigInt(currentCheckPos);

            if ((mask & dir.edge) !== 0n) {
               continue;
            }
            while (
               currentCheckPos >= 0 &&
               currentCheckPos < boardSize &&
               (currentCheckMask & enemyBoard) !== 0n &&
               (currentCheckMask & dir.edge) === 0n
            ) {
               currentFlipsInDirection |= currentCheckMask;
               currentCheckPos += Number(dir.shift);
               currentCheckMask = 1n << BigInt(currentCheckPos);
            }
            if (
               currentFlipsInDirection !== 0n &&
               (currentCheckMask & playerBoard) !== 0n &&
               currentCheckPos >= 0 &&
               currentCheckPos < boardSize
            ) {
               tempFlipMask |= currentFlipsInDirection;
            }
         }
         if (tempFlipMask !== 0n) {
            flipMask.set(i, tempFlipMask);
         }
      }
   }
   return flipMask;
}

function applyFlips(plotPos, flipCells, player, blackTempBoard, whiteTempBoard) {
   let playerBoard = player == 1 ? blackTempBoard : whiteTempBoard;
   let enemyBoard = player == 1 ? whiteTempBoard : blackTempBoard;

   playerBoard |= flipCells | (1n << BigInt(plotPos));
   enemyBoard &= ~flipCells;

   blackBoard = player == 1 ? playerBoard : enemyBoard;
   whiteBoard = player == 1 ? enemyBoard : playerBoard;

   return { black: blackBoard, white: whiteBoard };
}

function changePlayer(player) {
   return (player *= -1);
}

function isGameOver(blackTempBoard, whiteTempBoard, blackLegalMoves, whiteLegalMoves) {
   const occupiedCells = blackTempBoard | whiteTempBoard;
   if (occupiedCells === AllMask) {
      console.log("Board is full! Game Over.");
      return true;
   }
   if (!blackLegalMoves && !whiteLegalMoves) {
      console.log("No legal moves for either player. Game Over.");
      return true;
   }
   if (passCount >= 2) {
      console.log("Both players passed consecutively. Game Over.");
      return true;
   }
   if (blackTempBoard === 0n || whiteTempBoard === 0n) {
      console.log("One player has no pieces left. Game Over.");
      return true;
   }
   return false;
}

function displayFinalScore() {
   const blackCount = countSetBits(blackBoard);
   const whiteCount = countSetBits(whiteBoard);
   console.log("\n--- GAME OVER ---");
   console.log(`Black: ${blackCount} pieces`);
   console.log(`White: ${whiteCount} pieces`);
   if (blackCount > whiteCount) {
      console.log("Black Wins!");
   } else if (whiteCount > blackCount) {
      console.log("White Wins!");
   } else {
      console.log("It's a Draw!");
   }
}

function countSetBits(n) {
   let count = 0;
   while (n > 0n) {
      n &= n - 1n;
      count++;
   }
   return count;
}

main();

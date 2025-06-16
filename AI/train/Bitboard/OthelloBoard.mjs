import { boardDisplay } from "./debug.mjs";

export class OthelloBoard {
   static boardLength = 8;
   static boardSize = 64;
   static AllMask = 0xffffffffffffffffn;
   static uMask = 0xffn;
   static bMask = 0xff00000000000000n;
   static lMask = 0x101010101010101n;
   static rMask = 0x8080808080808080n;
   static lNMask = ~OthelloBoard.lMask & OthelloBoard.AllMask;
   static rNMask = ~OthelloBoard.rMask & OthelloBoard.AllMask;
   static uNMask = ~OthelloBoard.uMask & OthelloBoard.AllMask;
   static bNMask = ~OthelloBoard.bMask & OthelloBoard.AllMask;
   static blackInitBoard = 0x1008000000n;
   static whiteInitBoard = 0x810000000n;

   constructor() {
      this.blackBoard = OthelloBoard.blackInitBoard;
      this.whiteBoard = OthelloBoard.whiteInitBoard;
      this.currentPlayer = 1;
      this.passCount = 0;
      this.passedLastTurn = false;
   }

   setBoardState(blackBoard, whiteBoard, currentPlayer, passCount, passedLastTurn) {
      this.blackBoard = BigInt(blackBoard || 0);
      this.whiteBoard = BigInt(whiteBoard || 0);
      this.currentPlayer = Number(currentPlayer || 1);
      this.passCount = Number(passCount || 0);
      this.passedLastTurn = Boolean(passedLastTurn || false);
   }

   getBoardState() {
      return {
         blackBoard: this.blackBoard,
         whiteBoard: this.whiteBoard,
         currentPlayer: this.currentPlayer,
         passCount: this.passCount,
         passedLastTurn: this.passedLastTurn,
      };
   }

   switchPlayer() {
      this.currentPlayer *= -1;
   }

   getLegalMoves() {
      const LegalMovesBitboard = this.getLegalMovesBitboard();
      const moves = [];
      for (let i = 0n; i < BigInt(OthelloBoard.boardSize); i++) {
         if (((LegalMovesBitboard >> i) & 1n) !== 0n) {
            const r = Math.floor(Number(i) / OthelloBoard.boardLength);
            const c = Number(i) % OthelloBoard.boardLength;
            moves.push([r, c]);
         }
      }
      return moves;
   }

   getLegalMovesBitboard() {
      let playerBoard = this.currentPlayer === 1 ? this.blackBoard : this.whiteBoard;
      let enemyBoard = this.currentPlayer === 1 ? this.whiteBoard : this.blackBoard;

      let legalMoves = 0n;
      //console.log(typeof playerBoard, typeof enemyBoard, playerBoard, enemyBoard, this.blackBoard, this.whiteBoard);
      const occupiedSquares = playerBoard | enemyBoard;
      const emptySquares = occupiedSquares ^ OthelloBoard.AllMask;
      if (emptySquares === 0n) {
         return 0n;
      }

      const calculateMovesInDirection = (player, enemy, empty, shift, clipMask) => {
         // ここがビットボードオセロの合法手計算の核となるロジック
         // 全ての引数がBigIntであることを前提とする
         let potentialFlips = (player << shift) & enemy & clipMask;
         for (let i = 0; i < OthelloBoard.boardLength - 2; i++) {
            potentialFlips |= (potentialFlips << shift) & enemy & clipMask;
         }
         return (potentialFlips << shift) & empty & clipMask;
      };

      legalMoves |= calculateMovesInDirection(playerBoard, enemyBoard, emptySquares, 1n, OthelloBoard.rNMask); // 右
      legalMoves |= calculateMovesInDirection(playerBoard, enemyBoard, emptySquares, -1n, OthelloBoard.lNMask); // 左
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         BigInt(OthelloBoard.boardLength),
         OthelloBoard.bNMask
      );
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         -BigInt(OthelloBoard.boardLength),
         OthelloBoard.uNMask
      );
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         BigInt(OthelloBoard.boardLength) + 1n,
         OthelloBoard.rNMask & OthelloBoard.bNMask
      );
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         -(BigInt(OthelloBoard.boardLength) + 1n),
         OthelloBoard.lNMask & OthelloBoard.uNMask
      );
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         BigInt(OthelloBoard.boardLength) - 1n,
         OthelloBoard.lNMask & OthelloBoard.bNMask
      );
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         -(BigInt(OthelloBoard.boardLength) - 1n),
         OthelloBoard.rNMask & OthelloBoard.uNMask
      );

      return legalMoves;
   }

   _calculateFlips(moveBit, playerBoard, enemyBoard) {
      let flipMask = 0n;
      const placeMask = 1n << moveBit;
      if (((BigInt(playerBoard) | BigInt(enemyBoard)) & placeMask) !== 0n) return 0n;

      const directions = [
         { shift: -1n, edge: OthelloBoard.lNMask },
         { shift: 1n, edge: OthelloBoard.rNMask },
         { shift: -BigInt(OthelloBoard.boardLength), edge: OthelloBoard.uNMask },
         { shift: BigInt(OthelloBoard.boardLength), edge: OthelloBoard.bNMask },
         { shift: -(BigInt(OthelloBoard.boardLength) + 1n), edge: OthelloBoard.lNMask & OthelloBoard.uNMask },
         { shift: -(BigInt(OthelloBoard.boardLength) - 1n), edge: OthelloBoard.rNMask & OthelloBoard.uNMask },
         { shift: BigInt(OthelloBoard.boardLength) - 1n, edge: OthelloBoard.lNMask & OthelloBoard.bNMask },
         { shift: BigInt(OthelloBoard.boardLength) + 1n, edge: OthelloBoard.rNMask & OthelloBoard.bNMask },
      ];

      for (const dir of directions) {
         let currentDirFlips = 0n;
         let tempCheckMask = placeMask;
         for (let i = 0; i < OthelloBoard.boardLength - 2; i++) {
            tempCheckMask = (tempCheckMask << dir.shift) & dir.edge;
            if (tempCheckMask === 0n) {
               currentDirFlips = 0n;
               break;
            }
            if ((BigInt(enemyBoard) & tempCheckMask) !== 0n) {
               currentDirFlips |= tempCheckMask;
            } else if ((BigInt(playerBoard) & tempCheckMask) !== 0n) {
               break;
            } else {
               currentDirFlips = 0n;
               break;
            }
         }
         flipMask |= currentDirFlips;
      }
      return flipMask;
   }

   applyMove(moveBit) {
      const initPassCount = this.passCount;
      if (moveBit === null) {
         const playerLegalMoves = this.getLegalMovesBitboard();
         if (playerLegalMoves !== 0n) {
            console.log("Something went wrong🔨🐒: 001");
         }
         this.passCount++;
         this.switchPlayer();
         this.passedLastTurn = true;
         return true;
      }
      let playerBoard = this.currentPlayer === 1 ? this.blackBoard : this.whiteBoard;
      let enemyBoard = this.currentPlayer === 1 ? this.whiteBoard : this.blackBoard;
      const flipMask = this._calculateFlips(moveBit, playerBoard, enemyBoard);
      if (flipMask === 0n) {
         console.log("Something went wrong🔨🐒: 002");
         return false;
      }
      playerBoard |= 1n << BigInt(moveBit);
      playerBoard ^= flipMask;
      enemyBoard ^= flipMask;

      //console.log(`Undefined Check: ${playerBoard} ${enemyBoard}`);
      if (this.currentPlayer === 1) {
         this.blackBoard = playerBoard;
         this.whiteBoard = enemyBoard;
      } else {
         this.whiteBoard = playerBoard;
         this.blackBoard = enemyBoard;
      }

      this.passCount = 0;
      this.passedLastTurn = false;
      this.switchPlayer();

      const nextPlayerLegalMoves = this.getLegalMovesBitboard();
      if (nextPlayerLegalMoves === 0n) {
         this.passCount++;
         this.passedLastTurn = true;
         this.switchPlayer();
      }
      return true;
   }

   display() {
      let board = Array(8)
         .fill(null)
         .map(() => Array(8).fill("🟩"));
      for (let i = 0; i < 8 ** 2; i++) {
         const x = i % 8;
         const y = Math.floor(i / 8);
         const mask = 1n << BigInt(i);

         if ((this.blackBoard & mask) !== 0n) {
            board[y][x] = "🔴";
         } else if ((this.whiteBoard & mask) !== 0n) {
            board[y][x] = "⚪️";
         }
      }
      console.log("\n   a b c d e f g h");
      for (let i = 0; i < 8; i++) {
         const b = board[i];
         let cons = `${i} `;
         for (let j = 0; j < 8; j++) {
            cons += `${b[j]}`;
         }
         console.log(`${cons}`);
      }
      console.log("");
   }

   getWinner() {
      const scores = this.getScores();
      if (scores.black > scores.white) {
         return 1;
      } else if (scores.white > scores.black) {
         return -1;
      } else {
         return 0;
      }
   }

   getScores() {
      let black = this.countSetBits(this.blackBoard);
      let white = this.countSetBits(this.whiteBoard);
      return { black, white };
   }

   countSetBits(n) {
      let count = 0;
      while (n > 0n) {
         n &= n - 1n;
         count++;
      }
      return count;
   }

   isGameOver() {
      const occupiedCells = this.blackBoard | this.whiteBoard;
      //console.log(typeof this.blackBoard, typeof this.whiteBoard);
      //console.log(this.blackBoard, this.whiteBoard);
      //console.log(typeof occupiedCells, occupiedCells);
      if ((occupiedCells & OthelloBoard.AllMask) === OthelloBoard.AllMask) return true;

      // blackLegalMoves と whiteLegalMoves は、それぞれのプレイヤーで getLegalMovesBitboard() を呼んで計算
      // OthelloBoard を一時的にコピーし、currentPlayer を切り替えて合法手を計算
      const currentBoardForLegalMoves = new OthelloBoard();
      currentBoardForLegalMoves.setBoardState(
         this.blackBoard,
         this.whiteBoard,
         this.currentPlayer,
         this.passCount,
         this.passedLastTurn
      );

      // 黒の合法手 (this.currentPlayer が黒の場合の合法手)
      const blackLegalMoves = currentBoardForLegalMoves.getLegalMovesBitboard();

      // 白の合法手 (currentPlayer を白に切り替えた場合の合法手)
      currentBoardForLegalMoves.switchPlayer(); // プレイヤーを切り替える
      const whiteLegalMoves = currentBoardForLegalMoves.getLegalMovesBitboard();

      // 元の currentPlayer に戻す（必要であれば）
      currentBoardForLegalMoves.switchPlayer();

      if (
         (blackLegalMoves === 0n && whiteLegalMoves === 0n) ||
         this.passCount >= 2 ||
         this.blackBoard === 0n ||
         this.whiteBoard === 0n
      ) {
         //console.log("Game Over 01");
         return true;
      }
      return false;
   }
}

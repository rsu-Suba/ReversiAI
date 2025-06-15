import { boardDisplay } from "./debug.mjs";

export class OthelloBoard {
   static boardLength = 8;
   static boardSize;
   static AllMask;
   static uMask = 0xffn;
   static bMask = 0xff00000000000000n;
   static lMask = 0x101010101010101n;
   static rMask = 0x8080808080808080n;
   static lNMask;
   static rNMask;
   static uNMask;
   static bNMask;
   static blackInitBoard = 0x1008000000n;
   static whiteInitBoard = 0x810000000n;

   static {
      OthelloBoard.boardSize = OthelloBoard.boardLength ** 2;
      OthelloBoard.AllMask = BigInt((1n << BigInt(OthelloBoard.boardSize)) - 1n);
      OthelloBoard.lNMask = ~OthelloBoard.lMask & OthelloBoard.AllMask;
      OthelloBoard.rNMask = ~OthelloBoard.rMask & OthelloBoard.AllMask;
      OthelloBoard.uNMask = ~OthelloBoard.uMask & OthelloBoard.AllMask;
      OthelloBoard.bNMask = ~OthelloBoard.bMask & OthelloBoard.AllMask;

      (() => {
         console.log("[DEBUG OthelloBoard Static Init END]");
         console.log(`boardLength: ${OthelloBoard.boardLength}`);
         console.log(`boardSize: ${OthelloBoard.boardSize}`);
         console.log(`AllMask: ${typeof OthelloBoard.AllMask} ${OthelloBoard.AllMask.toString(16)}n`);
         console.log(`uMask: ${typeof OthelloBoard.uMask} ${OthelloBoard.uMask.toString(16)}n`);
         console.log(`bMask: ${typeof OthelloBoard.bMask} ${OthelloBoard.bMask.toString(16)}n`);
         console.log(`lMask: ${typeof OthelloBoard.lMask} ${OthelloBoard.lMask.toString(16)}n`);
         console.log(`rMask: ${typeof OthelloBoard.rMask} ${OthelloBoard.rMask.toString(16)}n`);
         console.log(`NOT_COL_A: ${typeof OthelloBoard.lNMask} ${OthelloBoard.lNMask.toString(16)}n`);
         console.log(`NOT_COL_H: ${typeof OthelloBoard.rNMask} ${OthelloBoard.rNMask.toString(16)}n`);
         console.log(`NOT_ROW_0: ${typeof OthelloBoard.uNMask} ${OthelloBoard.uNMask.toString(16)}n`);
         console.log(`NOT_ROW_7: ${typeof OthelloBoard.bNMask} ${OthelloBoard.bNMask.toString(16)}n`);
         console.log(
            `blackInitBoard: ${typeof OthelloBoard.blackInitBoard} ${OthelloBoard.blackInitBoard.toString(16)}n`
         );
         console.log(
            `whiteInitBoard: ${typeof OthelloBoard.whiteInitBoard} ${OthelloBoard.whiteInitBoard.toString(16)}n`
         );
      })();
      // ★★★ デバッグログ終わり ★★★
   }

   constructor() {
      this.blackBoard = OthelloBoard.blackInitBoard;
      this.whiteBoard = OthelloBoard.whiteInitBoard;
      this.currentPlayer = 1;
      this.passCount = 0;
      this.passedLastTurn = false; // MCTSNodeと同期するため
   }

   setBoardState(blackBoard, whiteBoard, currentPlayer, passCount) {
      this.blackBoard = blackBoard;
      this.whiteBoard = whiteBoard;
      this.currentPlayer = currentPlayer;
      this.passCount = passCount;
   }

   getBoardState() {
      return { blackBoard: this.blackBoard, whiteBoard: this.whiteBoard, passedLastTurn: this.passedLastTurn };
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
      let emptySquares;
      if (typeof (playerBoard | enemyBoard) === typeof OthelloBoard.AllMask) {
         emptySquares = (playerBoard | enemyBoard) ^ OthelloBoard.AllMask;
      }
      if (emptySquares === 0n) {
         return 0n;
      }
      for (let i = 0n; i < BigInt(OthelloBoard.boardSize); i++) {
         const moveBit = 1n << i;

         if (typeof emptySquares === typeof moveBit && (emptySquares & moveBit) !== 0n) {
            const flips = this._calculateFlips(i, playerBoard, enemyBoard);
            if (flips !== 0n) {
               legalMoves |= moveBit;
            }
         }
      }
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
      let board = Array(this.boardLength)
         .fill(null)
         .map(() => Array(this.boardLength).fill("🟩"));
      for (let i = 0; i < this.boardLength ** 2; i++) {
         const x = i % this.boardLength;
         const y = Math.floor(i / this.boardLength);
         const mask = 1n << BigInt(i);

         if ((this.blackBoard & mask) !== 0n) {
            board[y][x] = "🔴";
         } else if ((this.whiteBoard & mask) !== 0n) {
            board[y][x] = "⚪️";
         }
      }
      console.log("\n   a b c d e f g h");
      for (let i = 0; i < this.boardLength; i++) {
         const b = board[i];
         let cons = `${i} `;
         for (let j = 0; j < this.boardLength; j++) {
            cons += `${b[j]}`;
         }
         console.log(`${cons}`);
      }
      console.log("");
   }

   getWinner() {
      if (!this.isGameOver()) {
         return null;
      }
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
      if ((BigInt(occupiedCells) & BigInt(OthelloBoard.AllMask)) === BigInt(OthelloBoard.AllMask)) return true;
      const blackLegalMoves = this._getLegalMovesForPlayer(this.blackBoard, this.whiteBoard);
      const whiteLegalMoves = this._getLegalMovesForPlayer(this.whiteBoard, this.blackBoard);
      if (
         (blackLegalMoves === 0n && whiteLegalMoves === 0n) ||
         this.passCount >= 2 ||
         this.blackBoard === 0n ||
         this.whiteBoard === 0n
      ) {
         return true;
      }
      return false;
   }

   _getLegalMovesForPlayer(playerBoard, enemyBoard) {
      let legalMoves = 0n;
      let emptySquares;
      if (typeof (playerBoard | enemyBoard) === typeof OthelloBoard.AllMask) {
         emptySquares = (playerBoard | enemyBoard) ^ OthelloBoard.AllMask;
      }
      if (emptySquares === 0n) {
         return 0n;
      }

      const calculateMovesInDirection = (player, enemy, empty, shift, clipMask) => {
         let potentialFlips = 0n;
         let p = player;
         let o = enemy;
         let e = empty;
         let tmp;

         if (typeof enemy === typeof player && typeof player === typeof clipMask) {
            tmp = (p << shift) & o & clipMask;
            for (let i = 0; i < OthelloBoard.boardLength - 2; i++) {
               tmp |= (tmp << shift) & o & clipMask;
            }
            potentialFlips = (tmp << shift) & e & clipMask;
         }
         return potentialFlips;
      };

      legalMoves |= calculateMovesInDirection(playerBoard, enemyBoard, emptySquares, 1n, OthelloBoard.rNMask); // 右
      legalMoves |= calculateMovesInDirection(playerBoard, enemyBoard, emptySquares, -1n, OthelloBoard.lNMask); // 左
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         BigInt(OthelloBoard.boardLength),
         OthelloBoard.bNMask
      ); // 下
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         -BigInt(OthelloBoard.boardLength),
         OthelloBoard.uNMask
      ); // 上
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         BigInt(OthelloBoard.boardLength) + 1n,
         OthelloBoard.rNMask & OthelloBoard.bNMask
      ); // 右下
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         -(BigInt(OthelloBoard.boardLength) + 1n),
         OthelloBoard.lNMask & OthelloBoard.uNMask
      ); // 左上
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         BigInt(OthelloBoard.boardLength) - 1n,
         OthelloBoard.lNMask & OthelloBoard.bNMask
      ); // 左下
      legalMoves |= calculateMovesInDirection(
         playerBoard,
         enemyBoard,
         emptySquares,
         -(BigInt(OthelloBoard.boardLength) - 1n),
         OthelloBoard.rNMask & OthelloBoard.uNMask
      ); // 右上

      return legalMoves;
   }
}

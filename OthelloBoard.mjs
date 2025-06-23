export class OthelloBoard {
   static boardLength = 8;
   static boardSize = 64;
   static AllMask = 0xffffffffffffffffn;
   static lMask = 0x0101010101010101n;
   static rMask = 0x8080808080808080n;
   static lNMask = ~OthelloBoard.lMask;
   static rNMask = ~OthelloBoard.rMask;
   static blackInitBoard = 0x0000001008000000n;
   static whiteInitBoard = 0x0000000810000000n;

   constructor() {
      this.reset();
   }

   reset() {
      this.blackBoard = OthelloBoard.blackInitBoard;
      this.whiteBoard = OthelloBoard.whiteInitBoard;
      this.currentPlayer = 1;
      this.passedLastTurn = false;
   }

   setBoardState(blackBoard, whiteBoard, currentPlayer, passedLastTurn) {
      this.blackBoard = BigInt(blackBoard);
      this.whiteBoard = BigInt(whiteBoard);
      this.currentPlayer = Number(currentPlayer);
      this.passedLastTurn = Boolean(passedLastTurn || false);
   }

   getBoardState() {
      return {
         blackBoard: this.blackBoard,
         whiteBoard: this.whiteBoard,
         currentPlayer: this.currentPlayer,
      };
   }

   getLegalMovesBitboard() {
      const playerBoard = this.currentPlayer === 1 ? this.blackBoard : this.whiteBoard;
      const enemyBoard = this.currentPlayer === 1 ? this.whiteBoard : this.blackBoard;
      const emptySquares = ~(playerBoard | enemyBoard);
      let legalMoves = 0n;
      for (let i = 0; i < 64; i++) {
         const moveBit = BigInt(i);
         if (((1n << moveBit) & emptySquares) !== 0n) {
            if (this._calculateFlips(moveBit, playerBoard, enemyBoard) !== 0n) {
               legalMoves |= 1n << moveBit;
            }
         }
      }
      return legalMoves;
   }

   _calculateFlips(moveBit, playerBoard, enemyBoard) {
      const moveMask = 1n << moveBit;
      let totalFlipMask = 0n;
      const directions = [-9n, -8n, -7n, -1n, 1n, 7n, 8n, 9n];
      for (const shift of directions) {
         let line = 0n;
         let current = moveMask;
         for (let i = 0; i < OthelloBoard.boardLength; i++) {
            if ((shift === 1n || shift === -7n || shift === 9n) && (current & OthelloBoard.rMask) !== 0n) {
               line = 0n;
               break;
            }
            if ((shift === -1n || shift === 7n || shift === -9n) && (current & OthelloBoard.lMask) !== 0n) {
               line = 0n;
               break;
            }
            current = shift > 0 ? current << shift : current >> -shift;
            if ((current & enemyBoard) !== 0n) {
               line |= current;
            } else if ((current & playerBoard) !== 0n) {
               totalFlipMask |= line;
               break;
            } else {
               break;
            }
         }
      }
      return totalFlipMask;
   }

   applyMove(moveBit) {
      if (moveBit === null) {
         this.passedLastTurn = true;
         this.currentPlayer *= -1;
         return;
      }
      const playerBoard = this.currentPlayer === 1 ? this.blackBoard : this.whiteBoard;
      const enemyBoard = this.currentPlayer === 1 ? this.whiteBoard : this.blackBoard;
      const flipMask = this._calculateFlips(moveBit, playerBoard, enemyBoard);
      const moveMask = 1n << moveBit;
      if (this.currentPlayer === 1) {
         this.blackBoard ^= moveMask | flipMask;
         this.whiteBoard ^= flipMask;
      } else {
         this.whiteBoard ^= moveMask | flipMask;
         this.blackBoard ^= flipMask;
      }
      this.passedLastTurn = false;
      this.currentPlayer *= -1;
   }

   isGameOver() {
      if ((this.blackBoard | this.whiteBoard) === OthelloBoard.AllMask) return true;
      if (this.blackBoard === 0n || this.whiteBoard === 0n) return true;
      const originalPlayer = this.currentPlayer;
      if (this.getLegalMovesBitboard() !== 0n) return false;
      this.currentPlayer *= -1;
      const opponentMoves = this.getLegalMovesBitboard();
      this.currentPlayer = originalPlayer;
      return opponentMoves === 0n;
   }

   getLegalMoves() {
      const bitboard = this.getLegalMovesBitboard();
      const moves = [];
      for (let i = 0; i < 64; i++) {
         if ((bitboard >> BigInt(i)) & 1n) {
            moves.push([Math.floor(i / 8), i % 8]);
         }
      }
      return moves;
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
      let boardStr = "\n   a b c d e f g h\n";
      for (let i = 0; i < 8; i++) {
         const b = board[i];
         boardStr += `${i} `;
         let cons = "";
         for (let j = 0; j < 8; j++) {
            cons += `${b[j]}`;
         }
         boardStr += `${cons}\n`;
      }
      console.log(`${boardStr}`);
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

   getLegalMovesWithDetails() {
      const playerBoard = this.currentPlayer === 1 ? this.blackBoard : this.whiteBoard;
      const enemyBoard = this.currentPlayer === 1 ? this.whiteBoard : this.blackBoard;
      const legalMovesBitboard = this.getLegalMovesBitboard();
      const detailedMoves = [];

      for (let i = 0; i < 64; i++) {
         const moveBit = BigInt(i);
         const moveMask = 1n << moveBit;
         if ((legalMovesBitboard & moveMask) !== 0n) {
            const moveCoords = [Math.floor(i / 8), i % 8];
            const flipMask = this._calculateFlips(moveBit, playerBoard, enemyBoard);
            const flippedStonesCoords = [];
            if (flipMask > 0n) {
               for (let j = 0; j < 64; j++) {
                  if ((flipMask >> BigInt(j)) & 1n) {
                     const flipY = Math.floor(j / 8);
                     const flipX = j % 8;
                     flippedStonesCoords.push([flipY, flipX]);
                  }
               }
            }
            detailedMoves.push({
               move: moveCoords,
               flips: flippedStonesCoords,
            });
         }
      }

      return detailedMoves;
   }
}

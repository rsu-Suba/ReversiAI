export class OthelloBoard {
   constructor() {
      this.board = Array(8)
         .fill(null)
         .map(() => Array(8).fill(0));
      this.board[3][3] = 1;
      this.board[3][4] = -1;
      this.board[4][3] = -1;
      this.board[4][4] = 1;
      this.currentPlayer = 1;
      this.passedLastTurn = false;
   }

   setBoardState(boardState, currentPlayer) {
      this.board = boardState.map((row) => [...row]);
      this.currentPlayer = currentPlayer;
   }

   getBoardState() {
      return this.board.map((row) => [...row]);
   }

   switchPlayer() {
      this.currentPlayer *= -1;
   }

   _flipDiscs(row, col, player) {
      const directions = [
         [-1, -1],
         [-1, 0],
         [-1, 1],
         [0, -1],
         [0, 1],
         [1, -1],
         [1, 0],
         [1, 1],
      ];
      let flippedCount = 0;
      for (const [dr, dc] of directions) {
         let r = row + dr;
         let c = col + dc;
         const discsToFlip = [];
         while (r >= 0 && r < 8 && c >= 0 && c < 8 && this.board[r][c] === -player) {
            discsToFlip.push([r, c]);
            r += dr;
            c += dc;
         }
         if (r >= 0 && r < 8 && c >= 0 && c < 8 && this.board[r][c] === player) {
            for (const [fr, fc] of discsToFlip) {
               this.board[fr][fc] = player;
               flippedCount++;
            }
         }
      }
      return flippedCount;
   }

   getLegalMoves() {
      const legalMoves = [];
      for (let r = 0; r < 8; r++) {
         for (let c = 0; c < 8; c++) {
            if (this.board[r][c] === 0) {
               if (this._isValidMove(r, c, this.currentPlayer)) {
                  legalMoves.push([r, c]);
               }
            }
         }
      }
      return legalMoves;
   }

   _isValidMove(row, col, player) {
      if (this.board[row][col] !== 0) return false;
      const directions = [
         [-1, -1],
         [-1, 0],
         [-1, 1],
         [0, -1],
         [0, 1],
         [1, -1],
         [1, 0],
         [1, 1],
      ];
      for (const [dr, dc] of directions) {
         let r = row + dr;
         let c = col + dc;
         let foundOpponent = false;
         while (r >= 0 && r < 8 && c >= 0 && c < 8 && this.board[r][c] === -player) {
            foundOpponent = true;
            r += dr;
            c += dc;
         }
         if (foundOpponent && r >= 0 && r < 8 && c >= 0 && c < 8 && this.board[r][c] === player) {
            return true;
         }
      }
      return false;
   }

   applyMove(move) {
      const legalMoves = this.getLegalMoves();
      if (move === null || !this._isValidMove(move[0], move[1], this.currentPlayer)) {
         if (legalMoves.length === 0) {
            if (this.passedLastTurn) {
               this.currentPlayer = 0;
            } else {
               this.passedLastTurn = true;
               this.switchPlayer();
            }
            return true;
         } else {
            return false;
         }
      }

      this.board[move[0]][move[1]] = this.currentPlayer;
      this._flipDiscs(move[0], move[1], this.currentPlayer);
      this.passedLastTurn = false;
      this.switchPlayer();
      const nextPlayerBoard = new OthelloBoard();
      nextPlayerBoard.setBoardState(this.board, this.currentPlayer);
      const nextPlayerLegalMoves = nextPlayerBoard.getLegalMoves();

      if (nextPlayerLegalMoves.length === 0) {
         this.passedLastTurn = true;
         this.switchPlayer();
      }

      return true;
   }

   isGameOver() {
      const scores = this.getScores();
      if (scores.black === 0 || scores.white === 0) return true;
      const emptyCells = this.board.flat().filter((cell) => cell === 0).length;
      if (emptyCells === 0) return true;

      const originalPlayer = this.currentPlayer;
      const originalBoardState = this.getBoardState();

      this.setBoardState(originalBoardState, 1);
      const blackMoves = this.getLegalMoves().length;
      this.setBoardState(originalBoardState, -1);
      const whiteMoves = this.getLegalMoves().length;

      this.setBoardState(originalBoardState, originalPlayer);

      if (blackMoves === 0 && whiteMoves === 0) {
         return true;
      }

      return false;
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
      let black = 0;
      let white = 0;
      for (let r = 0; r < 8; r++) {
         for (let c = 0; c < 8; c++) {
            if (this.board[r][c] === 1) {
               black++;
            } else if (this.board[r][c] === -1) {
               white++;
            }
         }
      }
      return { black, white };
   }

   display() {
      let boardString = "   a b c d e f g h\n";
      for (let r = 0; r < 8; r++) {
         boardString += `${r} `;
         for (let c = 0; c < 8; c++) {
            const cell = this.board[r][c];
            if (cell === 1) {
               boardString += "🔴";
            } else if (cell === -1) {
               boardString += "⚪";
            } else {
               boardString += "🟩";
            }
         }
         boardString += "\n";
      }
      console.log(boardString);
      console.log(`Current Player: ${this.currentPlayer === 1 ? "Black" : "White"}`);
      const scores = this.getScores();
      console.log(`Scores: Black = ${scores.black}, White = ${scores.white}`);
   }
}

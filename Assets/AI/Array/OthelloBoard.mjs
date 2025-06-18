export class OthelloBoard {
   constructor() {
      this.boardState = Array(8)
         .fill(null)
         .map(() => Array(8).fill(0));
      this.boardState[3][3] = 1;
      this.boardState[3][4] = -1;
      this.boardState[4][3] = -1;
      this.boardState[4][4] = 1;
      this.currentPlayer = 1;
      this.passedLastTurn = false;
   }

   setBoardState(boardState, currentPlayer, passedLastTurn) {
      this.boardState = boardState.map((row) => [...row]);
      this.currentPlayer = currentPlayer;
      this.passedLastTurn = passedLastTurn;
   }

   getBoardState() {
      return this.boardState.map((row) => [...row]);
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
         while (r >= 0 && r < 8 && c >= 0 && c < 8 && this.boardState[r][c] === -player) {
            discsToFlip.push([r, c]);
            r += dr;
            c += dc;
         }
         if (r >= 0 && r < 8 && c >= 0 && c < 8 && this.boardState[r][c] === player) {
            for (const [fr, fc] of discsToFlip) {
               this.boardState[fr][fc] = player;
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
            if (this.boardState[r][c] === 0) {
               if (this._isValidMove(r, c, this.currentPlayer)) {
                  legalMoves.push([r, c]);
               }
            }
         }
      }
      return legalMoves;
   }

   _isValidMove(row, col, player) {
      if (this.boardState[row][col] !== 0) return false;
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
         while (r >= 0 && r < 8 && c >= 0 && c < 8 && this.boardState[r][c] === -player) {
            foundOpponent = true;
            r += dr;
            c += dc;
         }
         if (foundOpponent && r >= 0 && r < 8 && c >= 0 && c < 8 && this.boardState[r][c] === player) {
            return true;
         }
      }
      return false;
   }

   applyMove(move) {
      if (move === null) {
         const currentLegalMoves = this.getLegalMoves();
         if (currentLegalMoves.length === 0) {
            if (this.passedLastTurn) {
               this.currentPlayer = 0;
            } else {
               this.passedLastTurn = true;
               this.switchPlayer();
            }
         } else {
            console.warn(`Attempted to pass for player ${this.currentPlayer} but legal moves exist. Forcing pass.`);
            this.passedLastTurn = true;
            this.switchPlayer();
         }
         return;
      }

      const [row, col] = move;
      if (!this._isValidMove(row, col, this.currentPlayer)) {
         throw new Error(
            `Invalid move tried by player ${this.currentPlayer} at (${row}, ${col}). Board state: ${JSON.stringify(
               this.boardState
            )}`
         );
      }

      this.boardState[row][col] = this.currentPlayer;
      this._flipDiscs(row, col, this.currentPlayer);
      this.passedLastTurn = false;
      this.switchPlayer();
      const nextPlayerLegalMoves = this.getLegalMoves();

      if (nextPlayerLegalMoves.length === 0) {
         this.passedLastTurn = true;
         this.switchPlayer();
      } else {
         this.passedLastTurn = false;
      }
   }

   isGameOver() {
      if (this.getScores().black + this.getScores().white === 64) return true;
      if (this.currentPlayer === 0) return true;

      const currentLegalMoves = this.getLegalMoves();
      this.switchPlayer();
      const opponentLegalMoves = this.getLegalMoves();
      this.switchPlayer();

      if (currentLegalMoves.length === 0 && opponentLegalMoves.length === 0) {
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
            if (this.boardState[r][c] === 1) {
               black++;
            } else if (this.boardState[r][c] === -1) {
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
            const cell = this.boardState[r][c];
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

      if (this.currentPlayer === 0) {
         console.log("Game Over (2 consecutive passes or full board)");
      } else {
         console.log(`Current Player: ${this.currentPlayer === 1 ? "Black" : "White"}`);
      }
      const scores = this.getScores();
      console.log(`Scores: Black = ${scores.black}, White = ${scores.white}`);
   }
}

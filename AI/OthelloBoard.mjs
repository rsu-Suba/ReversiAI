export class OthelloBoard {
   constructor() {
      this.board = [
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 1, -1, 0, 0, 0],
         [0, 0, 0, -1, 1, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
         [0, 0, 0, 0, 0, 0, 0, 0],
      ];
      this.currentPlayer = 1;
   }

   getBoardState() {
      return this.board.map((row) => [...row]);
   }

   setBoardState(boardState, currentPlayer) {
      this.board = boardState.map((row) => [...row]);
      this.currentPlayer = currentPlayer;
   }

   getLegalMoves() {
      let legalMoves = [];
      for (let i = 0; i < 8; i++) {
         for (let j = 0; j < 8; j++) {
            if (this.board[i][j] == 0) {
               const flippable = this._checkBoard([j, i], this.board, this.currentPlayer);
               if (flippable.length > 0) {
                  legalMoves.push([j, i]);
               }
            }
         }
      }
      if (legalMoves.length === 0) return [];
      return legalMoves;
   }

   _checkBoard(pos, board, player) {
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
         let x = pos[0] + dx;
         let y = pos[1] + dy;
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
            x += dx;
            y += dy;
         }
      }
      return flips;
   }

   applyMove(move) {
      if (move === null) {
         this.currentPlayer *= -1;
         return;
      }
      this.board[move[1]][move[0]] = this.currentPlayer;
      const flippable = this._checkBoard(move, this.board, this.currentPlayer);

      for (let i = 0; i < flippable.length; i++) {
         const flip = flippable[i];
         this.board[flip[1]][flip[0]] = this.currentPlayer;
      }
      this.currentPlayer *= -1;
   }

   isGameOver() {
      let emptyCells = 0;
      for (let i = 0; i < this.board.length; i++) {
         for (let j = 0; j < this.board[0].length; j++) {
            if (this.board[i][j] === 0) {
               emptyCells++;
            }
         }
      }
      if (emptyCells === 0) return true;

      const currentPlayerMoves = this.getLegalMoves();
      if (currentPlayerMoves.length > 0) return false;

      const realPlayer = this.currentPlayer;
      this.currentPlayer *= -1;
      const enemyMoves = this.getLegalMoves();
      this.currentPlayer *= -1;
      return enemyMoves.length > 0 ? false : true;
   }

   getWinner() {
      let black = 0,
         white = 0;
      for (let row of this.board) {
         for (let cell of row) {
            if (cell === 1) black++;
            else if (cell === -1) white++;
         }
      }
      if (black > white) {
         return 1;
      } else if (white > black) {
         return -1;
      } else {
         return 0;
      }
   }

   display(pos) {
      console.log("   a  b  c  d  e  f  g  h");
      let convBoard = Array(8)
         .fill(0)
         .map(() => Array(8).fill("🟩"));

      for (let i = 0; i < this.board.length; i++) {
         for (let j = 0; j < this.board[0].length; j++) {
            if (this.board[i][j] === 1) {
               convBoard[i][j] = "🔴";
            } else if (this.board[i][j] === -1) {
               convBoard[i][j] = "⚪";
            }
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

      if (pos && pos[0] !== 8) {
         console.log(`Last move : ${String.fromCharCode(97 + pos[0])}${pos[1] + 1}`);
      }
      console.log(`Now : ${this.currentPlayer === 1 ? "🔴" : "⚪"}`);
   }

   countStones(player) {
      let count = 0;
      for (let i = 0; i < this.board.length; i++) {
         for (let j = 0; j < this.board[0].length; j++) {
            if (this.board[i][j] === player) count++;
         }
      }
      return count;
   }
}

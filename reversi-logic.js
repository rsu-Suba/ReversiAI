// reversi-logic.js

// 盤面をチェックして、ひっくり返せる石のリストを返す
export function checkBoard(board, pos, player) {
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
      while (y >= 0 && y < 8 && x >= 0 && x < 8) {
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

// 指定されたプレイヤーが石を置ける場所があるかチェックする
export function hasValidMove(board, player) {
   for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
         if (board[y][x] === 0) {
            if (checkBoard(board, [y, x], player).length > 0) return true;
         }
      }
   }
   return false;
}

// 盤面が全て埋まっているかチェックする
export function isBoardFull(board) {
   for (let row of board) {
      if (row.includes(0)) return false;
   }
   return true;
}

// ゲーム終了時のスコア計算と勝敗メッセージを返す
export function getGameResult(board) {
   let red = 0,
      white = 0;
   for (let row of board) {
      for (let cell of row) {
         if (cell === 1) red++;
         else if (cell === -1) white++;
      }
   }

   let message = "ゲーム終了！ ";
   if (red > white) message += `🔴 の勝ちです！ (${red} vs ${white})`;
   else if (white > red) message += `⚪ の勝ちです！ (${white} vs ${red})`;
   else message += `引き分けです！ (${red} vs ${white})`;

   return message;
}

function formatCurrentDateTime() {
   const now = new Date();
   const hours = String(now.getHours()).padStart(2, "0");
   const minutes = String(now.getMinutes()).padStart(2, "0");
   const seconds = String(now.getSeconds()).padStart(2, "0");
   const month = String(now.getMonth() + 1).padStart(2, "0");
   const day = String(now.getDate()).padStart(2, "0");
   const year = now.getFullYear();
   const formattedDateTime = `${hours}:${minutes}:${seconds} at ${month}/${day}/${year}`;

   return formattedDateTime;
}

async function inputSelect(board, rl, player) {
   const alpha = ["a", "b", "c", "d", "e", "f", "g", "h"];
   while (true) {
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
      console.log(x, y);

      if (y >= 0 && y < board.length && x >= 0 && x < board[0].length) {
         if (board[y][x] == 0) {
            const flips = checkBoard([y, x], board, player);
            if (flips <= 0) {
               console.log("Can't place there");
            } else {
               return [y, x];
            }
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

export { formatCurrentDateTime, inputSelect };

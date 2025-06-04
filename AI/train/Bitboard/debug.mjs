function boardDisplay(playerBoard) {
   const binaryString = playerBoard.toString(2).padStart(36, "0");
   const reversedString = binaryString.split("").reverse().join("");
   let result = "";
   for (let i = 0; i < reversedString.length; i++) {
      result += reversedString[i];
      if ((i + 1) % 6 === 0 && i + 1 !== reversedString.length) {
         result += " ";
      }
   }

   return result;
}

function dirDisplay(shiftDir) {
   let dirStr = "";
   switch (shiftDir) {
      case -1n:
         dirStr = "Left";
         break;
      case 1n:
         dirStr = "Right";
         break;
      case -BigInt(boardLength):
         dirStr = "Up";
         break;
      case BigInt(boardLength):
         dirStr = "Down";
         break;
      case -(BigInt(boardLength) + 1n):
         dirStr = "Left Up";
         break;
      case -(BigInt(boardLength) - 1n):
         dirStr = "Right Up";
         break;
      case BigInt(boardLength) - 1n:
         dirStr = "Left Down";
         break;
      case BigInt(boardLength) + 1n:
         dirStr = "Right Down";
         break;
      default:
         dirStr = "Error";
         break;
   }

   return dirStr;
}

function posToBin(pos, boardLength) {
   let posBin = 0n;
   const alpha = ["a", "b", "c", "d", "e", "f", "g", "h"];
   for (const posHex of pos) {
      if (typeof posHex !== "string" || posHex.length !== 2) {
         console.log("Invaild pos. (a0)");
      }
      const pattern = /^([a-h])([0-7])$/;
      const match = posHex.match(pattern);
      if (!match) {
         console.log("Invaild match. (a0)");
      }
      const x = parseInt(alpha.indexOf(match[1]));
      const y = parseInt(match[2]);
      const plotPos = y * boardLength + x;
      posBin |= 1n << BigInt(plotPos);
   }

   return posBin;
}

export { boardDisplay, dirDisplay, posToBin };

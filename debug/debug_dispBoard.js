import { OthelloBoard } from "../OthelloBoard.mjs";

function main() {
   console.log("--- Board State Display Tool ---");
   const boardKey = process.argv[2];
   if (!boardKey) {
      console.error("Error: Please provide a board state key as a command-line argument.");
      console.error('Example: node debug_display_board.js "1008000000_810000000_1"');
      return;
   }
   try {
      const parts = boardKey.split("_");
      if (parts.length < 3) {
         throw new Error("Invalid key format. Expected 'black_white_player'.");
      }
      const blackBoardHex = parts[0];
      const whiteBoardHex = parts[1];
      const currentPlayerNum = parts[2];
      const board = new OthelloBoard();
      board.setBoardState(BigInt("0x" + blackBoardHex), BigInt("0x" + whiteBoardHex), Number(currentPlayerNum));
      console.log(`\nDisplaying board for key: ${boardKey}`);
      board.display();
   } catch (error) {
      console.error("\nAn error occurred while processing the key:");
      console.error(error.message);
      console.error("Please ensure the key is in the correct format (e.g., '1008000000_810000000_1').");
   }
}

main();

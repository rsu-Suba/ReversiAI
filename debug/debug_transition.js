import { OthelloBoard } from "../OthelloBoard.mjs";

function main() {
   console.log("--- MCTS Node Transition Verifier ---");
   const parentNodeData = {
      b: "11a8cb6f28f8000",
      w: "fee573490c707fff",
      c: -1,
   };
   const childNodeData = {
      b: "ff03251931230500",
      w: "fcdae6cedcfaff",
      c: 1,
   };
   const moveThatLeadsToChild = 0n;

   console.log("\n[1] Verifying Transition:");
   console.log("Parent Node (White to play):");
   const parentBoard = new OthelloBoard();
   parentBoard.setBoardState(BigInt("0x" + parentNodeData.b), BigInt("0x" + parentNodeData.w), parentNodeData.c);
   parentBoard.display();
   console.log(`Applying move: ${moveThatLeadsToChild.toString()}...`);

   const legalMoves = parentBoard.getLegalMovesBitboard();
   const isMoveLegal = (legalMoves & (1n << moveThatLeadsToChild)) !== 0n;
   if (!isMoveLegal) {
      console.error("\n--- VERIFICATION FAILED ---");
      console.error(`Move ${moveThatLeadsToChild} is NOT a legal move from the parent state.`);
      return;
   }
   console.log("Move is legal. Proceeding to apply move...");

   parentBoard.applyMove(moveThatLeadsToChild);

   console.log("\n[2] Comparing Result:");
   console.log("Resulting board state after applyMove:");
   parentBoard.display();

   console.log("Expected child node's board state:");
   const expectedChildBoard = new OthelloBoard();
   expectedChildBoard.setBoardState(BigInt("0x" + childNodeData.b), BigInt("0x" + childNodeData.w), childNodeData.c);
   expectedChildBoard.display();

   const isBlackSame = parentBoard.blackBoard === expectedChildBoard.blackBoard;
   const isWhiteSame = parentBoard.whiteBoard === expectedChildBoard.whiteBoard;
   const isPlayerSame = parentBoard.currentPlayer === expectedChildBoard.currentPlayer;

   console.log("\n--- VERDICT ---");
   if (isBlackSame && isWhiteSame && isPlayerSame) {
      console.log("✅ SUCCESS: The transition is logically correct!");
      console.log("The child node is a valid result of the parent's move.");
   } else {
      console.error("❌ FAILURE: The transition is INVALID.");
      console.error("The generated child node data does not match the result of the move.");
      if (!isBlackSame) console.error(" -> Black boards do not match.");
      if (!isWhiteSame) console.error(" -> White boards do not match.");
      if (!isPlayerSame) console.error(" -> Current players do not match.");
      console.error("This points to a critical bug in the MCTS tree construction logic (`expand` method).");
   }
}

main();

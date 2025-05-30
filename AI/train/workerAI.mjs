import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { parentPort, workerData } from "worker_threads";
import seedrandom from "seedrandom";

const { simsN, cP, workerSlotId, gameNumber, treeData } = workerData;

const rngAI1 = seedrandom(`seed-${workerSlotId}-ai1-${Date.now()}-${Math.random()}`);
const rngAI2 = seedrandom(`seed-${workerSlotId}-ai2-${Date.now()}-${Math.random()}`);
let mctsAI1 = new MCTS(cP, rngAI1);
let mctsAI2 = new MCTS(cP, rngAI2);

if (treeData) {
   try {
      const rootObject = JSON.parse(treeData);
      mctsAI1.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
      mctsAI1._rebuildNodeMap(mctsAI1.persistentRoot);
      mctsAI1.currentRoot = mctsAI1.persistentRoot;

      mctsAI2.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
      mctsAI2._rebuildNodeMap(mctsAI2.persistentRoot);
      mctsAI2.currentRoot = mctsAI2.persistentRoot;

      console.log(`Worker ${workerSlotId}: Loaded initial MCTS tree with ${mctsAI1.nodeMap.size} nodes.`);
   } catch (e) {
      console.error(`Worker ${workerSlotId}: Failed to parse or load initial treeData:`, e);
      const initialBoard = new OthelloBoard();
      mctsAI1.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
      mctsAI1._rebuildNodeMap(mctsAI1.persistentRoot);
      mctsAI1.currentRoot = mctsAI1.persistentRoot;

      mctsAI2.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
      mctsAI2._rebuildNodeMap(mctsAI2.persistentRoot);
      mctsAI2.currentRoot = mctsAI2.persistentRoot;
   }
} else {
   const initialBoard = new OthelloBoard();
   mctsAI1.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
   mctsAI1._rebuildNodeMap(mctsAI1.persistentRoot);
   mctsAI1.currentRoot = mctsAI1.persistentRoot;

   mctsAI2.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
   mctsAI2._rebuildNodeMap(mctsAI2.persistentRoot);
   mctsAI2.currentRoot = mctsAI2.persistentRoot;
}

async function runSelfPlayGame() {
   let board = new OthelloBoard();
   const gameMoves = [];

   while (!board.isGameOver()) {
      const currentPlayer = board.currentPlayer;
      const validMoves = board.getLegalMoves();

      if (validMoves.length === 0) {
         board.passTurn();
         continue;
      }
      let bestMove;
      let selectedMCTS;
      selectedMCTS = currentPlayer === 1 ? mctsAI1 : mctsAI2;

      try {
         bestMove = selectedMCTS.run(board.getBoardState(), currentPlayer, simsN);
         if (bestMove) {
            selectedMCTS.updateRoot(bestMove);
         } else {
            const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
            bestMove = randomMove;
            console.warn(`Worker ${workerSlotId}: MCTS found no best move, taking random valid move.`);
         }
      } catch (e) {
         console.error(`Worker ${workerSlotId}: Error during MCTS run for player ${currentPlayer}:`, e);
         parentPort.postMessage({
            type: "game_error",
            workerSlotId: workerSlotId,
            gameNumber: workerData.gameNumber,
            errorMessage: e.message,
         });
         return;
      }
      board.applyMove(bestMove);
      gameMoves.push({ player: currentPlayer, move: bestMove });
   }

   const scores = board.getScores();
   const winner = scores[1] > scores[-1] ? 1 : scores[-1] > scores[1] ? -1 : 0;
   const finalBoardState = board.getBoardState();

   const serializedTreeAI1 = JSON.stringify(mctsAI1.persistentRoot.toSerializableObject());
   const serializedTreeAI2 = JSON.stringify(mctsAI2.persistentRoot.toSerializableObject());

   parentPort.postMessage({
      type: "game_finished",
      workerSlotId: workerSlotId,
      gameNumber: workerData.gameNumber,
      blackStones: scores.black,
      whiteStones: scores.white,
      winner: winner,
      treeDataAI1: serializedTreeAI1,
      treeDataAI2: serializedTreeAI2,
      finalBoard: finalBoardState,
   });
}

parentPort.on("message", (msg) => {
   if (msg.type === "terminate_now") {
      console.log(`Worker ${workerSlotId}: Received terminate_now message. Exiting.`);
      process.exit(0);
   } else if (msg.type === "start_game") {
      if (msg.treeData) {
         try {
            const rootObject = JSON.parse(msg.treeData);
            mctsAI1 = new MCTS(cP, seedrandom(`seed-${workerSlotId}-ai1-${Date.now()}-${Math.random()}`));
            mctsAI1.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
            mctsAI1._rebuildNodeMap(mctsAI1.persistentRoot);
            mctsAI1.currentRoot = mctsAI1.persistentRoot;

            mctsAI2 = new MCTS(cP, seedrandom(`seed-${workerSlotId}-ai2-${Date.now()}-${Math.random()}`));
            mctsAI2.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
            mctsAI2._rebuildNodeMap(mctsAI2.persistentRoot);
            mctsAI2.currentRoot = mctsAI2.persistentRoot;
         } catch (e) {
            console.error(`Worker ${workerSlotId}: Failed to parse or load updated treeData:`, e);
            const initialBoard = new OthelloBoard();
            mctsAI1 = new MCTS(cP, seedrandom(`seed-${workerSlotId}-ai1-${Date.now()}-${Math.random()}`));
            mctsAI1.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
            mctsAI1._rebuildNodeMap(mctsAI1.persistentRoot);
            mctsAI1.currentRoot = mctsAI1.persistentRoot;

            mctsAI2 = new MCTS(cP, seedrandom(`seed-${workerSlotId}-ai2-${Date.now()}-${Math.random()}`));
            mctsAI2.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
            mctsAI2._rebuildNodeMap(mctsAI2.persistentRoot);
            mctsAI2.currentRoot = mctsAI2.persistentRoot;
         }
      }
      runSelfPlayGame();
   }
});

runSelfPlayGame();

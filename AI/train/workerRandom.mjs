import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { parentPort, workerData } from "worker_threads";
import seedrandom from "seedrandom";

const simsN = workerData.simsN;
const cP = workerData.cP;
const workerSlotId = workerData.workerSlotId;
let gameNumber = workerData.gameNumber;
let initialTreeData = workerData.treeData;

let mctsAI1;
let mctsAI2;
let randomBotRng;
let shouldTerminate = false;

function initializeMCTS(treeDataToLoad) {
   const rngAI1 = seedrandom(`seed-${workerSlotId}-ai1-${Date.now()}-${Math.random()}`);
   mctsAI1 = new MCTS(cP, rngAI1);
   const rngAI2Dummy = seedrandom(`seed-${workerSlotId}-ai2-dummy-${Date.now()}-${Math.random()}`);
   mctsAI2 = new MCTS(cP, rngAI2Dummy);

   if (treeDataToLoad) {
      try {
         const rootObject = JSON.parse(treeDataToLoad);
         mctsAI1.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
         mctsAI1._rebuildNodeMap(mctsAI1.persistentRoot);
         mctsAI1.currentRoot = mctsAI1.persistentRoot;

         mctsAI2.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
         mctsAI2._rebuildNodeMap(mctsAI2.persistentRoot);
         mctsAI2.currentRoot = mctsAI2.persistentRoot;

         console.log(`W${workerSlotId}: Loaded MCTS tree -> ${mctsAI1.nodeMap.size} nodes.`);
      } catch (e) {
         console.error(`W${workerSlotId}: Failed to load treeData:`, e);
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
}

initializeMCTS(initialTreeData);

async function runGameSimulation() {
   if (shouldTerminate) {
      console.log(`W${workerSlotId}: Game not started -> terminate.`);
      return;
   }
   randomBotRng = seedrandom(`${Date.now()}-random-bot-${gameNumber}-${workerSlotId}`);
   console.log(`W${workerSlotId}: Starting game ${gameNumber} (MCTS AI vs Random Bot).`);

   let board = new OthelloBoard();
   const gameMoves = [];
   let turnCount = 0;
   const maxTurns = 120;

   try {
      const isMCTSBlack = gameNumber % 2 === 0;
      while (!board.isGameOver() && turnCount < maxTurns) {
         if (shouldTerminate) {
            console.log(`W${workerSlotId}: Terminating game ${gameNumber}.`);
            return;
         }

         const currentPlayer = board.currentPlayer;
         const currentBoardState = board.getBoardState();
         let chosenMove = null;
         let MCTS_chose_move = false;

         if ((currentPlayer === 1 && isMCTSBlack) || (currentPlayer === -1 && !isMCTSBlack)) {
            let nodeKey = JSON.stringify(currentBoardState) + "_" + currentPlayer;
            let existingNode = mctsAI1.nodeMap.get(nodeKey);

            if (existingNode) {
               mctsAI1.currentRoot = existingNode;
            } else {
               mctsAI1.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
               mctsAI1.nodeMap.set(nodeKey, mctsAI1.currentRoot);
               if (!mctsAI1.persistentRoot) {
                  mctsAI1.persistentRoot = mctsAI1.currentRoot;
               }
            }

            const mctsSuggestedMove = mctsAI1.run(currentBoardState, currentPlayer, simsN);

            if (mctsSuggestedMove) {
               chosenMove = mctsSuggestedMove;
               mctsAI1.updateRoot(chosenMove);
               MCTS_chose_move = true;
            } else {
               const validMoves = board.getLegalMoves();
               if (validMoves.length > 0) {
                  chosenMove = validMoves[Math.floor(randomBotRng() * validMoves.length)];
                  console.warn(`W${workerSlotId}: No best move -> Random move`);
               } else {
                  chosenMove = null;
               }
               MCTS_chose_move = false;
            }
         } else {
            const legalMoves = board.getLegalMoves();
            if (legalMoves.length === 0) {
               chosenMove = null;
            } else {
               chosenMove = legalMoves[Math.floor(randomBotRng() * legalMoves.length)];
            }
         }

         const moveApplied = board.applyMove(chosenMove);
         if (!moveApplied && chosenMove !== null) {
            console.error(
               `W${workerSlotId}: Invalid move -> Game ${gameNumber} -> Turn ${turnCount}. Move: ${JSON.stringify(
                  chosenMove
               )}. Board: ${JSON.stringify(currentBoardState)}`
            );
            throw new Error("Invalid move.");
         }
         gameMoves.push({ player: currentPlayer, move: chosenMove });
         turnCount++;
      }

      if (shouldTerminate) {
         console.log(`W${workerSlotId}: Skipping final message -> terminating.`);
         return;
      }
      if (turnCount >= maxTurns) {
         console.warn(`W${workerSlotId}: Game ${gameNumber} Max turns ${maxTurns}.`);
      }

      const scores = board.getScores();
      const winner = scores.black > scores.white ? 1 : scores.white > scores.black ? -1 : 0;
      const finalBoardState = board.getBoardState();

      const serializedTreeAI1 = JSON.stringify(mctsAI1.persistentRoot.toSerializableObject());
      const serializedTreeAI2 = null;

      parentPort.postMessage({
         type: "game_finished",
         workerSlotId: workerSlotId,
         gameNumber: gameNumber,
         blackStones: scores.black,
         whiteStones: scores.white,
         winner: winner,
         treeDataAI1: serializedTreeAI1,
         treeDataAI2: serializedTreeAI2,
         finalBoard: finalBoardState,
      });
   } catch (e) {
      console.error(`W${workerSlotId}: Error -> Game ${gameNumber}:`, e);
      if (shouldTerminate) {
         console.log(`W${workerSlotId}: Skipping error -> terminating`);
         return;
      }
      parentPort.postMessage({
         type: "game_error",
         workerSlotId: workerSlotId,
         gameNumber: gameNumber,
         errorMessage: e.message,
         currentBoardState: board.getBoardState(),
         currentPlayer: board.currentPlayer,
      });
   }
}

parentPort.on("message", (msg) => {
   if (msg.type === "terminate_now") {
      console.log(`W${workerSlotId}: Starting terminate`);
      shouldTerminate = true;
      mctsAI1.requestStop();
      mctsAI2.requestStop();
   } else if (msg.type === "start_game") {
      shouldTerminate = false;
      gameNumber = msg.gameNumber;
      if (msg.treeData) {
         try {
            const rootObject = JSON.parse(msg.treeData);
            mctsAI1.persistentRoot = MCTSNode.fromSerializableObject(rootObject);
            mctsAI1._rebuildNodeMap(mctsAI1.persistentRoot);
            mctsAI1.currentRoot = mctsAI1.persistentRoot;
            console.log(`W${workerSlotId}: Updated MCTS tree.`);
         } catch (e) {
            console.error(`W${workerSlotId}: Failed load new MCTS tree:`, e);
            initializeMCTS(null);
         }
      } else {
         initializeMCTS(null);
      }
      if (mctsAI1.persistentRoot) {
         mctsAI2.persistentRoot = MCTSNode.fromSerializableObject(mctsAI1.persistentRoot.toSerializableObject());
         mctsAI2._rebuildNodeMap(mctsAI2.persistentRoot);
         mctsAI2.currentRoot = mctsAI2.persistentRoot;
      } else {
         initializeMCTS(null);
      }
      runGameSimulation();
   }
});

runGameSimulation();

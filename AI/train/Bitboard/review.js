import { OthelloBoard } from "./OthelloBoard.mjs";
import { MCTS } from "./MCTS.mjs";
import { MCTSNode } from "./MCTSNode.mjs";
import { config } from "./config.mjs";
import { fileURLToPath } from "url";
import * as path from "path";
import seedrandom from "seedrandom";

const NUM_GAMES_TO_PLAY = config.reviewMatches;
const MCTS_SIMS_PER_MOVE = config.reviewSimsN;
const saveFileName = config.treeLoadPath;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const saveFilePath = path.join(__dirname, saveFileName);

const mctsRngForReview = seedrandom(`review-mcts-ai-${Date.now()}`);

async function playVsRandomBot() {
   console.log("--- Starting MCTS AI vs Random Bot Play ---");
   console.log(`Loading Data <- ${saveFileName}`);

   // MCTS コンストラクタに OthelloBoard の初期盤面を明示的に渡す
   // 評価プログラムなので workerSlotId は 'review' などと識別可能にする
   const mcts = new MCTS(
      config.cP,
      mctsRngForReview,
      "review",
      OthelloBoard.blackInitBoard, // OthelloBoardのstatic初期盤面
      OthelloBoard.whiteInitBoard, // OthelloBoardのstatic初期盤面
      1, // 初期手番プレイヤー (黒)
      false // 初期パス状態
   );

   const loaded = await mcts.loadTree(saveFilePath);
   if (!loaded || !mcts.persistentRoot) {
      console.error("Error: MCTS tree can't load.");
      console.error("Run the self-play script first to generate the tree.");
      return;
   }
   console.log("MCTS tree loaded. Ready to play!");
   if (mcts.persistentRoot) {
      console.log(`[Review Debug] Loaded root key: "${mcts.persistentRoot.getBoardStateKey()}"`);
      console.log(`[Review Debug] Loaded root visits: ${mcts.persistentRoot.visits}`);
      console.log(`[Review Debug] Loaded root children count: ${Object.keys(mcts.persistentRoot.children).length}`);
      console.log(`[Review Debug] Total nodes in loaded tree (nodeMap): ${mcts.nodeMap.size}`);
      if (Object.keys(mcts.persistentRoot.children).length === 0 && mcts.nodeMap.size === 1) {
         console.warn("WARNING: Loaded tree appears to be empty (only root node). AI will likely play randomly.");
      }
   }

   let mctsWins = 0;
   let randomBotWins = 0;
   let draws = 0;

   for (let i = 1; i <= NUM_GAMES_TO_PLAY; i++) {
      console.log(`\n--- Game ${i}/${NUM_GAMES_TO_PLAY} ---`);

      // gameBoard を OthelloBoard の初期盤面で初期化
      const gameBoard = new OthelloBoard(); // constructorで初期化される

      const mctsRng = seedrandom(`${Date.now()}-mcts-ai-${i}`);
      const randomBotRng = seedrandom(`${Date.now()}-random-bot-${i}`);

      const mctsPlayer = mcts; // MCTSインスタンスをそのまま使用

      // randomBotPlayer をビットボード対応に修正
      const randomBotPlayer = {
         // run メソッドは (blackBoard, whiteBoard, currentPlayer, passCount) を受け取る
         run: (currentBlackBoard, currentWhiteBoard, currentPlayer, currentPassCount) => {
            const tempBoard = new OthelloBoard();
            tempBoard.setBoardState(currentBlackBoard, currentWhiteBoard, currentPlayer, currentPassCount);
            const legalMoves = tempBoard.getLegalMoves(); // [r,c] 形式の配列を返す
            if (legalMoves.length === 0) return null; // 合法手がなければパス

            // legalMoves は [r,c] 配列なので、これを BigInt のビット位置に変換して返す
            const randomMoveCoords = legalMoves[Math.floor(randomBotRng() * legalMoves.length)];
            return BigInt(randomMoveCoords[0] * OthelloBoard.boardLength + randomMoveCoords[1]);
         },
      };

      const isMctsBlack = Math.floor(mctsRng() * 2) === 0; // AIが黒番か白番かランダムに決定
      console.log(`MCTS AI plays as: ${isMctsBlack ? "Black (先手)" : "White (後手)"}`);

      let turnCount = 0;
      const maxTurns = 100; // ゲームが長すぎる場合の安全弁

      while (!gameBoard.isGameOver() && turnCount < maxTurns) {
         const currentPlayer = gameBoard.currentPlayer;
         // gameBoard の現在の盤面データ {blackBoard, whiteBoard, currentPlayer, passCount, passedLastTurn}
         const currentBoardData = gameBoard.getBoardState();

         let chosenMove = null; // BigInt (ビット位置) または null (パス)

         // MCTS AI の手番か、Random Bot の手番かを判定
         if ((currentPlayer === 1 && isMctsBlack) || (currentPlayer === -1 && !isMctsBlack)) {
            // MCTS AIの手番
            // MCTS.run の前提を満たすため、現在の盤面ノードがツリーに存在することを保証
            const tempNodeForMCTS = new MCTSNode(
               currentBoardData.blackBoard,
               currentBoardData.whiteBoard,
               currentBoardData.currentPlayer,
               null,
               null,
               0,
               currentBoardData.passedLastTurn
            );
            const boardKey = tempNodeForMCTS.getBoardStateKey();

            mctsPlayer.currentRoot = mctsPlayer.nodeMap.get(boardKey);
            if (!mctsPlayer.currentRoot) {
               // ノードが見つからない場合、MCTSツリーにマージ (train.jsと同じロジック)
               console.warn(
                  `Error: MCTS node for key ${boardKey} not found in nodeMap. Adding it now. This might indicate an issue with training data consistency or pruning.`
               );
               mctsPlayer.persistentRoot.merge(tempNodeForMCTS); // 統計情報マージ
               mctsPlayer._rebuildNodeMap(mctsPlayer.persistentRoot); // nodeMapを更新
               mctsPlayer.currentRoot = mctsPlayer.nodeMap.get(boardForMCTSNode.getBoardStateKey()); // マージ後に再取得
               if (!mctsPlayer.currentRoot) {
                  // ここに到達したら深刻な問題（マージ後もノードが見つからない）
                  console.error(
                     `FATAL ERROR: MCTS node for key ${boardKey} still not found after merge. Aborting game.`
                  );
                  break; // ゲームを中断
               }
            }

            console.log(
               `\n[Review Debug] W${mctsPlayer.workerSlotId} G${i} - MCTS Turn ${turnCount} (Player: ${
                  currentPlayer === 1 ? "Black" : "White"
               })`
            );
            console.log(`[Review Debug]   Current root for MCTS.run: "${mctsPlayer.currentRoot.getBoardStateKey()}"`);
            console.log(
               `[Review Debug]   Current root children count: ${Object.keys(mctsPlayer.currentRoot.children).length}`
            );
            console.log(`[Review Debug]   Current root visits: ${mctsPlayer.currentRoot.visits}`);
            console.log(`[Review Debug]   MCTS nodeMap size: ${mctsPlayer.nodeMap.size}`);
            gameBoard.display(); // 現在の盤面を表示

            chosenMove = mctsPlayer.run(
               currentBoardData.blackBoard,
               currentBoardData.whiteBoard,
               currentBoardData.currentPlayer,
               MCTS_SIMS_PER_MOVE,
               currentBoardData.passedLastTurn
            );

            console.log(`[Review Debug]   MCTS.run returned chosenMove: ${chosenMove === null ? 'null' : chosenMove.toString()}`);
        

            // メモリ制限などで探索が打ち切られた場合
            if (mctsPlayer.shouldStopSimulations) {
               console.warn(`MCTS AI: Simulation stopped early due to memory limit. Picking random legal move.`);
               const legalMovesArray = gameBoard.getLegalMoves();
               if (legalMovesArray.length === 0) chosenMove = null; // 合法手がない場合はパス
               else {
                  const randomMoveCoords = legalMovesArray[Math.floor(randomBotRng() * legalMovesArray.length)];
                  chosenMove = BigInt(randomMoveCoords[0] * OthelloBoard.boardLength + randomMoveCoords[1]);
               }
            }
            console.log(`chosenMove: ${chosenMove}`);
            // MCTSが手を見つけられなかった場合もランダムに選択
            if (chosenMove === null) {
               console.warn(`MCTS AI: No move found. Picking random legal move.`);
               const legalMovesArray = gameBoard.getLegalMoves();
               if (legalMovesArray.length === 0) chosenMove = null; // 合法手がない場合はパス
               else {
                  const randomMoveCoords = legalMovesArray[Math.floor(randomBotRng() * legalMovesArray.length)];
                  chosenMove = BigInt(randomMoveCoords[0] * OthelloBoard.boardLength + randomMoveCoords[1]);
               }
            }

            // AIが手を選んだ後、その手でMCTSのcurrentRootを更新し、ノードをツリーに接続
            // (MCTS.updateRoot は chosenMove が null の場合も処理できるべきだが、ここでは nullでない場合のみ呼ぶ)
            if (chosenMove !== null) {
               mctsPlayer.updateRoot(chosenMove);
            }
         } else {
            // Random Bot の手番
            // randomBotPlayer.run は (blackBoard, whiteBoard, currentPlayer, passCount) を期待
            chosenMove = randomBotPlayer.run(
               currentBoardData.blackBoard,
               currentBoardData.whiteBoard,
               currentBoardData.currentPlayer,
               currentBoardData.passCount
            );
            // ランダムボットが打った手でMCTSのcurrentRootを更新し、ノードをツリーに接続
            // これはMCTSが学習した統計情報には影響しないが、MCTSツリーの構造を最新に保つ
            if (chosenMove !== null) {
               mctsPlayer.updateRoot(chosenMove);
            }
         }
         // 実際にゲームボードに手番を適用
         if (chosenMove !== null) {
            gameBoard.applyMove(chosenMove); // applyMove は BigInt のビット位置を期待
         } else {
            gameBoard.applyMove(null); // パス
         }
         turnCount++;
         // gameBoard.display(); // デバッグ表示を有効にする場合はコメント解除
      }

      // ゲーム終了後の結果表示
      const winner = gameBoard.getWinner();
      let resultMessage = "Draw.";
      if (winner === 1) {
         resultMessage = `Winner: Black.${isMctsBlack ? "AI" : "Random"}`;
         if (isMctsBlack) mctsWins++;
         else randomBotWins++;
      } else if (winner === -1) {
         resultMessage = `Winner: White.${isMctsBlack ? "Random" : "AI"}`;
         if (!isMctsBlack) mctsWins++;
         else randomBotWins++;
      } else {
         draws++;
      }
      console.log(resultMessage);
      gameBoard.display(); // 最終盤面を表示
   }

   console.log("\n--- Final Results ---");
   console.log(`Total Games: ${NUM_GAMES_TO_PLAY}`);
   console.log(`MCTS AI Wins: ${mctsWins}`);
   console.log(`Random Bot Wins: ${randomBotWins}`);
   console.log(`Draws: ${draws}`);
   console.log(`MCTS AI Win Rate: ${((mctsWins / NUM_GAMES_TO_PLAY) * 100).toFixed(2)}%`);
}

playVsRandomBot();

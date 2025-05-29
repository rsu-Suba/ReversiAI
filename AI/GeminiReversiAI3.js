// play_vs_random.mjs
import { OthelloBoard } from "./GeminiOthelloBoard.mjs";
import { MCTS } from "./GeminiMCTS.mjs";
import { MCTSNode } from "./GeminiMCTSNode.mjs";
import * as path from "path";
import { fileURLToPath } from "url";
import seedrandom from "seedrandom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const saveFileName = "./mcts_tree.msgpack"; // 学習済みMCTSツリーのファイル名
const saveFilePath = path.join(__dirname, saveFileName);

const NUM_GAMES_TO_PLAY = 10; // 対戦させるゲーム数
const MCTS_SIMS_PER_MOVE = 500; // MCTS AI が1手あたりに行うシミュレーション回数 (学習時より多めに設定してOK)

async function playVsRandomBot() {
   console.log("--- Starting MCTS AI vs Random Bot Play ---");
   console.log(`Loading MCTS tree from: ${saveFilePath}`);

   const mcts = new MCTS();
   const loaded = await mcts.loadTree(saveFilePath);

   if (!loaded || !mcts.persistentRoot) {
      console.error(
         "Error: MCTS tree could not be loaded. Please ensure 'mcts_tree.msgpack' exists and contains learned data."
      );
      console.error("Run the self-play script first to generate the tree.");
      return;
   }
   console.log("MCTS tree loaded successfully. Ready to play!");

   let mctsWins = 0;
   let randomBotWins = 0;
   let draws = 0;

   for (let i = 1; i <= NUM_GAMES_TO_PLAY; i++) {
      console.log(`\n--- Game ${i}/${NUM_GAMES_TO_PLAY} ---`);

      const gameBoard = new OthelloBoard();

      // MCTS AIとランダムボットのための乱数ジェネレータ
      const mctsRng = seedrandom(`${Date.now()}-mcts-ai-${i}`);
      const randomBotRng = seedrandom(`${Date.now()}-random-bot-${i}`);

      // MCTS AIは学習済みのツリーを使用
      // ランダムボットはシンプルな関数で手を選ぶ
      const mctsPlayer = mcts; // ロードしたMCTSインスタンスをそのまま使う
      const randomBotPlayer = {
         run: (boardState, currentPlayer) => {
            const tempBoard = new OthelloBoard();
            tempBoard.setBoardState(boardState, currentPlayer);
            const legalMoves = tempBoard.getLegalMoves();
            if (legalMoves.length === 0) {
               return null; // パス
            }
            // ランダムに手を選択
            return legalMoves[Math.floor(randomBotRng() * legalMoves.length)];
         },
      };

      // どちらが先手 (黒) になるかをランダムに決定
      const isMctsBlack = Math.floor(mctsRng() * 2) === 0;
      console.log(`MCTS AI plays as: ${isMctsBlack ? "Black (先手)" : "White (後手)"}`);

      let turnCount = 0;
      const maxTurns = 100; // 安全のため最大ターン数を設定

      while (!gameBoard.isGameOver() && turnCount < maxTurns) {
         const currentPlayer = gameBoard.currentPlayer;
         const currentBoardState = gameBoard.getBoardState();
         let chosenMove = null;

         // play_vs_random.mjs (MCTS AI の手番のifブロック内)
         // ...
         if ((currentPlayer === 1 && isMctsBlack) || (currentPlayer === -1 && !isMctsBlack)) {
            // MCTS AI の手番
            // currentRoot を更新し、MCTS AIの探索を開始
            const boardKey = JSON.stringify(currentBoardState) + "_" + currentPlayer;
            mctsPlayer.currentRoot = mctsPlayer.nodeMap.get(boardKey);

            // もし学習済みツリーに現在の局面が存在しない場合、新しいノードを作成
            // ただし、そのノードは persistentRoot の子孫ではない
            if (!mctsPlayer.currentRoot) {
               mctsPlayer.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
               // このノードを nodeMap にも追加しておくと、次回同じ局面で高速にアクセスできる
               mctsPlayer.nodeMap.set(boardKey, mctsPlayer.currentRoot);
            }

            chosenMove = mctsPlayer.run(currentBoardState, currentPlayer, MCTS_SIMS_PER_MOVE);

            // MCTS AIが選んだ手でツリーのルートを更新 (次の手番のために)
            if (chosenMove !== null) {
               mctsPlayer.updateRoot(chosenMove);
            }
         } else {
            // ...
            // ランダムボット の手番
            chosenMove = randomBotPlayer.run(currentBoardState, currentPlayer);
         }

         if (chosenMove !== null) {
            gameBoard.applyMove(chosenMove);
         } else {
            gameBoard.applyMove(null); // パス
         }
         turnCount++;
         gameBoard.display();
      }

      // ゲーム結果の表示と集計
      const scores = gameBoard.getScores();
      const winner = gameBoard.getWinner();

      console.log("Final Board State:");
      const finalBoardDisplay = new OthelloBoard();
      finalBoardDisplay.setBoardState(gameBoard.getBoardState(), 0);
      finalBoardDisplay.display();
      console.log(`Scores: Black: ${scores.black}, White: ${scores.white}.`);

      let resultMessage = "Draw.";
      if (winner === 1) {
         resultMessage = "Winner: Black.";
         if (isMctsBlack) mctsWins++;
         else randomBotWins++;
      } else if (winner === -1) {
         resultMessage = "Winner: White.";
         if (!isMctsBlack) mctsWins++;
         else randomBotWins++;
      } else {
         draws++;
      }
      console.log(resultMessage);
   }

   console.log("\n--- Final Results ---");
   console.log(`Total Games: ${NUM_GAMES_TO_PLAY}`);
   console.log(`MCTS AI Wins: ${mctsWins}`);
   console.log(`Random Bot Wins: ${randomBotWins}`);
   console.log(`Draws: ${draws}`);
   console.log(`MCTS AI Win Rate: ${((mctsWins / NUM_GAMES_TO_PLAY) * 100).toFixed(2)}%`);
}

playVsRandomBot();

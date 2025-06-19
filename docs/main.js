// main.js (Webアプリ版・最終完成形)

import { OthelloBoard } from "..//OthelloBoard.mjs";
import { MCTS } from "../MCTS.mjs";
import { MCTSNode } from "../MCTSNode.mjs";

// --- 初期設定 ---
const MCTS_SIMS_PER_MOVE = 500; // スマホの負荷を考慮し、シミュレーション回数を調整
const AI_THINKING_TIME_MS = 5; // AIが手を打つ前の待機時間（見栄えのため）

// --- DOM要素の取得 ---
const boardElement = document.getElementById("game-board");
const messageElement = document.getElementById("status-message");
const resetButton = document.getElementById("reset-button");

// --- グローバル変数 ---
let board;
let mctsAI;
let humanPlayer; // 1: 黒, -1: 白
let isGameActive = false;
let isAiThinking = false;

// --- メインの実行部分 ---
async function initializeApp() {
   messageElement.textContent = "Loading AI Brain (this may take a moment)...";

   try {
      // 1. AIの頭脳データを読み込む
      const response = await fetch("../mcts.json");
      if (!response.ok) throw new Error("Could not load mcts_data.json");
      const dbData = await response.json();

      // 2.【最重要】ブラウザ用の「偽のデータベース管理者」を作成
      const dbMock = new Map();
      for (const row of dbData) {
         // JSONの文字列データを、AIが使えるBigIntや正しいデータ型に変換して格納
         const nodeData = {
            key: row.key,
            parent_key: row.parent_key,
            move: row.move ? BigInt(row.move) : null,
            wins: Number(row.wins),
            visits: Number(row.visits),
            children_keys: JSON.parse(row.children_keys),
            blackBoard: BigInt("0x" + row.black_board),
            whiteBoard: BigInt("0x" + row.white_board),
            currentPlayer: Number(row.current_player),
         };
         dbMock.set(nodeData.key, nodeData);
      }

      const dbManagerMock = {
         getNode: async (key) => dbMock.get(key),
         saveNode: async (node) => {
            /* Web版では保存しない */
         },
         batchUpdateNodes: async (nodes) => {
            /* Web版では保存しない */
         },
      };

      // 3. 偽のDB管理者を使ってAIを初期化
      // コンストラクタを MCTS(dbManager, cP, rng) に合わせる
      mctsAI = new MCTS(dbManagerMock, 1.414, Math.random);

      // 4. ゲームを開始
      startNewGame();
   } catch (error) {
      console.error("Failed to initialize app:", error);
      messageElement.textContent = "Error: AI data could not be loaded.";
   }
}

function startNewGame() {
   board = new OthelloBoard();
   humanPlayer = Math.random() < 0.5 ? 1 : -1;
   isGameActive = true;
   isAiThinking = false;
   renderBoard();

   // 最初のターンがAIなら、思考を促す
   if (board.currentPlayer !== humanPlayer) {
      setTimeout(requestAiMove, AI_THINKING_TIME_MS);
   }
}

function renderBoard() {
   boardElement.innerHTML = "";
   const legalMoves = board.getLegalMoves();

   for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
         const square = document.createElement("div");
         square.className = "square";
         const bit = 1n << BigInt(r * 8 + c);

         if ((board.blackBoard & bit) !== 0n) {
            const disc = document.createElement("div");
            disc.className = "disc black";
            square.appendChild(disc);
         } else if ((board.whiteBoard & bit) !== 0n) {
            const disc = document.createElement("div");
            disc.className = "disc white";
            square.appendChild(disc);
         } else if (isGameActive && board.currentPlayer === humanPlayer) {
            const isLegal = legalMoves.some((move) => move[0] === r && move[1] === c);
            if (isLegal) {
               square.classList.add("legal");
               square.onclick = () => handleHumanMove(r, c);
            }
         }
         boardElement.appendChild(square);
      }
   }
   updateStatus();
   board.display();
}

function handleHumanMove(r, c) {
   if (!isGameActive || isAiThinking) return;

   const moveBit = BigInt(r * 8 + c);
   board.applyMove(moveBit);
   renderBoard();

   setTimeout(requestAiMove, AI_THINKING_TIME_MS);
}

async function requestAiMove() {
   if (!isGameActive || board.isGameOver()) return;

   isAiThinking = true;
   messageElement.textContent = "AI is thinking...";

   // AIに思考させる
   const legalMoves = board.getLegalMoves();
   if (legalMoves.length === 0) {
      board.applyMove(null);
      isAiThinking = false;
      renderBoard();
      return;
   }

   const aiMoveBit = await mctsAI.run(board.blackBoard, board.whiteBoard, board.currentPlayer, MCTS_SIMS_PER_MOVE);

   board.applyMove(aiMoveBit);
   isAiThinking = false;
   renderBoard();

   // 次が人間の手番で、パスしかない場合は、自動でパス処理
   if (board.currentPlayer === humanPlayer && !board.isGameOver() && board.getLegalMoves().length === 0) {
      messageElement.textContent = "You have no moves. Passing turn...";
      setTimeout(() => {
         board.applyMove(null);
         requestAiMove();
      }, 1500);
   }
}

function updateStatus() {
   if (!isGameActive) return;
   if (board.isGameOver()) {
      isGameActive = false;
      const scores = board.getScores();
      const winner = board.getWinner();
      let msg = `Game Over! Score Black:${scores.black} White:${scores.white}. `;
      if (winner === 0) msg += "Draw!";
      else if (winner === humanPlayer) msg += "You Win!";
      else msg += "AI Wins!";
      messageElement.textContent = msg;
   } else {
      messageElement.textContent = `${board.currentPlayer === humanPlayer ? "Your" : "AI"}'s turn (${
         board.currentPlayer === 1 ? "Black" : "White"
      })`;
   }
}

resetButton.onclick = startNewGame;
initializeApp();

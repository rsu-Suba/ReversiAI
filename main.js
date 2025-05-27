// main.js
import { checkBoard, hasValidMove, getGameResult } from "./reversi-logic.js";

// --- DOM要素の取得 ---
const boardElement = document.getElementById("board");
const messageElement = document.getElementById("message");
const blackScoreElement = document.getElementById("black-score");
const whiteScoreElement = document.getElementById("white-score");
const currentPlayerDisplay = document.getElementById("current-player-display");
const resetButton = document.getElementById("reset-button");

// --- ゲームの状態変数 ---
let playerNum;
let board;

// --- 初期化処理 ---
function initGame() {
   board = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, -1, 0, 0, 0],
      [0, 0, 0, -1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
   ];
   playerNum = 1;
   messageElement.textContent = "";
   render();
}

// --- 画面描画処理 ---
function render() {
   boardElement.innerHTML = "";
   let blackCount = 0;
   let whiteCount = 0;

   board.forEach((row, y) => {
      row.forEach((cell, x) => {
         const cellElement = document.createElement("div");
         cellElement.className = "cell";
         cellElement.dataset.y = y;
         cellElement.dataset.x = x;
         if (cell !== 0) {
            const stoneElement = document.createElement("div");
            stoneElement.className = `stone ${cell === 1 ? "black" : "white"}`;
            cellElement.appendChild(stoneElement);
            if (cell === 1) blackCount++;
            else whiteCount++;
         }
         boardElement.appendChild(cellElement);
      });
   });

   blackScoreElement.textContent = blackCount;
   whiteScoreElement.textContent = whiteCount;
   currentPlayerDisplay.className = `stone ${playerNum === 1 ? "black" : "white"}`;

   // 古いイベントリスナーを削除し、新しいものを設定
   const newBoardElement = boardElement.cloneNode(true);
   const gameContainer = boardElement.parentElement;
   newBoardElement.querySelectorAll(".cell").forEach((cell) => {
      cell.addEventListener("click", handleCellClick);
   });
   console.log(newBoardElement, boardElement, boardElement.parentNode);
   gameContainer.replaceChild(newBoardElement, boardElement);
}

// --- マスがクリックされたときの処理 ---
function handleCellClick(event) {
   const y = parseInt(event.currentTarget.dataset.y);
   const x = parseInt(event.currentTarget.dataset.x);

   if (board[y][x] !== 0) return;

   // ロジックを呼び出し
   const flips = checkBoard(board, [y, x], playerNum);
   if (flips.length === 0) {
      messageElement.textContent = "そこには置けません。";
      return;
   }

   board[y][x] = playerNum;
   flips.forEach((pos) => {
      board[pos[1]][pos[0]] = playerNum;
   });

   playerNum *= -1;
   messageElement.textContent = "";
   render();

   // ゲームの進行管理
   checkGameFlow();
}

// --- ゲーム進行の管理 ---
function checkGameFlow() {
   // 両者置けないならゲーム終了
   if (!hasValidMove(board, 1) && !hasValidMove(board, -1)) {
      endGame();
      return;
   }

   // 現在のプレイヤーがパスの場合
   if (!hasValidMove(board, playerNum)) {
      messageElement.textContent = `${playerNum === 1 ? "🔴" : "⚪"} はパスします。`;
      playerNum *= -1; // 手番を戻す
      render(); // 手番表示を更新
   }
}

// --- ゲーム終了処理 ---
function endGame() {
   // 結果メッセージをロジックから取得
   const resultMessage = getGameResult(board);
   messageElement.textContent = resultMessage;

   // ゲームが終わったらクリックできなくする
   document.querySelectorAll(".cell").forEach((cell) => {
      cell.style.cursor = "default";
      cell.replaceWith(cell.cloneNode(true)); // イベントリスナーを完全に削除
   });
}

resetButton.addEventListener("click", initGame);
initGame();

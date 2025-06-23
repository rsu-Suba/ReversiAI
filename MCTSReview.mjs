import { MCTSNode } from "./MCTSNode.mjs";
import { OthelloBoard } from "./OthelloBoard.mjs";
import fetch from "node-fetch";

const API_URL = "http://localhost:5000/predict";

export class MCTS {
   constructor(cP, rng) {
      this.cP = cP;
      this.rng = rng || Math.random;
      this.nodeMap = new Map();
      this.simGameBoard = new OthelloBoard();
   }

   // Pythonサーバーに問い合わせるヘルパー関数
   async getPrediction(board) {
      try {
         const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               blackBoard: board.blackBoard.toString(16),
               whiteBoard: board.whiteBoard.toString(16),
               currentPlayer: board.currentPlayer,
            }),
         });
         if (!response.ok) return null;
         return await response.json();
      } catch (error) {
         console.error("API call to Python server failed:", error.message);
         return null;
      }
   }


   async run(blackBoard, whiteBoard, currentPlayer) {
      const board = new OthelloBoard();
      board.setBoardState(blackBoard, whiteBoard, currentPlayer);

      // 1. Pythonサーバーに、現在の盤面について「相談」する
      const prediction = await this.getPrediction(board);

      if (!prediction || !prediction.policy) {
          // Pythonサーバーが応答しない場合は、どの手を選べばいいか分からない
          console.warn("Could not get prediction from Python server.");
          return null; // nullを返すと、review.js側でランダムな手が選ばれる
      }

      // 2. Pythonの「直感（ポリシー）」を元に、最善手を選ぶ
      const legalMoves = board.getLegalMoves();
      if (legalMoves.length === 0) return null;

      let bestMove = null;
      let maxProbability = -Infinity;

      // 合法手の中から、ポリシーネットワークの評価が最も高い手を探す
      for (const move of legalMoves) {
          const moveBit = BigInt(move[0] * 8 + move[1]);
          const moveIndex = Number(moveBit);
          const moveProbability = prediction.policy[moveIndex];

          if (moveProbability > maxProbability) {
              maxProbability = moveProbability;
              bestMove = moveBit;
          }
      }
      
      //console.log(`AI chose move based on Policy Network. Best legal prob: ${maxProbability.toFixed(4)}`);
      return bestMove;
  }

   select(node) {
      let currentNode = node;
      while (true) {
         // ▼▼▼【ここからが新しい堅牢なロジック】▼▼▼

         // 1. まず、現在地が終局かどうかを判定
         this.simGameBoard.setBoardState(currentNode.blackBoard, currentNode.whiteBoard, currentNode.currentPlayer);
         if (this.simGameBoard.isGameOver()) {
            break; // 終局なら、それ以上潜らずにループを抜ける
         }

         // 2. 子ノードが一つもなければ、探索終了
         if (Object.keys(currentNode.children).length === 0) {
            break;
         }

         // 3. 最も有望な子ノードを探す
         const bestChildNode = currentNode.bestChild(this.cP);

         // 4. もし有望な子が見つからなければ、探索終了
         if (bestChildNode === null) {
            break;
         }

         // 5. 見つかれば、次のノードとして探索を続ける
         currentNode = bestChildNode;
         // ▲▲▲
      }
      return currentNode;
   }

   expand(node, policy) {
      this.simGameBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
      const legalMoves = this.simGameBoard.getLegalMoves();

      for (const move of legalMoves) {
         const moveBit = BigInt(move[0] * 8 + move[1]);
         const moveIndex = Number(moveBit);

         const nextBoard = new OthelloBoard();
         nextBoard.setBoardState(node.blackBoard, node.whiteBoard, node.currentPlayer);
         nextBoard.applyMove(moveBit);

         const newNode = new MCTSNode(
            nextBoard.blackBoard,
            nextBoard.whiteBoard,
            nextBoard.currentPlayer,
            node,
            moveBit
         );
         // ポリシーネットワークの予測を、事前確率としてノードに保存
         newNode.priorProbability = policy[moveIndex];
         node.children[moveBit.toString()] = newNode;
         this.nodeMap.set(newNode.getBoardStateKey(), newNode);
      }
      return node;
   }

   // バリューネットワークの評価値（-1から1）を更新する
   backpropagate(node, value) {
      let tempNode = node;
      while (tempNode) {
         tempNode.visits++;
         // 相手の手番の視点での価値に変換して加算
         tempNode.wins += tempNode.parent && tempNode.parent.currentPlayer === tempNode.currentPlayer ? -value : value;
         tempNode = tempNode.parent;
      }
   }

   async getNode(key) {
      //if (this.nodeMap.has(key)) return this.nodeMap.get(key);
      const nodeData = this.dbManager.getNode(key);
      if (!nodeData) {
         return null;
      }
      const node = new MCTSNode(nodeData.blackBoard, nodeData.whiteBoard, nodeData.currentPlayer, null, nodeData.move);
      node.wins = nodeData.wins;
      node.visits = nodeData.visits;

      this.nodeMap.set(key, node);
      return node;
   }

   async getChildrenNodes(node) {
      const nodeData = this.dbManager.getNode(node.getBoardStateKey());
      //console.log(nodeData);
      if (!nodeData || !nodeData.children) return [];
      const children = [];
      const childrenKeys = nodeData.children_keys;
      for (const childKey of childrenKeys) {
         //for (const childKey of nodeData.childrenKeys) {
         const childNode = await this.getNode(childKey);
         //console.log(node.getBoardStateKey(), childNode);
         if (childNode) children.push(childNode);
      }
      //console.log(children);
      return children;
   }
}

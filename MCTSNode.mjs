// MCTSNode.mjs (最終完成版)

import { OthelloBoard } from "./OthelloBoard.mjs";
import { config } from "./config.mjs";

export class MCTSNode {
   /**
    * MCTSノードの設計図
    * @param {BigInt} blackBoard - 黒石の盤面
    * @param {BigInt} whiteBoard - 白石の盤面
    * @param {number} currentPlayer - 現在の手番 (1: 黒, -1: 白)
    * @param {MCTSNode | null} parent - 親ノードへの参照
    * @param {BigInt | null} move - このノードに至った手
    */
   constructor(blackBoard, whiteBoard, currentPlayer, parent = null, move = null) {
      // --- 局面を定義する、最も重要な3つの情報 ---
      this.blackBoard = blackBoard;
      this.whiteBoard = whiteBoard;
      this.currentPlayer = currentPlayer;

      // --- ツリー構造と、MCTSの統計情報 ---
      this.parent = parent;
      this.move = move;
      this.wins = 0;
      this.visits = 0;
      this.children = {}; // { moveBitStr: MCTSNode }
      this.untriedMoves = null; // 未試行の手をキャッシュするためのプロパティ
      this.priorProbability = 0;
   }

   // ノードを識別するための一意のキーを生成する
   getBoardStateKey() {
      return `${this.blackBoard.toString(16)}_${this.whiteBoard.toString(16)}_${this.currentPlayer}`;
   }

   bestChild(C_param = config.cP) {
      let bestScore = -Infinity;
      let bestChild = null;

      for (const child of Object.values(this.children)) {
         const qValue = child.visits > 0 ? child.wins / child.visits : 0;
         const uValue = C_param * child.priorProbability * (Math.sqrt(this.visits) / (1 + child.visits));
         const puctScore = qValue + uValue;

         if (puctScore > bestScore) {
            bestScore = puctScore;
            bestChild = child;
         }
      }
      return bestChild;
   }

   // このノードからまだ試していない合法手を取得する
   getUntriedMoves(gameBoardInstance) {
      if (this.untriedMoves === null) {
         gameBoardInstance.setBoardState(this.blackBoard, this.whiteBoard, this.currentPlayer);
         this.untriedMoves = gameBoardInstance.getLegalMoves();
      }
      // すでに展開済みの手は、untriedMovesから削除されている想定
      return this.untriedMoves;
   }

   // 全ての合法手が展開済みかどうかを判定
   isFullyExpanded(gameBoardInstance) {
      return this.getUntriedMoves(gameBoardInstance).length === 0;
   }

   // ゲーム終了局面かどうかを判定
   isTerminal(gameBoardInstance) {
      gameBoardInstance.setBoardState(this.blackBoard, this.whiteBoard, this.currentPlayer);
      return gameBoardInstance.isGameOver();
   }

   // --- データ永続化（Msgpack/DB）のための重要なメソッド ---

   // ファイル保存/送信用に、シンプルなオブジェクトに変換する
   toSerializableObject() {
      const childrenSerializable = {};
      for (const moveStr in this.children) {
         childrenSerializable[moveStr] = this.children[moveStr].toSerializableObject();
      }
      return {
         // 最低限のデータだけを保存
         b: this.blackBoard.toString(16),
         w: this.whiteBoard.toString(16),
         c: this.currentPlayer,
         m: this.move ? this.move.toString() : null,
         wi: this.wins,
         v: this.visits,
         ch: childrenSerializable,
      };
   }

   static fromSerializableObject(serializableNodeData, parentNode = null) {
      const node = new MCTSNode(
         BigInt("0x" + serializableNodeData.b),
         BigInt("0x" + serializableNodeData.w),
         serializableNodeData.c,
         parentNode,
         serializableNodeData.m ? BigInt("0x" + serializableNodeData.m) : null
      );
      node.visits = serializableNodeData.v;
      node.wins = serializableNodeData.wi;

      for (const moveBitStr in serializableNodeData.ch) {
         const childNode = MCTSNode.fromSerializableObject(serializableNodeData.ch[moveBitStr], node);
         node.children[moveBitStr] = childNode;
      }
      return node;
   }

   // 他のAIの知識（ツリー）を自分に合体させる
   merge(otherNode) {
      this.wins += otherNode.wins;
      this.visits += otherNode.visits;
      for (const moveStr in otherNode.children) {
         const otherChild = otherNode.children[moveStr];
         if (this.children[moveStr]) {
            this.children[moveStr].merge(otherChild);
         } else {
            this.children[moveStr] = MCTSNode.fromSerializableObject(otherChild.toSerializableObject(), this);
         }
      }
   }
}

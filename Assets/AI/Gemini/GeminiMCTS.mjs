// MCTS.mjs
import { MCTSNode } from "./GeminiMCTSNode.mjs";
import * as fs from "fs/promises";
import { OthelloBoard } from "./GeminiOthelloBoard.mjs";
import { encode, decode, Encoder } from "@msgpack/msgpack";

export class MCTS {
    constructor(rng = Math.random) {
        this.persistentRoot = null;
        this.currentRoot = null;
        this.simGameBoard = new OthelloBoard();
        this.rng = rng;
        // ★★★ 新しくマップを追加して、ボード状態文字列からノードを素早く検索できるようにする ★★★
        this.nodeMap = new Map(); // Map<boardStateString, MCTSNode>
    }

    async loadTree(filePath) {
        try {
            const buffer = await fs.readFile(filePath);
            const serializableRoot = decode(buffer);
            this.persistentRoot = MCTSNode.fromSerializableObject(serializableRoot);
            this.currentRoot = this.persistentRoot;
            // ★★★ ロード後にマップを再構築 ★★★
            this._rebuildNodeMap(this.persistentRoot);
            return true;
        } catch (error) {
            if (error.code === "ENOENT") {
                console.warn(`MCTS Tree 404: ${filePath} (creating new tree)`);
            } else {
                console.error(`Error loading MCTS Tree from ${filePath}:`, error);
            }
            this.persistentRoot = null;
            this.currentRoot = null;
            this.nodeMap.clear(); // エラー時はマップもクリア
            return false;
        }
    }

    async saveTree(filePath) {
        if (!this.persistentRoot) {
            console.warn("MCTS Tree is empty. Nothing to save.");
            return false;
        }
        try {
            const serializableRoot = this.persistentRoot.toSerializableObject();
            const encoder = new Encoder({ maxDepth: 200 });
            const encoded = encoder.encode(serializableRoot);
            await fs.writeFile(filePath, encoded);
            return true;
        } catch (error) {
            console.error(`Error saving MCTS Tree to ${filePath}:`, error);
            return false;
        }
    }

    // ★★★ MCTSNode.mjs の merge メソッドが呼ばれる際に、
    // ここで MCTS.nodeMap も更新されるように MCTSNode.merge を修正するか、
    // もしくは MCTS.merge を呼び出して MCTS.nodeMap を更新する
    // main.mjs のマージ部分を MCTS.merge に変更する方が自然。

    // ★★★ MCTSNode.merge 後に MCTS.nodeMap を更新するためのヘルパー関数 ★★★
    _rebuildNodeMap(rootNode) {
        this.nodeMap.clear(); // まずクリア
        const queue = [rootNode];
        while (queue.length > 0) {
            const node = queue.shift();
            const boardKey = JSON.stringify(node.boardState) + '_' + node.currentPlayer; // プレイヤーもキーに含める
            this.nodeMap.set(boardKey, node);
            for (const moveStr in node.children) {
                queue.push(node.children[moveStr]);
            }
        }
    }


    run(currentBoardState, currentPlayer, numSimulations) {
        const boardKey = JSON.stringify(currentBoardState) + '_' + currentPlayer;

        if (!this.persistentRoot) {
            const initialBoard = new OthelloBoard();
            this.persistentRoot = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer);
            this.currentRoot = this.persistentRoot;
            this.nodeMap.set(boardKey, this.currentRoot); // 新しいルートをマップに追加
        } else if (
            !this.currentRoot ||
            JSON.stringify(this.currentRoot.boardState) !== JSON.stringify(currentBoardState) ||
            this.currentRoot.currentPlayer !== currentPlayer
        ) {
            // 現在の盤面に対応するノードをマップから探す
            let foundNode = this.nodeMap.get(boardKey); // マップから直接検索
            if (foundNode) {
                this.currentRoot = foundNode;
            } else {
                // マップに見つからない場合、新しいノードを作成
                // これは学習済みツリーにその盤面が存在しないケース
                // このノードはpersistentRootの子孫ではないため、後でマージが必要になる
                this.currentRoot = new MCTSNode(currentBoardState, currentPlayer);
                // 新しいノードをマップに追加 (ただし、これはpersistentRootの子孫ではないので注意)
                // 学習には影響しないが、プレイ時にはマップに存在することで検索が高速化される
                this.nodeMap.set(boardKey, this.currentRoot); 
            }
        }

        for (let i = 0; i < numSimulations; i++) {
            this.simGameBoard.setBoardState(this.currentRoot.boardState, this.currentRoot.currentPlayer);

            let selectedNode = this.select(this.currentRoot);
            let expandedNode = selectedNode;
            if (!this.simGameBoard.isGameOver()) {
                expandedNode = this.expand(selectedNode);
            }

            this.simGameBoard.setBoardState(expandedNode.boardState, expandedNode.currentPlayer);
            let winner = this.simulate(expandedNode);

            this.backpropagate(expandedNode, winner);
        }

        let bestMove = null;
        let maxVisits = -1;

        this.simGameBoard.setBoardState(currentBoardState, currentPlayer);
        const legalMovesForCurrentState = this.simGameBoard.getLegalMoves();
        if (legalMovesForCurrentState.length === 0) {
            return null; // 合法手がない場合はパス
        }

        if (Object.keys(this.currentRoot.children).length === 0) {
            return legalMovesForCurrentState[Math.floor(this.rng() * legalMovesForCurrentState.length)]; // Math.random()からthis.rng()に変更
        }

        for (const moveStr in this.currentRoot.children) {
            const child = this.currentRoot.children[moveStr];
            if (child.visits > maxVisits) {
                maxVisits = child.visits;
                bestMove = JSON.parse(moveStr);
            }
        }
        return bestMove;
    }

    // findNodeByState は MCTSNode.mjs の merge メソッドで nodeMap を更新するよう修正するか、
    // MCTS クラスに merge メソッドを追加して nodeMap も更新するようにする
    // 今回は nodeMap を使って直接検索するので、このメソッドは不要になる。
    // しかし、main.mjs のマージ処理で MCTS.nodeMap を更新する必要がある。
    // よりよいのは、MCTSクラスにマージメソッドを持たせ、そこですべての整合性を保つこと。

    // ★★★ findNodeByState は削除（または大幅に簡素化） ★★★
    // 代わりに nodeMap を使うので、このメソッドはもう必要ありません。
    // もし完全に削除しない場合は、再帰的にノードを探すのではなく、
    // boardStateString をキーとして MCTS.nodeMap から直接取得するように変更します。
    // 例:
    // findNodeByState(targetBoardState, targetPlayer) {
    //     const boardKey = JSON.stringify(targetBoardState) + '_' + targetPlayer;
    //     return this.nodeMap.get(boardKey) || null;
    // }


    select(node) {
        while (!this.simGameBoard.isGameOver() && node.isFullyExpanded(this.simGameBoard)) {
            const bestChildMove = node.bestChild(1.4, this.rng); // Math.random()からthis.rng()に変更
            if (!bestChildMove) {
                break;
            }
            node = node.children[JSON.stringify(bestChildMove)];
            this.simGameBoard.setBoardState(node.boardState, node.currentPlayer);
        }
        return node;
    }

    expand(node) {
        const maxTreeDepth = 60;
        if (node.depth >= maxTreeDepth) {
            return node;
        }

        this.simGameBoard.setBoardState(node.boardState, node.currentPlayer);
        if (this.simGameBoard.isGameOver()) return node;

        const legalMoves = this.simGameBoard.getLegalMoves();
        const unexpandedMoves = legalMoves.filter((move) => !(JSON.stringify(move) in node.children));

        if (unexpandedMoves.length === 0) {
            return node;
        }

        const moveToExpand = unexpandedMoves[Math.floor(this.rng() * unexpandedMoves.length)]; // Math.random()からthis.rng()に変更

        const nextBoard = new OthelloBoard();
        nextBoard.setBoardState(node.boardState, node.currentPlayer);
        nextBoard.applyMove(moveToExpand);

        const newNode = new MCTSNode(nextBoard.getBoardState(), nextBoard.currentPlayer, node, moveToExpand);
        node.children[JSON.stringify(moveToExpand)] = newNode;
        // ★★★ 新しいノードをマップに追加 ★★★
        this.nodeMap.set(JSON.stringify(newNode.boardState) + '_' + newNode.currentPlayer, newNode);


        this.simGameBoard.setBoardState(newNode.boardState, newNode.currentPlayer);

        return newNode;
    }

    simulate(node) {
        const simulationBoard = new OthelloBoard();
        simulationBoard.setBoardState(node.boardState, node.currentPlayer);

        const maxSimulationDepth = 60;
        let currentSimulationDepth = 0;

        while (!simulationBoard.isGameOver() && currentSimulationDepth < maxSimulationDepth) {
            const legalMoves = simulationBoard.getLegalMoves();

            if (legalMoves.length === 0) {
                simulationBoard.applyMove(null); // パス
            } else {
                const randomMove = legalMoves[Math.floor(this.rng() * legalMoves.length)]; // Math.random()からthis.rng()に変更
                simulationBoard.applyMove(randomMove);
            }
            currentSimulationDepth++;
        }
        return simulationBoard.getWinner();
    }

    backpropagate(node, winner) {
        let currentNode = node;
        while (currentNode !== null) {
            currentNode.visits++;
            if (winner === currentNode.currentPlayer) {
                currentNode.wins++;
            } else if (winner === (currentNode.currentPlayer === 1 ? -1 : 1)) {
                currentNode.wins--;
            }
            currentNode = currentNode.parent;
        }
    }

    updateRoot(move) {
        if (!this.currentRoot) {
            console.error("updateRoot called but currentRoot is null.");
            return;
        }

        let nextRootNode = null;
        if (move !== null) {
            const moveStr = JSON.stringify(move);
            if (this.currentRoot.children[moveStr]) {
                nextRootNode = this.currentRoot.children[moveStr];
            } else {
                const nextBoard = new OthelloBoard();
                nextBoard.setBoardState(this.currentRoot.boardState, this.currentRoot.currentPlayer);
                nextBoard.applyMove(move);
                nextRootNode = new MCTSNode(nextBoard.getBoardState(), nextBoard.currentPlayer, this.currentRoot, move);
                this.currentRoot.children[moveStr] = nextRootNode;
                // ★★★ 新しいノードをマップに追加 ★★★
                this.nodeMap.set(JSON.stringify(nextRootNode.boardState) + '_' + nextRootNode.currentPlayer, nextRootNode);
            }
        }
        // パスの場合は currentRoot が変わらないが、手番は変わるので
        // `play_vs_random.mjs` の `mctsPlayer.currentRoot = mctsPlayer.findNodeByState(...)`
        // で次の手番に対応するノードが検索されるはず。
        // ここでの updateRoot は MCTS AI 自身が打った手でツリーを辿るためのものなので、
        // パスの場合の処理は不要。

        if (nextRootNode) {
            this.currentRoot = nextRootNode;
        }
    }

    // ★★★ MCTS クラスに新しいマージメソッドを追加 ★★★
    // main.mjs から直接 MCTSNode.merge を呼び出すのではなく、このメソッドを呼び出すように変更する
    mergeWorkerTrees(workerRootNodeAI1, workerRootNodeAI2) {
        // AI1のツリーをマージ
        if (this.persistentRoot && workerRootNodeAI1) {
            this.persistentRoot.merge(workerRootNodeAI1);
        } else if (workerRootNodeAI1) {
            // persistentRoot がまだない場合、workerRootNodeAI1 を最初のルートとする
            this.persistentRoot = workerRootNodeAI1;
        }
        // AI2のツリーをマージ
        if (this.persistentRoot && workerRootNodeAI2) {
            this.persistentRoot.merge(workerRootNodeAI2);
        } else if (workerRootNodeAI2) {
            // persistentRoot がまだない場合、workerRootNodeAI2 を最初のルートとする
            this.persistentRoot = workerRootNodeAI2;
        }
        // マージ後にマップを再構築する
        // ツリーが巨大な場合、この操作は非常に重くなる可能性があるため、
        // ある程度の頻度でしか呼び出さないように main.mjs で制御するべき。
        // または、MCTSNode.merge の中で部分的に Map を更新するロジックを実装することも検討する。
        this._rebuildNodeMap(this.persistentRoot);
    }
}
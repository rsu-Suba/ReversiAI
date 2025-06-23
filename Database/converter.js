// converter.js
import { MCTSNode } from '../MCTSNode.mjs';
import { DatabaseManager } from '../DatabaseManager.mjs';
import { config } from '../config.mjs';
import { decode } from '@msgpack/msgpack';
import * as fs from 'fs';

// --- 設定 ---
const MSGPACK_PATH = config.treeSavePath;
const MASTER_DB_PATH = config.dbInputPath;

function main() {
    console.log(`--- Starting Msgpack to SQLite Converter ---`);
    console.log(`Input: ${MSGPACK_PATH}`);
    console.log(`Output: ${MASTER_DB_PATH}`);

    // 1. Msgpackファイルを読み込み、デコードする
    if (!fs.existsSync(MSGPACK_PATH)) {
        console.error(`Error: Input file not found at ${MSGPACK_PATH}`);
        return;
    }
    const msgpackData = fs.readFileSync(MSGPACK_PATH);
    const decodedObject = decode(msgpackData);
    
    // 2. メモリ上にMCTSの木構造を完全に復元する
    console.log("Reconstructing MCTS tree in memory...");
    const rootNode = MCTSNode.fromSerializableObject(decodedObject);

    // 3. 復元した木から、全てのノードを配列に展開する
    const allNodes = [];
    const queue = [rootNode];
    const visited = new Set();

    while (queue.length > 0) {
        const node = queue.shift();
        const key = node.getBoardStateKey();
        if (visited.has(key)) continue;
        
        visited.add(key);
        allNodes.push(node);

        for (const child of Object.values(node.children)) {
            queue.push(child);
        }
    }
    
    // 4. 新しいマスターデータベースを作成し、全ノードを書き込む
    if (fs.existsSync(MASTER_DB_PATH)) {
        fs.unlinkSync(MASTER_DB_PATH); // 古いマスターDBがあれば削除
    }
    const dbManager = new DatabaseManager(MASTER_DB_PATH);
    
    console.log(`Saving ${allNodes.length} nodes to database...`);
    dbManager.batchSaveNodes(allNodes);
    dbManager.close();

    console.log("--- Conversion complete! ---");
}

main();
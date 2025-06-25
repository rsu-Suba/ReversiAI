// debug_get_node.js
import { DatabaseManager } from './DatabaseManager.mjs';
import { config } from './config.mjs';

function main() {
    console.log("--- Database Node Inspector ---");

    // 1. コマンドラインから、検索したいキーを取得する
    const keyToFind = process.argv[2];
    if (!keyToFind) {
        console.error("Error: Please provide a key to search for as a command-line argument.");
        console.error('Example: node debug_get_node.js "1008000000_810000000_1_false"');
        return;
    }

    // 2. 評価用のデータベースに接続する
    const dbFilePath = "./Database/mcts.sqlite";
    console.log(`Searching for key in: ${dbFilePath}`);
    console.log(`Key to find: ${keyToFind}`);
    
    try {
        const dbManager = new DatabaseManager(dbFilePath);

        // 3. getNodeメソッドでキーを検索
        const foundNodeData = dbManager.getNode(keyToFind);

        // 4. 結果を表示
        console.log("\n--- Search Result ---");
        if (foundNodeData) {
            console.log("Node FOUND!");
            // オブジェクトの内容を整形して表示
            console.log(JSON.stringify(foundNodeData, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value, 
                2
            ));
        } else {
            console.log("Node NOT FOUND.");
        }

        dbManager.close();

    } catch (error) {
        console.error("An error occurred:", error.message);
    }
}

main();
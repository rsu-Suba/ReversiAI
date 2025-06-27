import { DatabaseManager } from "../DatabaseManager.mjs";
import { config } from "../config.mjs";
import * as fs from "fs";
import * as path from "path";

const INPUT_DB_PATHS = config.mergeFile || [];
const OUTPUT_DB_PATH = config.outputMergeFile || "mcts_master.sqlite";

function main() {
    console.log("--- Starting Database Merge Tool ---");
    if (INPUT_DB_PATHS.length < 1) {
        console.error("Error: No input files specified in config.mjs 'mergeFile' array.");
        return;
    }    
    const aggregatedNodes = new Map();
    console.log("Reading and aggregating nodes from all worker databases...");

    for (const relativePath of INPUT_DB_PATHS) {
        const workerDbPath = path.resolve(relativePath);
        if (fs.existsSync(workerDbPath)) {
            console.log(`  Processing ${relativePath}...`);
            const workerDb = new DatabaseManager(workerDbPath);
            const workerNodes = workerDb.getAllNodes();
            workerDb.close();

            for (const nodeData of workerNodes) {
                if (aggregatedNodes.has(nodeData.key)) {
                    const existing = aggregatedNodes.get(nodeData.key);
                    existing.wins += nodeData.wins;
                    existing.visits += nodeData.visits;
                    const existingChildren = JSON.parse(existing.children_keys);
                    const newChildren = JSON.parse(nodeData.children_keys);
                    existing.children_keys = JSON.stringify([...new Set([...existingChildren, ...newChildren])]);
                } else {
                    aggregatedNodes.set(nodeData.key, nodeData);
                }
            }
        } else {
            console.warn(`Warning: Input database not found. Skipping: ${relativePath}`);
        }
    }
    console.log(`Aggregation complete. Found ${aggregatedNodes.size} unique nodes.`);

    if (fs.existsSync(OUTPUT_DB_PATH)) {
        fs.unlinkSync(OUTPUT_DB_PATH);
    }
    const masterDb = new DatabaseManager(OUTPUT_DB_PATH);
    console.log(`Master database ready at ${OUTPUT_DB_PATH}`);
    console.log("Saving aggregated nodes to the master database...");
    masterDb.batchSaveNodesFromData(Array.from(aggregatedNodes.values()));
    
    const finalNodeCount = masterDb.getNodeCount();
    console.log(`\n--- Master database now contains a total of ${finalNodeCount} nodes. ---`);
    masterDb.close();
    
    console.log("--- Merge process completed successfully! ---");
}

main();
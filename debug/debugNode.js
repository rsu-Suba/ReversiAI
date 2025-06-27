import { DatabaseManager } from "../DatabaseManager.mjs";
import { config } from "../config.mjs";

function main() {
   console.log("--- Database Node Inspector ---");
   const keyToFind = process.argv[2];
   if (!keyToFind) {
      console.error("Error: Please provide a key to search for as a command-line argument.");
      console.error('Example: node debug_get_node.js "1008000000_810000000_1_false"');
      return;
   }
   const dbFilePath = "./Database/mcts.sqlite";
   console.log(`Searching for key in: ${dbFilePath}`);
   console.log(`Key to find: ${keyToFind}`);

   try {
      const dbManager = new DatabaseManager(dbFilePath);
      const foundNodeData = dbManager.getNode(keyToFind);
      console.log("\n--- Search Result ---");
      if (foundNodeData) {
         console.log("Node FOUND!");
         console.log(
            JSON.stringify(foundNodeData, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2)
         );
      } else {
         console.log("Node NOT FOUND.");
      }

      dbManager.close();
   } catch (error) {
      console.error("An error occurred:", error.message);
   }
}

main();

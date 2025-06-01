import * as path from "path";
import { fileURLToPath } from "url";
import { MergeMCTSTreeManager } from "./MCTSTree.mjs";
import { OthelloBoard } from "../OthelloBoard.mjs";
import { MCTSNode } from "../MCTSNode.mjs";
import { mergeFiles, outputFile } from "./mergeConfig.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let treeFilePaths;
for (let i = 0; i < mergeFiles.length; i++) {
   treeFilePaths.push = path.join(__dirname, mergeFiles[i]);
}
const outputFilePath = path.join(__dirname, outputFile);

async function runMergeTool() {
   console.log("--- Starting MCTS Tree Merge Tool ---");
   if (treeFilePaths.length === 0) {
      console.warn("No input files specified for merging. Please update 'treeFilePaths' in merge_tool.js.");
      return;
   }
   let baseTreeManager = new MergeMCTSTreeManager();
   let loadedSuccessfully = false;
   console.log(`Loading initial tree from: ${treeFilePaths[0]}`);
   loadedSuccessfully = await baseTreeManager.loadTree(treeFilePaths[0]);
   if (!loadedSuccessfully) {
      console.error(`Failed to load initial tree from ${treeFilePaths[0]}. Initializing with an empty Othello tree.`);
      const initialBoard = new OthelloBoard();
      const initialNode = new MCTSNode(initialBoard.getBoardState(), initialBoard.currentPlayer, null, null, 0, false);
      baseTreeManager.setRootNode(initialNode);
   }

   for (let i = 1; i < treeFilePaths.length; i++) {
      const currentFilePath = treeFilePaths[i];
      console.log(`Processing tree ${i + 1}/${treeFilePaths.length}: ${currentFilePath}`);
      const tempTreeManager = new MergeMCTSTreeManager();
      const loadedTemp = await tempTreeManager.loadTree(currentFilePath);
      if (loadedTemp) {
         baseTreeManager.mergeTrees(tempTreeManager);
         console.log(
            `Successfully merged ${currentFilePath}. Current total nodes: ${baseTreeManager.getNodeMap().size}`
         );
      } else {
         console.warn(`Skipping ${currentFilePath} due to loading error.`);
      }
   }
   console.log(`All specified trees processed. Final total nodes: ${baseTreeManager.getNodeMap().size}`);
   console.log(`Saving final merged tree to: ${outputFilePath}`);
   const saved = await baseTreeManager.saveTree(outputFilePath);
   if (saved) {
      console.log("Merged tree saved successfully!");
   } else {
      console.error("Failed to save the merged tree.");
   }
   console.log("--- Merge Tool Finished ---");
}
runMergeTool().catch((error) => {
   console.error("An unhandled error occurred during merge process:", error);
});

import * as fs from "fs/promises";
import { decode, Encoder } from "@msgpack/msgpack";
import { MCTSNode } from "./MCTSNode.mjs";

export class MergeMCTSTreeManager {
   constructor() {
      this.rootNode = null;
      this.nodeMap = new Map();
   }

   async loadTree(filePath, fileName) {
      this.rootNode = null;
      this.nodeMap.clear();
      try {
         const data = await fs.readFile(filePath);
         if (data.length === 0) {
            console.warn(`Loaded empty file: ${fileName}.`);
            return false;
         }
         const serializableRoot = decode(data);
         this.rootNode = MCTSNode.fromSerializableObject(serializableRoot);
         this._rebuildNodeMap(this.rootNode);
         console.log(`Tree loaded <- ${fileName}. ${this.nodeMap.size} nodes`);
         return true;
      } catch (e) {
         console.error(`Failed to load <- ${fileName}`);
         return false;
      }
   }

   async saveTree(filePath, fileName, isMainFile) {
      if (!this.rootNode) {
         console.warn(`No tree -> ${fileName}.`);
         return false;
      }
      try {
         const serializableTree = this.rootNode.toSerializableObject();
         const encoder = new Encoder({ maxDepth: 250 });
         const encoded = encoder.encode(serializableTree);
         await fs.writeFile(filePath, encoded);
         if (isMainFile) console.log(`Tree saved -> ${fileName}. ${this.nodeMap.size} nodes`);
         return true;
      } catch (e) {
         console.error(`Failed to save -> ${fileName}:`, e.message);
         return false;
      }
   }

   mergeTrees(otherTreeManager) {
      if (!otherTreeManager || !otherTreeManager.rootNode) {
         console.warn("No tree -> merge");
         return;
      }

      if (!this.rootNode) {
         this.rootNode = MCTSNode.fromSerializableObject(otherTreeManager.rootNode.toSerializableObject());
         this._rebuildNodeMap(this.rootNode);
         console.log("Merged tree -> empty");
         return;
      }

      const queue = [{ mainParent: null, workerNode: otherTreeManager.rootNode }];
      let nodesMergedCount = 0;

      while (queue.length > 0) {
         const { mainParent, workerNode } = queue.shift();
         const workerNodeKey = workerNode.getBoardStateKey();

         let existingMainNode = this.nodeMap.get(workerNodeKey);
         let currentNodeInMainTree;

         if (existingMainNode) {
            existingMainNode.visits += workerNode.visits;
            existingMainNode.wins += workerNode.wins;
            currentNodeInMainTree = existingMainNode;
         } else {
            currentNodeInMainTree = MCTSNode.fromSerializableObject(workerNode.toSerializableObject());
            this.nodeMap.set(workerNodeKey, currentNodeInMainTree);
            nodesMergedCount++;

            if (mainParent) {
                if (workerNode.move !== null) {
                    mainParent.children[workerNode.move.toString()] = currentNodeInMainTree;
                    currentNodeInMainTree.parent = mainParent;
                }
            }
         }

         for (const moveBitStr in workerNode.children) {
            if (Object.prototype.hasOwnProperty.call(workerNode.children, moveBitStr)) {
               const workerChild = workerNode.children[moveBitStr];
               queue.push({ mainParent: currentNodeInMainTree, workerNode: workerChild });
            }
         }
      }
      console.log(`MCTS: Merged ${nodesMergedCount} new nodes. Total nodes: ${this.nodeMap.size}`);
   }

   _rebuildNodeMap(rootNode) {
      this.nodeMap.clear();
      const queue = [rootNode];
      while (queue.length > 0) {
         const node = queue.shift();
         if (!node) continue;
         const key = node.getBoardStateKey();
         if (!this.nodeMap.has(key)) {
            this.nodeMap.set(key, node);
         }
         const childrenEntries = Object.entries(node.children);
         for (const [, child] of childrenEntries) {
            if (child) {
               queue.push(child);
            }
         }
      }
   }

   setRootNode(node) {
      this.rootNode = node;
      this.nodeMap.clear();
      this._rebuildNodeMap(this.rootNode);
   }

   getRootNode() {
      return this.rootNode;
   }

   getNodeMap() {
      return this.nodeMap;
   }
}
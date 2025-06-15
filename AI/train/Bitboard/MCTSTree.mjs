import * as fs from "fs/promises";
import { decode, Encoder } from "@msgpack/msgpack";
import { MCTSNode } from "./MCTSNode.mjs";

export class MergeMCTSTreeManager {
   constructor() {
      this.rootNode = null;
      this.nodeMap = new Map();
   }

   async loadTree(filePath) {
      this.rootNode = null;
      this.nodeMap.clear();
      try {
         const data = await fs.readFile(filePath);
         if (data.length === 0) {
            console.warn(`[Merge Tree] Loaded empty file: ${filePath}.`);
            return false;
         }
         const serializableRoot = decode(data);
         this.rootNode = MCTSNode.fromSerializableObject(serializableRoot);
         this._rebuildNodeMap(this.rootNode);
         console.log(`[Merge Tree] Tree loaded <- ${filePath}. ${this.nodeMap.size} nodes`);
         return true;
      } catch (e) {
         console.error(`[Merge Tree] Failed to load <- ${filePath}`);
         return false;
      }
   }

   async saveTree(filePath) {
      if (!this.rootNode) {
         console.warn(`[Merge Tree] No tree -> ${filePath}.`);
         return false;
      }
      try {
         const serializableTree = this.rootNode.toSerializableObject();
         const encoder = new Encoder({ maxDepth: 250 });
         const encoded = encoder.encode(serializableTree);
         await fs.writeFile(filePath, encoded);
         console.log(`[Merge Tree] Tree saved -> ${filePath}. ${this.nodeMap.size} nodes`);
         return true;
      } catch (e) {
         console.error(`[Merge Tree] Failed to save -> ${filePath}:`, e.message);
         return false;
      }
   }

   mergeTrees(otherTreeManager) {
      if (!otherTreeManager || !otherTreeManager.rootNode) {
         console.warn("[Merge Tree] No tree -> merge");
         return;
      }

      if (!this.rootNode) {
         this.rootNode = MCTSNode.fromSerializableObject(otherTreeManager.rootNode.toSerializableObject());
         this._rebuildNodeMap(this.rootNode);
         console.log("[Merge Tree] Merged tree -> empty");
         return;
      }
      console.log(
         `[Merge Tree] Starting merge. ${this.nodeMap.size} nodes + ${otherTreeManager.nodeMap.size} nodes`
      );
      this.rootNode.merge(otherTreeManager.rootNode);
      this._rebuildNodeMap(this.rootNode);

      console.log(`[Merge Tree] Merge done. -> ${this.nodeMap.size} nodes`);
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

export const config = {
   //Train
   parallel: 4,
   simsN: 10,
   cP: 2.0,
   trainingHours: 0,
   matches: 4,
   vsRandom: false,

   //Review
   reviewSimsN: 100,
   reviewMatches: 20,

   //Common
   Mem_Check_Interval: 200,
   Mem_Worker_Check_Interval: 50,
   Mem_Threshold_Per: 0.85,
   Mem_Worker_Threshold_Per: 0.75,
   Mem_Heap_Size: 8192,
   treeSavePath: "./mcts_tree.msgpack",
   treeLoadPath: "./mcts_tree.msgpack",
   treeBackupPath: "./mcts_tree_backup.msgpack",

   //Merge
   mergeFile: ["T20.msgpack", "T50.msgpack"],
   outputMergeFile: "T70Merged.msgpack",

   //decode
   inputFile: "./mcts_tree.msgpack",
   outputFile: "./mcts.json",
};

export const config = {
   //Train
   parallel: 4,
   simsN: 100,
   cP: 1.4,
   trainingHours: 0,
   matches: 8,
   vsRandom: false,

   //Review
   reviewSimsN: 100,
   reviewMatches: 100,

   //Common
   Mem_Check_Interval: 200,
   Mem_Worker_Check_Interval: 50,
   Mem_Threshold_Per: 0.85,
   Mem_Worker_Threshold_Per: 0.75,
   Mem_Heap_Size: 8192,
   treeSavePath: "./Database/mcts.msgpack",
   treeLoadPath: "./Database/mcts.msgpack",
   treeBackupPath: "./Database/mcts_b.msgpack",

   //Merge
   mergeFile: ["./Database/mcts1.sqlite", "./Database/mcts2.sqlite", "./Database/mcts3.sqlite"],
   outputMergeFile: "./Database/mcts_merged.sqlite",

   //decode
   inputFile: "./Database/mcts.msgpack",
   outputFile: "./Database/mcts.json",

   //db to Json
   dbInputPath: "./Database/mcts_2-7M.sqlite",
   dbOutputPath: "./Database/mcts_2-7M.json",
};

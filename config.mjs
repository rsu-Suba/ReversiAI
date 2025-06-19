export const config = {
   //Train
   parallel: 4,
   simsN: 200,
   cP: 1.4,
   trainingHours: 0,
   matches: 20,
   vsRandom: false,

   //Review
   reviewSimsN: 250,
   reviewMatches: 10,

   //Common
   Mem_Check_Interval: 200,
   Mem_Worker_Check_Interval: 50,
   Mem_Threshold_Per: 0.85,
   Mem_Worker_Threshold_Per: 0.75,
   Mem_Heap_Size: 8192,
   treeLoadPath: "./mcts.sqlite",

   //Merge
   mergeFile: ["T20.msgpack", "T50.msgpack"],
   outputMergeFile: "T70Merged.msgpack",

   //decode
   inputFile: "./mcts.sqlite",
   outputFile: "./mcts.json",
};

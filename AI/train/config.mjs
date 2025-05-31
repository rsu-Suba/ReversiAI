export const config = {
   //Train
   parallel: 4,
   simsN: 200,
   cP: 1.4,
   trainingHours: 0,
   matches: 8,
   vsRandom: true,

   //Review
   reviewSimsN: 200,
   reviewMatches: 10,

   //common
   Mem_Check_Interval: 1000,
   Mem_Worker_Check_Interval: 100,
   Mem_Threshold_Per: 0.90,
   Mem_Worker_Threshold_Per: 0.80,
   Mem_Heap_Size: 8192,
   treeSavePath: "./mcts_tree.msgpack",
   treeLoadPath: "./mcts_tree.msgpack",
   treeBackupPath: "./mcts_tree_backup.msgpack",
};

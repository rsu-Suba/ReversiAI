export const config = {
   //Train
   parallel: 1,
   simsN: 10,
   cP: 1.4,
   trainingHours: 0,
   matches: 1,
   vsRandom: false,

   //Review
   reviewSimsN: 100,
   reviewMatches: 4,

   //common
   Mem_Check_Interval: 200,
   Mem_Worker_Check_Interval: 50,
   Mem_Threshold_Per: 0.85,
   Mem_Worker_Threshold_Per: 0.75,
   Mem_Heap_Size: 8192,
   treeSavePath: "./mcts_tree.msgpack",
   treeLoadPath: "./mcts_tree.msgpack",
   treeBackupPath: "./mcts_tree_backup.msgpack",
};

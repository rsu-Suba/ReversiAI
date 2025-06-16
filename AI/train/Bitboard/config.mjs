export const config = {
   //Train
   parallel: 4,
   simsN: 2000,
   cP: 4.5,
   trainingHours: 0,
   matches: 10,
   vsRandom: false,

   //Review
   reviewSimsN: 1000,
   reviewMatches: 2,

   //common
   Mem_Check_Interval: 200,
   Mem_Worker_Check_Interval: 50,
   Mem_Threshold_Per: 0.85,
   Mem_Worker_Threshold_Per: 0.75,
   Mem_Heap_Size: 4096,
   treeSavePath: "./mcts_tree.msgpack",
   treeLoadPath: "./mcts_tree.msgpack",
   treeBackupPath: "./mcts_tree_backup.msgpack",
};

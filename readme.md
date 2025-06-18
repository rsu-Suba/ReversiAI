## Commands

-  Study `node train.js`
-  Study (more RAM usage) `node --max-old-space-size=8192 train.js`<br>
   **Please change config.mjs -> Mem_Heap_Size**
-  Review `node review.js` (AI vs Random Bot)
-  Review `node reviewHuman.js` (AI vs Human)

## Files used

-  train.js : Study
-  review.js : Review (vs Random bot)
-  reviewHuman.js : Review (vs Human input)
-  config.mjs : Parameters file for all program

### Module files(Required)

-  workerAI.mjs : AI program
-  MCTS.mjs : Selecting moves for AI
-  MCTSNode.mjs : Studied data control for AI
-  MCTSTree.mjs : Studied data manegement for AI
-  OthelloBoard.mjs : Managing game
-  module.mjs : Module program for train.js

#### Config.mjs Parameters

<table>
<caption>Study</caption>
<thead><tr><th>Param Name</th><th>Descrption</th><tr></thead>
<tr><td>Parallel game coats</td><td>parallel</td></tr>
<tr><td>Simulation num</td><td>      simsN</td></tr>
<tr><td>c_num</td><td>               cP</td></tr>
<tr><td>Train hours</td><td>         trainingHours</td></tr>
<tr><td>Train games</td><td>         matches</td></tr>
<tr><td>Train vs Random bot</td><td> vsRandom</td></tr>
</table>
<table>
<caption>Review</caption>
<thead><tr><th>Param Name</th><th>Descrption</th><tr></thead>
<tr><td>Simulation num</td><td>      reviewSimsN</td></tr>
<tr><td>Review games</td><td>        reviewMatches</td></tr>
</table>

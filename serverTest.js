// test_api.js
import fetch from "node-fetch";

// Pythonサーバーのアドレス
const API_URL = "http://localhost:5000/predict";

// テスト用に、オセロの初期盤面のデータを準備
const sampleBoardState = {
   // BigIntはJSONにできないため、16進数の文字列として送る
   blackBoard: "1008000000",
   whiteBoard: "810000000",
   currentPlayer: 1, // 黒番
};

async function runApiTest() {
   console.log("--- Starting API Server Test ---");
   console.log("Sending sample board state to:", API_URL);
   console.log("Sample Data:", sampleBoardState);

   try {
      // 1. fetchを使って、PythonサーバーにPOSTリクエストを送信
      const response = await fetch(API_URL, {
         method: "POST",
         // ヘッダーで、中身がJSONであることを伝える
         headers: {
            "Content-Type": "application/json",
         },
         // 送信するデータをJSON文字列に変換
         body: JSON.stringify(sampleBoardState),
      });

      // 2. サーバーからの応答を確認
      if (!response.ok) {
         // もしエラーが返ってきたら、その内容を表示
         const errorText = await response.text();
         throw new Error(`Server returned an error: ${response.status} ${response.statusText}. Body: ${errorText}`);
      }

      // 3. 正常な応答（JSON形式）をパースして中身を確認
      const prediction = await response.json();

      console.log("\n--- TEST SUCCESS! Received a valid response from the server. ---");
      console.log("Value (勝率予測):", prediction.value);
      console.log("Policy (有望度リスト、最初の5手):", prediction.policy.slice(0, 5));
      console.log(`Policy array length: ${prediction.policy.length}`); // 64になるはず
   } catch (error) {
      console.error("\n--- TEST FAILED! ---");
      if (error.code === "ECONNREFUSED") {
         console.error("Connection refused. Is the Python API server (api_server.py) running?");
      } else {
         console.error("An error occurred:", error.message);
      }
   }
}

runApiTest();

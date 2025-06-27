import fetch from "node-fetch";

const API_URL = "http://localhost:5000/predict";

const sampleBoardState = {
   blackBoard: "1008000000",
   whiteBoard: "810000000",
   currentPlayer: 1,
};

async function runApiTest() {
   console.log("--- Starting API Server Test ---");
   console.log("Sending sample board state to:", API_URL);
   console.log("Sample Data:", sampleBoardState);

   try {
      const response = await fetch(API_URL, {
         method: "POST",
         headers: {
            "Content-Type": "application/json",
         },
         body: JSON.stringify(sampleBoardState),
      });
      if (!response.ok) {
         const errorText = await response.text();
         throw new Error(`Server returned an error: ${response.status} ${response.statusText}. Body: ${errorText}`);
      }
      const prediction = await response.json();
      console.log("\n--- TEST SUCCESS! Received a valid response from the server. ---");
      console.log("Value (勝率予測):", prediction.value);
      console.log("Policy (有望度リスト、最初の5手):", prediction.policy.slice(0, 5));
      console.log(`Policy array length: ${prediction.policy.length}`);
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

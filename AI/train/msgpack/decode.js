// msgpack_to_json.js (修正版)

import * as fs from "fs/promises";
import * as path from "path";
import { decode } from "@msgpack/msgpack";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 設定 ---
const inputMsgpackPath = path.join(__dirname, "./mcts_tree_backup.msgpack");
const outputJsonPath = path.join(__dirname, "./mcts.json"); // null にするとコンソール出力のみ
const jsonIndent = 2;
// --- 設定ここまで ---

// ★より詳細な循環参照/不正文字ハンドリングのための replacer 関数★
function jsonReplacer(key, value) {
   // 1. 循環参照のハンドリング (MCTSNodeのparentプロパティを想定)
   if (key === "parent") {
      return undefined; // parent プロパティはシリアライズから除外
   }

   if (value instanceof Map) {
      return Object.fromEntries(value);
   }
   if (value instanceof Set) {
      return Array.from(value);
   }
   if (typeof value === "function" || typeof value === "symbol" || value === undefined) {
      return undefined; // シリアライズから除外
   }

   // 3. ★最も重要な修正：不正な文字列のハンドリング★
   // 文字列の場合、その健全性をチェックする
   if (typeof value === "string") {
      try {
         // New String() を通すことで、不正な文字コードが含まれている場合にエラーを発生させる
         // または、replace(/\p{C}/gu, '?') のように制御文字を置換
         // `String.fromCodePoint` と `charCodeAt` を使ったより厳密なチェックも可能
         // 例えば、JSONが許容しない制御文字などを置換する
         const cleanedString = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, (char) => {
            // 制御文字を見つけたら、例えば '?' に置き換える
            console.warn(
               `[WARNING] Found control character in string value for key "${key}": \\u${char
                  .charCodeAt(0)
                  .toString(16)
                  .padStart(4, "0")}. Replacing with '?'.`
            );
            return "?";
         });
         return cleanedString;
      } catch (e) {
         console.error(
            `[ERROR] Failed to process string for key "${key}": ${
               e.message
            }. Replacing with "[STRING_ERROR]". Original value start: "${value.substring(0, 50)}..."`
         );
         return "[STRING_ERROR]"; // エラーが発生した文字列を特定しやすいように置き換える
      }
   }

   // 4. 配列要素のチェック (特に boardState のような数値配列)
   // boardState が問題の場合、その要素が数値以外でないか確認
   // if (key === 'boardState' && Array.isArray(value)) {
   //     if (value.some(row => !Array.isArray(row) || row.some(cell => typeof cell !== 'number'))) {
   //         console.error(`[ERROR] boardState contains non-numeric or non-array elements.`);
   //         return "[INVALID_BOARDSTATE]";
   //     }
   // }

   return value; // それ以外の値はそのまま返す
}

async function convertMsgpackToJson(inputPath, outputPath = null, indent = null) {
   console.log(`--- Starting MsgPack to JSON Converter ---`);
   console.log(`Input MsgPack file: ${inputPath}`);

   try {
      const data = await fs.readFile(inputPath);

      if (data.length === 0) {
         console.error(`Error: Input file "${inputPath}" is empty.`);
         return;
      }

      const decodedObject = decode(data);

      // ★JSON.stringify に強化された replacer を追加★
      //const jsonString = JSON.stringify(decodedObject, jsonReplacer, indent);
      const jsonString = JSON.stringify(decodedObject);

      if (outputPath) {
         await fs.writeFile(outputPath, jsonString);
         console.log(`Successfully converted and saved JSON to: ${outputPath}`);
      } else {
         console.log(`\n--- Converted JSON Content ---`);
         console.log(jsonString);
         console.log(`\n--- End of JSON Content ---`);
      }
   } catch (error) {
      console.error(`Error converting MsgPack to JSON: ${error.message}`);
      console.error(
         `This error likely means a non-serializable type or bad characters are present after MsgPack decoding.`
      );
      console.error(`Please check the 'jsonReplacer' function and the structure of 'decodedObject'.`);
      console.error(error); // 詳細なスタックトレースも出力
   } finally {
      console.log(`--- Converter Finished ---`);
   }
}

convertMsgpackToJson(inputMsgpackPath, outputJsonPath, jsonIndent).catch((error) => {
   console.error("An unhandled error occurred during conversion:", error);
});

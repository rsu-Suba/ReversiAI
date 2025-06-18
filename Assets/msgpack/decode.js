import * as fs from "fs/promises";
import * as path from "path";
import { decode } from "@msgpack/msgpack";
import { fileURLToPath } from "url";
import { config } from "../../config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputMsgpackPath = path.join(__dirname, config.inputFile);
const outputJsonPath = path.join(__dirname, config.outputFile);
const jsonIndent = 2;

function jsonReplacer(key, value) {
   if (key === "parent") {
      return undefined;
   }
   if (value instanceof Map) {
      return Object.fromEntries(value);
   }
   if (value instanceof Set) {
      return Array.from(value);
   }
   if (typeof value === "function" || typeof value === "symbol" || value === undefined) {
      return undefined;
   }

   if (typeof value === "string") {
      try {
         const cleanedString = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, (char) => {
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
         return "[STRING_ERROR]";
      }
   }

   return value;
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
      console.error(error);
   } finally {
      console.log(`--- Converter Finished ---`);
   }
}

convertMsgpackToJson(inputMsgpackPath, outputJsonPath, jsonIndent).catch((error) => {
   console.error("An unhandled error occurred during conversion:", error);
});

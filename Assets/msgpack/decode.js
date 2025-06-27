import * as fs from "fs";
import * as path from "path";
import pkg from "@msgpack/msgpack";
const { decode } = pkg;
import { fileURLToPath } from "url";
import { config } from "../../config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputMsgpackPath = path.resolve(__dirname, config.inputFile || "../../mcts_tree.msgpack");
const outputJsonPath = path.resolve(__dirname, config.outputFile || "../../mcts.json");
const INDENT = "  ";

function stringifyStream(data, writeStream, indent = "") {
   if (data === null) {
      writeStream.write("null");
      return;
   }

   if (Array.isArray(data)) {
      writeStream.write("[\n");
      data.forEach((item, index) => {
         writeStream.write(indent + INDENT);
         stringifyStream(item, writeStream, indent + INDENT);
         if (index < data.length - 1) {
            writeStream.write(",");
         }
         writeStream.write("\n");
      });
      writeStream.write(indent + "]");
   } else if (typeof data === "object") {
      writeStream.write("{\n");
      const keys = Object.keys(data);
      keys.forEach((key, index) => {
         writeStream.write(`${indent + INDENT}"${key}": `);
         stringifyStream(data[key], writeStream, indent + INDENT);
         if (index < keys.length - 1) {
            writeStream.write(",");
         }
         writeStream.write("\n");
      });
      writeStream.write(indent + "}");
   } else {
      writeStream.write(JSON.stringify(data));
   }
}

function convertMsgpackToJson() {
   console.log(`--- Starting MsgPack to JSON Stream Converter ---`);
   console.log(`Input: ${inputMsgpackPath}`);
   console.log(`Output: ${outputJsonPath}`);

   try {
      const msgpackData = fs.readFileSync(inputMsgpackPath);
      if (msgpackData.length === 0) {
         console.error(`Error: Input file is empty.`);
         return;
      }
      const decodedObject = decode(msgpackData);
      const writeStream = fs.createWriteStream(outputJsonPath);
      console.log("Conversion in progress...");
      stringifyStream(decodedObject, writeStream, "");
      writeStream.end();

      console.log("\n--- Conversion complete! ---");
      console.log(`Successfully converted and saved JSON to: ${outputJsonPath}`);
   } catch (error) {
      console.error(`Error converting MsgPack to JSON: ${error.message}`);
      console.error(error);
   } finally {
      console.log(`--- Converter Finished ---`);
   }
}

convertMsgpackToJson();

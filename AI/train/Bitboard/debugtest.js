import { boardDisplay } from "./debug.mjs";

const boardB = 0x81808000000n;
const boardW = 0x10000000n;

console.log(boardDisplay(boardB));
console.log(boardDisplay(boardW));
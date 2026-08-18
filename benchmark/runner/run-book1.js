import { runBook1Benchmark } from "./book1.js";

const result = await runBook1Benchmark();
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;

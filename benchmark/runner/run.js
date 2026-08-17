import { runRetrievalBenchmark } from "./retrieval.js";

const result = await runRetrievalBenchmark();
process.stdout.write(`${JSON.stringify({
  status: result.status,
  summary: result.summary,
  metrics: result.metrics,
}, null, 2)}\n`);
if (result.status !== "PASS") process.exitCode = 1;

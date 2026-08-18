import { runLapZoneBenchmark } from "./lapzone.js";

const result = await runLapZoneBenchmark();
process.stdout.write(`${JSON.stringify({
  status: result.status,
  codegraph: result.codegraph,
  lapzone: result.lapzone,
  gates: result.gates,
  metrics: result.metrics,
  sea: result.sea,
  failures: result.failures,
}, null, 2)}\n`);
if (result.status !== "PASS") process.exitCode = 1;

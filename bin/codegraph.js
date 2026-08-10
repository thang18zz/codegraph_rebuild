#!/usr/bin/env node

import { run } from "../src/cli.js";

run(process.argv.slice(2)).catch((error) => {
  const code = error.code ?? "INTERNAL_ERROR";
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = error.exitCode ?? 1;
});

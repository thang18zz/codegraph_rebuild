import assert from "node:assert/strict";
import test from "node:test";
import { runRetrievalBenchmark } from "../benchmark/runner/retrieval.js";

test("deterministic retrieval corpus satisfies independent oracles", async () => {
  const result = await runRetrievalBenchmark({ writeResults: false });
  assert.equal(result.status, "PASS", JSON.stringify(
    result.cases.filter((caseResult) => !caseResult.passed),
    null,
    2,
  ));
  assert.equal(result.metrics.false_navigation_safe_count, 0);
  assert.equal(result.metrics.false_match_count, 0);
  assert.equal(result.metrics.wrong_region_match_count, 0);
});

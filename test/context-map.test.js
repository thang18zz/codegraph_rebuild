import assert from "node:assert/strict";
import test from "node:test";
import { compileContextMap } from "../src/context-map.js";

test("100k-entity projection stays bounded and retains top-level routing domains", () => {
  const regions = [{
    stable_id: "region:repository",
    parent_id: null,
    kind: "repository",
    name: "repository",
    path: ".",
    confidence: "HIGH",
    risk_flags: [],
  }];
  for (let index = 0; index < 10; index += 1) {
    regions.push({
      stable_id: `region:domain_${index}`,
      parent_id: "region:repository",
      kind: "package",
      name: `domain_${index}`,
      path: `domain_${index}`,
      confidence: "HIGH",
      risk_flags: [],
    });
  }
  const entities = Array.from({ length: 100_000 }, (_, index) => ({
    stable_id: `python:generated/file_${index}.py:generated.file_${index}.helper:function`,
    kind: "function",
    name: `helper_${index}`,
    qualified_name: `generated.file_${index}.helper_${index}`,
    file_path: `generated/file_${index}.py`,
    region_id: `region:domain_${index % 10}`,
    signature: `def helper_${index}()`,
    confidence: "HIGH",
    classification: index < 10 ? "FIRST_PARTY" : "GENERATED",
    semantic_tags: [],
    risk_flags: index < 10 ? [] : ["GENERATED_CODE"],
    source_location: {
      file_path: `generated/file_${index}.py`,
      start_line: 1,
      start_column: 0,
      end_line: 1,
      end_column: 10,
    },
  }));
  const graph = {
    entities,
    relations: [],
    regions,
    health: { status: "FRESH", risk_flags: ["GENERATED_CODE"], stale_files: [] },
  };
  const map = compileContextMap(graph, 1, {
    compact_entity_limit: 250,
    map_target_tokens: 1000,
    map_hard_cap_tokens: 1500,
  });
  assert.equal(map.mode, "HYBRID");
  assert.ok(map.budgetUnits <= 1500);
  for (let index = 0; index < 10; index += 1) assert.match(map.content, new RegExp(`domain_${index}`, "u"));
  assert.equal(graph.entities.length, 100_000);
});

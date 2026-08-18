import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPinnedProvenance,
  checkSourceOracle,
  graphGate,
  scoreQuery,
} from "../benchmark/runner/book1.js";
import { isFalseNavigationSafe } from "../benchmark/runner/safety.js";

const identity = {
  source_fingerprint: "declared",
  java_file_count: 2,
  production_java_file_count: 1,
  test_java_file_count: 1,
  commit_sha: "expected-sha",
  project_subpath: "book1/book/book/VinaBookStore",
};

test("Book1 source validation rejects fingerprint and inventory drift", () => {
  const failures = checkSourceOracle(
    { project_identity: identity, required_entities: [] },
    {
      fingerprint: "observed",
      files: {},
      paths: ["src/main/java/App.java", "src/test/java/AppTest.java"],
    },
  );
  assert(failures.some((failure) => failure.includes("fingerprint observed != declared")));
  assert(!failures.some((failure) => failure.includes("Java file count")));
});

test("Book1 pinned provenance rejects wrong SHA, subpath, and dirty checkout", () => {
  const failures = checkPinnedProvenance({ project_identity: identity }, {
    commit_sha: "wrong-sha",
    project_subpath: "wrong/project",
    worktree_clean: false,
  });
  assert(failures.some((failure) => failure.includes("Git SHA")));
  assert(failures.some((failure) => failure.includes("project subpath")));
  assert(failures.some((failure) => failure.includes("worktree is dirty")));
});

test("Book1 scorer directly rejects NO_MATCH plus NAVIGATION_SAFE", () => {
  const expected = {
    id: "no-match",
    request: { budget: 1000 },
    expected_status: "NO_MATCH",
    expected_entities_empty: true,
    required_safety: ["SOURCE_INSPECTION_REQUIRED"],
    forbidden_safety: ["NAVIGATION_SAFE"],
  };
  const response = {
    retrieval_status: "NO_MATCH",
    entities: [],
    safety_states: ["SOURCE_INSPECTION_REQUIRED", "NAVIGATION_SAFE"],
    response_budget_units: 100,
  };
  const result = scoreQuery(expected, response, 0);
  assert.equal(result.passed, false);
  assert(result.failures.includes("forbidden safety NAVIGATION_SAFE"));
  assert.equal(result.false_navigation_safe, true);
  assert.equal(isFalseNavigationSafe(response), true);
});

test("Book1 false-HIGH audit uses semantic identity instead of source line", () => {
  const graph = {
    entities: [
      { stable_id: "source", qualified_name: "demo.Source.run()", kind: "method", file_path: "Source.java" },
      { stable_id: "wrong", qualified_name: "demo.Wrong.call()", kind: "method", file_path: "Wrong.java" },
    ],
    relations: [{
      src_entity_id: "source",
      dst_entity_id: "wrong",
      unresolved_target: null,
      candidates: [],
      kind: "CALLS",
      confidence: "HIGH",
      source_location: { start_line: 999 },
    }],
    health: {
      impact_completeness: "INCOMPLETE",
      resolved_call_rate: 1,
      parse_failures: [],
      supported_file_coverage: 1,
      unsupported_file_count: 0,
    },
  };
  const oracle = {
    required_entities: [{ qualified_name: "demo.Source.run()", kind: "method", path: "Source.java" }],
    required_relations: [],
    entity_audit_scopes: [],
    relation_audit_scopes: [{
      source: "demo.Source.run()",
      kind: "CALLS",
      required_targets: ["demo.Expected.call()"],
      allowed_additional_targets: [],
    }],
  };
  const result = graphGate(graph, oracle);
  assert.equal(result.metrics.false_high_critical_edge_count, 1);
  assert.equal(result.metrics.audited_high_relation_precision, 0);
  assert.equal(result.metrics.audited_high_relation_recall, 0);
});

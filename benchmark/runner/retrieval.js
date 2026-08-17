import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { semanticExplore } from "../../src/query.js";
import { initializeProject } from "../../src/sync.js";
import { retrievalFixtures } from "../fixtures/retrieval/corpus.js";

const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const oraclePath = join(benchmarkRoot, "oracles", "retrieval.json");

async function writeFixture(files, oracle) {
  const root = await mkdtemp(join(tmpdir(), "codegraph-benchmark-"));
  const workspace = join(root, "workspace");
  const generatedOraclePath = join(root, "oracle.json");
  await mkdir(join(workspace, ".git"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(workspace, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  await writeFile(generatedOraclePath, `${JSON.stringify(oracle, null, 2)}\n`, "utf8");
  return {
    root,
    workspace,
    oraclePath: generatedOraclePath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function sourceDigests(workspace, files) {
  const entries = [];
  for (const path of Object.keys(files).sort()) {
    const digest = createHash("sha256")
      .update(await readFile(join(workspace, path)))
      .digest("hex");
    entries.push([path, digest]);
  }
  return entries;
}

function relationKey(relation) {
  return `${relation.source}\u0000${relation.kind}\u0000${relation.target}`;
}

function scoreCase(oracle, response, sourceUnchanged, durationMs) {
  const initial = response.entities.filter((entity) => entity.selection_origin === "QUERY_MATCH");
  const initialNames = initial.map((entity) => entity.qualified_name);
  const returnedNames = response.entities.map((entity) => entity.qualified_name);
  const returnedSet = new Set(returnedNames);
  const initialSet = new Set(initialNames);
  const relationSet = new Set(response.relations.map(relationKey));
  const relevant = new Set([
    ...(oracle.required_entities ?? []),
    ...(oracle.acceptable_entities ?? []),
  ]);
  const checks = [];
  const check = (condition, message) => {
    if (!condition) checks.push(message);
  };

  for (const entity of oracle.required_entities ?? []) {
    check(returnedSet.has(entity), `missing required entity ${entity}`);
  }
  for (const entity of oracle.forbidden_entities ?? []) {
    check(!initialSet.has(entity), `forbidden entity matched ${entity}`);
  }
  for (const relation of oracle.required_relations ?? []) {
    check(relationSet.has(relationKey(relation)), `missing relation ${relation.source} ${relation.kind} ${relation.target}`);
  }
  check(response.retrieval_status === oracle.expected_retrieval_status,
    `retrieval status ${response.retrieval_status} != ${oracle.expected_retrieval_status}`);
  if (oracle.expected_entities_empty) check(response.entities.length === 0, "entities must be empty");
  if (oracle.expected_relations_empty) check(response.relations.length === 0, "relations must be empty");
  if (oracle.expected_first_entity) {
    check(initialNames[0] === oracle.expected_first_entity,
      `first entity ${initialNames[0] ?? "NONE"} != ${oracle.expected_first_entity}`);
  }
  if (oracle.expected_impact) {
    check(response.completeness?.impact === oracle.expected_impact,
      `impact ${response.completeness?.impact} != ${oracle.expected_impact}`);
  }
  for (const state of oracle.required_safety_states ?? []) {
    check(response.safety_states.includes(state), `missing safety state ${state}`);
  }
  for (const state of oracle.forbidden_safety_states ?? []) {
    check(!response.safety_states.includes(state), `forbidden safety state ${state}`);
  }
  for (const risk of oracle.required_risks ?? []) {
    check(response.unresolved_areas.includes(risk), `missing risk ${risk}`);
  }
  for (const evidence of oracle.required_evidence ?? []) {
    check(response.retrieval_evidence.includes(evidence), `missing evidence ${evidence}`);
  }
  check(sourceUnchanged, "fixture source changed during indexing/retrieval");
  check(initial.every((entity) => Array.isArray(entity.match_evidence) && entity.match_evidence.length > 0),
    "initial entity lacks retrieval evidence");

  const firstFive = initialNames.slice(0, 5);
  const precisionAt = (limit) => {
    const values = initialNames.slice(0, limit);
    return values.length === 0 ? (relevant.size === 0 ? 1 : 0) : values.filter((name) => relevant.has(name)).length / values.length;
  };
  const required = oracle.required_entities ?? [];
  const recallAt5 = required.length === 0
    ? 1
    : required.filter((name) => firstFive.includes(name) || returnedSet.has(name)).length / required.length;
  const forbidden = new Set(oracle.forbidden_entities ?? []);
  const wrongMatches = initialNames.filter((name) => forbidden.has(name)).length;
  const expectedNoMatch = oracle.expected_retrieval_status === "NO_MATCH";
  const falseSafe = ["NO_MATCH", "WEAK"].includes(oracle.expected_retrieval_status)
    && (!response.safety_states.includes("SOURCE_INSPECTION_REQUIRED")
      || response.safety_states.includes("NAVIGATION_SAFE"));

  return {
    id: oracle.id,
    passed: checks.length === 0,
    failures: checks,
    retrieval_status: response.retrieval_status,
    returned_entities: returnedNames,
    initial_matches: initialNames,
    precision_at_1: precisionAt(1),
    precision_at_5: precisionAt(5),
    recall_at_5: recallAt5,
    wrong_region_matches: wrongMatches,
    false_no_match: !expectedNoMatch && response.retrieval_status === "NO_MATCH",
    false_match: expectedNoMatch && (response.retrieval_status !== "NO_MATCH" || initialNames.length > 0),
    false_navigation_safe: falseSafe,
    response_budget_units: response.response_budget_units,
    duration_ms: Number(durationMs.toFixed(3)),
    source_unchanged: sourceUnchanged,
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function markdown(result) {
  const lines = [
    "# Retrieval benchmark",
    "",
    `Status: **${result.status}**`,
    "",
    `Cases: ${result.summary.passed_cases}/${result.summary.case_count} passed`,
    `Precision@1: ${result.metrics.precision_at_1.toFixed(3)}`,
    `Precision@5: ${result.metrics.precision_at_5.toFixed(3)}`,
    `Recall@5: ${result.metrics.recall_at_5.toFixed(3)}`,
    `False NO_MATCH: ${result.metrics.false_no_match_count}`,
    `False MATCH: ${result.metrics.false_match_count}`,
    `False NAVIGATION_SAFE: ${result.metrics.false_navigation_safe_count}`,
    `Wrong-region matches: ${result.metrics.wrong_region_match_count}`,
    "",
    "| Case | Status | Retrieval | Failures |",
    "| --- | --- | --- | --- |",
  ];
  for (const caseResult of result.cases) {
    lines.push(`| ${caseResult.id} | ${caseResult.passed ? "PASS" : "FAIL"} | ${caseResult.retrieval_status} | ${caseResult.failures.join("; ") || "-"} |`);
  }
  return `${lines.join("\n")}\n`;
}

export async function runRetrievalBenchmark({ writeResults = true } = {}) {
  const oracleDocument = JSON.parse(await readFile(oraclePath, "utf8"));
  const results = [];
  for (const oracle of oracleDocument.cases) {
    const files = retrievalFixtures[oracle.fixture];
    if (!files) throw new Error(`Unknown retrieval fixture: ${oracle.fixture}`);
    const fixture = await writeFixture(files, oracle);
    try {
      const persistedOracle = JSON.parse(await readFile(fixture.oraclePath, "utf8"));
      if (JSON.stringify(persistedOracle) !== JSON.stringify(oracle)) {
        throw new Error(`Oracle changed before CodeGraph execution: ${oracle.id}`);
      }
      const before = await sourceDigests(fixture.workspace, files);
      await initializeProject(fixture.workspace);
      const started = performance.now();
      const response = await semanticExplore(fixture.workspace, oracle.request);
      const durationMs = performance.now() - started;
      const after = await sourceDigests(fixture.workspace, files);
      results.push(scoreCase(oracle, response, JSON.stringify(before) === JSON.stringify(after), durationMs));
    } finally {
      await fixture.cleanup();
    }
  }

  const metrics = {
    precision_at_1: mean(results.map((result) => result.precision_at_1)),
    precision_at_5: mean(results.map((result) => result.precision_at_5)),
    recall_at_5: mean(results.map((result) => result.recall_at_5)),
    false_no_match_count: results.filter((result) => result.false_no_match).length,
    false_match_count: results.filter((result) => result.false_match).length,
    false_navigation_safe_count: results.filter((result) => result.false_navigation_safe).length,
    wrong_region_match_count: results.reduce((sum, result) => sum + result.wrong_region_matches, 0),
  };
  const result = {
    schema_version: 1,
    benchmark: "deterministic-retrieval",
    generated_at: new Date().toISOString(),
    status: results.every((caseResult) => caseResult.passed)
      && metrics.false_navigation_safe_count === 0
      ? "PASS"
      : "FAIL",
    summary: {
      case_count: results.length,
      passed_cases: results.filter((caseResult) => caseResult.passed).length,
    },
    metrics,
    cases: results,
  };

  if (writeResults) {
    const resultsDirectory = join(benchmarkRoot, "results");
    await mkdir(resultsDirectory, { recursive: true });
    await writeFile(join(resultsDirectory, "latest.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await writeFile(join(resultsDirectory, "latest.md"), markdown(result), "utf8");
  }
  return result;
}

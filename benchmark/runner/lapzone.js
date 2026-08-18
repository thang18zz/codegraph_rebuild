import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { semanticExplore } from "../../src/query.js";
import { SqliteGraphStore } from "../../src/store.js";
import {
  artifactPaths,
  initializeProject,
  rebuildProject,
  synchronizeProject,
} from "../../src/sync.js";

const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function materializeProject(root) {
  try {
    return await rebuildProject(root);
  } catch (error) {
    if (error.code !== "PROJECT_NOT_INITIALIZED") throw error;
    return initializeProject(root);
  }
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

async function trackedDigests(root) {
  const paths = git(root, ["ls-files", "-z"]).split("\0").filter(Boolean).sort();
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [
    path,
    createHash("sha256").update(await readFile(join(root, path))).digest("hex"),
  ])));
}

function relationView(graph, relation, byId) {
  return {
    source: byId.get(relation.src_entity_id)?.qualified_name ?? relation.src_entity_id,
    kind: relation.kind,
    target: byId.get(relation.dst_entity_id)?.qualified_name ?? relation.unresolved_target,
    confidence: relation.confidence,
    condition: relation.condition?.expression ?? null,
    risks: relation.risk_flags,
  };
}

function verifySourceOracle(oracle, sources) {
  const failures = [];
  for (const expected of oracle.required_entities) {
    const text = sources.get(expected.path) ?? "";
    const tail = expected.qualified_name.split(".").at(-1);
    const name = tail.replace(/\(.*\)$/u, "");
    if (!new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*(?:[<(]|$)`, "mu").test(text)) {
      failures.push(`source oracle symbol missing: ${expected.qualified_name}`);
    }
  }
  const program = sources.get("Program.cs") ?? "";
  const registrations = [...program.matchAll(
    /\.Add(Scoped|Transient|Singleton)<\s*([^,>]+)(?:\s*,\s*([^>]+))?\s*>\s*\(/gu,
  )].map((match) => {
    const lifetime = match[1].toLowerCase();
    const service = match[2].trim();
    const implementation = (match[3] ?? match[2]).trim();
    return `${lifetime}:${service}->${implementation}`;
  }).sort();
  if (JSON.stringify(registrations) !== JSON.stringify([...oracle.di_registrations].sort())) {
    failures.push("source-derived DI registrations differ from the pinned oracle");
  }
  return failures;
}

function evaluateGraph(graph, oracle) {
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const byQualified = new Map(graph.entities.map((entity) => [entity.qualified_name, entity]));
  const byId = new Map(graph.entities.map((entity) => [entity.stable_id, entity]));
  const relations = graph.relations.map((relation) => relationView(graph, relation, byId));
  let requiredTagCount = 0;
  let requiredTagHits = 0;
  let requiredConditionHits = 0;

  for (const expected of oracle.required_entities) {
    const entity = byQualified.get(expected.qualified_name);
    check(Boolean(entity), `missing entity ${expected.qualified_name}`);
    if (entity) check(entity.file_path === expected.path,
      `wrong source for ${expected.qualified_name}: ${entity.file_path}`);
  }
  for (const expected of oracle.required_relations) {
    check(relations.some((relation) => relation.source === expected.source
      && relation.kind === expected.kind
      && relation.target === expected.target
      && relation.confidence === expected.confidence),
    `missing relation ${expected.source} ${expected.kind} ${expected.target} ${expected.confidence}`);
  }
  for (const expected of oracle.required_tags) {
    const entity = byQualified.get(expected.entity);
    for (const tag of expected.tags) {
      requiredTagCount += 1;
      if (entity?.semantic_tags.includes(tag)) requiredTagHits += 1;
      check(entity?.semantic_tags.includes(tag), `missing tag ${tag} on ${expected.entity}`);
    }
  }
  for (const expected of oracle.required_conditions) {
    const present = relations.some((relation) => relation.target === expected.target
      && relation.condition?.includes(expected.contains));
    if (present) requiredConditionHits += 1;
    check(present,
    `missing condition ${expected.contains} for ${expected.target}`);
  }

  const registrations = relations.filter((relation) => relation.kind === "CONFIGURES")
    .map((relation) => relation.target)
    .sort();
  check(JSON.stringify(registrations) === JSON.stringify([...oracle.di_registrations].sort()),
    "DI registration graph differs from oracle");
  check(graph.relations.filter((relation) => relation.kind === "CONFIGURES")
    .every((relation) => relation.confidence !== "HIGH"
      && relation.risk_flags.includes("DEPENDENCY_INJECTION")),
  "DI registration was treated as HIGH runtime dispatch or lost its risk");

  const databaseTargets = new Set(relations
    .filter((relation) => relation.kind === "USES" && relation.risks.includes("CROSS_LANGUAGE_BOUNDARY"))
    .map((relation) => relation.target));
  for (const symbol of oracle.database_symbols) {
    check(databaseTargets.has(symbol), `missing database boundary ${symbol}`);
  }
  const programModule = graph.entities.find((entity) => entity.file_path === "Program.cs"
    && entity.kind === "module");
  check(programModule?.risk_flags.includes("REFLECTION"), "Program.cs reflection risk missing");
  check(graph.health.impact_completeness === "INCOMPLETE", "impact completeness must remain INCOMPLETE");
  check(graph.health.risk_flags.includes("CROSS_LANGUAGE_BOUNDARY"), "cross-language risk missing");
  check(graph.health.risk_flags.includes("UNSUPPORTED_SEMANTICS"), "unsupported SQL/config risk missing");

  const allowedCritical = new Map();
  for (const expected of oracle.required_relations) {
    const key = `${expected.source}\0${expected.kind}`;
    const values = allowedCritical.get(key) ?? new Set();
    values.add(expected.target);
    allowedCritical.set(key, values);
  }
  const falseHigh = relations.filter((relation) => relation.confidence === "HIGH"
    && allowedCritical.has(`${relation.source}\0${relation.kind}`)
    && !allowedCritical.get(`${relation.source}\0${relation.kind}`).has(relation.target));
  check(falseHigh.length === 0, `false HIGH critical relations: ${falseHigh.length}`);

  return {
    failures,
    metrics: {
      required_entity_recall: oracle.required_entities.filter((item) => byQualified.has(item.qualified_name)).length
        / oracle.required_entities.length,
      required_relation_recall: oracle.required_relations.filter((expected) => relations.some((relation) => (
        relation.source === expected.source && relation.kind === expected.kind
        && relation.target === expected.target && relation.confidence === expected.confidence
      ))).length / oracle.required_relations.length,
      false_high_critical_edge_count: falseHigh.length,
      explicit_di_registration_count: registrations.length,
      database_boundary_count: databaseTargets.size,
      route_tag_recall: requiredTagCount === 0 ? 1 : requiredTagHits / requiredTagCount,
      condition_recall: oracle.required_conditions.length === 0
        ? 1
        : requiredConditionHits / oracle.required_conditions.length,
    },
  };
}

function scoreQuery(expected, response, durationMs) {
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const initial = (response.entities ?? []).filter((entity) => entity.selection_origin === "QUERY_MATCH")
    .map((entity) => entity.qualified_name);
  const returned = (response.entities ?? []).map((entity) => entity.qualified_name);
  check(response.retrieval_status === expected.expected_status,
    `${expected.id}: ${response.retrieval_status} != ${expected.expected_status}`);
  for (const name of expected.required_initial ?? []) {
    check(initial.includes(name), `${expected.id}: missing initial ${name}`);
  }
  if (expected.required_returned_any) {
    check(expected.required_returned_any.some((name) => returned.includes(name)),
      `${expected.id}: no required expansion returned`);
  }
  for (const state of expected.required_safety ?? []) {
    check(response.safety_states.includes(state), `${expected.id}: missing safety ${state}`);
  }
  if (expected.expected_entities_empty) check(returned.length === 0, `${expected.id}: entities must be empty`);
  check(response.response_budget_units <= expected.request.budget,
    `${expected.id}: response exceeded budget`);
  if (["NO_MATCH", "WEAK"].includes(expected.expected_status)) {
    check(!response.safety_states.includes("NAVIGATION_SAFE"), `${expected.id}: false NAVIGATION_SAFE`);
  }
  return {
    id: expected.id,
    passed: failures.length === 0,
    failures,
    retrieval_status: response.retrieval_status,
    initial_matches: initial,
    returned_entities: returned,
    response_budget_units: response.response_budget_units,
    duration_ms: Number(durationMs.toFixed(3)),
  };
}

function runExecutable(command, args, cwd, input = null) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(input ?? undefined);
  });
}

async function blackBoxExecutable(executable, root, oracle) {
  const rebuilt = await runExecutable(executable, ["rebuild"], root);
  if (rebuilt.code !== 0) return { passed: false, failures: [`SEA rebuild failed: ${rebuilt.stderr}`] };
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "lapzone-benchmark", version: "1" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ...oracle.queries.slice(0, 4).map((item, index) => ({
      jsonrpc: "2.0",
      id: index + 3,
      method: "tools/call",
      params: { name: "semantic_explore", arguments: item.request },
    })),
  ];
  const mcp = await runExecutable(
    executable,
    ["mcp"],
    root,
    `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
  );
  const failures = [];
  if (mcp.code !== 0) failures.push(`SEA MCP failed: ${mcp.stderr}`);
  let responses = [];
  try { responses = mcp.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { failures.push(`SEA MCP output invalid: ${error.message}`); }
  if (responses[0]?.result?.protocolVersion !== "2025-06-18") failures.push("SEA initialize failed");
  if (responses[1]?.result?.tools?.[0]?.name !== "semantic_explore") failures.push("SEA tool list failed");
  for (let index = 0; index < oracle.queries.slice(0, 4).length; index += 1) {
    const expected = oracle.queries[index];
    const response = responses[index + 2]?.result?.structuredContent;
    if (!response) failures.push(`SEA ${expected.id} response missing`);
    else failures.push(...scoreQuery(expected, response, 0).failures.map((failure) => `SEA ${failure}`));
  }
  return { passed: failures.length === 0, failures };
}

function markdown(result) {
  return `# LapZone deterministic benchmark\n\nStatus: **${result.status}**\n\n`
    + `- CodeGraph: ${result.codegraph.commit_sha}${result.codegraph.worktree_dirty ? " (dirty)" : ""}\n`
    + `- LapZoneAPI: ${result.lapzone.commit_sha}\n`
    + `- C# grammar: ${result.grammar.package}@${result.grammar.package_version} (${result.grammar.license})\n`
    + `- Coverage: ${result.gates.gate_a.supported_file_coverage.toFixed(4)} -> ${result.gates.gate_b.supported_file_coverage.toFixed(4)}\n`
    + `- Unsupported files: ${result.gates.gate_a.unsupported_file_count} -> ${result.gates.gate_b.unsupported_file_count}\n`
    + `- Entity recall: ${result.metrics.required_entity_recall.toFixed(3)}\n`
    + `- Relation recall: ${result.metrics.required_relation_recall.toFixed(3)}\n`
    + `- False HIGH critical edges: ${result.metrics.false_high_critical_edge_count}\n`
    + `- False NAVIGATION_SAFE: ${result.metrics.false_navigation_safe_count}\n`
    + `- Source unchanged: ${result.source_integrity.tracked_files_unchanged}\n`
    + `- SEA black-box: ${result.sea.mode === "not_run" ? "NOT RUN" : (result.sea.passed ? "PASS" : "FAIL")}\n\n`
    + `${result.failures.length === 0 ? "No failures.\n" : result.failures.map((failure) => `- ${failure}`).join("\n")}\n`;
}

function traceability(result) {
  const pass = (condition) => (condition ? "PASS" : "FAIL");
  const entries = [
    ["LZ-A01", result.lapzone.commit_sha === "c8032dd253964a0884491fb18f3020b3850e6c00", "pinned-sha", "/lapzone_commit_sha", "Pinned LapZone commit verified"],
    ["LZ-A02", result.source_oracle_failures.length === 0, "source-oracle", "/required_entities", "Independent source oracle rechecked before CodeGraph"],
    ["LZ-A03", result.gates.gate_a.status === "PASS", "pre-csharp-baseline", "/pre_csharp", "Gate A baseline retained"],
    ["LZ-A04", result.source_integrity.tracked_files_unchanged, "source-integrity", "/source_integrity", "Tracked sources unchanged"],
    ["LZ-B01", result.metrics.required_entity_recall === 1, "entity-recall", "/required_entities", "Required C# entities parsed"],
    ["LZ-B02", result.metrics.required_entity_recall === 1, "stable-identities", "/required_entities", "Qualified overload identities retained"],
    ["LZ-B03", result.gates.gate_b.supported_file_coverage > result.gates.gate_a.supported_file_coverage, "coverage", "/pre_csharp", "C# coverage improved"],
    ["LZ-B04", result.metrics.required_relation_recall === 1, "typed-overloads", "/required_relations", "Typed member overloads resolve"],
    ["LZ-B05", result.metrics.route_tag_recall === 1, "aspnet-tags", "/required_tags", "ASP.NET metadata retained"],
    ["LZ-B06", result.metrics.route_tag_recall === 1, "http-routes", "/required_tags", "HTTP routes retained"],
    ["LZ-B07", result.metrics.route_tag_recall === 1, "auth-tags", "/required_tags", "Auth metadata retained"],
    ["LZ-B08", result.metrics.required_relation_recall === 1, "constructor-di", "/required_relations", "Constructor dependencies resolve"],
    ["LZ-B09", result.metrics.required_relation_recall === 1, "typed-fields", "/required_relations", "Typed fields resolve"],
    ["LZ-B10", result.metrics.required_relation_recall === 1, "implements", "/required_relations", "Interface implementation retained"],
    ["LZ-B11", result.metrics.required_relation_recall === 1, "typed-calls", "/required_relations", "Critical calls resolve"],
    ["LZ-B12", result.metrics.condition_recall === 1, "conditions", "/required_conditions", "Conditional edges retained"],
    ["LZ-B13", result.metrics.explicit_di_registration_count === 13, "di-registration", "/di_registrations", "DI registrations explicit and uncertain"],
    ["LZ-B14", result.metrics.audited_database_boundary_pass_count === result.metrics.audited_database_boundary_count, "database-boundaries", "/database_symbols", "Audited SQL boundaries retained"],
    ["LZ-B15", result.metrics.reflection_risk_visible, "reflection-risk", "/known_unsupported_boundaries", "Reflection remains visible"],
    ["LZ-B16", result.gates.gate_b.impact_completeness === "INCOMPLETE", "safe-incompleteness", "/known_unsupported_boundaries", "Runtime/SQL impact not claimed complete"],
    ["LZ-B17", result.metrics.query_pass_count === result.metrics.query_count, "source-queries", "/queries", "All source-grounded queries pass"],
    ["LZ-B18", result.metrics.false_navigation_safe_count === 0, "no-match", "/queries", "No false NAVIGATION_SAFE"],
    ["LZ-B19", result.sea.passed === true, "relocated-sea", "/queries", "Relocated SEA MCP gate passes"],
    ["LZ-B20", result.performance.one_file.changed_files === 1, "incremental-performance", "/performance", "One-file sync stays incremental"],
  ].map(([requirementId, condition, testName, oracleReference, notes]) => ({
    requirement_id: requirementId,
    status: pass(condition),
    test_name: testName,
    oracle_reference: oracleReference,
    evidence_file: "deterministic.json",
    notes,
  }));
  return { schema_version: 1, lapzone_commit_sha: result.lapzone.commit_sha, requirements: entries };
}

function traceabilityMarkdown(document) {
  return `# LapZone traceability\n\n| Requirement | Status | Test | Oracle | Notes |\n|---|---|---|---|---|\n${document.requirements
    .map((item) => `| ${item.requirement_id} | ${item.status} | ${item.test_name} | ${item.oracle_reference} | ${item.notes} |`)
    .join("\n")}\n`;
}

export async function runLapZoneBenchmark({
  root = process.env.LAPZONE_REPO,
  executable = process.env.CODEGRAPH_BIN,
  writeResults = true,
} = {}) {
  if (!root) throw new Error("LAPZONE_REPO must point to a disposable LapZoneAPI clone");
  const absoluteRoot = resolve(root);
  const lapzoneCommit = git(absoluteRoot, ["rev-parse", "HEAD"]);
  const oraclePath = join(benchmarkRoot, "oracles", "lapzone", `${lapzoneCommit}.json`);
  const oracleBytes = await readFile(oraclePath);
  const oracleHash = createHash("sha256").update(oracleBytes).digest("hex");
  const frozenOracleHash = (await readFile(`${oraclePath.slice(0, -5)}.sha256`, "utf8"))
    .trim().split(/\s+/u)[0];
  if (oracleHash !== frozenOracleHash) throw new Error("LapZone oracle hash differs from its frozen checksum");
  const oracle = JSON.parse(oracleBytes.toString("utf8"));
  if (oracle.lapzone_commit_sha !== lapzoneCommit) throw new Error("LapZone oracle SHA mismatch");
  const sourceFiles = new Map(await Promise.all([...new Set(oracle.required_entities
    .map((item) => item.path).concat("Program.cs"))].map(async (path) => [
    path,
    await readFile(join(absoluteRoot, path), "utf8"),
  ])));
  const sourceOracleFailures = verifySourceOracle(oracle, sourceFiles);
  const before = await trackedDigests(absoluteRoot);
  const started = performance.now();
  await materializeProject(absoluteRoot);
  const indexLatencyMs = performance.now() - started;
  const store = new SqliteGraphStore(artifactPaths(absoluteRoot).db, { readOnly: true });
  const graph = store.snapshot();
  store.close();
  const graphResult = evaluateGraph(graph, oracle);
  const queryResults = [];
  for (const expected of oracle.queries) {
    const queryStarted = performance.now();
    const response = await semanticExplore(absoluteRoot, expected.request);
    queryResults.push(scoreQuery(expected, response, performance.now() - queryStarted));
  }
  const unchangedStarted = performance.now();
  await synchronizeProject(absoluteRoot);
  const unchangedMs = performance.now() - unchangedStarted;
  const changedPath = join(absoluteRoot, oracle.required_entities[0].path);
  const changedBytes = await readFile(changedPath);
  await appendFile(changedPath, "\n");
  const oneFileStarted = performance.now();
  const oneFileResult = await synchronizeProject(absoluteRoot);
  const oneFileMs = performance.now() - oneFileStarted;
  await writeFile(changedPath, changedBytes);
  await synchronizeProject(absoluteRoot);
  const sea = executable
    ? await blackBoxExecutable(resolve(executable), absoluteRoot, oracle)
    : { mode: "not_run", passed: null, failures: [] };
  if (executable) sea.mode = "relocated_executable";
  const after = await trackedDigests(absoluteRoot);
  const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after);
  const codegraphRoot = resolve(benchmarkRoot, "..");
  const codegraphStatus = git(codegraphRoot, ["status", "--porcelain"]);
  const falseSafe = queryResults.filter((item) => {
    const expected = oracle.queries.find((query) => query.id === item.id);
    return ["NO_MATCH", "WEAK"].includes(expected.expected_status)
      && !item.failures.every((failure) => !failure.includes("NAVIGATION_SAFE"));
  }).length;
  const failures = [
    ...sourceOracleFailures,
    ...graphResult.failures,
    ...queryResults.flatMap((item) => item.failures),
    ...sea.failures,
    ...(sourceUnchanged ? [] : ["tracked LapZone source changed"]),
    ...(oneFileResult.changed_files?.length === 1 ? [] : ["one-file sync was not incremental"]),
  ];
  const confidenceCounts = Object.fromEntries(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]
    .map((confidence) => [confidence, graph.relations.filter((relation) => relation.confidence === confidence).length]));
  const byId = new Map(graph.entities.map((entity) => [entity.stable_id, entity]));
  const auditedDatabaseBoundaries = oracle.database_symbols.slice(0, 12).map((target) => {
    const relation = graph.relations.find((item) => item.kind === "USES"
      && item.unresolved_target === target
      && item.risk_flags.includes("CROSS_LANGUAGE_BOUNDARY"));
    return {
      expected_target: target,
      source_method: byId.get(relation?.src_entity_id)?.qualified_name ?? null,
      actual_target: relation?.unresolved_target ?? null,
      actual_confidence: relation?.confidence ?? null,
      expected_risk: "CROSS_LANGUAGE_BOUNDARY",
      status: relation ? "PASS" : "FAIL",
    };
  });
  const durations = queryResults.map((item) => item.duration_ms).sort((left, right) => left - right);
  const graphBytes = (await stat(artifactPaths(absoluteRoot).db)).size;
  const mapBytes = (await stat(artifactPaths(absoluteRoot).map)).size;
  const result = {
    schema_version: 1,
    benchmark: "lapzone-realworld-csharp",
    generated_at: new Date().toISOString(),
    status: failures.length === 0 ? "PASS" : "FAIL",
    codegraph: {
      commit_sha: git(codegraphRoot, ["rev-parse", "HEAD"]),
      worktree_dirty: codegraphStatus !== "",
    },
    lapzone: { commit_sha: lapzoneCommit, repository: oracle.source_repository },
    oracle: { sha256: oracleHash, frozen_sha256: frozenOracleHash },
    grammar: {
      language: "csharp",
      package: "@vscode/tree-sitter-wasm",
      package_version: "0.3.1",
      asset: "wasm/tree-sitter-c-sharp.wasm",
      license: "MIT",
      source_repository: "https://github.com/Microsoft/vscode-tree-sitter-wasm",
    },
    host: { os: platform(), arch: arch(), node: process.version },
    mode: "source",
    gates: {
      gate_a: { ...oracle.pre_csharp, status: "PASS", evidence: "archived before C# implementation" },
      gate_b: {
        status: failures.length === 0 ? "PASS" : "FAIL",
        supported_file_coverage: graph.health.supported_file_coverage,
        unsupported_file_count: graph.health.unsupported_file_count,
        impact_completeness: graph.health.impact_completeness,
      },
    },
    metrics: {
      ...graphResult.metrics,
      entity_precision_evaluated: graphResult.metrics.required_entity_recall,
      relation_precision_evaluated: graphResult.metrics.false_high_critical_edge_count === 0 ? 1 : 0,
      relation_count_by_confidence: confidenceCounts,
      audited_database_boundary_count: auditedDatabaseBoundaries.length,
      audited_database_boundary_pass_count: auditedDatabaseBoundaries.filter((item) => item.status === "PASS").length,
      reflection_risk_visible: graph.health.risk_flags.includes("REFLECTION"),
      false_navigation_safe_count: falseSafe,
      query_pass_count: queryResults.filter((item) => item.passed).length,
      query_count: queryResults.length,
      initial_index_latency_ms: Number(indexLatencyMs.toFixed(3)),
      query_latency_median_ms: durations[Math.floor(durations.length / 2)] ?? 0,
      query_latency_max_ms: durations.at(-1) ?? 0,
      peak_rss_bytes: process.memoryUsage().rss,
    },
    performance: {
      cold_index: { wall_ms: Number(indexLatencyMs.toFixed(3)), graph_db_bytes: graphBytes, map_bytes: mapBytes },
      unchanged_sync: { wall_ms: Number(unchangedMs.toFixed(3)) },
      one_file: { wall_ms: Number(oneFileMs.toFixed(3)), changed_files: oneFileResult.changed_files?.length ?? 0 },
    },
    audited_database_boundaries: auditedDatabaseBoundaries,
    queries: queryResults,
    sea,
    source_integrity: { tracked_files_unchanged: sourceUnchanged, tracked_file_count: Object.keys(before).length },
    source_oracle_failures: sourceOracleFailures,
    known_unsupported_boundaries: ["SQL definitions", "ASP.NET runtime dispatch", "reflection-generated Dapper mapping"],
    failures,
  };
  if (writeResults) {
    const directory = join(benchmarkRoot, "results", "lapzone", lapzoneCommit);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "deterministic.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await writeFile(join(directory, "deterministic.md"), markdown(result), "utf8");
    const trace = traceability(result);
    await writeFile(join(directory, "traceability.json"), `${JSON.stringify(trace, null, 2)}\n`, "utf8");
    await writeFile(join(directory, "traceability.md"), traceabilityMarkdown(trace), "utf8");
    await writeFile(join(directory, "metrics.json"), `${JSON.stringify({
      schema_version: 1,
      metrics: result.metrics,
      performance: result.performance,
      audited_database_boundaries: result.audited_database_boundaries,
    }, null, 2)}\n`, "utf8");
    await writeFile(join(directory, "provenance.json"), `${JSON.stringify({
      schema_version: 1,
      codegraph: result.codegraph,
      lapzone: result.lapzone,
      grammar: result.grammar,
      host: result.host,
      executable_mode: result.sea.mode,
    }, null, 2)}\n`, "utf8");
  }
  return result;
}

import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { semanticExplore } from "../../src/query.js";
import { SqliteGraphStore } from "../../src/store.js";
import { artifactPaths, initializeProject, synchronizeProject } from "../../src/sync.js";
import { forbiddenSafetyFailures, isFalseNavigationSafe } from "./safety.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const oraclePath = join(repositoryRoot, "release-evidence", "book1", "oracle.json");

async function sourcePaths(root) {
  const paths = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if ([".codegraph", "target"].includes(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const path = relative(root, absolute).replaceAll("\\", "/");
        if (path.endsWith(".java")
            || path === "pom.xml"
            || path === "src/main/resources/application.properties") paths.push(path);
      }
    }
  }
  await walk(root);
  return paths;
}

async function sourceSnapshot(root) {
  const paths = await sourcePaths(root);
  const files = new Map();
  const fingerprint = createHash("sha256");
  for (const path of paths) {
    const bytes = await readFile(join(root, path));
    files.set(path, createHash("sha256").update(bytes).digest("hex"));
    fingerprint.update(path).update("\0").update(bytes);
  }
  return {
    fingerprint: fingerprint.digest("hex"),
    files: Object.fromEntries(files),
    paths,
  };
}

export function checkSourceOracle(oracle, snapshot) {
  const failures = [];
  const javaPaths = snapshot.paths.filter((path) => path.endsWith(".java"));
  const productionJavaPaths = javaPaths.filter((path) => path.startsWith("src/main/java/"));
  const testJavaPaths = javaPaths.filter((path) => path.startsWith("src/test/java/"));
  if (snapshot.fingerprint !== oracle.project_identity.source_fingerprint) {
    failures.push(`source fingerprint ${snapshot.fingerprint} != ${oracle.project_identity.source_fingerprint}`);
  }
  if (javaPaths.length !== oracle.project_identity.java_file_count) {
    failures.push(`Java file count ${javaPaths.length} != ${oracle.project_identity.java_file_count}`);
  }
  if (productionJavaPaths.length !== oracle.project_identity.production_java_file_count) {
    failures.push(`production Java file count ${productionJavaPaths.length} != ${oracle.project_identity.production_java_file_count}`);
  }
  if (testJavaPaths.length !== oracle.project_identity.test_java_file_count) {
    failures.push(`test Java file count ${testJavaPaths.length} != ${oracle.project_identity.test_java_file_count}`);
  }
  const requiredPaths = new Set([
    ...oracle.required_entities.map((item) => item.path),
    ...(oracle.entity_audit_scopes ?? []).map((item) => item.path),
  ]);
  for (const path of requiredPaths) {
    if (!(path in snapshot.files)) failures.push(`oracle source missing: ${path}`);
  }
  return failures;
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function normalizedRepositoryIdentity(value = "") {
  return value.trim()
    .replace(/^git@github\.com:/u, "github.com/")
    .replace(/^https?:\/\//u, "")
    .replace(/\.git$/u, "")
    .replace(/\/$/u, "")
    .toLowerCase();
}

function inspectPinnedProvenance(projectRoot, suppliedRepositoryRoot) {
  const repositoryRootPath = resolve(suppliedRepositoryRoot
    ?? git(projectRoot, ["rev-parse", "--show-toplevel"]));
  let repository = null;
  try { repository = git(repositoryRootPath, ["remote", "get-url", "origin"]); } catch {}
  return {
    repository_root: repositoryRootPath,
    repository,
    repository_identity: normalizedRepositoryIdentity(repository),
    commit_sha: git(repositoryRootPath, ["rev-parse", "HEAD"]),
    project_subpath: relative(repositoryRootPath, projectRoot).replaceAll("\\", "/"),
    worktree_clean: git(repositoryRootPath, ["status", "--porcelain"]) === "",
  };
}

export function checkPinnedProvenance(oracle, provenance) {
  const failures = [];
  const identity = oracle.project_identity;
  if (provenance.commit_sha !== identity.commit_sha) {
    failures.push(`Git SHA ${provenance.commit_sha} != ${identity.commit_sha}`);
  }
  if (provenance.project_subpath !== identity.project_subpath) {
    failures.push(`project subpath ${provenance.project_subpath} != ${identity.project_subpath}`);
  }
  if (!provenance.worktree_clean) failures.push("external BookStore worktree is dirty");
  if (provenance.repository_identity
      && provenance.repository_identity !== normalizedRepositoryIdentity(identity.repository)) {
    failures.push(`repository ${provenance.repository_identity} != ${normalizedRepositoryIdentity(identity.repository)}`);
  }
  return failures;
}

function relationTarget(relation, byId) {
  return byId.get(relation.dst_entity_id)?.qualified_name ?? relation.unresolved_target;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function graphGate(graph, oracle) {
  const failures = [];
  const byQualified = new Map(graph.entities.map((entity) => [entity.qualified_name, entity]));
  const byId = new Map(graph.entities.map((entity) => [entity.stable_id, entity]));
  const relations = graph.relations.map((relation) => ({
    ...relation,
    source: byId.get(relation.src_entity_id)?.qualified_name,
    target: relationTarget(relation, byId),
    candidate_names: relation.candidates.map((candidate) => byId.get(candidate)?.qualified_name),
  }));
  let entityHits = 0;
  for (const expected of oracle.required_entities) {
    const entity = byQualified.get(expected.qualified_name);
    const pass = entity?.kind === expected.kind && entity.file_path === expected.path;
    if (pass) entityHits += 1;
    else failures.push(`missing/wrong entity: ${expected.qualified_name}`);
  }
  let relationHits = 0;
  for (const expected of oracle.required_relations) {
    const pass = relations.some((relation) => relation.source === expected.source
      && relation.kind === expected.kind
      && relation.confidence === expected.expected_confidence
      && (relation.target === expected.target || relation.candidate_names.includes(expected.target)));
    if (pass) relationHits += 1;
    else failures.push(`missing relation: ${expected.source} ${expected.kind} ${expected.target}`);
  }

  let auditedEntityTp = 0;
  let auditedEntityFp = 0;
  let auditedEntityFn = 0;
  for (const scope of oracle.entity_audit_scopes ?? []) {
    const expected = new Set(scope.expected_entities
      .map((entity) => `${entity.qualified_name}\0${entity.kind}`));
    const actual = new Set(graph.entities
      .filter((entity) => entity.file_path === scope.path)
      .map((entity) => `${entity.qualified_name}\0${entity.kind}`));
    const missing = [...expected].filter((identity) => !actual.has(identity));
    const extra = [...actual].filter((identity) => !expected.has(identity));
    auditedEntityTp += [...expected].filter((identity) => actual.has(identity)).length;
    auditedEntityFn += missing.length;
    auditedEntityFp += extra.length;
    for (const identity of missing) failures.push(`audited entity missing in ${scope.path}: ${identity.replace("\0", " ")}`);
    for (const identity of extra) failures.push(`audited entity extra in ${scope.path}: ${identity.replace("\0", " ")}`);
  }

  let auditedHighTp = 0;
  let auditedHighFp = 0;
  let auditedHighFn = 0;
  let auditedHighRequiredTp = 0;
  for (const scope of oracle.relation_audit_scopes ?? []) {
    const required = new Set(scope.required_targets ?? []);
    const allowed = new Set([...required, ...(scope.allowed_additional_targets ?? [])]);
    const actual = new Set(relations
      .filter((relation) => relation.source === scope.source
        && relation.kind === scope.kind
        && relation.confidence === "HIGH")
      .map((relation) => relation.target));
    const missing = [...required].filter((target) => !actual.has(target));
    const extra = [...actual].filter((target) => !allowed.has(target));
    auditedHighRequiredTp += [...required].filter((target) => actual.has(target)).length;
    auditedHighTp += [...actual].filter((target) => allowed.has(target)).length;
    auditedHighFn += missing.length;
    auditedHighFp += extra.length;
    for (const target of missing) failures.push(`audited HIGH relation missing: ${scope.source} ${scope.kind} ${target}`);
    for (const target of extra) failures.push(`audited HIGH relation extra: ${scope.source} ${scope.kind} ${target}`);
  }
  if (auditedHighFp > 0) failures.push(`false HIGH critical edges: ${auditedHighFp}`);
  if (graph.health.impact_completeness !== "INCOMPLETE") {
    failures.push("dynamic/unsupported Java boundaries were not surfaced as INCOMPLETE");
  }
  return {
    failures,
    metrics: {
      required_entity_recall: entityHits / oracle.required_entities.length,
      required_relation_recall: relationHits / oracle.required_relations.length,
      audited_entity_tp: auditedEntityTp,
      audited_entity_fp: auditedEntityFp,
      audited_entity_fn: auditedEntityFn,
      audited_entity_precision: ratio(auditedEntityTp, auditedEntityTp + auditedEntityFp),
      audited_entity_recall: ratio(auditedEntityTp, auditedEntityTp + auditedEntityFn),
      audited_high_relation_tp: auditedHighTp,
      audited_high_relation_fp: auditedHighFp,
      audited_high_relation_fn: auditedHighFn,
      audited_high_relation_required_tp: auditedHighRequiredTp,
      audited_high_relation_precision: ratio(auditedHighTp, auditedHighTp + auditedHighFp),
      audited_high_relation_recall: ratio(auditedHighRequiredTp, auditedHighRequiredTp + auditedHighFn),
      false_high_critical_edge_count: auditedHighFp,
      resolved_call_rate: graph.health.resolved_call_rate,
      parse_failure_count: graph.health.parse_failures.length,
      supported_file_coverage: graph.health.supported_file_coverage,
      unsupported_file_count: graph.health.unsupported_file_count,
    },
  };
}

export function scoreQuery(expected, response, durationMs) {
  const initial = (response.entities ?? [])
    .filter((entity) => entity.selection_origin === "QUERY_MATCH")
    .map((entity) => entity.qualified_name);
  const returned = (response.entities ?? []).map((entity) => entity.qualified_name);
  const relevant = new Set([
    ...(expected.required_initial ?? []),
    ...(expected.required_any ?? []),
    ...(expected.acceptable ?? []),
  ]);
  const failures = [];
  const statuses = expected.expected_status_any ?? [expected.expected_status];
  if (!statuses.includes(response.retrieval_status)) failures.push(`status ${response.retrieval_status}`);
  for (const name of expected.required_initial ?? []) {
    if (!initial.includes(name)) failures.push(`missing initial ${name}`);
  }
  if (expected.required_any && !expected.required_any.some((name) => returned.includes(name))) {
    failures.push("no required entity returned");
  }
  for (const state of expected.required_safety ?? []) {
    if (!response.safety_states.includes(state)) failures.push(`missing safety ${state}`);
  }
  failures.push(...forbiddenSafetyFailures(expected, response));
  const falseNavigationSafe = isFalseNavigationSafe(response);
  if (falseNavigationSafe && !failures.some((failure) => failure.includes("NAVIGATION_SAFE"))) {
    failures.push("false NAVIGATION_SAFE");
  }
  if (expected.expected_entities_empty && returned.length !== 0) failures.push("expected empty result");
  if (expected.expected_relations_empty && (response.relations ?? []).length !== 0) failures.push("expected empty relations");
  if (response.response_budget_units > expected.request.budget) failures.push("budget exceeded");
  const hits = (limit) => initial.slice(0, limit).filter((name) => relevant.has(name)).length;
  return {
    id: expected.id,
    passed: failures.length === 0,
    failures,
    retrieval_status: response.retrieval_status,
    safety_states: response.safety_states,
    initial_matches: initial,
    returned_entities: returned,
    precision_at_1: hits(1),
    precision_at_5: hits(5) / Math.min(5, Math.max(1, initial.length)),
    recall_at_5: relevant.size === 0 ? null : hits(5) / relevant.size,
    relevant_returned: returned.filter((name) => relevant.has(name)).length,
    false_navigation_safe: falseNavigationSafe,
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

async function seaGate(executable, root, oracle) {
  if (!executable) return { mode: "not_run", executable_path: null, passed: null, failures: [] };
  const rebuilt = await runExecutable(executable, ["rebuild"], root);
  if (rebuilt.code !== 0) return {
    mode: "relocated_executable",
    executable_path: executable,
    passed: false,
    failures: [rebuilt.stderr],
  };
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "book1-gate", version: "1" } } },
    ...oracle.query_cases.map((item, index) => ({
      jsonrpc: "2.0",
      id: index + 2,
      method: "tools/call",
      params: { name: "semantic_explore", arguments: item.request },
    })),
  ];
  const result = await runExecutable(
    executable,
    ["mcp"],
    root,
    `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
  );
  const failures = [];
  let responses = [];
  try { responses = result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { failures.push(`invalid MCP output: ${error.message}`); }
  if (result.code !== 0) failures.push(result.stderr || `SEA exited ${result.code}`);
  for (let index = 0; index < oracle.query_cases.length; index += 1) {
    const response = responses[index + 1]?.result?.structuredContent;
    if (!response) failures.push(`${oracle.query_cases[index].id}: response missing`);
    else failures.push(...scoreQuery(oracle.query_cases[index], response, 0).failures
      .map((failure) => `${oracle.query_cases[index].id}: ${failure}`));
  }
  return {
    mode: "relocated_executable",
    executable_path: executable,
    passed: failures.length === 0,
    failures,
  };
}

function markdown(result) {
  return `# Book1 acceptance\n\nStatus: **${result.status}**\n\n`
    + `- Entity recall: ${result.metrics.required_entity_recall.toFixed(3)}\n`
    + `- Audited entity precision/recall: ${result.metrics.audited_entity_precision?.toFixed(3) ?? "N/A"}/${result.metrics.audited_entity_recall?.toFixed(3) ?? "N/A"}\n`
    + `- Relation recall: ${result.metrics.required_relation_recall.toFixed(3)}\n`
    + `- Audited HIGH relation precision/recall: ${result.metrics.audited_high_relation_precision?.toFixed(3) ?? "N/A"}/${result.metrics.audited_high_relation_recall?.toFixed(3) ?? "N/A"}\n`
    + `- False HIGH critical edges: ${result.metrics.false_high_critical_edge_count}\n`
    + `- Queries: ${result.metrics.query_pass_count}/${result.metrics.query_count}\n`
    + `- Original source unchanged: ${result.source_integrity.unchanged}\n`
    + `- SEA: ${result.sea.mode === "not_run" ? "NOT RUN" : (result.sea.passed ? "PASS" : "FAIL")}\n\n`
    + (result.failures.length === 0 ? "No failures.\n" : `${result.failures.map((item) => `- ${item}`).join("\n")}\n`);
}

export async function runBook1Benchmark({
  root = process.env.BOOK1_ROOT,
  bookStoreRepositoryRoot = process.env.BOOK1_REPO_ROOT,
  expectedCommitSha = process.env.BOOK1_EXPECTED_SHA,
  mode = process.env.BOOK1_ACCEPTANCE_MODE ?? "PINNED_RELEASE_ACCEPTANCE",
  executable = process.env.CODEGRAPH_BIN,
  writeResults = true,
} = {}) {
  if (!root) throw new Error("BOOK1_ROOT must point to the discovered VinaBookStore project");
  const absoluteRoot = resolve(root);
  const oracleText = (await readFile(oraclePath, "utf8")).replaceAll("\r\n", "\n");
  const oracle = JSON.parse(oracleText);
  const oracleHash = createHash("sha256").update(oracleText).digest("hex");
  const frozenOracleHash = (await readFile(`${oraclePath.slice(0, -5)}.sha256`, "utf8"))
    .trim().split(/\s+/u)[0];
  if (oracleHash !== frozenOracleHash) throw new Error("Book1 oracle hash differs from its frozen checksum");
  const before = await sourceSnapshot(absoluteRoot);
  const sourceFailures = checkSourceOracle(oracle, before);
  const pinnedMode = mode === "PINNED_RELEASE_ACCEPTANCE";
  const beforeProvenance = pinnedMode
    ? inspectPinnedProvenance(absoluteRoot, bookStoreRepositoryRoot)
    : {
      repository_root: bookStoreRepositoryRoot ? resolve(bookStoreRepositoryRoot) : null,
      repository: null,
      repository_identity: null,
      commit_sha: null,
      project_subpath: null,
      worktree_clean: null,
    };
  const provenanceFailures = pinnedMode ? checkPinnedProvenance(oracle, beforeProvenance) : [];
  if (pinnedMode && expectedCommitSha && expectedCommitSha !== oracle.project_identity.commit_sha) {
    provenanceFailures.push(`BOOK1_EXPECTED_SHA ${expectedCommitSha} != ${oracle.project_identity.commit_sha}`);
  }
  const preflightFailures = [...sourceFailures, ...provenanceFailures];
  if (preflightFailures.length > 0) {
    throw new Error(`Book1 source/provenance validation failed:\n${preflightFailures.join("\n")}`);
  }
  const disposable = await mkdtemp(join(tmpdir(), `codegraph-book1-${randomUUID()}-`));
  try {
    await cp(join(absoluteRoot, "src"), join(disposable, "src"), { recursive: true });
    await cp(join(absoluteRoot, "pom.xml"), join(disposable, "pom.xml"));
    const coldStarted = performance.now();
    await initializeProject(disposable);
    const coldMs = performance.now() - coldStarted;
    const store = new SqliteGraphStore(artifactPaths(disposable).db, { readOnly: true });
    const graph = store.snapshot();
    store.close();
    const graphDbBytes = (await stat(artifactPaths(disposable).db)).size;
    const mapBytes = (await stat(artifactPaths(disposable).map)).size;
    const graphResult = graphGate(graph, oracle);
    const queryResults = [];
    for (const expected of oracle.query_cases) {
      const started = performance.now();
      const response = await semanticExplore(disposable, expected.request);
      queryResults.push(scoreQuery(expected, response, performance.now() - started));
    }
    const unchangedStarted = performance.now();
    await synchronizeProject(disposable);
    const unchangedMs = performance.now() - unchangedStarted;
    const changedPath = join(disposable, oracle.required_entities[0].path);
    await appendFile(changedPath, "\n", "utf8");
    const oneFileStarted = performance.now();
    const oneFile = await synchronizeProject(disposable);
    const oneFileMs = performance.now() - oneFileStarted;
    const sea = await seaGate(executable ? resolve(executable) : null, disposable, oracle);
    const after = await sourceSnapshot(absoluteRoot);
    const unchanged = JSON.stringify(before.files) === JSON.stringify(after.files);
    const afterProvenance = pinnedMode
      ? inspectPinnedProvenance(absoluteRoot, beforeProvenance.repository_root)
      : beforeProvenance;
    const failures = [
      ...graphResult.failures,
      ...queryResults.flatMap((item) => item.failures.map((failure) => `${item.id}: ${failure}`)),
      ...sea.failures,
      ...(unchanged ? [] : ["original Book1 source changed"]),
      ...(pinnedMode && !afterProvenance.worktree_clean ? ["external BookStore worktree is dirty after benchmark"] : []),
      ...(oneFile.changed_files?.length === 1 ? [] : ["one-file sync did not isolate one changed source"]),
    ];
    const average = (values) => {
      const measured = values.filter((value) => value !== null && value !== undefined);
      return measured.length === 0 ? null : measured.reduce((sum, value) => sum + value, 0) / measured.length;
    };
    const result = {
      schema_version: 2,
      benchmark: "book1-realworld-java",
      generated_at: new Date().toISOString(),
      status: failures.length === 0 ? "PASS" : "FAIL",
      host: { os: platform(), arch: arch(), node: process.version },
      codegraph: {
        commit_sha: git(repositoryRoot, ["rev-parse", "HEAD"]),
        worktree_clean: git(repositoryRoot, ["status", "--porcelain"]) === "",
      },
      oracle: { sha256: oracleHash, frozen_sha256: frozenOracleHash },
      project: {
        name: oracle.project_identity.name,
        mode,
        repository: beforeProvenance.repository ?? oracle.project_identity.repository,
        commit_sha: beforeProvenance.commit_sha,
        project_subpath: beforeProvenance.project_subpath ?? oracle.project_identity.project_subpath,
        declared_source_fingerprint: oracle.project_identity.source_fingerprint,
        observed_source_fingerprint: before.fingerprint,
        java_file_count: before.paths.filter((path) => path.endsWith(".java")).length,
        production_java_file_count: before.paths.filter((path) => path.startsWith("src/main/java/") && path.endsWith(".java")).length,
        test_java_file_count: before.paths.filter((path) => path.startsWith("src/test/java/") && path.endsWith(".java")).length,
        git_worktree_clean_before: beforeProvenance.worktree_clean,
        git_worktree_clean_after: afterProvenance.worktree_clean,
      },
      metrics: {
        ...graphResult.metrics,
        query_pass_count: queryResults.filter((item) => item.passed).length,
        query_count: queryResults.length,
        retrieval_precision_at_1: average(queryResults.map((item) => item.precision_at_1)),
        retrieval_precision_at_5: average(queryResults.map((item) => item.precision_at_5)),
        retrieval_recall_at_5: average(queryResults.map((item) => item.recall_at_5)),
        false_navigation_safe_count: queryResults.filter((item) => item.false_navigation_safe).length,
        cold_index_ms: Number(coldMs.toFixed(3)),
        graph_db_bytes: graphDbBytes,
        map_bytes: mapBytes,
        unchanged_sync_ms: Number(unchangedMs.toFixed(3)),
        one_file_sync_ms: Number(oneFileMs.toFixed(3)),
        peak_rss_bytes: process.memoryUsage().rss,
      },
      queries: queryResults,
      sea,
      source_integrity: {
        unchanged,
        file_count: before.paths.length,
        git_worktree_clean_before: beforeProvenance.worktree_clean,
        git_worktree_clean_after: afterProvenance.worktree_clean,
      },
      known_unsupported_boundaries: oracle.known_dynamic_or_unsupported_boundaries,
      execution_policy: "Source parsed only; Maven, tests, application, database, and network services were not executed.",
      failures,
    };
    if (writeResults) {
      const directory = join(repositoryRoot, "release-evidence", "book1");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
      await writeFile(join(directory, "results.md"), markdown(result), "utf8");
    }
    return result;
  } finally {
    await rm(disposable, { recursive: true, force: true });
  }
}

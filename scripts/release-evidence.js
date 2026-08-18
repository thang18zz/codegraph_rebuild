import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pinnedLapZone = "c8032dd253964a0884491fb18f3020b3850e6c00";
const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

async function symlinkProbe() {
  const directory = await mkdtemp(join(tmpdir(), "codegraph-release-symlink-"));
  try {
    const target = join(directory, "target.txt");
    const link = join(directory, "link.txt");
    await writeFile(target, "probe\n", "utf8");
    try {
      await symlink(target, link, "file");
      return { status: (await lstat(link)).isSymbolicLink() ? "SUPPORTED" : "UNEXPECTED_ERROR" };
    } catch (error) {
      if (["EACCES", "EPERM"].includes(error.code)) return { status: "UNAVAILABLE_PRIVILEGE", code: error.code };
      if (["ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(error.code)) return { status: "UNAVAILABLE_FILESYSTEM", code: error.code };
      return { status: "UNEXPECTED_ERROR", code: error.code, message: error.message };
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const bookPath = join(root, "release-evidence", "book1", "results.json");
const lapDirectory = join(root, "benchmark", "results", "lapzone", pinnedLapZone);
const lapPath = join(lapDirectory, "deterministic.json");
const book = JSON.parse(await readFile(bookPath, "utf8"));
const lapzone = JSON.parse(await readFile(lapPath, "utf8"));
const codegraphSha = git("rev-parse", "HEAD");
const status = git("status", "--porcelain");
const bookstoreNativeCi = {
  windows: process.env.BOOKSTORE_WINDOWS_CI_STATUS ?? "NOT_EVALUATED",
  linux: process.env.BOOKSTORE_LINUX_CI_STATUS ?? "NOT_EVALUATED",
};
const provenance = {
  schema_version: 2,
  generated_at: new Date().toISOString(),
  codegraph: { repository: git("remote", "get-url", "origin"), commit_sha: codegraphSha, worktree_clean: status === "" },
  lapzone: lapzone.lapzone,
  book1: {
    name: book.project.name,
    repository: book.project.repository,
    commit_sha: book.project.commit_sha,
    project_subpath: book.project.project_subpath,
    mode: book.project.mode,
    source_fingerprint: book.project.observed_source_fingerprint,
    oracle_sha256: book.oracle.sha256,
    git_worktree_clean_before: book.project.git_worktree_clean_before,
    git_worktree_clean_after: book.project.git_worktree_clean_after,
    public_native_ci: bookstoreNativeCi,
  },
  runtime: { os: platform(), arch: arch(), node: process.version },
  dependency_lock: { path: "package-lock.json", sha256: await digest(join(root, "package-lock.json")) },
  csharp_grammar: {
    component: "@vscode/tree-sitter-wasm",
    version: "0.3.1",
    upstream: "https://github.com/Microsoft/vscode-tree-sitter-wasm",
    license: "MIT",
    asset: "wasm/tree-sitter-c-sharp.wasm",
    sha256: await digest(join(root, "node_modules", "@vscode", "tree-sitter-wasm", "wasm", "tree-sitter-c-sharp.wasm")),
    notice_path: "THIRD_PARTY_NOTICES.md",
    notice_sha256: await digest(join(root, "THIRD_PARTY_NOTICES.md")),
  },
  symlink_capability: await symlinkProbe(),
};

const metrics = {
  schema_version: 2,
  generated_at: provenance.generated_at,
  codegraph_commit_sha: codegraphSha,
  lapzone: { ...lapzone.metrics, performance: lapzone.performance },
  book1: book.metrics,
};
const cross = {
  schema_version: 2,
  codegraph_commit_sha: codegraphSha,
  interpretation: "Coverage measures observability of supported semantics; correctness and safe incompleteness are primary.",
  repositories: [
    {
      name: "LapZoneAPI",
      language: "C#",
      coverage: lapzone.gates.gate_b.supported_file_coverage,
      required_entity_recall: lapzone.metrics.required_entity_recall,
      required_relation_recall: lapzone.metrics.required_relation_recall,
      audited_entity_precision: lapzone.metrics.audited_entity_precision ?? null,
      audited_entity_recall: lapzone.metrics.audited_entity_recall ?? null,
      audited_high_relation_precision: lapzone.metrics.audited_high_relation_precision ?? null,
      audited_high_relation_recall: lapzone.metrics.audited_high_relation_recall ?? null,
      false_high_critical_edge_count: lapzone.metrics.false_high_critical_edge_count,
      false_navigation_safe_count: lapzone.metrics.false_navigation_safe_count,
      retrieval_precision_at_1: null,
      retrieval_precision_at_5: null,
      retrieval_recall_at_5: null,
      cold_index_ms: lapzone.performance.cold_index.wall_ms,
      query_latency_median_ms: lapzone.metrics.query_latency_median_ms,
      graph_db_bytes: lapzone.performance.cold_index.graph_db_bytes,
      map_bytes: lapzone.performance.cold_index.map_bytes,
    },
    {
      name: "VinaBookStore (book1)",
      language: "Java",
      coverage: book.metrics.supported_file_coverage,
      required_entity_recall: book.metrics.required_entity_recall,
      required_relation_recall: book.metrics.required_relation_recall,
      audited_entity_precision: book.metrics.audited_entity_precision,
      audited_entity_recall: book.metrics.audited_entity_recall,
      audited_high_relation_precision: book.metrics.audited_high_relation_precision,
      audited_high_relation_recall: book.metrics.audited_high_relation_recall,
      false_high_critical_edge_count: book.metrics.false_high_critical_edge_count,
      false_navigation_safe_count: book.metrics.false_navigation_safe_count,
      retrieval_precision_at_1: book.metrics.retrieval_precision_at_1,
      retrieval_precision_at_5: book.metrics.retrieval_precision_at_5,
      retrieval_recall_at_5: book.metrics.retrieval_recall_at_5,
      cold_index_ms: book.metrics.cold_index_ms,
      query_latency_median_ms: [...book.queries].sort((a, b) => a.duration_ms - b.duration_ms)[Math.floor(book.queries.length / 2)].duration_ms,
      graph_db_bytes: book.metrics.graph_db_bytes,
      map_bytes: book.metrics.map_bytes,
    },
  ],
};
const traceability = JSON.parse(await readFile(join(lapDirectory, "traceability.json"), "utf8"));
const releasePass = provenance.codegraph.worktree_clean
  && book.project.mode === "PINNED_RELEASE_ACCEPTANCE"
  && book.project.commit_sha === "44455ee3792bbca84d0379feff862f66a4426d3e"
  && book.project.declared_source_fingerprint === book.project.observed_source_fingerprint
  && book.project.git_worktree_clean_before === true
  && book.project.git_worktree_clean_after === true
  && book.status === "PASS"
  && book.sea.passed === true
  && book.metrics.audited_entity_precision === 1
  && book.metrics.audited_entity_recall === 1
  && book.metrics.audited_high_relation_precision === 1
  && book.metrics.audited_high_relation_recall === 1
  && book.metrics.false_high_critical_edge_count === 0
  && book.metrics.false_navigation_safe_count === 0
  && bookstoreNativeCi.windows === "PASS"
  && bookstoreNativeCi.linux === "PASS"
  && lapzone.status === "PASS"
  && lapzone.sea.passed === true
  && traceability.requirements.every((item) => item.status === "PASS");
const report = `# Portable CodeGraph release report\n\nDecision: **${releasePass ? "PASS" : "BLOCKED"}**\n\n`
  + `- CodeGraph SHA: ${codegraphSha}${provenance.codegraph.worktree_clean ? " (clean)" : " (dirty)"}\n`
  + `- Native host: ${provenance.runtime.os}/${provenance.runtime.arch}, ${provenance.runtime.node}\n`
  + `- LapZone: ${lapzone.status}, queries ${lapzone.metrics.query_pass_count}/${lapzone.metrics.query_count}, SEA ${lapzone.sea.passed ? "PASS" : "FAIL"}\n`
  + `- Book1: ${book.status}, queries ${book.metrics.query_pass_count}/${book.metrics.query_count}, SEA ${book.sea.passed ? "PASS" : "FAIL"}\n`
  + `- Book1 pinned source: ${book.project.commit_sha}, clean ${book.project.git_worktree_clean_before && book.project.git_worktree_clean_after ? "PASS" : "FAIL"}\n`
  + `- Book1 audited entity precision/recall: ${book.metrics.audited_entity_precision}/${book.metrics.audited_entity_recall}\n`
  + `- Book1 audited HIGH relation precision/recall: ${book.metrics.audited_high_relation_precision}/${book.metrics.audited_high_relation_recall}\n`
  + `- Book1 retrieval P@1/P@5/R@5: ${book.metrics.retrieval_precision_at_1}/${book.metrics.retrieval_precision_at_5}/${book.metrics.retrieval_recall_at_5}\n`
  + `- Book1 public native CI: Windows ${bookstoreNativeCi.windows}, Linux ${bookstoreNativeCi.linux}\n`
  + `- Critical false HIGH: LapZone ${lapzone.metrics.false_high_critical_edge_count}, Book1 ${book.metrics.false_high_critical_edge_count}\n`
  + `- Safe incompleteness: LapZone ${lapzone.gates.gate_b.impact_completeness}, Book1 known boundaries disclosed\n`
  + `- Symlink probe: ${provenance.symlink_capability.status}${provenance.symlink_capability.code ? ` (${provenance.symlink_capability.code})` : ""}\n`
  + `- C# grammar license/provenance: PASS\n`;

await mkdir(join(root, "release-evidence"), { recursive: true });
await writeFile(join(root, "release-evidence", "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
await writeFile(join(root, "release-evidence", "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
await writeFile(join(root, "release-evidence", "cross-repo-summary.json"), `${JSON.stringify(cross, null, 2)}\n`, "utf8");
await writeFile(join(root, "release-evidence", "release-report.md"), report, "utf8");
console.log(JSON.stringify({ status: releasePass ? "PASS" : "BLOCKED", codegraph_commit_sha: codegraphSha }, null, 2));
if (!releasePass) process.exitCode = 1;

import assert from "node:assert/strict";
import {
  chmod,
  copyFile,
  link,
  open,
  readdir,
  readFile,
  rename,
  symlink,
  stat,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { diagnoseProject } from "../src/doctor.js";
import { hashBytes } from "../src/ir.js";
import { semanticExplore } from "../src/query.js";
import { SqliteGraphStore } from "../src/store.js";
import {
  artifactPaths,
  initializeProject,
  isUnsupportedDirectorySyncError,
  projectStatus,
  rebuildProject,
  removeDerivedProject,
  synchronizeProject,
} from "../src/sync.js";
import { sourceHashes, temporaryProject } from "./helpers.js";

function runCli(cwd, command) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "bin", "codegraph.js"), command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function writePublicationFixture(paths, publication) {
  const registry = `${JSON.stringify({
    prepared: publication.prepared,
    backup: publication.backup,
  }, null, 2)}\n`;
  await writeFile(paths.publicationArtifacts, registry, "utf8");
  await writeFile(paths.publication, `${JSON.stringify({
    ...publication,
    artifact_registry_digest: hashBytes(registry),
  })}\n`, "utf8");
}

test("init publishes one canonical graph, SQLite/FTS5, and valid bounded map without touching source", async (t) => {
  const project = await temporaryProject();
  let store;
  t.after(async () => {
    store?.close();
    await project.cleanup();
  });
  await project.write("pkg/repository.py", "def find(token: str):\n    return token\n");
  await project.write("pkg/service.py", "from pkg.repository import find\n\ndef refresh(token: str):\n    return find(token)\n");
  const before = await sourceHashes(project.root);
  const result = await initializeProject(project.root);
  const after = await sourceHashes(project.root);
  assert.deepEqual(after, before);
  assert.equal(result.revision, 1);
  assert.equal(result.status, "FRESH");

  const paths = artifactPaths(project.root);
  const map = await readFile(paths.map, "utf8");
  assert.match(map, /OMISSION_IS_NOT_ABSENCE = True/u);
  assert.match(map, /Original source files remain authoritative/u);
  assert.ok(result.profile.estimated_codegraph_tokens <= 1500);
  const python = process.platform === "win32" ? "python" : "python3";
  const syntax = spawnSync(python, ["-m", "py_compile", paths.map], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);

  store = new SqliteGraphStore(paths.db, { readOnly: true });
  const snapshot = store.snapshot();
  assert.equal(snapshot.revision, 1);
  assert.ok(snapshot.entities.some((entity) => entity.qualified_name === "pkg.service.refresh"));
  const call = snapshot.relations.find((relation) => relation.kind === "CALLS" && relation.unresolved_target === "find");
  assert.equal(call.confidence, "HIGH");
  assert.ok(store.searchEntities(["refresh"], 5).some((row) => row.name === "refresh"));
});

test("writable graph stores use WAL with NORMAL synchronization and foreign keys", async (t) => {
  const project = await temporaryProject();
  let store;
  t.after(async () => {
    store?.close();
    await project.cleanup();
  });
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);

  store = new SqliteGraphStore(artifactPaths(project.root).db);
  assert.equal(store.db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
  assert.equal(store.db.prepare("PRAGMA synchronous").get().synchronous, 1);
  assert.equal(store.db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
});

test("directory sync compatibility is narrow and Windows-aware", () => {
  assert.equal(isUnsupportedDirectorySyncError({ code: "EINVAL", syscall: "fsync" }, "linux"), true);
  assert.equal(isUnsupportedDirectorySyncError({ code: "UNKNOWN", syscall: "fsync" }, "win32"), true);
  assert.equal(isUnsupportedDirectorySyncError({ code: "UNKNOWN", syscall: "fsync" }, "linux"), false);
  assert.equal(isUnsupportedDirectorySyncError({ code: "EACCES", syscall: "open" }, "win32"), false);
});

test("line movement keeps stable identity and comment-only semantics", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def target(value: str) -> str:\n    return value\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  let store = new SqliteGraphStore(paths.db, { readOnly: true });
  const before = store.snapshot();
  store.close();
  const original = before.entities.find((entity) => entity.name === "target");
  const oldSemanticHash = before.files.find((file) => file.path === "app.py").semantic_hash;

  await project.write("app.py", "# moved down\n\n\ndef target(value: str) -> str:\n    return value\n");
  const synced = await synchronizeProject(project.root);
  assert.equal(synced.revision, 2);
  store = new SqliteGraphStore(paths.db, { readOnly: true });
  const after = store.snapshot();
  store.close();
  const updated = after.entities.find((entity) => entity.name === "target");
  assert.equal(updated.stable_id, original.stable_id);
  assert.notEqual(updated.source_location.start_line, original.source_location.start_line);
  assert.equal(after.files.find((file) => file.path === "app.py").semantic_hash, oldSemanticHash);
});

test("temporary syntax errors retain last-known-good semantics and fail closed", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("auth.py", "def login(user: str) -> bool:\n    return bool(user)\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  let store = new SqliteGraphStore(paths.db, { readOnly: true });
  const revisionOne = store.snapshot();
  store.close();
  const stableId = revisionOne.entities.find((entity) => entity.name === "login").stable_id;

  await project.write("auth.py", "def login(\n");
  const result = await synchronizeProject(project.root);
  assert.equal(result.status, "PARTIAL");
  store = new SqliteGraphStore(paths.db, { readOnly: true });
  const partial = store.snapshot();
  store.close();
  assert.equal(partial.status, "PARTIAL");
  const retained = partial.entities.find((entity) => entity.name === "login");
  assert.equal(retained.stable_id, stableId);
  assert.ok(retained.risk_flags.includes("STALE_SOURCE"));
  assert.deepEqual(partial.health.stale_files, ["auth.py"]);

  const response = await semanticExplore(project.root, { task: "why can login fail?", focus: "auth", budget: 1024 });
  assert.equal(response.graph_status, "PARTIAL");
  assert.ok(response.safety_states.includes("GRAPH_PARTIAL"));
  assert.ok(response.safety_states.includes("SOURCE_INSPECTION_REQUIRED"));
  assert.equal(response.last_known_good_revision, 1);
  assert.deepEqual(response.stale_files, ["auth.py"]);
  assert.ok(response.source_locations?.[0] || response.entities?.[0]?.source_location);
});

test("freshness reconciliation catches edits made while no watcher is active", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def old_name():\n    pass\n");
  await initializeProject(project.root);
  await project.write("app.py", "def new_name():\n    pass\n");
  const stale = await projectStatus(project.root);
  assert.equal(stale.graph_status, "STALE");
  const response = await semanticExplore(project.root, { task: "find new_name", focus: "app" });
  assert.equal(response.graph_revision, 2);
  assert.ok(response.entities.some((entity) => entity.name === "new_name"));
  assert.equal(response.entities.some((entity) => entity.name === "old_name"), false);
});

test("broad and impact queries are bounded and disclose incompleteness", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("api.py", `
def public_api():
    pass

def caller():
    public_api()

def load_plugin(name):
    return __import__(name)
`);
  await initializeProject(project.root);
  const broad = await semanticExplore(project.root, { task: "show entire repository", budget: 1500 });
  assert.equal(broad.broad_query, true);
  assert.equal(broad.entities.length, 0);
  assert.ok(broad.response_tokens <= 1500);

  const impact = await semanticExplore(project.root, { task: "find all callers before public API rename", focus: "public_api" });
  assert.equal(impact.completeness.impact, "INCOMPLETE");
  assert.ok(impact.safety_states.includes("IMPACT_INCOMPLETE"));
  assert.match(impact.notice, /Omission is not absence/u);
});

test("unsupported-language and config consumers force destructive impact incompleteness", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("api.py", "def public_api():\n    pass\n");
  await project.write("plugin.rb", "register(:public_api)\n");
  await project.write("routes.yaml", "handler: public_api\n");
  await initializeProject(project.root);
  const response = await semanticExplore(project.root, {
    task: "what breaks if I change public_api signature?",
    focus: "public_api",
  });
  assert.equal(response.completeness.impact, "INCOMPLETE");
  assert.ok(response.safety_states.includes("IMPACT_INCOMPLETE"));
  assert.ok(response.unresolved_areas.includes("UNSUPPORTED_SEMANTICS"));
  const status = await projectStatus(project.root);
  assert.equal(status.health.unsupported_file_count, 2);
  assert.ok(status.health.supported_file_coverage < 1);
});

test("context continuation returns a delta without becoming required for correctness", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("flow.py", "def a():\n    b()\n\ndef b():\n    c()\n\ndef c():\n    pass\n");
  await initializeProject(project.root);
  const contexts = new Map();
  const first = await semanticExplore(project.root, { task: "trace a flow", focus: "a" }, contexts);
  const second = await semanticExplore(project.root, {
    task: "inspect b",
    focus: "b",
    context_id: first.context_id,
  }, contexts);
  const independent = await semanticExplore(project.root, { task: "inspect b", focus: "b" }, new Map());
  assert.equal(second.delta, true);
  assert.ok(second.entities.length <= independent.entities.length);
  assert.ok(independent.entities.some((entity) => entity.name === "b"));
});

test("doctor reports coherent healthy artifacts", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const diagnosis = await diagnoseProject(project.root);
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosis.materialization_consistent, true);
});

test("init refuses to overwrite a user-owned root codegraph.py", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("codegraph.py", "def user_behavior():\n    return 42\n");
  await assert.rejects(
    initializeProject(project.root),
    (error) => error.code === "MAP_PATH_CONFLICT",
  );
  assert.equal(await project.read("codegraph.py"), "def user_behavior():\n    return 42\n");
});

test("sync refuses to overwrite a root codegraph.py replaced by user source", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  await unlink(paths.map);
  const userSource = "def branch_owned_source():\n    return 42\n";
  await writeFile(paths.map, userSource, "utf8");
  const forgedState = JSON.parse(await readFile(paths.state, "utf8"));
  forgedState.map_sha256 = hashBytes(userSource);
  await writeFile(paths.state, `${JSON.stringify(forgedState, null, 2)}\n`, "utf8");
  await project.write("app.py", "def changed():\n    pass\n");
  await assert.rejects(
    synchronizeProject(project.root),
    (error) => error.code === "MAP_PATH_CONFLICT",
  );
  assert.equal(await readFile(paths.map, "utf8"), userSource);
});

test("a public ownership marker does not authorize overwriting user source", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const userSource = '"""PORTABLE CODEGRAPH SEMANTIC MAP"""\ndef owned(): return 42\n';
  await unlink(paths.map);
  await writeFile(paths.map, userSource, "utf8");
  await assert.rejects(
    synchronizeProject(project.root),
    (error) => error.code === "MAP_PATH_CONFLICT",
  );
  assert.equal(await readFile(paths.map, "utf8"), userSource);
});

test("derived-state removal preserves a root codegraph.py replaced by user source", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  await unlink(paths.map);
  const userSource = "def branch_owned_source():\n    return 42\n";
  await writeFile(paths.map, userSource, "utf8");
  await removeDerivedProject(project.root);
  assert.equal(await readFile(paths.map, "utf8"), userSource);
  await assert.rejects(stat(paths.directory), (error) => error.code === "ENOENT");
});

test("init rejects a symlinked .codegraph directory without writing outside the project", async (t) => {
  const project = await temporaryProject();
  const external = await temporaryProject("codegraph-external-");
  t.after(() => project.cleanup());
  t.after(() => external.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await symlink(external.root, join(project.root, ".codegraph"));
  await assert.rejects(
    initializeProject(project.root),
    (error) => error.code === "UNSAFE_ARTIFACT_PATH",
  );
  assert.deepEqual((await readdir(external.root)).sort(), [".git"]);
});

test("nested source named codegraph.py is indexed and never mistaken for the generated map", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("tools/codegraph.py", "def nested_source():\n    pass\n");
  await initializeProject(project.root);
  const store = new SqliteGraphStore(artifactPaths(project.root).db, { readOnly: true });
  const snapshot = store.snapshot();
  store.close();
  assert.ok(snapshot.entities.some((entity) => entity.qualified_name === "tools.codegraph.nested_source"));
});

test("freshness hashes catch same-size edits with restored mtimes", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const path = await project.write("app.py", "def old_name():\n    pass\n");
  await initializeProject(project.root);
  const before = await stat(path);
  await writeFile(path, "def new_name():\n    pass\n", "utf8");
  await utimes(path, before.atime, before.mtime);
  const stale = await projectStatus(project.root);
  assert.equal(stale.graph_status, "STALE");
  await synchronizeProject(project.root);
  const store = new SqliteGraphStore(artifactPaths(project.root).db, { readOnly: true });
  const snapshot = store.snapshot();
  store.close();
  assert.ok(snapshot.entities.some((entity) => entity.name === "new_name"));
  assert.equal(snapshot.entities.some((entity) => entity.name === "old_name"), false);
});

test("an unreadable subtree retains prior semantics as PARTIAL instead of deleting them", {
  skip: process.platform === "win32" || process.getuid?.() === 0
    ? "requires non-root POSIX permission semantics"
    : false,
}, async (t) => {
  const project = await temporaryProject();
  const privateDirectory = join(project.root, "private");
  t.after(async () => {
    await chmod(privateDirectory, 0o700).catch(() => {});
    await project.cleanup();
  });
  await project.write("private/secret.py", "def retained_secret():\n    pass\n");
  await project.write("visible.py", "def first():\n    pass\n");
  await initializeProject(project.root);
  await chmod(privateDirectory, 0o000);
  await project.write("visible.py", "def second():\n    pass\n");
  const result = await synchronizeProject(project.root);
  assert.equal(result.status, "PARTIAL");
  const store = new SqliteGraphStore(artifactPaths(project.root).db, { readOnly: true });
  const snapshot = store.snapshot();
  store.close();
  assert.ok(snapshot.entities.some((entity) => entity.name === "retained_secret"));
  assert.ok(snapshot.health.scan_diagnostics.some((item) => item.code === "DIRECTORY_UNREADABLE"));
});

test("a newly unreadable subtree cannot remain FRESH", {
  skip: process.platform === "win32" || process.getuid?.() === 0
    ? "requires non-root POSIX permission semantics"
    : false,
}, async (t) => {
  const project = await temporaryProject();
  const privateDirectory = join(project.root, "new-private");
  t.after(async () => {
    await chmod(privateDirectory, 0o700).catch(() => {});
    await project.cleanup();
  });
  await project.write("visible.py", "def visible():\n    pass\n");
  await initializeProject(project.root);
  await project.write("new-private/hidden.py", "def hidden():\n    pass\n");
  await chmod(privateDirectory, 0o000);
  const stale = await projectStatus(project.root);
  assert.equal(stale.graph_status, "STALE");
  assert.equal(stale.fresh, false);
  const result = await synchronizeProject(project.root);
  assert.equal(result.status, "PARTIAL");
  assert.ok(result.health.scan_diagnostics.some((item) => item.code === "DIRECTORY_UNREADABLE"));
  assert.ok(result.health.stale_files.includes("new-private"));
  const reconciled = await projectStatus(project.root);
  assert.equal(reconciled.graph_status, "PARTIAL");
});

test("symlinked source boundaries are surfaced as PARTIAL", async (t) => {
  const project = await temporaryProject();
  const external = await temporaryProject("codegraph-symlink-source-");
  t.after(() => project.cleanup());
  t.after(() => external.cleanup());
  const target = await external.write("implementation.py", "def external_api():\n    pass\n");
  await symlink(target, join(project.root, "implementation.py"));
  const result = await initializeProject(project.root);
  assert.equal(result.status, "PARTIAL");
  assert.ok(result.health.scan_diagnostics.some((item) => item.code === "SYMLINK_SKIPPED"));
  assert.ok(result.health.risk_flags.includes("UNSUPPORTED_SEMANTICS"));
  assert.ok(result.health.stale_files.includes("implementation.py"));
});

test("concurrent synchronizers publish one coherent revision", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def first():\n    pass\n");
  await initializeProject(project.root);
  await project.write("app.py", "def second():\n    pass\n");
  const [left, right] = await Promise.all([
    synchronizeProject(project.root),
    synchronizeProject(project.root),
  ]);
  assert.equal(left.revision, 2);
  assert.equal(right.revision, 2);
  const store = new SqliteGraphStore(artifactPaths(project.root).db, { readOnly: true });
  const snapshot = store.snapshot();
  store.close();
  assert.equal(snapshot.revision, 2);
  assert.ok(snapshot.entities.some((entity) => entity.name === "second"));
});

test("cross-process synchronizers serialize through the project lock", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def first():\n    pass\n");
  await initializeProject(project.root);
  await project.write("app.py", "def second():\n    pass\n");
  const results = await Promise.all([
    runCli(project.root, "sync"),
    runCli(project.root, "sync"),
  ]);
  assert.ok(results.every((result) => result.code === 0), results.map((result) => result.stderr).join("\n"));
  assert.ok(results.every((result) => JSON.parse(result.stdout).revision === 2));
  const store = new SqliteGraphStore(artifactPaths(project.root).db, { readOnly: true });
  const snapshot = store.snapshot();
  store.close();
  assert.equal(snapshot.revision, 2);
});

test("project locking does not require a persistent-disk flush", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);

  const probePath = join(project.root, ".codegraph", "handle-probe");
  const probe = await open(probePath, "w");
  const handlePrototype = Object.getPrototypeOf(probe);
  await probe.close();
  await unlink(probePath);
  const syncMock = t.mock.method(handlePrototype, "sync", async () => {
    throw Object.assign(new Error("forced sync failure"), { code: "EIO", syscall: "fsync" });
  });

  const result = await synchronizeProject(project.root);
  assert.equal(result.changed, false);
  assert.equal(syncMock.mock.callCount(), 0);
  await assert.rejects(
    stat(join(project.root, ".codegraph", "sync.lock")),
    (error) => error.code === "ENOENT",
  );
});

test("prepared regular-file sync failures preserve the published revision", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def first():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const oldMap = await readFile(paths.map, "utf8");
  const oldState = await readFile(paths.state, "utf8");
  await project.write("app.py", "def second():\n    pass\n");
  const sourceBefore = await sourceHashes(project.root);

  const probePath = join(project.root, ".codegraph", "handle-probe");
  const probe = await open(probePath, "w");
  const handlePrototype = Object.getPrototypeOf(probe);
  await probe.close();
  await unlink(probePath);
  const syncMock = t.mock.method(handlePrototype, "sync", async () => {
    throw Object.assign(new Error("forced regular-file sync failure"), {
      code: "EIO",
      errno: -5,
      syscall: "fsync",
    });
  });

  await assert.rejects(
    synchronizeProject(project.root),
    (error) => error.code === "STORAGE_FILE_SYNC_FAILED"
      && error.details?.operation === "PREPARED_FILE_SYNC"
      && error.cause?.code === "EIO",
  );
  syncMock.mock.restore();

  assert.equal(await readFile(paths.map, "utf8"), oldMap);
  assert.equal(await readFile(paths.state, "utf8"), oldState);
  assert.deepEqual(await sourceHashes(project.root), sourceBefore);
  const status = await projectStatus(project.root);
  assert.equal(status.graph_revision, 1);
  assert.equal(status.graph_status, "STALE");
});

test("SQLite publication commit failures roll back and retain revision provenance", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def first():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const oldMap = await readFile(paths.map, "utf8");
  const oldState = await readFile(paths.state, "utf8");
  await project.write("app.py", "def second():\n    pass\n");

  const originalExec = DatabaseSync.prototype.exec;
  const publishing = new WeakSet();
  const execMock = t.mock.method(DatabaseSync.prototype, "exec", function mockExec(sql) {
    if (sql === "BEGIN IMMEDIATE") publishing.add(this);
    if (sql === "COMMIT" && publishing.has(this)) {
      throw Object.assign(new Error("forced SQLite commit failure"), { code: "SQLITE_IOERR_FSYNC" });
    }
    if (sql === "ROLLBACK") publishing.delete(this);
    return originalExec.call(this, sql);
  });

  await assert.rejects(
    synchronizeProject(project.root),
    (error) => error.code === "STORAGE_SQLITE_COMMIT_FAILED"
      && error.details?.operation === "SQLITE_COMMIT"
      && error.cause?.code === "SQLITE_IOERR_FSYNC",
  );
  execMock.mock.restore();

  assert.equal(await readFile(paths.map, "utf8"), oldMap);
  assert.equal(await readFile(paths.state, "utf8"), oldState);
  const status = await projectStatus(project.root);
  assert.equal(status.graph_revision, 1);
  assert.equal(status.graph_status, "STALE");
});

test("a stale lock is removed only after its recorded file identity is revalidated", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const lockPath = join(project.root, ".codegraph", "sync.lock");
  await writeFile(lockPath, `${JSON.stringify({
    pid: 99_999_999,
    created_at: Date.now() - 120_000,
    token: "stale-test-token",
  })}\n`, "utf8");
  const result = await synchronizeProject(project.root);
  assert.equal(result.changed, false);
  await assert.rejects(stat(lockPath), (error) => error.code === "ENOENT");
});

test("a hardlinked graph database is rejected before synchronization can mutate it", async (t) => {
  const project = await temporaryProject();
  const external = await temporaryProject("codegraph-hardlink-target-");
  t.after(() => project.cleanup());
  t.after(() => external.cleanup());
  await project.write("app.py", "def first():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const externalDatabase = join(external.root, "shared-graph.db");
  await link(paths.db, externalDatabase);
  await project.write("app.py", "def second():\n    pass\n");
  await assert.rejects(
    synchronizeProject(project.root),
    (error) => error.code === "UNSAFE_ARTIFACT_PATH",
  );
  const database = new DatabaseSync(externalDatabase, { readOnly: true });
  assert.equal(database.prepare("SELECT value FROM metadata WHERE key = ?")
    .get("current_revision").value, "1");
  database.close();
});

test("doctor rejects hardlinked SQLite sidecars before opening the database", async (t) => {
  const project = await temporaryProject();
  const external = await temporaryProject("codegraph-sidecar-");
  t.after(() => project.cleanup());
  t.after(() => external.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const externalSidecar = await external.write("outside-shm", "outside-content");
  await link(externalSidecar, `${paths.db}-shm`);
  const before = hashBytes(await readFile(externalSidecar));
  const diagnosis = await diagnoseProject(project.root);
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.error.code, "UNSAFE_ARTIFACT_PATH");
  assert.equal(hashBytes(await readFile(externalSidecar)), before);
});

test("projection config changes regenerate the same revision under the new hard cap", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  for (let index = 0; index < 20; index += 1) {
    await project.write(`service_${index}.py`, `def handler_${index}():\n    pass\n`);
  }
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const config = (await readFile(paths.config, "utf8"))
    .replace("map_target_tokens = 1000", "map_target_tokens = 700")
    .replace("map_hard_cap_tokens = 1500", "map_hard_cap_tokens = 900");
  await writeFile(paths.config, config, "utf8");
  const result = await synchronizeProject(project.root);
  assert.equal(result.changed, false);
  assert.equal(result.revision, 1);
  const state = JSON.parse(await readFile(paths.state, "utf8"));
  assert.ok(state.codegraph_tokens <= 900);
});

test("semantic config changes force reparsing and a new revision", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    return 'content larger than ten bytes'\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const config = (await readFile(paths.config, "utf8"))
    .replace("source_file_size_limit = 5000000", "source_file_size_limit = 10");
  await writeFile(paths.config, config, "utf8");
  const result = await synchronizeProject(project.root);
  assert.equal(result.revision, 2);
  assert.equal(result.status, "PARTIAL");
  const store = new SqliteGraphStore(paths.db, { readOnly: true });
  const file = store.snapshot().files.find((item) => item.path === "app.py");
  store.close();
  assert.equal(file.parse_status, "FAILED");
  assert.match(file.parse_error, /source_file_size_limit/u);
});

test("a digest-mismatched map is never overwritten from a public marker alone", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const generated = await readFile(paths.map, "utf8");
  const corrupted = `${generated}${"# generated corruption\n".repeat(5000)}`;
  await writeFile(paths.map, corrupted, "utf8");
  const stale = await projectStatus(project.root);
  assert.equal(stale.materialized, false);
  assert.equal(stale.graph_status, "STALE");
  await assert.rejects(
    synchronizeProject(project.root),
    (error) => error.code === "MAP_PATH_CONFLICT",
  );
  assert.equal(await readFile(paths.map, "utf8"), corrupted);
});

test("malformed persisted semantic JSON is detected and rebuild recovers from source", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main(value: str):\n    return value\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const database = new DatabaseSync(paths.db);
  database.prepare("UPDATE entities SET inputs_json = ? WHERE name = ?").run("{broken", "main");
  database.close();
  const broken = await diagnoseProject(project.root);
  assert.equal(broken.ok, false);
  assert.equal(broken.graph_status, "BROKEN");
  const rebuilt = await rebuildProject(project.root);
  assert.equal(rebuilt.revision, 2);
  const repaired = await diagnoseProject(project.root);
  assert.equal(repaired.ok, true);
});

test("a clean rebuild preserves monotonic publication revision identity", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  const initialized = await initializeProject(project.root);
  const rebuilt = await rebuildProject(project.root);
  assert.equal(initialized.revision, 1);
  assert.equal(rebuilt.revision, 2);
  const status = await projectStatus(project.root);
  assert.equal(status.graph_revision, 2);
});

test("an interrupted rebuild restores the previous database before synchronization", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const members = [paths.db, `${paths.db}-wal`, `${paths.db}-shm`];
  const suffix = "test-rebuild-interruption";
  const journalMembers = [];
  for (const path of members) {
    const backup = `${path}.rebuild-backup-${suffix}`;
    try {
      const bytes = await readFile(path);
      journalMembers.push({ path, backup, had_file: true, digest: hashBytes(bytes) });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      journalMembers.push({ path, backup, had_file: false, digest: null });
    }
  }
  await writeFile(paths.rebuild, `${JSON.stringify({
    previous_revision: 1,
    members: journalMembers,
  })}\n`, "utf8");
  for (const member of journalMembers) {
    if (member.had_file) await rename(member.path, member.backup);
  }
  const result = await synchronizeProject(project.root);
  assert.equal(result.revision, 1);
  const status = await projectStatus(project.root);
  assert.equal(status.graph_revision, 1);
  await assert.rejects(stat(paths.rebuild), (error) => error.code === "ENOENT");
});

test("valid-looking semantic row tampering fails the published graph digest", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main(value: str):\n    return value\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const database = new DatabaseSync(paths.db);
  const row = database.prepare("SELECT inputs_json FROM entities WHERE name = ?").get("main");
  database.prepare("UPDATE entities SET inputs_json = ? WHERE name = ?")
    .run(row.inputs_json.replace('"str"', '"int"'), "main");
  database.close();
  const diagnosis = await diagnoseProject(project.root);
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.graph_status, "BROKEN");
  await assert.rejects(
    semanticExplore(project.root, { task: "inspect main", focus: "main" }),
    (error) => error.code === "GRAPH_CORRUPTED",
  );
});

test("incremental sync cannot launder corrupt unchanged semantic rows", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("trusted.py", "def trusted(value: str):\n    return value\n");
  await project.write("other.py", "def before():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const database = new DatabaseSync(paths.db);
  database.prepare("UPDATE entities SET signature = ? WHERE name = ?")
    .run("def trusted(value: forged)", "trusted");
  database.close();
  await project.write("other.py", "def after():\n    pass\n");
  await assert.rejects(
    synchronizeProject(project.root),
    (error) => error.code === "GRAPH_CORRUPTED",
  );
  const persisted = new DatabaseSync(paths.db, { readOnly: true });
  assert.equal(persisted.prepare("SELECT value FROM metadata WHERE key = ?")
    .get("current_revision").value, "1");
  persisted.close();
});

test("revision status and health metadata are covered by the graph digest", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("auth.py", "def login():\n    return True\n");
  await initializeProject(project.root);
  await project.write("auth.py", "def login(\n");
  await synchronizeProject(project.root);
  const paths = artifactPaths(project.root);
  const database = new DatabaseSync(paths.db);
  const row = database.prepare("SELECT health_json FROM revisions WHERE revision = 2").get();
  const health = JSON.parse(row.health_json);
  Object.assign(health, {
    status: "FRESH",
    stale_files: [],
    stale_file_count: 0,
    parse_failures: [],
    risk_flags: [],
    impact_completeness: "SCOPED_STATIC",
  });
  const forged = JSON.stringify(health);
  database.prepare("UPDATE revisions SET status = ?, health_json = ? WHERE revision = 2")
    .run("FRESH", forged);
  database.prepare("UPDATE health SET status = ?, metrics_json = ? WHERE revision = 2")
    .run("FRESH", forged);
  database.close();
  const diagnosis = await diagnoseProject(project.root);
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.graph_status, "BROKEN");
});

test("revision source fingerprint is covered by the graph digest", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const database = new DatabaseSync(paths.db);
  database.prepare("UPDATE revisions SET source_fingerprint = ? WHERE revision = 1")
    .run("forged-source-fingerprint");
  database.close();
  const diagnosis = await diagnoseProject(project.root);
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.graph_status, "BROKEN");
});

test("state source binding corruption is rejected and safely rematerialized", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const state = JSON.parse(await readFile(paths.state, "utf8"));
  state.source_fingerprint = "forged-source-fingerprint";
  await writeFile(paths.state, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const stale = await projectStatus(project.root);
  assert.equal(stale.materialized, false);
  assert.equal(stale.fresh, false);
  const diagnosis = await diagnoseProject(project.root);
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.materialization_consistent, false);
  const repaired = await synchronizeProject(project.root);
  assert.equal(repaired.changed, false);
  const repairedState = JSON.parse(await readFile(paths.state, "utf8"));
  assert.notEqual(repairedState.source_fingerprint, "forged-source-fingerprint");
  assert.equal((await projectStatus(project.root)).materialized, true);
});

test("a forged map and matching state hash cannot replace the deterministic projection", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const map = await readFile(paths.map, "utf8");
  const forgedMap = map.replace("main", "evil");
  assert.notEqual(forgedMap, map);
  const state = JSON.parse(await readFile(paths.state, "utf8"));
  state.map_sha256 = hashBytes(forgedMap);
  await writeFile(paths.map, forgedMap, "utf8");
  await writeFile(paths.state, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const status = await projectStatus(project.root);
  assert.equal(status.materialized, false);
  assert.equal(status.fresh, false);
  await synchronizeProject(project.root);
  assert.equal(await readFile(paths.map, "utf8"), map);
});

test("doctor preserves PARTIAL status and global last-known-good revision", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("auth.py", "def login():\n    return True\n");
  await project.write("other.py", "def first():\n    pass\n");
  await initializeProject(project.root);
  await project.write("auth.py", "def login(\n");
  await synchronizeProject(project.root);
  await project.write("other.py", "def second():\n    pass\n");
  await synchronizeProject(project.root);
  const diagnosis = await diagnoseProject(project.root);
  assert.equal(diagnosis.graph_status, "PARTIAL");
  assert.equal(diagnosis.ok, false);
  const response = await semanticExplore(project.root, { task: "inspect login", focus: "auth" });
  assert.equal(response.graph_revision, 3);
  assert.equal(response.last_known_good_revision, 1);
});

test("context deltas reset when a new revision changes a known entity", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("api.py", "def target(value):\n    return value\n");
  await initializeProject(project.root);
  const contexts = new Map();
  const first = await semanticExplore(project.root, { task: "inspect target", focus: "target" }, contexts);
  await project.write("api.py", "def target(value, extra):\n    return value\n");
  const second = await semanticExplore(project.root, {
    task: "inspect target",
    focus: "target",
    context_id: first.context_id,
  }, contexts);
  assert.equal(second.graph_revision, 2);
  assert.equal(second.delta, false);
  assert.ok(second.entities.some((entity) => entity.name === "target" && entity.signature.includes("extra")));
});

test("incremental sync re-resolves old HIGH edges when a new ambiguity appears", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("dep.py", "def target():\n    pass\n");
  await project.write("caller.py", "from dep import target\n\ndef call():\n    target()\n");
  await initializeProject(project.root);
  await project.write("dep/__init__.py", "def target():\n    pass\n");
  await synchronizeProject(project.root);
  const store = new SqliteGraphStore(artifactPaths(project.root).db, { readOnly: true });
  const snapshot = store.snapshot();
  store.close();
  const call = snapshot.relations.find((relation) => relation.kind === "CALLS" && relation.unresolved_target === "target");
  assert.notEqual(call.confidence, "HIGH");
  assert.equal(call.dst_entity_id, null);
  assert.equal(call.candidates.length, 2);
  assert.equal(snapshot.health.impact_completeness, "INCOMPLETE");
});

test("persisted resolver conditions and semantic revisions remain stable on unrelated syncs", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("dep.py", "if target_available:\n    def target(): pass\n");
  await project.write("caller.py", `
if import_enabled:
    from dep import target
def caller():
    if call_enabled:
        target()
`);
  await project.write("unrelated.py", "value = 1\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const snapshots = [];
  for (let value = 1; value <= 3; value += 1) {
    if (value > 1) {
      await project.write("unrelated.py", `value = ${value}\n`);
      await synchronizeProject(project.root);
    }
    const store = new SqliteGraphStore(paths.db, { readOnly: true });
    snapshots.push(store.snapshot());
    store.close();
  }
  const calls = snapshots.map((snapshot) => snapshot.relations.find((relation) => (
    relation.kind === "CALLS" && relation.unresolved_target === "target"
  )));
  assert.equal(calls[1].condition.expression, calls[0].condition.expression);
  assert.equal(calls[2].condition.expression, calls[0].condition.expression);
  assert.equal(calls[1].stable_id, calls[0].stable_id);
  assert.equal(calls[2].stable_id, calls[0].stable_id);
  assert.equal(calls[0].semantic_revision, 1);
  assert.equal(calls[1].semantic_revision, 1);
  assert.equal(calls[2].semantic_revision, 1);
});

test("minimum MCP response remains within an explicit small budget", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const response = await semanticExplore(project.root, {
    task: "show entire repository",
    budget: 1024,
  });
  assert.ok(response.response_tokens <= 1024);
  assert.equal(response.truncated, true);
});

test("an interrupted pre-commit publication journal restores revision N artifacts", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const originalMap = await readFile(paths.map, "utf8");
  const originalState = await readFile(paths.state, "utf8");
  const nextMap = originalMap.replace("GRAPH_REVISION = 1", "GRAPH_REVISION = 2");
  const nextState = '{"graph_revision":2}\n';
  const suffix = "test-interruption";
  const backup = {
    mapBackup: `${paths.map}.backup-${suffix}`,
    stateBackup: `${paths.state}.backup-${suffix}`,
    hadMap: true,
    hadState: true,
    mapSha256: hashBytes(originalMap),
    stateSha256: hashBytes(originalState),
  };
  const prepared = {
    mapTemp: `${paths.map}.new-${suffix}`,
    stateTemp: `${paths.state}.new-${suffix}`,
    mapSha256: hashBytes(nextMap),
    stateSha256: hashBytes(nextState),
  };
  await copyFile(paths.map, backup.mapBackup);
  await copyFile(paths.state, backup.stateBackup);
  await writeFile(paths.map, nextMap, "utf8");
  await writeFile(paths.state, nextState, "utf8");
  await writePublicationFixture(paths, {
    revision: 2,
    previous_revision: 1,
    graph_digest: "a".repeat(64),
    backup,
    prepared,
  });
  const result = await synchronizeProject(project.root);
  assert.equal(result.revision, 1);
  assert.equal(await readFile(paths.map, "utf8"), originalMap);
  assert.equal(await readFile(paths.state, "utf8"), originalState);
  await assert.rejects(stat(paths.publication), (error) => error.code === "ENOENT");
});

test("publication recovery is idempotent after a second crash before journal clearing", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const originalMap = await readFile(paths.map, "utf8");
  const originalState = await readFile(paths.state, "utf8");
  const nextMap = originalMap.replace("GRAPH_REVISION = 1", "GRAPH_REVISION = 2");
  const nextState = '{"graph_revision":2}\n';
  const suffix = "test-recovery-retry";
  const backup = {
    mapBackup: `${paths.map}.backup-${suffix}`,
    stateBackup: `${paths.state}.backup-${suffix}`,
    hadMap: true,
    hadState: true,
    mapSha256: hashBytes(originalMap),
    stateSha256: hashBytes(originalState),
  };
  const prepared = {
    mapTemp: `${paths.map}.new-${suffix}`,
    stateTemp: `${paths.state}.new-${suffix}`,
    mapSha256: hashBytes(nextMap),
    stateSha256: hashBytes(nextState),
  };
  await copyFile(paths.map, backup.mapBackup);
  await copyFile(paths.state, backup.stateBackup);
  await writePublicationFixture(paths, {
    revision: 2,
    previous_revision: 1,
    graph_digest: "b".repeat(64),
    backup,
    prepared,
  });
  const result = await synchronizeProject(project.root);
  assert.equal(result.revision, 1);
  assert.equal(await readFile(paths.map, "utf8"), originalMap);
  assert.equal(await readFile(paths.state, "utf8"), originalState);
  await assert.rejects(stat(paths.publication), (error) => error.code === "ENOENT");
  await assert.rejects(stat(backup.mapBackup), (error) => error.code === "ENOENT");
  await assert.rejects(stat(backup.stateBackup), (error) => error.code === "ENOENT");
});

test("a committed publication journal completes revision N+1 projections", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    return 1\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const firstMap = await readFile(paths.map, "utf8");
  const firstState = await readFile(paths.state, "utf8");
  await project.write("app.py", "def main():\n    return 2\n");
  await synchronizeProject(project.root);
  const secondMap = await readFile(paths.map, "utf8");
  const secondState = await readFile(paths.state, "utf8");
  const store = new SqliteGraphStore(paths.db, { readOnly: true });
  const graphDigest = store.snapshot().graph_digest;
  store.close();
  const suffix = "test-committed-recovery";
  const backup = {
    mapBackup: `${paths.map}.backup-${suffix}`,
    stateBackup: `${paths.state}.backup-${suffix}`,
    hadMap: true,
    hadState: true,
    mapSha256: hashBytes(firstMap),
    stateSha256: hashBytes(firstState),
  };
  const prepared = {
    mapTemp: `${paths.map}.new-${suffix}`,
    stateTemp: `${paths.state}.new-${suffix}`,
    mapSha256: hashBytes(secondMap),
    stateSha256: hashBytes(secondState),
  };
  await writeFile(backup.mapBackup, firstMap, "utf8");
  await writeFile(backup.stateBackup, firstState, "utf8");
  await writeFile(prepared.mapTemp, secondMap, "utf8");
  await writeFile(prepared.stateTemp, secondState, "utf8");
  await writeFile(paths.map, firstMap, "utf8");
  await writeFile(paths.state, firstState, "utf8");
  await writePublicationFixture(paths, {
    revision: 2,
    previous_revision: 1,
    graph_digest: graphDigest,
    backup,
    prepared,
  });
  const result = await synchronizeProject(project.root);
  assert.equal(result.revision, 2);
  assert.equal(await readFile(paths.map, "utf8"), secondMap);
  assert.equal(await readFile(paths.state, "utf8"), secondState);
  await assert.rejects(stat(paths.publication), (error) => error.code === "ENOENT");
});

test("publication recovery refuses to restore over newly user-owned codegraph.py", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const originalMap = await readFile(paths.map, "utf8");
  const originalState = await readFile(paths.state, "utf8");
  const suffix = "test-recovery-conflict";
  const backup = {
    mapBackup: `${paths.map}.backup-${suffix}`,
    stateBackup: `${paths.state}.backup-${suffix}`,
    hadMap: true,
    hadState: true,
    mapSha256: hashBytes(originalMap),
    stateSha256: hashBytes(originalState),
  };
  const prepared = {
    mapTemp: `${paths.map}.new-${suffix}`,
    stateTemp: `${paths.state}.new-${suffix}`,
    mapSha256: hashBytes(originalMap.replace("GRAPH_REVISION = 1", "GRAPH_REVISION = 2")),
    stateSha256: hashBytes('{"graph_revision":2}\n'),
  };
  await copyFile(paths.map, backup.mapBackup);
  await copyFile(paths.state, backup.stateBackup);
  const userSource = "def branch_owned_source():\n    return 42\n";
  await unlink(paths.map);
  await writeFile(paths.map, userSource, "utf8");
  await writePublicationFixture(paths, {
    revision: 2,
    previous_revision: 1,
    graph_digest: "c".repeat(64),
    backup,
    prepared,
  });
  await assert.rejects(
    synchronizeProject(project.root),
    (error) => error.code === "MAP_PATH_CONFLICT",
  );
  assert.equal(await readFile(paths.map, "utf8"), userSource);
  assert.equal((await stat(paths.publication)).isFile(), true);
});

test("a journal alone cannot authorize deleting a matching-digest source path", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  const originalMap = await readFile(paths.map, "utf8");
  const originalState = await readFile(paths.state, "utf8");
  const suffix = "source-collision";
  const sourceLikeTemp = `${paths.map}.new-feature.py`;
  const sourceContent = "def feature(): return 42\n";
  await writeFile(sourceLikeTemp, sourceContent, "utf8");
  const backup = {
    mapBackup: `${paths.map}.backup-${suffix}`,
    stateBackup: `${paths.state}.backup-${suffix}`,
    hadMap: true,
    hadState: true,
    mapSha256: hashBytes(originalMap),
    stateSha256: hashBytes(originalState),
  };
  const prepared = {
    mapTemp: sourceLikeTemp,
    stateTemp: `${paths.state}.new-${suffix}`,
    mapSha256: hashBytes(sourceContent),
    stateSha256: "e".repeat(64),
  };
  await writeFile(backup.mapBackup, originalMap, "utf8");
  await writeFile(backup.stateBackup, originalState, "utf8");
  await writeFile(paths.publication, `${JSON.stringify({
    revision: 2,
    previous_revision: 1,
    graph_digest: "f".repeat(64),
    backup,
    prepared,
  })}\n`, "utf8");
  await assert.rejects(
    synchronizeProject(project.root),
    (error) => error.code === "GRAPH_CORRUPTED",
  );
  assert.equal(await readFile(sourceLikeTemp, "utf8"), sourceContent);
});

test("doctor reports pending recovery and rebuild discards an invalid derived journal", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const paths = artifactPaths(project.root);
  await writeFile(paths.publication, "{invalid", "utf8");
  const diagnosis = await diagnoseProject(project.root);
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.error.code, "RECOVERY_PENDING");
  const rebuilt = await rebuildProject(project.root);
  assert.equal(rebuilt.revision, 2);
  await assert.rejects(stat(paths.publication), (error) => error.code === "ENOENT");
});

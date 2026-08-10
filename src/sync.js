import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  CODEGRAPH_DIR,
  CONFIG_FILE,
  DB_FILE,
  GRAPH_STATUS,
  MAP_FILE,
  MAP_OWNERSHIP_MARKER,
  RISK,
  STATE_FILE,
  VERSION,
} from "./constants.js";
import { compileContextMap, estimateTokens } from "./context-map.js";
import { readConfig, writeDefaultConfig } from "./config.js";
import { CodeGraphError } from "./errors.js";
import { readFileNoFollow } from "./fs-safe.js";
import { hashBytes, uniqueSorted } from "./ir.js";
import { parseSourceFile } from "./parser.js";
import { scanProject } from "./project.js";
import { resolveGraph } from "./resolver.js";
import { SqliteGraphStore } from "./store.js";

const inProcessSynchronizations = new Map();
const MATERIAL_SCAN_DIAGNOSTICS = new Set([
  "DIRECTORY_UNREADABLE",
  "PATH_UNREADABLE",
  "FILE_UNREADABLE",
  "PATH_CASE_COLLISION",
  "SYMLINK_SKIPPED",
  "NESTED_REPOSITORY_SKIPPED",
]);

export function artifactPaths(root) {
  const directory = join(root, CODEGRAPH_DIR);
  return {
    directory,
    db: join(directory, DB_FILE),
    state: join(directory, STATE_FILE),
    config: join(directory, CONFIG_FILE),
    map: join(root, MAP_FILE),
    publication: join(directory, "publication.json"),
    publicationArtifacts: join(directory, "publication-artifacts.json"),
    rebuild: join(directory, "rebuild.json"),
  };
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return false;
    throw error;
  }
}

async function validateArtifactPaths(root, paths, { allowMissingDirectory = false } = {}) {
  let directoryMetadata;
  try {
    directoryMetadata = await lstat(paths.directory);
  } catch (error) {
    if (error.code === "ENOENT" && allowMissingDirectory) return;
    throw error;
  }
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new CodeGraphError(
      "UNSAFE_ARTIFACT_PATH",
      ".codegraph must be a real project-local directory, not a symlink or another file type.",
      3,
    );
  }
  const canonicalRoot = await realpath(root);
  const canonicalDirectory = await realpath(paths.directory);
  if (canonicalDirectory !== join(canonicalRoot, CODEGRAPH_DIR)) {
    throw new CodeGraphError("UNSAFE_ARTIFACT_PATH", ".codegraph resolves outside the project boundary.", 3);
  }
  const artifactFiles = [
    paths.db,
    `${paths.db}-wal`,
    `${paths.db}-shm`,
    paths.config,
    paths.state,
    paths.map,
    paths.publication,
    paths.publicationArtifacts,
    paths.rebuild,
    join(paths.directory, "sync.lock"),
  ];
  for (const path of artifactFiles) {
    try {
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
        throw new CodeGraphError(
          "UNSAFE_ARTIFACT_PATH",
          `Derived artifact must be a single-link regular non-symlink file: ${path}`,
          3,
        );
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

async function fsyncFile(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fsyncDirectory(path) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM"].includes(error.code)) throw error;
  } finally {
    await handle?.close();
  }
}

async function writePrepared(path, value) {
  await writeFile(path, value, { encoding: "utf8", flag: "wx" });
  await fsyncFile(path);
}

function configFingerprint(config) {
  return hashBytes(JSON.stringify(config));
}

function semanticConfigFingerprint(config) {
  return hashBytes(JSON.stringify({
    exclude: config.exclude ?? [],
    generated_file_size_limit: config.generated_file_size_limit,
    source_file_size_limit: config.source_file_size_limit,
  }));
}

function canonicalDiagnostics(diagnostics) {
  return diagnostics
    .map((diagnostic) => ({
      code: diagnostic.code,
      path: diagnostic.path ?? "",
      other_path: diagnostic.other_path ?? null,
      message: diagnostic.message ?? null,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function diagnosticsMatch(left, right) {
  return JSON.stringify(canonicalDiagnostics(left)) === JSON.stringify(canonicalDiagnostics(right));
}

function materialDiagnosticPaths(diagnostics) {
  return uniqueSorted(diagnostics
    .filter((diagnostic) => MATERIAL_SCAN_DIAGNOSTICS.has(diagnostic.code))
    .map((diagnostic) => diagnostic.path || "."));
}

async function inspectArtifactFile(path) {
  try {
    const before = await lstat(path);
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
      throw new CodeGraphError(
        "UNSAFE_ARTIFACT_PATH",
        `Artifact must be a single-link regular non-symlink file: ${path}`,
        3,
      );
    }
    const bytes = await readFileNoFollow(path);
    const after = await lstat(path);
    if (before.dev !== after.dev || before.ino !== after.ino || after.nlink !== 1) {
      throw new CodeGraphError("UNSAFE_ARTIFACT_PATH", `Artifact changed while being inspected: ${path}`, 3);
    }
    return { bytes, digest: hashBytes(bytes), metadata: after };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function assertMapReplaceable(path, allowedDigests = []) {
  const inspected = await inspectArtifactFile(path);
  if (!inspected) return null;
  const generatedMarker = inspected.bytes.subarray(0, 1024).toString("utf8").includes(MAP_OWNERSHIP_MARKER);
  if (generatedMarker && allowedDigests.includes(inspected.digest)) return inspected;
  throw new CodeGraphError(
    "MAP_PATH_CONFLICT",
    "Root codegraph.py is no longer the generated map; refusing to overwrite user-owned source.",
    2,
  );
}

async function generatedMapOwned(path, statePath) {
  const state = await readState(statePath);
  const inspected = await inspectArtifactFile(path);
  return Boolean(inspected
    && inspected.bytes.subarray(0, 1024).toString("utf8").includes(MAP_OWNERSHIP_MARKER)
    && state?.map_sha256 === inspected.digest);
}

async function inspectLock(path) {
  const inspected = await inspectArtifactFile(path);
  if (!inspected) return null;
  const text = inspected.bytes.toString("utf8");
  let owner = null;
  let createdAt = inspected.metadata.mtimeMs;
  let token = null;
  try {
    const document = JSON.parse(text);
    owner = document.pid;
    createdAt = document.created_at;
    token = document.token;
  } catch {
    const lines = text.split(/\r?\n/u);
    owner = Number(lines[0]);
    createdAt = Number(lines[1]) || createdAt;
  }
  return { ...inspected, owner, createdAt, token };
}

async function removeMatchingLock(path, expected, { requireToken = false } = {}) {
  const current = await inspectLock(path);
  if (!current) return false;
  if (current.metadata.dev !== expected.metadata.dev || current.metadata.ino !== expected.metadata.ino) return false;
  if (requireToken && current.token !== expected.token) return false;
  const confirmed = await lstat(path);
  if (confirmed.dev !== expected.metadata.dev || confirmed.ino !== expected.metadata.ino) return false;
  await unlink(path);
  return true;
}

async function withProjectLock(root, operation) {
  const lockPath = join(root, CODEGRAPH_DIR, "sync.lock");
  const deadline = Date.now() + 10_000;
  let handle;
  let ownership;
  while (!handle) {
    try {
      const token = randomUUID();
      handle = await open(lockPath, "wx");
      const metadata = await handle.stat();
      ownership = { metadata, token };
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, created_at: Date.now(), token })}\n`, "utf8");
      await handle.sync();
    } catch (error) {
      if (error.code !== "EEXIST") {
        await handle?.close().catch(() => {});
        if (ownership) await removeMatchingLock(lockPath, ownership).catch(() => {});
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new CodeGraphError("SYNC_LOCK_TIMEOUT", "Timed out waiting for the project publish lock.", 3);
      }
      const lock = await inspectLock(lockPath);
      if (lock) {
        let stale = false;
        if (Number.isSafeInteger(lock.owner) && lock.owner > 0) {
          try {
            process.kill(lock.owner, 0);
          } catch (ownerError) {
            stale = ownerError.code === "ESRCH";
          }
        } else {
          stale = Date.now() - lock.createdAt > 60_000;
        }
        if (stale) await removeMatchingLock(lockPath, lock, { requireToken: Boolean(lock.token) });
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
  try {
    return await operation();
  } finally {
    await handle.close();
    await removeMatchingLock(lockPath, ownership, { requireToken: true });
  }
}

async function removeIfPresent(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function removeKnownJournal(path) {
  const inspected = await inspectArtifactFile(path);
  if (!inspected) return;
  const confirmed = await lstat(path);
  if (confirmed.dev !== inspected.metadata.dev || confirmed.ino !== inspected.metadata.ino) {
    throw new CodeGraphError("ARTIFACT_PATH_CONFLICT", `Recovery journal changed before removal: ${path}`, 3);
  }
  await unlink(path);
}

function sourceFingerprint(files, unsupportedFiles = []) {
  return hashBytes([...files, ...unsupportedFiles]
    .map((file) => `${file.path}\u0000${file.content_hash ?? "UNREADABLE"}`)
    .sort()
    .join("\u0000"));
}

async function observeUnsupportedFiles(scan) {
  const observed = [];
  for (const file of scan.unsupportedFiles ?? []) {
    try {
      observed.push({
        path: file.path,
        classification: file.classification,
        content_hash: hashBytes(await readFileNoFollow(file.absolutePath)),
      });
    } catch (error) {
      scan.diagnostics.push({ code: "FILE_UNREADABLE", path: file.path, message: error.message });
      observed.push({ path: file.path, classification: file.classification, content_hash: null });
    }
  }
  return observed;
}

function stateDocument(root, graph, revision, fingerprint, graphDigest, map, config, semanticConfigHash) {
  return {
    version: VERSION,
    project_root: root,
    graph_revision: revision,
    graph_digest: graphDigest,
    last_known_good_revision: graph.last_known_good_revision,
    source_fingerprint: fingerprint,
    semantic_config_hash: semanticConfigHash,
    graph_status: graph.health.status,
    mode: map.mode,
    profile: graph.profile,
    health: graph.health,
    stale_files: graph.health.stale_files,
    parse_failures: graph.health.parse_failures,
    codegraph_tokens: map.tokens,
    map_sha256: hashBytes(map.content),
    projection_config_hash: configFingerprint(config),
    generated_at: new Date().toISOString(),
  };
}

async function prepareMaterialization(paths, mapContent, state) {
  const nonce = `${process.pid}-${randomUUID()}`;
  const mapTemp = `${paths.map}.new-${nonce}`;
  const stateTemp = `${paths.state}.new-${nonce}`;
  const stateContent = `${JSON.stringify(state, null, 2)}\n`;
  try {
    await writePrepared(mapTemp, mapContent);
    await writePrepared(stateTemp, stateContent);
    return {
      mapTemp,
      stateTemp,
      mapSha256: hashBytes(mapContent),
      stateSha256: hashBytes(stateContent),
    };
  } catch (error) {
    await Promise.allSettled([removeIfPresent(mapTemp), removeIfPresent(stateTemp)]);
    throw error;
  }
}

async function backupMaterialization(paths) {
  const nonce = `${process.pid}-${randomUUID()}`;
  const mapBackup = `${paths.map}.backup-${nonce}`;
  const stateBackup = `${paths.state}.backup-${nonce}`;
  const state = await readState(paths.state);
  const map = await assertMapReplaceable(paths.map, [state?.map_sha256].filter(Boolean));
  const stateFile = await inspectArtifactFile(paths.state);
  try {
    if (map) await writePrepared(mapBackup, map.bytes);
    if (stateFile) await writePrepared(stateBackup, stateFile.bytes);
    return {
      mapBackup,
      stateBackup,
      hadMap: Boolean(map),
      hadState: Boolean(stateFile),
      mapSha256: map?.digest ?? null,
      stateSha256: stateFile?.digest ?? null,
    };
  } catch (error) {
    await Promise.allSettled([removeIfPresent(mapBackup), removeIfPresent(stateBackup)]);
    throw error;
  }
}

async function requireDigest(path, expectedDigest) {
  const inspected = await inspectArtifactFile(path);
  if (!inspected || inspected.digest !== expectedDigest) {
    throw new CodeGraphError("GRAPH_CORRUPTED", `Prepared artifact digest mismatch: ${path}`, 3);
  }
  return inspected;
}

async function installMaterialization(paths, prepared, backup) {
  const install = async (sourcePath, destination, digest, beforeInstall = null) => {
    const source = await inspectArtifactFile(sourcePath);
    if (!source) {
      const installed = await inspectArtifactFile(destination);
      if (installed?.digest === digest) return;
      throw new CodeGraphError("GRAPH_CORRUPTED", `Prepared artifact is missing: ${sourcePath}`, 3);
    }
    if (source.digest !== digest) {
      throw new CodeGraphError("GRAPH_CORRUPTED", `Prepared artifact digest mismatch: ${sourcePath}`, 3);
    }
    const temporary = `${destination}.install-${process.pid}-${randomUUID()}`;
    try {
      await writePrepared(temporary, source.bytes);
      await requireDigest(temporary, digest);
      await beforeInstall?.();
      await rename(temporary, destination);
    } catch (error) {
      await removeIfPresent(temporary).catch(() => {});
      throw error;
    }
  };
  await install(
    prepared.mapTemp,
    paths.map,
    prepared.mapSha256,
    () => assertMapReplaceable(paths.map, [backup.mapSha256, prepared.mapSha256].filter(Boolean)),
  );
  await install(prepared.stateTemp, paths.state, prepared.stateSha256);
  await fsyncDirectory(dirname(paths.map));
  await fsyncDirectory(dirname(paths.state));
}

async function restoreBackupFile(backupPath, destination, expectedDigest, beforeInstall = null) {
  const source = await inspectArtifactFile(backupPath);
  if (!source) {
    const restored = await inspectArtifactFile(destination);
    if (restored?.digest === expectedDigest) return;
    throw new CodeGraphError("GRAPH_CORRUPTED", `Backup artifact is missing: ${backupPath}`, 3);
  }
  if (source.digest !== expectedDigest) {
    throw new CodeGraphError("GRAPH_CORRUPTED", `Backup artifact digest mismatch: ${backupPath}`, 3);
  }
  const temporary = `${destination}.restore-${process.pid}-${randomUUID()}`;
  try {
    await writePrepared(temporary, source.bytes);
    await requireDigest(temporary, expectedDigest);
    await beforeInstall?.();
    await rename(temporary, destination);
  } catch (error) {
    await removeIfPresent(temporary).catch(() => {});
    throw error;
  }
}

async function restoreMaterialization(paths, backup, prepared = null) {
  if (backup.hadMap) {
    const allowedDigests = [backup.mapSha256, prepared?.mapSha256].filter(Boolean);
    await restoreBackupFile(
      backup.mapBackup,
      paths.map,
      backup.mapSha256,
      () => assertMapReplaceable(paths.map, allowedDigests),
    );
  } else {
    await assertMapReplaceable(paths.map, [prepared?.mapSha256].filter(Boolean));
    await removeIfPresent(paths.map);
  }
  if (backup.hadState) {
    await restoreBackupFile(backup.stateBackup, paths.state, backup.stateSha256);
  } else await removeIfPresent(paths.state);
  await fsyncDirectory(dirname(paths.map));
  await fsyncDirectory(dirname(paths.state));
}

async function removeRecordedArtifact(path, expectedDigest) {
  const inspected = await inspectArtifactFile(path);
  if (!inspected) return;
  if (!expectedDigest || inspected.digest !== expectedDigest) {
    throw new CodeGraphError(
      "ARTIFACT_PATH_CONFLICT",
      `Refusing to remove an unrecognized file at a journal artifact path: ${path}`,
      3,
    );
  }
  const confirmed = await lstat(path);
  if (confirmed.dev !== inspected.metadata.dev || confirmed.ino !== inspected.metadata.ino) {
    throw new CodeGraphError("ARTIFACT_PATH_CONFLICT", `Journal artifact changed before removal: ${path}`, 3);
  }
  await unlink(path);
}

async function discardBackup(backup) {
  await removeRecordedArtifact(backup.mapBackup, backup.mapSha256);
  await removeRecordedArtifact(backup.stateBackup, backup.stateSha256);
}

async function discardPrepared(prepared) {
  await removeRecordedArtifact(prepared.mapTemp, prepared.mapSha256);
  await removeRecordedArtifact(prepared.stateTemp, prepared.stateSha256);
}

function safePublicationPath(candidate, prefix) {
  return typeof candidate === "string"
    && dirname(candidate) === dirname(prefix)
    && candidate.startsWith(prefix);
}

async function writePublicationJournal(paths, publication) {
  const temporary = `${paths.publication}.new-${process.pid}-${randomUUID()}`;
  await writePrepared(temporary, `${JSON.stringify(publication, null, 2)}\n`);
  await rename(temporary, paths.publication);
  await fsyncDirectory(paths.directory);
}

async function writePublicationArtifactRegistry(paths, prepared, backup) {
  const document = { prepared, backup };
  const content = `${JSON.stringify(document, null, 2)}\n`;
  const temporary = `${paths.publicationArtifacts}.new-${process.pid}-${randomUUID()}`;
  await writePrepared(temporary, content);
  await rename(temporary, paths.publicationArtifacts);
  await fsyncDirectory(paths.directory);
  return hashBytes(content);
}

async function readPublicationArtifactRegistry(paths) {
  try {
    const bytes = await readFileNoFollow(paths.publicationArtifacts);
    return {
      document: JSON.parse(bytes.toString("utf8")),
      digest: hashBytes(bytes),
    };
  } catch (error) {
    throw new CodeGraphError("GRAPH_CORRUPTED", `Invalid publication artifact registry: ${error.message}`, 3);
  }
}

async function clearPublicationJournal(paths) {
  await removeIfPresent(paths.publication);
  await fsyncDirectory(paths.directory);
}

async function writeRebuildJournal(paths, rebuild) {
  const temporary = `${paths.rebuild}.new-${process.pid}-${randomUUID()}`;
  await writePrepared(temporary, `${JSON.stringify(rebuild, null, 2)}\n`);
  await rename(temporary, paths.rebuild);
  await fsyncDirectory(paths.directory);
}

async function clearRebuildJournal(paths) {
  await removeIfPresent(paths.rebuild);
  await fsyncDirectory(paths.directory);
}

function validDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

async function recoverInterruptedRebuild(paths) {
  let rebuild;
  try {
    rebuild = JSON.parse((await readFileNoFollow(paths.rebuild)).toString("utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new CodeGraphError("GRAPH_CORRUPTED", `Invalid rebuild journal: ${error.message}`, 3);
  }
  const canonicalMembers = [paths.db, `${paths.db}-wal`, `${paths.db}-shm`];
  const valid = Number.isSafeInteger(rebuild.previous_revision)
    && rebuild.previous_revision >= 0
    && Array.isArray(rebuild.members)
    && rebuild.members.length === canonicalMembers.length
    && rebuild.members.every((member, index) => (
      member.path === canonicalMembers[index]
      && safePublicationPath(member.backup, `${canonicalMembers[index]}.rebuild-backup-`)
      && typeof member.had_file === "boolean"
      && (member.had_file ? validDigest(member.digest) : member.digest === null)
    ));
  if (!valid) {
    throw new CodeGraphError("GRAPH_CORRUPTED", "Rebuild journal contains unsafe paths.", 3);
  }

  let currentRevision = null;
  let currentValid = false;
  let store;
  try {
    if (await pathExists(paths.db)) {
      store = new SqliteGraphStore(paths.db, { readOnly: true });
      store.validateCompatibility();
      currentRevision = store.snapshot().revision;
      currentValid = true;
    }
  } catch {
    currentValid = false;
  } finally {
    store?.close();
  }
  const backupPresence = await Promise.all(rebuild.members.map((member) => pathExists(member.backup)));
  if (!(currentValid && (currentRevision > rebuild.previous_revision
      || (currentRevision === rebuild.previous_revision && backupPresence.every((present) => !present))))) {
    for (let index = 0; index < rebuild.members.length; index += 1) {
      const member = rebuild.members[index];
      if (member.had_file) {
        if (backupPresence[index]) {
          await restoreBackupFile(member.backup, member.path, member.digest);
        } else {
          const current = await inspectArtifactFile(member.path);
          if (!current || current.digest !== member.digest) {
            throw new CodeGraphError("GRAPH_CORRUPTED", "Rebuild backup is missing or invalid.", 3);
          }
        }
      } else {
        await removeIfPresent(member.path);
      }
    }
    await fsyncDirectory(paths.directory);
  }
  await clearRebuildJournal(paths);
  await Promise.allSettled(rebuild.members.map((member) => removeIfPresent(member.backup)));
}

async function recoverInterruptedPublication(paths) {
  let publication;
  try {
    publication = JSON.parse((await readFileNoFollow(paths.publication)).toString("utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      await removeKnownJournal(paths.publicationArtifacts);
      return;
    }
    throw new CodeGraphError("GRAPH_CORRUPTED", `Invalid publication journal: ${error.message}`, 3);
  }
  const artifactRegistry = await readPublicationArtifactRegistry(paths);
  const digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
  const valid = Number.isSafeInteger(publication.revision)
    && publication.revision > 0
    && digest(publication.graph_digest)
    && digest(publication.artifact_registry_digest)
    && publication.artifact_registry_digest === artifactRegistry.digest
    && JSON.stringify(publication.prepared) === JSON.stringify(artifactRegistry.document.prepared)
    && JSON.stringify(publication.backup) === JSON.stringify(artifactRegistry.document.backup)
    && safePublicationPath(publication.prepared?.mapTemp, `${paths.map}.new-`)
    && safePublicationPath(publication.prepared?.stateTemp, `${paths.state}.new-`)
    && digest(publication.prepared?.mapSha256)
    && digest(publication.prepared?.stateSha256)
    && safePublicationPath(publication.backup?.mapBackup, `${paths.map}.backup-`)
    && safePublicationPath(publication.backup?.stateBackup, `${paths.state}.backup-`)
    && typeof publication.backup?.hadMap === "boolean"
    && typeof publication.backup?.hadState === "boolean"
    && (publication.backup.hadMap
      ? digest(publication.backup.mapSha256)
      : publication.backup.mapSha256 === null)
    && (publication.backup.hadState
      ? digest(publication.backup.stateSha256)
      : publication.backup.stateSha256 === null);
  if (!valid) {
    throw new CodeGraphError("GRAPH_CORRUPTED", "Publication journal contains unsafe paths.", 3);
  }

  let databaseRevision = 0;
  let databaseDigest = null;
  let store;
  try {
    if (await pathExists(paths.db)) {
      store = new SqliteGraphStore(paths.db, { readOnly: true });
      store.validateCompatibility();
      databaseRevision = store.currentRevision();
      if (databaseRevision === publication.revision) {
        databaseDigest = store.snapshot().graph_digest;
      }
    }
  } finally {
    store?.close();
  }
  if (databaseRevision === publication.revision && databaseDigest === publication.graph_digest) {
    await installMaterialization(paths, publication.prepared, publication.backup);
  } else {
    await restoreMaterialization(paths, publication.backup, publication.prepared);
  }
  await discardPrepared(publication.prepared);
  await discardBackup(publication.backup);
  await clearPublicationJournal(paths);
  await removeKnownJournal(paths.publicationArtifacts);
}

async function replaceMaterializationSafely(paths, prepared) {
  const backup = await backupMaterialization(paths);
  try {
    await installMaterialization(paths, prepared, backup);
    await discardPrepared(prepared);
    await discardBackup(backup);
  } catch (error) {
    await restoreMaterialization(paths, backup, prepared);
    await discardPrepared(prepared);
    await discardBackup(backup);
    throw error;
  }
}

function copyLastKnownGood(current, failed, revision) {
  const staleRisks = [RISK.PARTIAL_PARSE, RISK.STALE_SOURCE];
  const entities = current.entities.map((entity) => ({
    ...entity,
    risk_flags: uniqueSorted([...(entity.risk_flags ?? []), RISK.STALE_SOURCE]),
  }));
  const relations = current.relations.map((relation) => ({
    ...relation,
    risk_flags: uniqueSorted([...(relation.risk_flags ?? []), RISK.STALE_SOURCE]),
  }));
  return {
    ...current,
    absolutePath: failed.absolutePath,
    size: failed.size,
    mtimeMs: failed.mtimeMs,
    content_hash: failed.content_hash,
    parse_status: "FAILED",
    parse_error: failed.parse_error,
    stale: true,
    last_good_revision: current.last_good_revision ?? revision,
    last_good_content_hash: current.last_good_content_hash ?? current.content_hash,
    risk_flags: uniqueSorted([...(current.risk_flags ?? []), ...staleRisks]),
    entities,
    relations,
  };
}

function diagnosticCoversPath(diagnostic, path) {
  if (!["DIRECTORY_UNREADABLE", "PATH_UNREADABLE", "FILE_UNREADABLE"].includes(diagnostic.code)) return false;
  return path === diagnostic.path || path.startsWith(`${diagnostic.path}/`);
}

async function buildParsedFiles(scan, previousFiles, config, currentRevision, forceFull) {
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file]));
  const parsedFiles = [];
  const changedPaths = [];
  const observedHashes = new Map();
  const parseStart = performance.now();

  for (const scanned of scan.files) {
    const previous = previousByPath.get(scanned.path);
    let observedHash;
    try {
      observedHash = hashBytes(await readFileNoFollow(scanned.absolutePath));
      observedHashes.set(scanned.path, observedHash);
    } catch (error) {
      scan.diagnostics.push({ code: "FILE_UNREADABLE", path: scanned.path, message: error.message });
      if (previous) {
        const failed = {
          ...scanned,
          content_hash: previous.content_hash,
          parse_error: `File became unreadable during synchronization: ${error.message}`,
        };
        const retained = copyLastKnownGood(previous, failed, currentRevision);
        parsedFiles.push(retained);
        if (!previous.stale || previous.parse_error !== failed.parse_error) changedPaths.push(scanned.path);
      }
      continue;
    }
    if (!forceFull && previous && observedHash === previous.content_hash) {
      parsedFiles.push({
        ...previous,
        absolutePath: scanned.absolutePath,
        size: scanned.size,
        mtimeMs: scanned.mtimeMs,
      });
      continue;
    }
    changedPaths.push(scanned.path);
    const parsed = await parseSourceFile(scanned, config);
    observedHashes.set(scanned.path, parsed.content_hash);
    if (parsed.parse_status === "FAILED" && previous?.entities.length > 0) {
      parsedFiles.push(copyLastKnownGood(previous, parsed, currentRevision));
    } else {
      parsed.stale = parsed.parse_status === "FAILED";
      parsed.last_good_revision = parsed.stale ? null : currentRevision + 1;
      parsed.last_good_content_hash = parsed.stale ? null : parsed.content_hash;
      for (const entity of parsed.entities) entity.semantic_revision = currentRevision + 1;
      for (const relation of parsed.relations) relation.semantic_revision = currentRevision + 1;
      parsedFiles.push(parsed);
    }
  }
  const scannedPaths = new Set(scan.files.map((file) => file.path));
  const deletedPaths = [];
  for (const previous of previousFiles.filter((file) => !scannedPaths.has(file.path))) {
    const diagnostic = scan.diagnostics.find((item) => diagnosticCoversPath(item, previous.path));
    if (!diagnostic) {
      deletedPaths.push(previous.path);
      continue;
    }
    const failed = {
      ...previous,
      content_hash: previous.content_hash,
      parse_error: `Source could not be reconciled: ${diagnostic.message ?? diagnostic.code}`,
    };
    parsedFiles.push(copyLastKnownGood(previous, failed, currentRevision));
    if (!previous.stale || previous.parse_error !== failed.parse_error) changedPaths.push(previous.path);
  }
  return {
    parsedFiles,
    changedPaths,
    deletedPaths,
    observedHashes,
    parseDurationMs: performance.now() - parseStart,
  };
}

function addScanDiagnostics(graph, diagnostics) {
  graph.health.scan_diagnostics = diagnostics;
  const hasCollision = diagnostics.some((item) => item.code === "PATH_CASE_COLLISION");
  const hasUnreadable = diagnostics.some((item) => [
    "DIRECTORY_UNREADABLE",
    "PATH_UNREADABLE",
    "FILE_UNREADABLE",
  ].includes(item.code));
  const hasBoundary = diagnostics.some((item) => [
    "SYMLINK_SKIPPED",
    "NESTED_REPOSITORY_SKIPPED",
  ].includes(item.code));
  if (hasCollision || hasUnreadable || hasBoundary) {
    const risks = [
      ...(graph.health.risk_flags ?? []),
      hasCollision ? RISK.AMBIGUOUS_SYMBOL : null,
      hasUnreadable || hasBoundary ? RISK.UNSUPPORTED_SEMANTICS : null,
      hasUnreadable ? RISK.STALE_SOURCE : null,
    ];
    graph.health.stale_files = uniqueSorted([
      ...(graph.health.stale_files ?? []),
      ...materialDiagnosticPaths(diagnostics),
    ]);
    graph.health.stale_file_count = graph.health.stale_files.length;
    graph.health.status = GRAPH_STATUS.PARTIAL;
    graph.health.impact_completeness = "INCOMPLETE";
    graph.health.risk_flags = uniqueSorted(risks);
  }
}

function addUnsupportedCoverage(graph, unsupportedFiles) {
  graph.health.unsupported_files = unsupportedFiles;
  graph.health.unsupported_file_count = unsupportedFiles.length;
  const total = graph.files.length + unsupportedFiles.length;
  graph.health.supported_file_coverage = total === 0 ? 1 : graph.files.length / total;
  graph.profile.unsupported_file_count = unsupportedFiles.length;
  if (unsupportedFiles.length > 0) {
    graph.health.risk_flags = uniqueSorted([
      ...graph.health.risk_flags,
      RISK.UNSUPPORTED_SEMANTICS,
      unsupportedFiles.some((file) => file.classification === "CONFIG")
        ? RISK.RUNTIME_REGISTRATION
        : RISK.CROSS_LANGUAGE_BOUNDARY,
    ]);
    graph.health.impact_completeness = "INCOMPLETE";
  }
}

async function repositoryStillMatches(root, config, observedHashes, expectedDiagnostics) {
  const verification = await scanProject(root, config);
  const relevantFiles = [...verification.files, ...(verification.unsupportedFiles ?? [])];
  if (relevantFiles.length !== observedHashes.size) return false;
  for (const file of relevantFiles) {
    const expected = observedHashes.get(file.path);
    if (expected === undefined) return false;
    try {
      if (hashBytes(await readFileNoFollow(file.absolutePath)) !== expected) return false;
    } catch (error) {
      verification.diagnostics.push({ code: "FILE_UNREADABLE", path: file.path, message: error.message });
      if (expected !== null) return false;
    }
  }
  return diagnosticsMatch(verification.diagnostics, expectedDiagnostics);
}

async function readState(path) {
  try {
    const inspected = await inspectArtifactFile(path);
    return inspected ? JSON.parse(inspected.bytes.toString("utf8")) : null;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function materializationMatches(paths, snapshot, config) {
  const state = await readState(paths.state);
  const expectedMap = compileContextMap(snapshot, snapshot.revision, config);
  const expectedProfile = {
    ...snapshot.profile,
    estimated_codegraph_tokens: expectedMap.tokens,
  };
  if (state?.version !== VERSION
      || state.graph_revision !== snapshot.revision
      || state.graph_digest !== snapshot.graph_digest
      || state.source_fingerprint !== snapshot.source_fingerprint
      || state.semantic_config_hash !== snapshot.semantic_config_hash
      || state.graph_status !== snapshot.status
      || state.last_known_good_revision !== snapshot.last_known_good_revision
      || state.mode !== expectedMap.mode
      || JSON.stringify(state.profile) !== JSON.stringify(expectedProfile)
      || JSON.stringify(state.health) !== JSON.stringify(snapshot.health)
      || JSON.stringify(state.stale_files) !== JSON.stringify(snapshot.health.stale_files)
      || JSON.stringify(state.parse_failures) !== JSON.stringify(snapshot.health.parse_failures)
      || state.codegraph_tokens !== expectedMap.tokens
      || state.map_sha256 !== hashBytes(expectedMap.content)
      || state.projection_config_hash !== configFingerprint(config)) return false;
  try {
    const inspected = await inspectArtifactFile(paths.map);
    if (!inspected) return false;
    const map = inspected.bytes.toString("utf8");
    const tokens = estimateTokens(map);
    return inspected.digest === hashBytes(expectedMap.content)
      && map.includes(`GRAPH_REVISION = ${snapshot.revision}`)
      && map.slice(0, 1024).includes(MAP_OWNERSHIP_MARKER)
      && state.map_sha256 === inspected.digest
      && state.codegraph_tokens === tokens
      && tokens <= config.map_hard_cap_tokens;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function rematerialize(paths, snapshot, config) {
  const map = compileContextMap(snapshot, snapshot.revision, config);
  snapshot.profile.estimated_codegraph_tokens = map.tokens;
  const state = stateDocument(
    dirname(paths.directory),
    snapshot,
    snapshot.revision,
    snapshot.source_fingerprint,
    snapshot.graph_digest,
    map,
    config,
    snapshot.semantic_config_hash,
  );
  const prepared = await prepareMaterialization(paths, map.content, state);
  await replaceMaterializationSafely(paths, prepared);
  return map;
}

export async function initializeProject(root) {
  const paths = artifactPaths(root);
  await validateArtifactPaths(root, paths, { allowMissingDirectory: true });
  if (await pathExists(paths.db)) {
    throw new CodeGraphError("PROJECT_ALREADY_INITIALIZED", "This project already has a graph. Use sync or rebuild.", 2);
  }
  if (await pathExists(paths.map)) {
    throw new CodeGraphError(
      "MAP_PATH_CONFLICT",
      "A user-owned root codegraph.py already exists; initialization will not overwrite source.",
      2,
    );
  }
  await mkdir(paths.directory, { recursive: true });
  await validateArtifactPaths(root, paths);
  try {
    await writeDefaultConfig(paths.config);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  return synchronizeProject(root, { forceFull: true });
}

async function synchronizeOnce(root, { forceFull = false, revisionFloor = 0, skipRebuildRecovery = false } = {}) {
  const started = performance.now();
  const paths = artifactPaths(root);
  if (!(await pathExists(paths.directory))) {
    throw new CodeGraphError("PROJECT_NOT_INITIALIZED", "Run codegraph init before synchronization.", 2);
  }
  await validateArtifactPaths(root, paths);
  if (!skipRebuildRecovery) await recoverInterruptedRebuild(paths);
  await recoverInterruptedPublication(paths);
  const config = await readConfig(paths.config);
  const semanticConfigHash = semanticConfigFingerprint(config);
  const databaseExists = await pathExists(paths.db);
  const store = new SqliteGraphStore(paths.db);
  let prepared;
  let backup;
  let publication;
  try {
    if (databaseExists) store.validateCompatibility();
    else store.initializeSchema();
    const currentRevision = store.currentRevision();
    const revisionBase = Math.max(currentRevision, revisionFloor);
    const previousSnapshot = currentRevision ? store.snapshot() : null;
    const previousFiles = previousSnapshot?.files ?? [];
    const semanticConfigChanged = currentRevision > 0
      && previousSnapshot.semantic_config_hash !== semanticConfigHash;
    const scan = await scanProject(root, config);
    const unsupportedFiles = await observeUnsupportedFiles(scan);
    const build = await buildParsedFiles(
      scan,
      previousFiles,
      config,
      revisionBase,
      forceFull || semanticConfigChanged,
    );
    for (const file of unsupportedFiles) build.observedHashes.set(file.path, file.content_hash);
    const previousUnsupported = previousSnapshot?.health.unsupported_files ?? [];
    const unsupportedChanged = JSON.stringify(unsupportedFiles) !== JSON.stringify(previousUnsupported);
    const diagnosticsChanged = !diagnosticsMatch(
      scan.diagnostics,
      previousSnapshot?.health.scan_diagnostics ?? [],
    );
    const changed = forceFull
      || currentRevision === 0
      || semanticConfigChanged
      || build.changedPaths.length > 0
      || build.deletedPaths.length > 0
      || unsupportedChanged
      || diagnosticsChanged;

    if (!changed) {
      const snapshot = previousSnapshot;
      if (!(await materializationMatches(paths, snapshot, config))) {
        await rematerialize(paths, snapshot, config);
      }
      return {
        changed: false,
        revision: snapshot.revision,
        status: snapshot.status,
        changed_files: [],
        deleted_files: [],
        profile: snapshot.profile,
        health: snapshot.health,
      };
    }

    const revision = revisionBase + 1;
    const graph = resolveGraph(build.parsedFiles, {
      parseDurationMs: build.parseDurationMs,
      syncDurationMs: performance.now() - started,
    });
    const previousSemanticHashes = new Map(previousFiles.map((file) => [file.path, file.semantic_hash]));
    for (const file of graph.files) {
      if (previousSemanticHashes.get(file.path) === file.semantic_hash) continue;
      for (const entity of file.entities) entity.semantic_revision = revision;
      for (const relation of file.relations) relation.semantic_revision = revision;
    }
    addScanDiagnostics(graph, scan.diagnostics);
    addUnsupportedCoverage(graph, unsupportedFiles);
    if (!(await repositoryStillMatches(root, config, build.observedHashes, scan.diagnostics))
        || configFingerprint(await readConfig(paths.config)) !== configFingerprint(config)) {
      throw new CodeGraphError(
        "REVISION_CONFLICT",
        "Repository changed while a semantic revision was being built; retrying is required.",
        3,
      );
    }
    const fingerprint = sourceFingerprint(graph.files, unsupportedFiles);
    graph.last_known_good_revision = graph.health.status === GRAPH_STATUS.FRESH
      ? revision
      : store.latestFreshRevision();
    const map = compileContextMap(graph, revision, config);
    graph.profile.estimated_codegraph_tokens = map.tokens;
    graph.profile.sync_latency_ms = performance.now() - started;
    backup = await backupMaterialization(paths);
    publication = store.stagePublish(graph, {
      revision,
      sourceFingerprint: fingerprint,
      mode: map.mode,
      semanticConfigHash,
    });
    const state = stateDocument(
      root,
      graph,
      revision,
      fingerprint,
      publication.graphDigest,
      map,
      config,
      semanticConfigHash,
    );
    prepared = await prepareMaterialization(paths, map.content, state);
    let databaseCommitted = false;
    try {
      const artifactRegistryDigest = await writePublicationArtifactRegistry(paths, prepared, backup);
      await writePublicationJournal(paths, {
        revision,
        previous_revision: currentRevision,
        graph_digest: publication.graphDigest,
        artifact_registry_digest: artifactRegistryDigest,
        prepared,
        backup,
      });
      publication.commit();
      publication = null;
      databaseCommitted = true;
      await installMaterialization(paths, prepared, backup);
    } catch (error) {
      if (!databaseCommitted) {
        publication?.rollback();
        publication = null;
        await restoreMaterialization(paths, backup, prepared);
        await discardPrepared(prepared);
        prepared = null;
        await discardBackup(backup);
        backup = null;
        await clearPublicationJournal(paths);
        await removeKnownJournal(paths.publicationArtifacts);
      }
      throw new CodeGraphError(
        "MATERIALIZATION_FAILED",
        databaseCommitted
          ? `Revision ${revision} graph data committed but projection publication is pending recovery: ${error.message}`
          : `Revision ${revision} was rolled back because generated files could not be published: ${error.message}`,
        3,
      );
    }
    try {
      await discardPrepared(prepared);
      prepared = null;
      await discardBackup(backup);
      backup = null;
      await clearPublicationJournal(paths);
      await removeKnownJournal(paths.publicationArtifacts);
    } catch {}
    try {
      store.checkpoint();
    } catch {}
    return {
      changed: true,
      revision,
      status: graph.health.status,
      changed_files: build.changedPaths,
      deleted_files: build.deletedPaths,
      profile: graph.profile,
      health: graph.health,
    };
  } finally {
    publication?.rollback();
    store.close();
    const journalPresent = await pathExists(paths.publication).catch(() => true);
    if (backup && !journalPresent) await discardBackup(backup);
    if (prepared && !journalPresent) {
      await Promise.allSettled([
        removeIfPresent(prepared.mapTemp),
        removeIfPresent(prepared.stateTemp),
      ]);
    }
  }
}

export function synchronizeProject(root, options = {}) {
  const key = root;
  if (inProcessSynchronizations.has(key)) return inProcessSynchronizations.get(key);
  const operation = (async () => {
    const paths = artifactPaths(root);
    if (!(await pathExists(paths.directory))) {
      throw new CodeGraphError("PROJECT_NOT_INITIALIZED", "Run codegraph init before synchronization.", 2);
    }
    await validateArtifactPaths(root, paths);
    return withProjectLock(root, async () => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await synchronizeOnce(root, options);
      } catch (error) {
        lastError = error;
        if (error.code !== "REVISION_CONFLICT") throw error;
      }
    }
    throw lastError;
    });
  })();
  inProcessSynchronizations.set(key, operation);
  operation.finally(() => inProcessSynchronizations.delete(key)).catch(() => {});
  return operation;
}

export async function projectStatus(root) {
  const paths = artifactPaths(root);
  if (!(await pathExists(paths.db))) {
    throw new CodeGraphError("PROJECT_NOT_INITIALIZED", "Run codegraph init first.", 2);
  }
  await validateArtifactPaths(root, paths);
  const config = await readConfig(paths.config);
  const store = new SqliteGraphStore(paths.db, { readOnly: true });
  try {
    store.validateCompatibility();
    const snapshot = store.snapshot();
    const scan = await scanProject(root, config);
    const unsupportedFiles = await observeUnsupportedFiles(scan);
    const previousByPath = new Map(snapshot.files.map((file) => [file.path, file]));
    const staleFiles = [];
    for (const file of scan.files) {
      const previous = previousByPath.get(file.path);
      if (!previous) {
        staleFiles.push(file.path);
        continue;
      }
      try {
        if (hashBytes(await readFileNoFollow(file.absolutePath)) !== previous.content_hash) staleFiles.push(file.path);
      } catch (error) {
        scan.diagnostics.push({ code: "FILE_UNREADABLE", path: file.path, message: error.message });
        staleFiles.push(file.path);
      }
    }
    const scannedPaths = new Set(scan.files.map((file) => file.path));
    for (const file of snapshot.files.filter((item) => !scannedPaths.has(item.path))) {
      staleFiles.push(file.path);
    }
    const previousUnsupported = new Map(
      (snapshot.health.unsupported_files ?? []).map((file) => [file.path, file.content_hash]),
    );
    for (const file of unsupportedFiles) {
      if (previousUnsupported.get(file.path) !== file.content_hash) staleFiles.push(file.path);
      previousUnsupported.delete(file.path);
    }
    staleFiles.push(...previousUnsupported.keys());
    const diagnosticsCurrent = diagnosticsMatch(
      scan.diagnostics,
      snapshot.health.scan_diagnostics ?? [],
    );
    if (!diagnosticsCurrent) staleFiles.push(...materialDiagnosticPaths(scan.diagnostics));
    const materialized = await materializationMatches(paths, snapshot, config);
    const fresh = staleFiles.length === 0 && diagnosticsCurrent && materialized;
    return {
      initialized: true,
      graph_revision: snapshot.revision,
      graph_status: fresh ? snapshot.status : GRAPH_STATUS.STALE,
      published_status: snapshot.status,
      fresh,
      materialized,
      stale_files: uniqueSorted([...staleFiles, ...(snapshot.health.stale_files ?? [])]),
      health: snapshot.health,
      profile: { ...snapshot.profile, graph_db_size: await store.size() },
      scan_diagnostics: scan.diagnostics,
    };
  } finally {
    store.close();
  }
}

export async function rebuildProject(root) {
  const paths = artifactPaths(root);
  if (!(await pathExists(paths.directory))) {
    throw new CodeGraphError("PROJECT_NOT_INITIALIZED", "Run codegraph init first.", 2);
  }
  await validateArtifactPaths(root, paths);
  return withProjectLock(root, async () => {
    try {
      await recoverInterruptedRebuild(paths);
    } catch (error) {
      if (error.code !== "GRAPH_CORRUPTED") throw error;
      await removeKnownJournal(paths.rebuild);
    }
    try {
      await recoverInterruptedPublication(paths);
    } catch (error) {
      if (error.code !== "GRAPH_CORRUPTED") throw error;
      await removeKnownJournal(paths.publication);
      await removeKnownJournal(paths.publicationArtifacts);
    }
    const nonce = `${process.pid}-${randomUUID()}`;
    const members = [paths.db, `${paths.db}-wal`, `${paths.db}-shm`];
    const backups = members.map((path) => `${path}.rebuild-backup-${nonce}`);
    let revisionFloor = 0;
    try {
      if (await pathExists(paths.db)) {
        let existing;
        try {
          existing = new SqliteGraphStore(paths.db);
          existing.validateCompatibility();
          const candidateRevision = existing.currentRevision();
          const state = await readState(paths.state);
          const map = await inspectArtifactFile(paths.map);
          if (Number.isSafeInteger(candidateRevision)
              && candidateRevision > 0
              && candidateRevision < Number.MAX_SAFE_INTEGER
              && state?.graph_revision === candidateRevision
              && state.map_sha256 === map?.digest
              && map?.bytes.subarray(0, 1024).toString("utf8").includes(MAP_OWNERSHIP_MARKER)) {
            revisionFloor = candidateRevision;
          }
          existing.snapshot();
          existing.checkpoint();
        } catch {
          // A corrupt graph is still recoverable because all state is derived.
        } finally {
          existing?.close();
        }
      }
      const journalMembers = [];
      for (let index = 0; index < members.length; index += 1) {
        const inspected = await inspectArtifactFile(members[index]);
        journalMembers.push({
          path: members[index],
          backup: backups[index],
          had_file: Boolean(inspected),
          digest: inspected?.digest ?? null,
        });
      }
      await writeRebuildJournal(paths, {
        previous_revision: revisionFloor,
        members: journalMembers,
      });
      for (let index = 0; index < members.length; index += 1) {
        if (await pathExists(members[index])) await rename(members[index], backups[index]);
      }
      await fsyncDirectory(paths.directory);
      const result = await synchronizeOnce(root, {
        forceFull: true,
        revisionFloor,
        skipRebuildRecovery: true,
      });
      await clearRebuildJournal(paths);
      await Promise.allSettled(backups.map(removeIfPresent));
      return result;
    } catch (error) {
      await recoverInterruptedRebuild(paths);
      throw error;
    }
  });
}

export async function removeDerivedProject(root) {
  const paths = artifactPaths(root);
  await validateArtifactPaths(root, paths);
  const state = await readState(paths.state);
  const ownedMap = await generatedMapOwned(paths.map, paths.state);
  await rm(paths.directory, { recursive: true, force: true });
  if (ownedMap) {
    const map = await inspectArtifactFile(paths.map);
    if (map?.digest === state?.map_sha256
        && map.bytes.subarray(0, 1024).toString("utf8").includes(MAP_OWNERSHIP_MARKER)) {
      await removeIfPresent(paths.map);
    }
  }
}

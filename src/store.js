import { lstatSync } from "node:fs";
import { stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { CONFIDENCE, PARSER_VERSION, SCHEMA_VERSION } from "./constants.js";
import { CodeGraphError } from "./errors.js";
import { hashBytes } from "./ir.js";

const INTEGRITY_VERSION = "3";

function json(value) {
  return JSON.stringify(value ?? null);
}

function fromJson(value, fallback, field = "persisted JSON") {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new CodeGraphError("GRAPH_CORRUPTED", `Invalid ${field}: ${error.message}`, 3);
  }
}

function locationColumns(location) {
  return [
    location.start_line,
    location.start_column,
    location.end_line,
    location.end_column,
  ];
}

function rowLocation(row) {
  return {
    file_path: row.file_path,
    start_line: row.start_line,
    start_column: row.start_column,
    end_line: row.end_line,
    end_column: row.end_column,
  };
}

function assertGraphReferences(files, entities, relations, regions, ftsIds) {
  const filePaths = new Set(files.map((file) => file.path));
  const entityIds = new Set(entities.map((entity) => entity.stable_id));
  const entitiesById = new Map(entities.map((entity) => [entity.stable_id, entity]));
  const regionIds = new Set(regions.map((region) => region.stable_id));
  const invalidEntity = entities.find((entity) => (
    !filePaths.has(entity.file_path) || !regionIds.has(entity.region_id)
  ));
  const invalidRelation = relations.find((relation) => (
    !filePaths.has(relation.source_location.file_path)
    || !entityIds.has(relation.src_entity_id)
    || entitiesById.get(relation.src_entity_id)?.file_path !== relation.source_location.file_path
    || (relation.dst_entity_id !== null && !entityIds.has(relation.dst_entity_id))
    || relation.candidates.some((candidate) => !entityIds.has(candidate))
  ));
  const invalidRegion = regions.find((region) => (
    region.parent_id !== null && !regionIds.has(region.parent_id)
  ));
  const sortedEntities = [...entityIds].sort();
  const sortedFts = [...ftsIds].sort();
  const invalidFts = sortedEntities.length !== sortedFts.length
    || sortedEntities.some((id, index) => id !== sortedFts[index]);
  if (invalidEntity || invalidRelation || invalidRegion || invalidFts) {
    throw new CodeGraphError(
      "GRAPH_CORRUPTED",
      "Published graph contains orphaned semantic or search-index rows. Run codegraph rebuild.",
      3,
    );
  }
}

export class SqliteGraphStore {
  constructor(path, { readOnly = false } = {}) {
    try {
      for (const artifact of [path, `${path}-wal`, `${path}-shm`]) {
        try {
          const metadata = lstatSync(artifact);
          if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
            throw new CodeGraphError(
              "UNSAFE_ARTIFACT_PATH",
              `SQLite artifact must be a single-link regular non-symlink file: ${artifact}`,
              3,
            );
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      this.path = path;
      this.db = new DatabaseSync(path, {
        readOnly,
        timeout: 5000,
        enableForeignKeyConstraints: true,
        defensive: true,
      });
      this.readOnly = readOnly;
      if (!readOnly) {
        this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;");
      }
    } catch (error) {
      if (error instanceof CodeGraphError) throw error;
      throw new CodeGraphError("GRAPH_CORRUPTED", `Cannot open graph database: ${error.message}`, 3);
    }
  }

  close() {
    if (this.db?.isOpen) this.db.close();
  }

  initializeSchema() {
    if (this.readOnly) throw new Error("Cannot initialize a read-only graph store");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS revisions (
        revision INTEGER PRIMARY KEY,
        parent_revision INTEGER,
        source_fingerprint TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        health_json TEXT NOT NULL,
        graph_digest TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY COLLATE BINARY,
        language TEXT NOT NULL,
        classification TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms REAL NOT NULL,
        content_hash TEXT NOT NULL,
        last_good_content_hash TEXT,
        semantic_hash TEXT,
        parse_status TEXT NOT NULL,
        parse_error TEXT,
        stale INTEGER NOT NULL,
        last_good_revision INTEGER,
        risk_flags_json TEXT NOT NULL,
        imports_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS regions (
        stable_id TEXT PRIMARY KEY,
        parent_id TEXT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        confidence TEXT NOT NULL,
        risk_flags_json TEXT NOT NULL,
        revision INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS entities (
        stable_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        qualified_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        region_id TEXT NOT NULL,
        inputs_json TEXT NOT NULL,
        outputs_json TEXT NOT NULL,
        conditions_json TEXT NOT NULL,
        effects_json TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        start_column INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        end_column INTEGER NOT NULL,
        confidence TEXT NOT NULL,
        classification TEXT NOT NULL,
        semantic_tags_json TEXT NOT NULL,
        risk_flags_json TEXT NOT NULL,
        signature TEXT NOT NULL,
        documentation TEXT NOT NULL,
        semantic_revision INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS entities_qualified_name ON entities(qualified_name);
      CREATE INDEX IF NOT EXISTS entities_file_path ON entities(file_path);
      CREATE INDEX IF NOT EXISTS entities_region_id ON entities(region_id);
      CREATE TABLE IF NOT EXISTS relations (
        stable_id TEXT PRIMARY KEY,
        src_entity_id TEXT NOT NULL,
        dst_entity_id TEXT,
        unresolved_target TEXT,
        kind TEXT NOT NULL,
        confidence TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        start_column INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        end_column INTEGER NOT NULL,
        condition_json TEXT,
        source_condition_json TEXT,
        risk_flags_json TEXT NOT NULL,
        candidates_json TEXT NOT NULL,
        type_only INTEGER NOT NULL,
        semantic_revision INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS relations_src_kind ON relations(src_entity_id, kind);
      CREATE INDEX IF NOT EXISTS relations_dst_kind ON relations(dst_entity_id, kind);
      CREATE TABLE IF NOT EXISTS aliases (
        old_stable_id TEXT NOT NULL,
        new_stable_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        PRIMARY KEY(old_stable_id, revision)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS health (
        revision INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        metrics_json TEXT NOT NULL
      ) STRICT;
      CREATE VIRTUAL TABLE IF NOT EXISTS entity_fts USING fts5(
        stable_id UNINDEXED,
        name,
        qualified_name,
        signature,
        path,
        tags,
        documentation,
        tokenize='unicode61'
      );
    `);
    this.setMetadata("schema_version", String(SCHEMA_VERSION));
    this.setMetadata("parser_version", PARSER_VERSION);
    this.setMetadata("integrity_version", INTEGRITY_VERSION);
  }

  validateCompatibility() {
    const required = new Set([
      "metadata",
      "revisions",
      "files",
      "regions",
      "entities",
      "relations",
      "aliases",
      "health",
      "entity_fts",
    ]);
    const present = new Set(this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type IN ('table', 'view')
    `).all().map((row) => row.name));
    const missing = [...required].filter((name) => !present.has(name));
    if (missing.length > 0) {
      throw new CodeGraphError(
        "GRAPH_CORRUPTED",
        `Graph schema is incomplete (${missing.join(", ")}). Run codegraph rebuild.`,
        3,
      );
    }
    const schemaVersion = Number(this.getMetadata("schema_version"));
    const parserVersion = this.getMetadata("parser_version");
    const integrityVersion = this.getMetadata("integrity_version");
    if (schemaVersion !== SCHEMA_VERSION
        || parserVersion !== PARSER_VERSION
        || integrityVersion !== INTEGRITY_VERSION) {
        throw new CodeGraphError(
          "GRAPH_VERSION_MISMATCH",
          "Graph schema/parser/integrity version differs from this executable. Run codegraph rebuild.",
        3,
      );
    }
  }

  getMetadata(key) {
    return this.db.prepare("SELECT value FROM metadata WHERE key = ?").get(key)?.value ?? null;
  }

  setMetadata(key, value) {
    this.db.prepare(`
      INSERT INTO metadata(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(key, value);
  }

  currentRevision() {
    return Number(this.getMetadata("current_revision") ?? 0);
  }

  currentRevisionRecord() {
    const revision = this.currentRevision();
    if (!revision) return null;
    const row = this.db.prepare("SELECT * FROM revisions WHERE revision = ?").get(revision);
    if (!row) {
      throw new CodeGraphError("GRAPH_CORRUPTED", "Current revision metadata points to a missing row.", 3);
    }
    return {
      ...row,
      profile: fromJson(row.profile_json, {}, "revision profile JSON"),
      health: fromJson(row.health_json, {}, "revision health JSON"),
    };
  }

  loadParsedFiles() {
    const files = this.db.prepare("SELECT * FROM files ORDER BY path").all().map((row) => ({
      path: row.path,
      language: row.language,
      classification: row.classification,
      size: row.size,
      mtimeMs: row.mtime_ms,
      content_hash: row.content_hash,
      last_good_content_hash: row.last_good_content_hash,
      semantic_hash: row.semantic_hash,
      parse_status: row.parse_status,
      parse_error: row.parse_error,
      stale: Boolean(row.stale),
      last_good_revision: row.last_good_revision,
      risk_flags: fromJson(row.risk_flags_json, [], `risk flags for ${row.path}`),
      imports: fromJson(row.imports_json, {}, `imports for ${row.path}`),
      entities: [],
      relations: [],
    }));
    const byPath = new Map(files.map((file) => [file.path, file]));
    for (const entity of this.allEntities()) {
      const owner = byPath.get(entity.file_path);
      if (!owner) {
        throw new CodeGraphError("GRAPH_CORRUPTED", `Entity references missing file: ${entity.file_path}`, 3);
      }
      owner.entities.push(entity);
    }
    for (const relation of this.allRelations()) {
      const owner = byPath.get(relation.source_location.file_path);
      if (!owner) {
        throw new CodeGraphError(
          "GRAPH_CORRUPTED",
          `Relation references missing file: ${relation.source_location.file_path}`,
          3,
        );
      }
      owner.relations.push(relation);
    }
    return files;
  }

  allEntities() {
    return this.db.prepare("SELECT * FROM entities ORDER BY stable_id").all().map((row) => ({
      stable_id: row.stable_id,
      kind: row.kind,
      name: row.name,
      qualified_name: row.qualified_name,
      file_path: row.file_path,
      region_id: row.region_id,
      inputs: fromJson(row.inputs_json, [], `inputs for ${row.stable_id}`),
      outputs: fromJson(row.outputs_json, [], `outputs for ${row.stable_id}`),
      conditions: fromJson(row.conditions_json, [], `conditions for ${row.stable_id}`),
      effects: fromJson(row.effects_json, [], `effects for ${row.stable_id}`),
      source_location: rowLocation(row),
      confidence: row.confidence,
      classification: row.classification,
      semantic_tags: fromJson(row.semantic_tags_json, [], `tags for ${row.stable_id}`),
      risk_flags: fromJson(row.risk_flags_json, [], `risks for ${row.stable_id}`),
      signature: row.signature,
      documentation: row.documentation,
      semantic_revision: row.semantic_revision,
    }));
  }

  allRelations() {
    return this.db.prepare("SELECT * FROM relations ORDER BY stable_id").all().map((row) => ({
      stable_id: row.stable_id,
      src_entity_id: row.src_entity_id,
      dst_entity_id: row.dst_entity_id,
      unresolved_target: row.unresolved_target,
      kind: row.kind,
      confidence: row.confidence,
      source_location: rowLocation(row),
      condition: fromJson(row.condition_json, null, `condition for ${row.stable_id}`),
      source_condition: fromJson(
        row.source_condition_json,
        null,
        `source condition for ${row.stable_id}`,
      ),
      risk_flags: fromJson(row.risk_flags_json, [], `risks for ${row.stable_id}`),
      candidates: fromJson(row.candidates_json, [], `candidates for ${row.stable_id}`),
      type_only: Boolean(row.type_only),
      semantic_revision: row.semantic_revision,
    }));
  }

  allRegions() {
    return this.db.prepare("SELECT * FROM regions ORDER BY stable_id").all().map((row) => ({
      stable_id: row.stable_id,
      parent_id: row.parent_id,
      kind: row.kind,
      name: row.name,
      path: row.path,
      confidence: row.confidence,
      risk_flags: fromJson(row.risk_flags_json, [], `risks for ${row.stable_id}`),
      revision: row.revision,
    }));
  }

  snapshot() {
    const ownsTransaction = !this.db.isTransaction;
    if (ownsTransaction) this.db.exec("BEGIN");
    try {
      const revision = this.currentRevisionRecord();
      if (!revision) throw new CodeGraphError("PROJECT_NOT_INITIALIZED", "Graph has no published revision.", 2);
      const files = this.loadParsedFiles();
      const entities = files.flatMap((file) => file.entities);
      const relations = files.flatMap((file) => file.relations);
      const regions = this.allRegions();
      const ftsIds = this.db.prepare("SELECT stable_id FROM entity_fts ORDER BY stable_id")
        .all().map((row) => row.stable_id);
      assertGraphReferences(files, entities, relations, regions, ftsIds);
      const snapshot = {
        revision: revision.revision,
        last_known_good_revision: this.latestFreshRevision(),
        source_fingerprint: revision.source_fingerprint,
        graph_digest: revision.graph_digest,
        semantic_config_hash: this.getMetadata("semantic_config_hash"),
        status: revision.status,
        mode: revision.mode,
        profile: revision.profile,
        health: revision.health,
        files,
        entities,
        relations,
        regions,
      };
      const healthRow = this.db.prepare("SELECT * FROM health WHERE revision = ?").get(revision.revision);
      const persistedHealth = healthRow
        ? fromJson(healthRow.metrics_json, {}, `health for revision ${revision.revision}`)
        : null;
      if (!healthRow
          || revision.status !== revision.health.status
          || healthRow.status !== revision.status
          || JSON.stringify(persistedHealth) !== JSON.stringify(revision.health)) {
        throw new CodeGraphError(
          "GRAPH_CORRUPTED",
          "Published revision status and health metadata are inconsistent. Run codegraph rebuild.",
          3,
        );
      }
      const actualDigest = this.persistedGraphDigest(revision.revision);
      if (actualDigest !== revision.graph_digest) {
        throw new CodeGraphError(
          "GRAPH_CORRUPTED",
          "Persisted semantic rows do not match the published revision digest. Run codegraph rebuild.",
          3,
        );
      }
      if (ownsTransaction) this.db.exec("COMMIT");
      return snapshot;
    } catch (error) {
      if (ownsTransaction && this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  latestFreshRevision() {
    return Number(this.db.prepare(`
      SELECT COALESCE(MAX(revision), 0) AS revision FROM revisions WHERE status = 'FRESH'
    `).get()?.revision ?? 0);
  }

  persistedGraphDigest(publicationRevision = this.currentRevision()) {
    const snapshot = {
      publication_revision: publicationRevision,
      metadata: this.db.prepare(`
        SELECT key, value FROM metadata
        WHERE key IN ('schema_version', 'parser_version', 'integrity_version', 'semantic_config_hash')
        ORDER BY key
      `).all(),
      revisions: this.db.prepare(`
        SELECT revision, parent_revision, source_fingerprint, status, mode, created_at,
               profile_json, health_json
        FROM revisions ORDER BY revision
      `).all(),
      files: this.db.prepare("SELECT * FROM files ORDER BY path").all(),
      regions: this.db.prepare("SELECT * FROM regions ORDER BY stable_id").all(),
      entities: this.db.prepare("SELECT * FROM entities ORDER BY stable_id").all(),
      relations: this.db.prepare("SELECT * FROM relations ORDER BY stable_id").all(),
      aliases: this.db.prepare("SELECT * FROM aliases ORDER BY old_stable_id, revision").all(),
      health: this.db.prepare("SELECT * FROM health ORDER BY revision").all(),
      entity_fts: this.db.prepare(`
        SELECT rowid, stable_id, name, qualified_name, signature, path, tags, documentation
        FROM entity_fts ORDER BY rowid
      `).all(),
    };
    return hashBytes(JSON.stringify(snapshot));
  }

  stagePublish(graph, {
    revision,
    sourceFingerprint,
    mode,
    semanticConfigHash,
  }) {
    assertGraphReferences(
      graph.files,
      graph.entities,
      graph.relations,
      graph.regions,
      graph.entities.map((entity) => entity.stable_id),
    );
    const insertRevision = this.db.prepare(`
      INSERT INTO revisions(
        revision, parent_revision, source_fingerprint, status, mode, created_at, profile_json, health_json, graph_digest
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFile = this.db.prepare(`
      INSERT INTO files(
        path, language, classification, size, mtime_ms, content_hash, last_good_content_hash,
        semantic_hash, parse_status, parse_error, stale, last_good_revision, risk_flags_json, imports_json
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertRegion = this.db.prepare(`
      INSERT INTO regions(
        stable_id, parent_id, kind, name, path, confidence, risk_flags_json, revision
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEntity = this.db.prepare(`
      INSERT INTO entities(
        stable_id, kind, name, qualified_name, file_path, region_id, inputs_json, outputs_json,
        conditions_json, effects_json, start_line, start_column, end_line, end_column, confidence,
        classification, semantic_tags_json, risk_flags_json, signature, documentation, semantic_revision
      ) VALUES(
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    const insertRelation = this.db.prepare(`
      INSERT INTO relations(
        stable_id, src_entity_id, dst_entity_id, unresolved_target, kind, confidence, file_path,
        start_line, start_column, end_line, end_column, condition_json, source_condition_json,
        risk_flags_json, candidates_json, type_only, semantic_revision
      ) VALUES(
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    const insertFts = this.db.prepare(`
      INSERT INTO entity_fts(stable_id, name, qualified_name, signature, path, tags, documentation)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `);
    const parentRevision = this.currentRevision() || null;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      insertRevision.run(
        revision,
        parentRevision,
        sourceFingerprint,
        graph.health.status,
        mode,
        new Date().toISOString(),
        json(graph.profile),
        json(graph.health),
        "",
      );
      this.db.exec(`
        DELETE FROM files;
        DELETE FROM regions;
        DELETE FROM entities;
        DELETE FROM relations;
        DELETE FROM entity_fts;
      `);
      for (const file of graph.files) {
        insertFile.run(
          file.path,
          file.language,
          file.classification,
          file.size,
          file.mtimeMs,
          file.content_hash,
          file.last_good_content_hash ?? (file.stale ? null : file.content_hash),
          file.semantic_hash,
          file.parse_status,
          file.parse_error,
          file.stale ? 1 : 0,
          file.last_good_revision ?? (file.stale ? parentRevision : revision),
          json(file.risk_flags ?? []),
          json(file.imports ?? {}),
        );
      }
      for (const region of graph.regions) {
        insertRegion.run(
          region.stable_id,
          region.parent_id,
          region.kind,
          region.name,
          region.path,
          region.confidence,
          json(region.risk_flags ?? []),
          revision,
        );
      }
      for (const entity of graph.entities) {
        insertEntity.run(
          entity.stable_id,
          entity.kind,
          entity.name,
          entity.qualified_name,
          entity.file_path,
          entity.region_id,
          json(entity.inputs),
          json(entity.outputs),
          json(entity.conditions),
          json(entity.effects),
          ...locationColumns(entity.source_location),
          entity.confidence,
          entity.classification,
          json(entity.semantic_tags),
          json(entity.risk_flags),
          entity.signature,
          entity.documentation,
          entity.semantic_revision ?? revision,
        );
        insertFts.run(
          entity.stable_id,
          entity.name,
          entity.qualified_name,
          entity.signature,
          entity.file_path,
          entity.semantic_tags.join(" "),
          entity.documentation,
        );
      }
      for (const relation of graph.relations) {
        insertRelation.run(
          relation.stable_id,
          relation.src_entity_id,
          relation.dst_entity_id,
          relation.unresolved_target,
          relation.kind,
          relation.confidence,
          relation.source_location.file_path,
          ...locationColumns(relation.source_location),
          relation.condition ? json(relation.condition) : null,
          relation.source_condition ? json(relation.source_condition) : null,
          json(relation.risk_flags),
          json(relation.candidates),
          relation.type_only ? 1 : 0,
          relation.semantic_revision ?? revision,
        );
      }
      this.db.prepare("INSERT INTO health(revision, status, metrics_json) VALUES(?, ?, ?)").run(
        revision,
        graph.health.status,
        json(graph.health),
      );
      this.setMetadata("schema_version", String(SCHEMA_VERSION));
      this.setMetadata("parser_version", PARSER_VERSION);
      this.setMetadata("integrity_version", INTEGRITY_VERSION);
      this.setMetadata("semantic_config_hash", semanticConfigHash);
      const graphDigest = this.persistedGraphDigest(revision);
      this.db.prepare("UPDATE revisions SET graph_digest = ? WHERE revision = ?")
        .run(graphDigest, revision);
      this.setMetadata("current_revision", String(revision));
      let finished = false;
      return {
        graphDigest,
        commit: () => {
          if (finished) return;
          try {
            this.db.exec("COMMIT");
          } catch (error) {
            throw new CodeGraphError(
              "STORAGE_SQLITE_COMMIT_FAILED",
              `SQLite publication commit failed: ${error.message}`,
              3,
              {
                operation: "SQLITE_COMMIT",
                original: {
                  name: error.name,
                  message: error.message,
                  code: error.code,
                  errno: error.errno,
                  syscall: error.syscall,
                  path: error.path,
                  stack: error.stack,
                },
              },
              error,
            );
          }
          finished = true;
        },
        rollback: () => {
          if (finished) return;
          if (this.db.isTransaction) this.db.exec("ROLLBACK");
          finished = true;
        },
      };
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  searchEntities(terms, limit = 20) {
    const tokens = terms
      .flatMap((term) => term.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_]+/gu) ?? [])
      .filter((token) => token.length > 1)
      .slice(0, 12);
    if (tokens.length === 0) return [];
    const expression = tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" OR ");
    return this.db.prepare(`
      SELECT e.*, bm25(entity_fts, 0, 8, 6, 3, 2, 2, 1) AS rank
      FROM entity_fts JOIN entities e USING(stable_id)
      WHERE entity_fts MATCH ?
      ORDER BY rank, e.qualified_name
      LIMIT ?
    `).all(expression, limit);
  }

  quickCheck() {
    const quick = this.db.prepare("PRAGMA quick_check").all();
    const foreignKeys = this.db.prepare("PRAGMA foreign_key_check").all();
    const schemaVersion = Number(this.getMetadata("schema_version"));
    const parserVersion = this.getMetadata("parser_version");
    const integrityVersion = this.getMetadata("integrity_version");
    const currentRevision = this.currentRevision();
    const revisionExists = currentRevision === 0
      || Boolean(this.db.prepare("SELECT 1 AS ok FROM revisions WHERE revision = ?").get(currentRevision));
    let ftsReadable = true;
    try {
      this.db.prepare("SELECT count(*) AS count FROM entity_fts").get();
    } catch {
      ftsReadable = false;
    }
    let semanticReadable = true;
    let semanticError = null;
    try {
      if (currentRevision > 0) this.snapshot();
    } catch (error) {
      semanticReadable = false;
      semanticError = error.message;
    }
    return {
      ok: quick.every((row) => row.quick_check === "ok")
        && foreignKeys.length === 0
        && schemaVersion === SCHEMA_VERSION
        && parserVersion === PARSER_VERSION
        && integrityVersion === INTEGRITY_VERSION
        && revisionExists
        && ftsReadable
        && semanticReadable,
      quick_check: quick,
      foreign_key_errors: foreignKeys,
      schema_version: schemaVersion,
      expected_schema_version: SCHEMA_VERSION,
      parser_version: parserVersion,
      expected_parser_version: PARSER_VERSION,
      integrity_version: integrityVersion,
      expected_integrity_version: INTEGRITY_VERSION,
      current_revision: currentRevision,
      revision_exists: revisionExists,
      fts_readable: ftsReadable,
      semantic_readable: semanticReadable,
      semantic_error: semanticError,
    };
  }

  checkpoint() {
    return this.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  }

  async size() {
    try {
      return (await stat(this.path)).size;
    } catch {
      return 0;
    }
  }
}

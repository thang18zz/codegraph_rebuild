#!/usr/bin/env node
import { pathToFileURL as __codegraphPathToFileURL } from "node:url"; const __codegraphImportMetaUrl = __codegraphPathToFileURL(process.execPath).href;

// src/cli.js
import { resolve as resolve2 } from "node:path";
import { isSea as isSea2 } from "node:sea";

// src/constants.js
var VERSION = "0.1.0";
var SCHEMA_VERSION = 3;
var PARSER_VERSION = "tree-sitter-wasm-vscode-0.3.1";
var CODEGRAPH_DIR = ".codegraph";
var DB_FILE = "graph.db";
var STATE_FILE = "state.json";
var CONFIG_FILE = "config.toml";
var MAP_FILE = "codegraph.py";
var MIN_MCP_BUDGET = 1024;
var GRAPH_STATUS = Object.freeze({
  FRESH: "FRESH",
  SYNCING: "SYNCING",
  PARTIAL: "PARTIAL",
  STALE: "STALE",
  BROKEN: "BROKEN"
});
var CONFIDENCE = Object.freeze({
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  UNKNOWN: "UNKNOWN"
});
var CLASSIFICATION = Object.freeze({
  FIRST_PARTY: "FIRST_PARTY",
  TEST: "TEST",
  CONFIG: "CONFIG",
  INFRASTRUCTURE: "INFRASTRUCTURE",
  GENERATED: "GENERATED",
  VENDOR: "VENDOR",
  BUILD: "BUILD",
  DOCUMENTATION: "DOCUMENTATION",
  UNKNOWN: "UNKNOWN"
});
var RISK = Object.freeze({
  DYNAMIC_DISPATCH: "DYNAMIC_DISPATCH",
  REFLECTION: "REFLECTION",
  DEPENDENCY_INJECTION: "DEPENDENCY_INJECTION",
  GENERATED_CODE: "GENERATED_CODE",
  CONDITIONAL_COMPILATION: "CONDITIONAL_COMPILATION",
  RUNTIME_REGISTRATION: "RUNTIME_REGISTRATION",
  CROSS_LANGUAGE_BOUNDARY: "CROSS_LANGUAGE_BOUNDARY",
  UNSUPPORTED_SEMANTICS: "UNSUPPORTED_SEMANTICS",
  STALE_SOURCE: "STALE_SOURCE",
  PARTIAL_PARSE: "PARTIAL_PARSE",
  AMBIGUOUS_SYMBOL: "AMBIGUOUS_SYMBOL"
});
var SAFETY_STATE = Object.freeze({
  NAVIGATION_SAFE: "NAVIGATION_SAFE",
  SOURCE_INSPECTION_REQUIRED: "SOURCE_INSPECTION_REQUIRED",
  IMPACT_INCOMPLETE: "IMPACT_INCOMPLETE",
  GRAPH_STALE: "GRAPH_STALE",
  GRAPH_PARTIAL: "GRAPH_PARTIAL"
});
var DEFAULT_CONFIG = Object.freeze({
  map_target_tokens: 1e3,
  map_hard_cap_tokens: 1500,
  mcp_default_budget: 2e3,
  mcp_hard_cap: 3e3,
  compact_entity_limit: 250,
  generated_file_size_limit: 1e6,
  source_file_size_limit: 5e6,
  exclude: []
});
var MAP_OWNERSHIP_MARKER = "PORTABLE CODEGRAPH SEMANTIC MAP";
var LANGUAGE_BY_EXTENSION = Object.freeze({
  ".py": "python",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".java": "java",
  ".go": "go"
});
var DEFAULT_IGNORED_DIRECTORIES = /* @__PURE__ */ new Set([
  CODEGRAPH_DIR,
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".vscode",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  "coverage",
  "__pycache__",
  ".venv",
  "venv"
]);
var INCOMPLETE_RISKS = /* @__PURE__ */ new Set([
  RISK.DYNAMIC_DISPATCH,
  RISK.REFLECTION,
  RISK.DEPENDENCY_INJECTION,
  RISK.GENERATED_CODE,
  RISK.RUNTIME_REGISTRATION,
  RISK.CROSS_LANGUAGE_BOUNDARY,
  RISK.CONDITIONAL_COMPILATION,
  RISK.UNSUPPORTED_SEMANTICS,
  RISK.STALE_SOURCE,
  RISK.PARTIAL_PARSE,
  RISK.AMBIGUOUS_SYMBOL
]);

// src/sync.js
import {
  lstat as lstat2,
  mkdir,
  open as open2,
  realpath,
  rename,
  rm,
  stat as stat3,
  unlink,
  writeFile as writeFile2
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname as dirname3, join as join3 } from "node:path";

// src/context-map.js
var BUDGET_BYTES_PER_UNIT = 1;
function utf8Bytes(value) {
  return Buffer.byteLength(value, "utf8");
}
function budgetByteLimit(budget) {
  return budget * BUDGET_BYTES_PER_UNIT;
}
function estimateTokens(value) {
  return Math.ceil(utf8Bytes(value) / BUDGET_BYTES_PER_UNIT);
}
function pythonString(value) {
  return JSON.stringify(String(value));
}
function entityScore(entity) {
  let score = 0;
  if (entity.classification === CLASSIFICATION.FIRST_PARTY) score += 50;
  if (entity.classification === CLASSIFICATION.TEST) score += 10;
  if (entity.classification === CLASSIFICATION.GENERATED) score -= 100;
  if (entity.semantic_tags.some((tag) => tag.startsWith("entry_point:"))) score += 100;
  if (entity.semantic_tags.includes("public")) score += 30;
  if (["service", "subsystem", "route", "class", "interface"].includes(entity.kind)) score += 20;
  if (/^(main|start|run|handler|controller|app|server|cli)$/iu.test(entity.name)) score += 40;
  if (entity.kind === "module") score += 5;
  if (entity.confidence === CONFIDENCE.HIGH) score += 5;
  return score;
}
function relationScore(relation, entitiesById) {
  let score = relation.kind === "ROUTES_TO" ? 100 : 0;
  if (relation.kind === "CALLS") score += 30;
  if (["INHERITS", "IMPLEMENTS"].includes(relation.kind)) score += 20;
  if (relation.confidence === CONFIDENCE.HIGH) score += 15;
  if (relation.condition) score += 10;
  const source = entitiesById.get(relation.src_entity_id);
  const target = entitiesById.get(relation.dst_entity_id);
  score += source ? entityScore(source) / 10 : 0;
  score += target ? entityScore(target) / 10 : 0;
  return score;
}
function lineForEntity(entity) {
  const location = entity.source_location;
  return `  (${pythonString(entity.qualified_name)}, ${pythonString(entity.kind)}, ${pythonString(entity.signature)}, ${pythonString(location.file_path)}, ${location.start_line}, ${pythonString(entity.confidence)}),
`;
}
function lineForRelation(relation, entitiesById) {
  const source = entitiesById.get(relation.src_entity_id)?.qualified_name ?? relation.src_entity_id;
  const target = entitiesById.get(relation.dst_entity_id)?.qualified_name ?? relation.unresolved_target ?? "UNKNOWN";
  const condition = relation.condition?.expression ?? "";
  return `  (${pythonString(source)}, ${pythonString(relation.kind)}, ${pythonString(target)}, ${pythonString(condition)}, ${pythonString(relation.confidence)}),
`;
}
function appendWithin(lines, candidate, hardByteCap) {
  const next = `${lines.join("")}${candidate}`;
  if (utf8Bytes(next) > hardByteCap) return false;
  lines.push(candidate);
  return true;
}
function headerLines(graph, revision, mode) {
  return [
    '"""\n',
    "PORTABLE CODEGRAPH SEMANTIC MAP\n\n",
    "GENERATED FILE.\n",
    "DO NOT EDIT.\n",
    "DO NOT EXECUTE.\n\n",
    "This file is an AI-oriented semantic representation of the repository.\n",
    "Original source files remain authoritative.\n\n",
    "This map is intentionally incomplete.\n",
    "Omitted symbols are not evidence that they do not exist.\n",
    "Use semantic MCP or source when completeness matters.\n",
    '"""\n\n',
    `GRAPH_REVISION = ${revision}
`,
    `GRAPH_STATUS = ${pythonString(graph.health.status)}
`,
    `MODE = ${pythonString(mode)}
`,
    "SOURCE_IS_AUTHORITATIVE = True\n",
    "OMISSION_IS_NOT_ABSENCE = True\n\n",
    "REGIONS = (\n"
  ];
}
function projectedMapBytes(graph, revision, rankedRegions, rankedEntities, entryPoints, rankedRelations, warningValues, entitiesById) {
  const entryPointIds = new Set(entryPoints.map((entity) => entity.stable_id));
  const lines = [...headerLines(graph, revision, "COMPACT")];
  lines.push(...rankedRegions.map((region) => `  (${pythonString(region.name)}, ${pythonString(region.path)}, ${pythonString(region.confidence)}),
`));
  lines.push(")\n\n", "ENTRY_POINTS = (\n");
  lines.push(...entryPoints.map(lineForEntity));
  lines.push(")\n\n", "IMPORTANT_SYMBOLS = (\n");
  lines.push(...rankedEntities.filter((entity) => !entryPointIds.has(entity.stable_id)).map(lineForEntity));
  lines.push(")\n\n", "MAIN_FLOWS = (\n");
  lines.push(...rankedRelations.filter((relation) => ["CALLS", "ROUTES_TO", "INHERITS", "IMPLEMENTS"].includes(relation.kind)).map((relation) => lineForRelation(relation, entitiesById)));
  lines.push(")\n\n", "WARNINGS = (\n");
  lines.push(...warningValues.map((warning) => `  ${pythonString(warning)},
`));
  lines.push(")\n", "MAP_TRUNCATED = False\n", 'MCP_TOOL = "semantic_explore"\n');
  return utf8Bytes(lines.join(""));
}
function compileContextMap(graph, revision, config) {
  const entitiesById = new Map(graph.entities.map((entity) => [entity.stable_id, entity]));
  const rankedEntities = [...graph.entities].sort((left, right) => entityScore(right) - entityScore(left) || left.qualified_name.localeCompare(right.qualified_name));
  const rankedRelations = [...graph.relations].sort((left, right) => relationScore(right, entitiesById) - relationScore(left, entitiesById) || left.stable_id.localeCompare(right.stable_id));
  const firstPartyRegionCounts = /* @__PURE__ */ new Map();
  for (const entity of graph.entities.filter((item) => item.classification === CLASSIFICATION.FIRST_PARTY)) {
    firstPartyRegionCounts.set(entity.region_id, (firstPartyRegionCounts.get(entity.region_id) ?? 0) + 1);
  }
  const rankedRegions = graph.regions.filter((item) => item.stable_id !== "region:repository").sort((left, right) => (firstPartyRegionCounts.get(right.stable_id) ?? 0) - (firstPartyRegionCounts.get(left.stable_id) ?? 0) || left.path.localeCompare(right.path));
  const entryPoints = rankedEntities.filter((entity) => entity.semantic_tags.some((tag) => tag.startsWith("entry_point:")));
  const warningValues = [
    ...graph.health.risk_flags.map((risk) => `Risk: ${risk}`),
    ...graph.health.stale_files.map((path) => `Stale source: ${path}`)
  ];
  const compactWithinTarget = graph.entities.length <= config.compact_entity_limit && projectedMapBytes(
    graph,
    revision,
    rankedRegions,
    rankedEntities,
    entryPoints,
    rankedRelations,
    warningValues,
    entitiesById
  ) <= budgetByteLimit(config.map_target_tokens);
  const mode = compactWithinTarget ? "COMPACT" : "HYBRID";
  const hardByteCap = budgetByteLimit(config.map_hard_cap_tokens);
  const lines = headerLines(graph, revision, mode);
  let truncated = false;
  for (const region of rankedRegions) {
    const regionLine = `  (${pythonString(region.name)}, ${pythonString(region.path)}, ${pythonString(region.confidence)}),
`;
    if (!appendWithin(lines, regionLine, hardByteCap - budgetByteLimit(100))) {
      truncated = true;
      break;
    }
  }
  lines.push(")\n\n");
  lines.push("ENTRY_POINTS = (\n");
  for (const entity of entryPoints) {
    if (!appendWithin(lines, lineForEntity(entity), hardByteCap - budgetByteLimit(80))) {
      truncated = true;
      break;
    }
  }
  lines.push(")\n\n");
  lines.push(mode === "COMPACT" ? "IMPORTANT_SYMBOLS = (\n" : "ROUTING_SYMBOLS = (\n");
  const symbolLimit = mode === "COMPACT" ? rankedEntities.length : Math.min(rankedEntities.length, 80);
  for (const entity of rankedEntities.slice(0, symbolLimit)) {
    if (entryPoints.includes(entity)) continue;
    if (!appendWithin(lines, lineForEntity(entity), hardByteCap - budgetByteLimit(70))) {
      truncated = true;
      break;
    }
  }
  lines.push(")\n\n");
  lines.push("MAIN_FLOWS = (\n");
  for (const relation of rankedRelations) {
    if (!["CALLS", "ROUTES_TO", "INHERITS", "IMPLEMENTS"].includes(relation.kind)) continue;
    if (!appendWithin(lines, lineForRelation(relation, entitiesById), hardByteCap - budgetByteLimit(55))) {
      truncated = true;
      break;
    }
  }
  lines.push(")\n\n");
  lines.push("WARNINGS = (\n");
  for (const warning of warningValues) {
    if (!appendWithin(lines, `  ${pythonString(warning)},
`, hardByteCap - budgetByteLimit(30))) {
      truncated = true;
      break;
    }
  }
  lines.push(")\n");
  lines.push(`MAP_TRUNCATED = ${truncated ? "True" : "False"}
`);
  lines.push('MCP_TOOL = "semantic_explore"\n');
  while (utf8Bytes(lines.join("")) > hardByteCap && lines.length > 20) {
    const removable = lines.findLastIndex((line) => line.startsWith("  ("));
    if (removable < 0) break;
    lines.splice(removable, 1);
    truncated = true;
  }
  let content = lines.join("");
  if (truncated) content = content.replace("MAP_TRUNCATED = False", "MAP_TRUNCATED = True");
  const bytes = utf8Bytes(content);
  const tokens2 = estimateTokens(content);
  if (bytes > hardByteCap) {
    throw new Error(`Mandatory codegraph.py content exceeds map_hard_cap_tokens (${config.map_hard_cap_tokens})`);
  }
  return { content, bytes, tokens: tokens2, mode, truncated };
}

// src/config.js
import { readFile, writeFile } from "node:fs/promises";
function parseScalar(value) {
  const trimmed = value.trim();
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const body2 = trimmed.slice(1, -1).trim();
    if (!body2) return [];
    return body2.split(",").map((item) => JSON.parse(item.trim()));
  }
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  return trimmed;
}
function parseConfig(text) {
  const config = { ...DEFAULT_CONFIG, exclude: [] };
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    if (!(key in DEFAULT_CONFIG)) continue;
    config[key] = parseScalar(line.slice(separator + 1));
  }
  validateConfig(config);
  return config;
}
function validateConfig(config) {
  const positiveIntegers = [
    "map_target_tokens",
    "map_hard_cap_tokens",
    "mcp_default_budget",
    "mcp_hard_cap",
    "compact_entity_limit",
    "generated_file_size_limit",
    "source_file_size_limit"
  ];
  for (const key of positiveIntegers) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }
  }
  if (config.map_target_tokens > config.map_hard_cap_tokens) {
    throw new Error("map_target_tokens cannot exceed map_hard_cap_tokens");
  }
  if (config.map_hard_cap_tokens < 640) {
    throw new Error("map_hard_cap_tokens must be at least 640 to fit the mandatory safety header");
  }
  if (config.mcp_default_budget > config.mcp_hard_cap) {
    throw new Error("mcp_default_budget cannot exceed mcp_hard_cap");
  }
  if (config.mcp_default_budget < MIN_MCP_BUDGET) {
    throw new Error(`mcp_default_budget must be at least ${MIN_MCP_BUDGET} to fit mandatory safety metadata`);
  }
  if (config.mcp_hard_cap < MIN_MCP_BUDGET) {
    throw new Error(`mcp_hard_cap must be at least ${MIN_MCP_BUDGET} to fit mandatory safety metadata`);
  }
  if (!Array.isArray(config.exclude) || !config.exclude.every((v) => typeof v === "string")) {
    throw new Error("exclude must be an array of strings");
  }
}
function serializeConfig(config = DEFAULT_CONFIG) {
  return [
    "# Portable CodeGraph project configuration.",
    "# One budget unit permits at most one serialized UTF-8 byte.",
    `map_target_tokens = ${config.map_target_tokens}`,
    `map_hard_cap_tokens = ${config.map_hard_cap_tokens}`,
    `mcp_default_budget = ${config.mcp_default_budget}`,
    `mcp_hard_cap = ${config.mcp_hard_cap}`,
    `compact_entity_limit = ${config.compact_entity_limit}`,
    `generated_file_size_limit = ${config.generated_file_size_limit}`,
    `source_file_size_limit = ${config.source_file_size_limit}`,
    `exclude = ${JSON.stringify(config.exclude ?? [])}`,
    ""
  ].join("\n");
}
async function readConfig(path) {
  try {
    return parseConfig(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { ...DEFAULT_CONFIG, exclude: [] };
    throw error;
  }
}
async function writeDefaultConfig(path) {
  await writeFile(path, serializeConfig(), { encoding: "utf8", flag: "wx" });
}

// src/errors.js
var CodeGraphError = class extends Error {
  constructor(code, message, exitCode = 1, details = void 0, cause = void 0) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "CodeGraphError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
};

// src/fs-safe.js
import { constants } from "node:fs";
import { open } from "node:fs/promises";
async function readFileNoFollow(path) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle2 = await open(path, constants.O_RDONLY | noFollow);
  try {
    const metadata2 = await handle2.stat();
    if (!metadata2.isFile()) {
      const error = new Error(`Not a regular file: ${path}`);
      error.code = "UNSAFE_SOURCE_PATH";
      throw error;
    }
    return await handle2.readFile();
  } finally {
    await handle2.close();
  }
}
async function readPrefixNoFollow(path, length) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle2 = await open(path, constants.O_RDONLY | noFollow);
  try {
    const metadata2 = await handle2.stat();
    if (!metadata2.isFile()) {
      const error = new Error(`Not a regular file: ${path}`);
      error.code = "UNSAFE_SOURCE_PATH";
      throw error;
    }
    const bytes = Buffer.alloc(Math.min(metadata2.size, length));
    const { bytesRead } = await handle2.read(bytes, 0, bytes.length, 0);
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle2.close();
  }
}

// src/ir.js
import { createHash } from "node:crypto";
import { extname } from "node:path";
function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
function normalizeSemanticText(value) {
  return value.replace(/\s+/gu, " ").trim();
}
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort(compareText);
}
function moduleNameForPath(path) {
  const extension = extname(path);
  let moduleName = path.slice(0, extension ? -extension.length : void 0).replaceAll("/", ".");
  moduleName = moduleName.replace(/\.__init__$/u, "");
  return moduleName || "repository";
}
function sourceLocation(path, node) {
  return {
    file_path: path,
    start_line: node.startPosition.row + 1,
    start_column: node.startPosition.column,
    end_line: node.endPosition.row + 1,
    end_column: node.endPosition.column
  };
}
function stableEntityId(language, path, qualifiedName, kind) {
  return `${language}:${path}:${qualifiedName}:${kind}`;
}
function createEntity({
  language,
  path,
  kind,
  name: name2,
  qualifiedName,
  regionId,
  inputs = [],
  outputs = [],
  conditions = [],
  effects = [],
  node,
  confidence = CONFIDENCE.HIGH,
  classification,
  semanticTags = [],
  riskFlags = [],
  signature = "",
  documentation = ""
}) {
  return {
    stable_id: stableEntityId(language, path, qualifiedName, kind),
    kind,
    name: name2,
    qualified_name: qualifiedName,
    file_path: path,
    region_id: regionId,
    inputs,
    outputs,
    conditions,
    effects,
    source_location: sourceLocation(path, node),
    confidence,
    classification,
    semantic_tags: uniqueSorted(semanticTags),
    risk_flags: uniqueSorted(riskFlags),
    signature: normalizeSemanticText(signature),
    documentation: normalizeSemanticText(documentation)
  };
}
function createRelation({
  src,
  dst = null,
  unresolvedTarget = null,
  kind,
  confidence = CONFIDENCE.UNKNOWN,
  path,
  node,
  condition = null,
  riskFlags = [],
  candidates = [],
  typeOnly = false
}) {
  const location = sourceLocation(path, node);
  const identity = [
    src,
    dst ?? unresolvedTarget ?? "",
    kind,
    condition?.expression ?? "",
    normalizeSemanticText(node.text ?? "")
  ].join("\0");
  return {
    stable_id: `relation:${hashBytes(identity).slice(0, 24)}`,
    src_entity_id: src,
    dst_entity_id: dst,
    unresolved_target: unresolvedTarget,
    kind,
    confidence,
    source_location: location,
    condition,
    source_condition: condition ? structuredClone(condition) : null,
    risk_flags: uniqueSorted(riskFlags),
    candidates: uniqueSorted(candidates),
    type_only: typeOnly
  };
}
function semanticEntity(entity) {
  return {
    stable_id: entity.stable_id,
    kind: entity.kind,
    qualified_name: entity.qualified_name,
    inputs: entity.inputs,
    outputs: entity.outputs,
    conditions: entity.conditions.map((condition) => condition.expression ?? condition),
    effects: entity.effects,
    confidence: entity.confidence,
    classification: entity.classification,
    semantic_tags: entity.semantic_tags,
    risk_flags: entity.risk_flags,
    signature: entity.signature
  };
}
function semanticRelation(relation) {
  return {
    src_entity_id: relation.src_entity_id,
    dst_entity_id: relation.dst_entity_id,
    unresolved_target: relation.unresolved_target,
    kind: relation.kind,
    confidence: relation.confidence,
    condition: relation.condition?.expression ?? null,
    risk_flags: relation.risk_flags,
    candidates: relation.candidates,
    type_only: relation.type_only
  };
}
function semanticImports(imports) {
  return Object.fromEntries(Object.entries(imports).sort(([a], [b]) => compareText(a, b)).map(([alias, rawBindings]) => {
    if (!Array.isArray(rawBindings)) return [alias, rawBindings];
    return [alias, rawBindings.map((binding) => ({
      target: binding.target,
      scope_entity_id: binding.scope_entity_id ?? null,
      condition: binding.condition?.expression ?? null,
      type_only: Boolean(binding.type_only),
      wildcard: Boolean(binding.wildcard)
    }))];
  }));
}
function semanticHash(parsedFile) {
  const normalized = {
    entities: parsedFile.entities.map(semanticEntity).sort((a, b) => compareText(a.stable_id, b.stable_id)),
    relations: parsedFile.relations.map(semanticRelation).sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b))),
    imports: semanticImports(parsedFile.imports),
    risk_flags: uniqueSorted(parsedFile.risk_flags)
  };
  return hashBytes(JSON.stringify(normalized));
}
function makeCondition(path, node, expression = node.text) {
  return {
    expression: normalizeSemanticText(expression),
    source_location: sourceLocation(path, node)
  };
}
function regionIdForPath(path) {
  const topLevel = path.includes("/") ? path.slice(0, path.indexOf("/")) : ".";
  return `region:${topLevel}`;
}
function buildRegions(files) {
  const regions = [{
    stable_id: "region:repository",
    parent_id: null,
    kind: "repository",
    name: "repository",
    path: ".",
    confidence: CONFIDENCE.HIGH,
    risk_flags: []
  }];
  const topLevels = /* @__PURE__ */ new Map();
  for (const file of files) {
    const topLevel = file.path.includes("/") ? file.path.slice(0, file.path.indexOf("/")) : ".";
    const current = topLevels.get(topLevel) ?? [];
    current.push(...file.risk_flags ?? []);
    topLevels.set(topLevel, current);
  }
  for (const [path, risks] of [...topLevels.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    regions.push({
      stable_id: `region:${path}`,
      parent_id: "region:repository",
      kind: path === "." ? "module" : "package",
      name: path === "." ? "root" : path,
      path,
      confidence: CONFIDENCE.HIGH,
      risk_flags: uniqueSorted(risks)
    });
  }
  return regions;
}

// node_modules/web-tree-sitter/web-tree-sitter.js
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var Edit = class {
  static {
    __name(this, "Edit");
  }
  /** The start position of the change. */
  startPosition;
  /** The end position of the change before the edit. */
  oldEndPosition;
  /** The end position of the change after the edit. */
  newEndPosition;
  /** The start index of the change. */
  startIndex;
  /** The end index of the change before the edit. */
  oldEndIndex;
  /** The end index of the change after the edit. */
  newEndIndex;
  constructor({
    startIndex,
    oldEndIndex,
    newEndIndex,
    startPosition,
    oldEndPosition,
    newEndPosition
  }) {
    this.startIndex = startIndex >>> 0;
    this.oldEndIndex = oldEndIndex >>> 0;
    this.newEndIndex = newEndIndex >>> 0;
    this.startPosition = startPosition;
    this.oldEndPosition = oldEndPosition;
    this.newEndPosition = newEndPosition;
  }
  /**
   * Edit a point and index to keep it in-sync with source code that has been edited.
   *
   * This function updates a single point's byte offset and row/column position
   * based on an edit operation. This is useful for editing points without
   * requiring a tree or node instance.
   */
  editPoint(point, index) {
    let newIndex = index;
    const newPoint = { ...point };
    if (index >= this.oldEndIndex) {
      newIndex = this.newEndIndex + (index - this.oldEndIndex);
      const originalRow = point.row;
      newPoint.row = this.newEndPosition.row + (point.row - this.oldEndPosition.row);
      newPoint.column = originalRow === this.oldEndPosition.row ? this.newEndPosition.column + (point.column - this.oldEndPosition.column) : point.column;
    } else if (index > this.startIndex) {
      newIndex = this.newEndIndex;
      newPoint.row = this.newEndPosition.row;
      newPoint.column = this.newEndPosition.column;
    }
    return { point: newPoint, index: newIndex };
  }
  /**
   * Edit a range to keep it in-sync with source code that has been edited.
   *
   * This function updates a range's start and end positions based on an edit
   * operation. This is useful for editing ranges without requiring a tree
   * or node instance.
   */
  editRange(range) {
    const newRange = {
      startIndex: range.startIndex,
      startPosition: { ...range.startPosition },
      endIndex: range.endIndex,
      endPosition: { ...range.endPosition }
    };
    if (range.endIndex >= this.oldEndIndex) {
      if (range.endIndex !== Number.MAX_SAFE_INTEGER) {
        newRange.endIndex = this.newEndIndex + (range.endIndex - this.oldEndIndex);
        newRange.endPosition = {
          row: this.newEndPosition.row + (range.endPosition.row - this.oldEndPosition.row),
          column: range.endPosition.row === this.oldEndPosition.row ? this.newEndPosition.column + (range.endPosition.column - this.oldEndPosition.column) : range.endPosition.column
        };
        if (newRange.endIndex < this.newEndIndex) {
          newRange.endIndex = Number.MAX_SAFE_INTEGER;
          newRange.endPosition = { row: Number.MAX_SAFE_INTEGER, column: Number.MAX_SAFE_INTEGER };
        }
      }
    } else if (range.endIndex > this.startIndex) {
      newRange.endIndex = this.startIndex;
      newRange.endPosition = { ...this.startPosition };
    }
    if (range.startIndex >= this.oldEndIndex) {
      newRange.startIndex = this.newEndIndex + (range.startIndex - this.oldEndIndex);
      newRange.startPosition = {
        row: this.newEndPosition.row + (range.startPosition.row - this.oldEndPosition.row),
        column: range.startPosition.row === this.oldEndPosition.row ? this.newEndPosition.column + (range.startPosition.column - this.oldEndPosition.column) : range.startPosition.column
      };
      if (newRange.startIndex < this.newEndIndex) {
        newRange.startIndex = Number.MAX_SAFE_INTEGER;
        newRange.startPosition = { row: Number.MAX_SAFE_INTEGER, column: Number.MAX_SAFE_INTEGER };
      }
    } else if (range.startIndex > this.startIndex) {
      newRange.startIndex = this.startIndex;
      newRange.startPosition = { ...this.startPosition };
    }
    return newRange;
  }
};
var SIZE_OF_SHORT = 2;
var SIZE_OF_INT = 4;
var SIZE_OF_CURSOR = 4 * SIZE_OF_INT;
var SIZE_OF_NODE = 5 * SIZE_OF_INT;
var SIZE_OF_POINT = 2 * SIZE_OF_INT;
var SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT;
var ZERO_POINT = { row: 0, column: 0 };
var INTERNAL = /* @__PURE__ */ Symbol("INTERNAL");
function assertInternal(x) {
  if (x !== INTERNAL) throw new Error("Illegal constructor");
}
__name(assertInternal, "assertInternal");
function isPoint(point) {
  return !!point && typeof point.row === "number" && typeof point.column === "number";
}
__name(isPoint, "isPoint");
function setModule(module2) {
  C = module2;
}
__name(setModule, "setModule");
var C;
var LookaheadIterator = class {
  static {
    __name(this, "LookaheadIterator");
  }
  /** @internal */
  [0] = 0;
  // Internal handle for Wasm
  /** @internal */
  language;
  /** @internal */
  constructor(internal, address, language) {
    assertInternal(internal);
    this[0] = address;
    this.language = language;
  }
  /** Get the current symbol of the lookahead iterator. */
  get currentTypeId() {
    return C._ts_lookahead_iterator_current_symbol(this[0]);
  }
  /** Get the current symbol name of the lookahead iterator. */
  get currentType() {
    return this.language.types[this.currentTypeId] || "ERROR";
  }
  /** Delete the lookahead iterator, freeing its resources. */
  delete() {
    C._ts_lookahead_iterator_delete(this[0]);
    this[0] = 0;
  }
  /**
   * Reset the lookahead iterator.
   *
   * This returns `true` if the language was set successfully and `false`
   * otherwise.
   */
  reset(language, stateId) {
    if (C._ts_lookahead_iterator_reset(this[0], language[0], stateId)) {
      this.language = language;
      return true;
    }
    return false;
  }
  /**
   * Reset the lookahead iterator to another state.
   *
   * This returns `true` if the iterator was reset to the given state and
   * `false` otherwise.
   */
  resetState(stateId) {
    return Boolean(C._ts_lookahead_iterator_reset_state(this[0], stateId));
  }
  /**
   * Returns an iterator that iterates over the symbols of the lookahead iterator.
   *
   * The iterator will yield the current symbol name as a string for each step
   * until there are no more symbols to iterate over.
   */
  [Symbol.iterator]() {
    return {
      next: /* @__PURE__ */ __name(() => {
        if (C._ts_lookahead_iterator_next(this[0])) {
          return { done: false, value: this.currentType };
        }
        return { done: true, value: "" };
      }, "next")
    };
  }
};
function getText(tree, startIndex, endIndex, startPosition) {
  const length = endIndex - startIndex;
  let result = tree.textCallback(startIndex, startPosition);
  if (result) {
    startIndex += result.length;
    while (startIndex < endIndex) {
      const string = tree.textCallback(startIndex, startPosition);
      if (string && string.length > 0) {
        startIndex += string.length;
        result += string;
      } else {
        break;
      }
    }
    if (startIndex > endIndex) {
      result = result.slice(0, length);
    }
  }
  return result ?? "";
}
__name(getText, "getText");
var Tree = class _Tree {
  static {
    __name(this, "Tree");
  }
  /** @internal */
  [0] = 0;
  // Internal handle for Wasm
  /** @internal */
  textCallback;
  /** The language that was used to parse the syntax tree. */
  language;
  /** @internal */
  constructor(internal, address, language, textCallback) {
    assertInternal(internal);
    this[0] = address;
    this.language = language;
    this.textCallback = textCallback;
  }
  /** Create a shallow copy of the syntax tree. This is very fast. */
  copy() {
    const address = C._ts_tree_copy(this[0]);
    return new _Tree(INTERNAL, address, this.language, this.textCallback);
  }
  /** Delete the syntax tree, freeing its resources. */
  delete() {
    C._ts_tree_delete(this[0]);
    this[0] = 0;
  }
  /** Get the root node of the syntax tree. */
  get rootNode() {
    C._ts_tree_root_node_wasm(this[0]);
    return unmarshalNode(this);
  }
  /**
   * Get the root node of the syntax tree, but with its position shifted
   * forward by the given offset.
   */
  rootNodeWithOffset(offsetBytes, offsetExtent) {
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, offsetBytes, "i32");
    marshalPoint(address + SIZE_OF_INT, offsetExtent);
    C._ts_tree_root_node_with_offset_wasm(this[0]);
    return unmarshalNode(this);
  }
  /**
   * Edit the syntax tree to keep it in sync with source code that has been
   * edited.
   *
   * You must describe the edit both in terms of byte offsets and in terms of
   * row/column coordinates.
   */
  edit(edit) {
    marshalEdit(edit);
    C._ts_tree_edit_wasm(this[0]);
  }
  /** Create a new {@link TreeCursor} starting from the root of the tree. */
  walk() {
    return this.rootNode.walk();
  }
  /**
   * Compare this old edited syntax tree to a new syntax tree representing
   * the same document, returning a sequence of ranges whose syntactic
   * structure has changed.
   *
   * For this to work correctly, this syntax tree must have been edited such
   * that its ranges match up to the new tree. Generally, you'll want to
   * call this method right after calling one of the [`Parser::parse`]
   * functions. Call it on the old tree that was passed to parse, and
   * pass the new tree that was returned from `parse`.
   */
  getChangedRanges(other) {
    if (!(other instanceof _Tree)) {
      throw new TypeError("Argument must be a Tree");
    }
    C._ts_tree_get_changed_ranges_wasm(this[0], other[0]);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0; i2 < count; i2++) {
        result[i2] = unmarshalRange(address);
        address += SIZE_OF_RANGE;
      }
      C._free(buffer);
    }
    return result;
  }
  /** Get the included ranges that were used to parse the syntax tree. */
  getIncludedRanges() {
    C._ts_tree_included_ranges_wasm(this[0]);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0; i2 < count; i2++) {
        result[i2] = unmarshalRange(address);
        address += SIZE_OF_RANGE;
      }
      C._free(buffer);
    }
    return result;
  }
};
var TreeCursor = class _TreeCursor {
  static {
    __name(this, "TreeCursor");
  }
  /** @internal */
  // @ts-expect-error: never read
  [0] = 0;
  // Internal handle for Wasm
  /** @internal */
  // @ts-expect-error: never read
  [1] = 0;
  // Internal handle for Wasm
  /** @internal */
  // @ts-expect-error: never read
  [2] = 0;
  // Internal handle for Wasm
  /** @internal */
  // @ts-expect-error: never read
  [3] = 0;
  // Internal handle for Wasm
  /** @internal */
  tree;
  /** @internal */
  constructor(internal, tree) {
    assertInternal(internal);
    this.tree = tree;
    unmarshalTreeCursor(this);
  }
  /** Creates a deep copy of the tree cursor. This allocates new memory. */
  copy() {
    const copy = new _TreeCursor(INTERNAL, this.tree);
    C._ts_tree_cursor_copy_wasm(this.tree[0]);
    unmarshalTreeCursor(copy);
    return copy;
  }
  /** Delete the tree cursor, freeing its resources. */
  delete() {
    marshalTreeCursor(this);
    C._ts_tree_cursor_delete_wasm(this.tree[0]);
    this[0] = this[1] = this[2] = 0;
  }
  /** Get the tree cursor's current {@link Node}. */
  get currentNode() {
    marshalTreeCursor(this);
    C._ts_tree_cursor_current_node_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /**
   * Get the numerical field id of this tree cursor's current node.
   *
   * See also {@link TreeCursor#currentFieldName}.
   */
  get currentFieldId() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_field_id_wasm(this.tree[0]);
  }
  /** Get the field name of this tree cursor's current node. */
  get currentFieldName() {
    return this.tree.language.fields[this.currentFieldId];
  }
  /**
   * Get the depth of the cursor's current node relative to the original
   * node that the cursor was constructed with.
   */
  get currentDepth() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_depth_wasm(this.tree[0]);
  }
  /**
   * Get the index of the cursor's current node out of all of the
   * descendants of the original node that the cursor was constructed with.
   */
  get currentDescendantIndex() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0]);
  }
  /** Get the type of the cursor's current node. */
  get nodeType() {
    return this.tree.language.types[this.nodeTypeId] || "ERROR";
  }
  /** Get the type id of the cursor's current node. */
  get nodeTypeId() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0]);
  }
  /** Get the state id of the cursor's current node. */
  get nodeStateId() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0]);
  }
  /** Get the id of the cursor's current node. */
  get nodeId() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_id_wasm(this.tree[0]);
  }
  /**
   * Check if the cursor's current node is *named*.
   *
   * Named nodes correspond to named rules in the grammar, whereas
   * *anonymous* nodes correspond to string literals in the grammar.
   */
  get nodeIsNamed() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0]) === 1;
  }
  /**
   * Check if the cursor's current node is *missing*.
   *
   * Missing nodes are inserted by the parser in order to recover from
   * certain kinds of syntax errors.
   */
  get nodeIsMissing() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0]) === 1;
  }
  /** Get the string content of the cursor's current node. */
  get nodeText() {
    marshalTreeCursor(this);
    const startIndex = C._ts_tree_cursor_start_index_wasm(this.tree[0]);
    const endIndex = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
    C._ts_tree_cursor_start_position_wasm(this.tree[0]);
    const startPosition = unmarshalPoint(TRANSFER_BUFFER);
    return getText(this.tree, startIndex, endIndex, startPosition);
  }
  /** Get the start position of the cursor's current node. */
  get startPosition() {
    marshalTreeCursor(this);
    C._ts_tree_cursor_start_position_wasm(this.tree[0]);
    return unmarshalPoint(TRANSFER_BUFFER);
  }
  /** Get the end position of the cursor's current node. */
  get endPosition() {
    marshalTreeCursor(this);
    C._ts_tree_cursor_end_position_wasm(this.tree[0]);
    return unmarshalPoint(TRANSFER_BUFFER);
  }
  /** Get the start index of the cursor's current node. */
  get startIndex() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_start_index_wasm(this.tree[0]);
  }
  /** Get the end index of the cursor's current node. */
  get endIndex() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_end_index_wasm(this.tree[0]);
  }
  /**
   * Move this cursor to the first child of its current node.
   *
   * This returns `true` if the cursor successfully moved, and returns
   * `false` if there were no children.
   */
  gotoFirstChild() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  /**
   * Move this cursor to the last child of its current node.
   *
   * This returns `true` if the cursor successfully moved, and returns
   * `false` if there were no children.
   *
   * Note that this function may be slower than
   * {@link TreeCursor#gotoFirstChild} because it needs to
   * iterate through all the children to compute the child's position.
   */
  gotoLastChild() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  /**
   * Move this cursor to the parent of its current node.
   *
   * This returns `true` if the cursor successfully moved, and returns
   * `false` if there was no parent node (the cursor was already on the
   * root node).
   *
   * Note that the node the cursor was constructed with is considered the root
   * of the cursor, and the cursor cannot walk outside this node.
   */
  gotoParent() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  /**
   * Move this cursor to the next sibling of its current node.
   *
   * This returns `true` if the cursor successfully moved, and returns
   * `false` if there was no next sibling node.
   *
   * Note that the node the cursor was constructed with is considered the root
   * of the cursor, and the cursor cannot walk outside this node.
   */
  gotoNextSibling() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_next_sibling_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  /**
   * Move this cursor to the previous sibling of its current node.
   *
   * This returns `true` if the cursor successfully moved, and returns
   * `false` if there was no previous sibling node.
   *
   * Note that this function may be slower than
   * {@link TreeCursor#gotoNextSibling} due to how node
   * positions are stored. In the worst case, this will need to iterate
   * through all the children up to the previous sibling node to recalculate
   * its position. Also note that the node the cursor was constructed with is
   * considered the root of the cursor, and the cursor cannot walk outside this node.
   */
  gotoPreviousSibling() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_previous_sibling_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  /**
   * Move the cursor to the node that is the nth descendant of
   * the original node that the cursor was constructed with, where
   * zero represents the original node itself.
   */
  gotoDescendant(goalDescendantIndex) {
    marshalTreeCursor(this);
    C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], goalDescendantIndex);
    unmarshalTreeCursor(this);
  }
  /**
   * Move this cursor to the first child of its current node that contains or
   * starts after the given byte offset.
   *
   * This returns `true` if the cursor successfully moved to a child node, and returns
   * `false` if no such child was found.
   */
  gotoFirstChildForIndex(goalIndex) {
    marshalTreeCursor(this);
    C.setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalIndex, "i32");
    const result = C._ts_tree_cursor_goto_first_child_for_index_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  /**
   * Move this cursor to the first child of its current node that contains or
   * starts after the given byte offset.
   *
   * This returns the index of the child node if one was found, and returns
   * `null` if no such child was found.
   */
  gotoFirstChildForPosition(goalPosition) {
    marshalTreeCursor(this);
    marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalPosition);
    const result = C._ts_tree_cursor_goto_first_child_for_position_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  /**
   * Re-initialize this tree cursor to start at the original node that the
   * cursor was constructed with.
   */
  reset(node) {
    marshalNode(node);
    marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE);
    C._ts_tree_cursor_reset_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
  }
  /**
   * Re-initialize a tree cursor to the same position as another cursor.
   *
   * Unlike {@link TreeCursor#reset}, this will not lose parent
   * information and allows reusing already created cursors.
   */
  resetTo(cursor) {
    marshalTreeCursor(this, TRANSFER_BUFFER);
    marshalTreeCursor(cursor, TRANSFER_BUFFER + SIZE_OF_CURSOR);
    C._ts_tree_cursor_reset_to_wasm(this.tree[0], cursor.tree[0]);
    unmarshalTreeCursor(this);
  }
};
var Node = class {
  static {
    __name(this, "Node");
  }
  /** @internal */
  // @ts-expect-error: never read
  [0] = 0;
  // Internal handle for Wasm
  /** @internal */
  _children;
  /** @internal */
  _namedChildren;
  /** @internal */
  constructor(internal, {
    id,
    tree,
    startIndex,
    startPosition,
    other
  }) {
    assertInternal(internal);
    this[0] = other;
    this.id = id;
    this.tree = tree;
    this.startIndex = startIndex;
    this.startPosition = startPosition;
  }
  /**
   * The numeric id for this node that is unique.
   *
   * Within a given syntax tree, no two nodes have the same id. However:
   *
   * * If a new tree is created based on an older tree, and a node from the old tree is reused in
   *   the process, then that node will have the same id in both trees.
   *
   * * A node not marked as having changes does not guarantee it was reused.
   *
   * * If a node is marked as having changed in the old tree, it will not be reused.
   */
  id;
  /** The byte index where this node starts. */
  startIndex;
  /** The position where this node starts. */
  startPosition;
  /** The tree that this node belongs to. */
  tree;
  /** Get this node's type as a numerical id. */
  get typeId() {
    marshalNode(this);
    return C._ts_node_symbol_wasm(this.tree[0]);
  }
  /**
   * Get the node's type as a numerical id as it appears in the grammar,
   * ignoring aliases.
   */
  get grammarId() {
    marshalNode(this);
    return C._ts_node_grammar_symbol_wasm(this.tree[0]);
  }
  /** Get this node's type as a string. */
  get type() {
    return this.tree.language.types[this.typeId] || "ERROR";
  }
  /**
   * Get this node's symbol name as it appears in the grammar, ignoring
   * aliases as a string.
   */
  get grammarType() {
    return this.tree.language.types[this.grammarId] || "ERROR";
  }
  /**
   * Check if this node is *named*.
   *
   * Named nodes correspond to named rules in the grammar, whereas
   * *anonymous* nodes correspond to string literals in the grammar.
   */
  get isNamed() {
    marshalNode(this);
    return C._ts_node_is_named_wasm(this.tree[0]) === 1;
  }
  /**
   * Check if this node is *extra*.
   *
   * Extra nodes represent things like comments, which are not required
   * by the grammar, but can appear anywhere.
   */
  get isExtra() {
    marshalNode(this);
    return C._ts_node_is_extra_wasm(this.tree[0]) === 1;
  }
  /**
   * Check if this node represents a syntax error.
   *
   * Syntax errors represent parts of the code that could not be incorporated
   * into a valid syntax tree.
   */
  get isError() {
    marshalNode(this);
    return C._ts_node_is_error_wasm(this.tree[0]) === 1;
  }
  /**
   * Check if this node is *missing*.
   *
   * Missing nodes are inserted by the parser in order to recover from
   * certain kinds of syntax errors.
   */
  get isMissing() {
    marshalNode(this);
    return C._ts_node_is_missing_wasm(this.tree[0]) === 1;
  }
  /** Check if this node has been edited. */
  get hasChanges() {
    marshalNode(this);
    return C._ts_node_has_changes_wasm(this.tree[0]) === 1;
  }
  /**
   * Check if this node represents a syntax error or contains any syntax
   * errors anywhere within it.
   */
  get hasError() {
    marshalNode(this);
    return C._ts_node_has_error_wasm(this.tree[0]) === 1;
  }
  /** Get the byte index where this node ends. */
  get endIndex() {
    marshalNode(this);
    return C._ts_node_end_index_wasm(this.tree[0]);
  }
  /** Get the position where this node ends. */
  get endPosition() {
    marshalNode(this);
    C._ts_node_end_point_wasm(this.tree[0]);
    return unmarshalPoint(TRANSFER_BUFFER);
  }
  /** Get the string content of this node. */
  get text() {
    return getText(this.tree, this.startIndex, this.endIndex, this.startPosition);
  }
  /** Get this node's parse state. */
  get parseState() {
    marshalNode(this);
    return C._ts_node_parse_state_wasm(this.tree[0]);
  }
  /** Get the parse state after this node. */
  get nextParseState() {
    marshalNode(this);
    return C._ts_node_next_parse_state_wasm(this.tree[0]);
  }
  /** Check if this node is equal to another node. */
  equals(other) {
    return this.tree === other.tree && this.id === other.id;
  }
  /**
   * Get the node's child at the given index, where zero represents the first child.
   *
   * This method is fairly fast, but its cost is technically log(n), so if
   * you might be iterating over a long list of children, you should use
   * {@link Node#children} instead.
   */
  child(index) {
    marshalNode(this);
    C._ts_node_child_wasm(this.tree[0], index);
    return unmarshalNode(this.tree);
  }
  /**
   * Get this node's *named* child at the given index.
   *
   * See also {@link Node#isNamed}.
   * This method is fairly fast, but its cost is technically log(n), so if
   * you might be iterating over a long list of children, you should use
   * {@link Node#namedChildren} instead.
   */
  namedChild(index) {
    marshalNode(this);
    C._ts_node_named_child_wasm(this.tree[0], index);
    return unmarshalNode(this.tree);
  }
  /**
   * Get this node's child with the given numerical field id.
   *
   * See also {@link Node#childForFieldName}. You can
   * convert a field name to an id using {@link Language#fieldIdForName}.
   */
  childForFieldId(fieldId) {
    marshalNode(this);
    C._ts_node_child_by_field_id_wasm(this.tree[0], fieldId);
    return unmarshalNode(this.tree);
  }
  /**
   * Get the first child with the given field name.
   *
   * If multiple children may have the same field name, access them using
   * {@link Node#childrenForFieldName}.
   */
  childForFieldName(fieldName) {
    const fieldId = this.tree.language.fields.indexOf(fieldName);
    if (fieldId !== -1) return this.childForFieldId(fieldId);
    return null;
  }
  /** Get the field name of this node's child at the given index. */
  fieldNameForChild(index) {
    marshalNode(this);
    const address = C._ts_node_field_name_for_child_wasm(this.tree[0], index);
    if (!address) return null;
    return C.AsciiToString(address);
  }
  /** Get the field name of this node's named child at the given index. */
  fieldNameForNamedChild(index) {
    marshalNode(this);
    const address = C._ts_node_field_name_for_named_child_wasm(this.tree[0], index);
    if (!address) return null;
    return C.AsciiToString(address);
  }
  /**
   * Get an array of this node's children with a given field name.
   *
   * See also {@link Node#children}.
   */
  childrenForFieldName(fieldName) {
    const fieldId = this.tree.language.fields.indexOf(fieldName);
    if (fieldId !== -1 && fieldId !== 0) return this.childrenForFieldId(fieldId);
    return [];
  }
  /**
    * Get an array of this node's children with a given field id.
    *
    * See also {@link Node#childrenForFieldName}.
    */
  childrenForFieldId(fieldId) {
    marshalNode(this);
    C._ts_node_children_by_field_id_wasm(this.tree[0], fieldId);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0; i2 < count; i2++) {
        result[i2] = unmarshalNode(this.tree, address);
        address += SIZE_OF_NODE;
      }
      C._free(buffer);
    }
    return result;
  }
  /** Get the node's first child that contains or starts after the given byte offset. */
  firstChildForIndex(index) {
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, index, "i32");
    C._ts_node_first_child_for_byte_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /** Get the node's first named child that contains or starts after the given byte offset. */
  firstNamedChildForIndex(index) {
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, index, "i32");
    C._ts_node_first_named_child_for_byte_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /** Get this node's number of children. */
  get childCount() {
    marshalNode(this);
    return C._ts_node_child_count_wasm(this.tree[0]);
  }
  /**
   * Get this node's number of *named* children.
   *
   * See also {@link Node#isNamed}.
   */
  get namedChildCount() {
    marshalNode(this);
    return C._ts_node_named_child_count_wasm(this.tree[0]);
  }
  /** Get this node's first child. */
  get firstChild() {
    return this.child(0);
  }
  /**
   * Get this node's first named child.
   *
   * See also {@link Node#isNamed}.
   */
  get firstNamedChild() {
    return this.namedChild(0);
  }
  /** Get this node's last child. */
  get lastChild() {
    return this.child(this.childCount - 1);
  }
  /**
   * Get this node's last named child.
   *
   * See also {@link Node#isNamed}.
   */
  get lastNamedChild() {
    return this.namedChild(this.namedChildCount - 1);
  }
  /**
   * Iterate over this node's children.
   *
   * If you're walking the tree recursively, you may want to use the
   * {@link TreeCursor} APIs directly instead.
   */
  get children() {
    if (!this._children) {
      marshalNode(this);
      C._ts_node_children_wasm(this.tree[0]);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      this._children = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0; i2 < count; i2++) {
          this._children[i2] = unmarshalNode(this.tree, address);
          address += SIZE_OF_NODE;
        }
        C._free(buffer);
      }
    }
    return this._children;
  }
  /**
   * Iterate over this node's named children.
   *
   * See also {@link Node#children}.
   */
  get namedChildren() {
    if (!this._namedChildren) {
      marshalNode(this);
      C._ts_node_named_children_wasm(this.tree[0]);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      this._namedChildren = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0; i2 < count; i2++) {
          this._namedChildren[i2] = unmarshalNode(this.tree, address);
          address += SIZE_OF_NODE;
        }
        C._free(buffer);
      }
    }
    return this._namedChildren;
  }
  /**
   * Get the descendants of this node that are the given type, or in the given types array.
   *
   * The types array should contain node type strings, which can be retrieved from {@link Language#types}.
   *
   * Additionally, a `startPosition` and `endPosition` can be passed in to restrict the search to a byte range.
   */
  descendantsOfType(types, startPosition = ZERO_POINT, endPosition = ZERO_POINT) {
    if (!Array.isArray(types)) types = [types];
    const symbols = [];
    const typesBySymbol = this.tree.language.types;
    for (const node_type of types) {
      if (node_type == "ERROR") {
        symbols.push(65535);
      }
    }
    for (let i2 = 0, n = typesBySymbol.length; i2 < n; i2++) {
      if (types.includes(typesBySymbol[i2])) {
        symbols.push(i2);
      }
    }
    const symbolsAddress = C._malloc(SIZE_OF_INT * symbols.length);
    for (let i2 = 0, n = symbols.length; i2 < n; i2++) {
      C.setValue(symbolsAddress + i2 * SIZE_OF_INT, symbols[i2], "i32");
    }
    marshalNode(this);
    C._ts_node_descendants_of_type_wasm(
      this.tree[0],
      symbolsAddress,
      symbols.length,
      startPosition.row,
      startPosition.column,
      endPosition.row,
      endPosition.column
    );
    const descendantCount = C.getValue(TRANSFER_BUFFER, "i32");
    const descendantAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(descendantCount);
    if (descendantCount > 0) {
      let address = descendantAddress;
      for (let i2 = 0; i2 < descendantCount; i2++) {
        result[i2] = unmarshalNode(this.tree, address);
        address += SIZE_OF_NODE;
      }
    }
    C._free(descendantAddress);
    C._free(symbolsAddress);
    return result;
  }
  /** Get this node's next sibling. */
  get nextSibling() {
    marshalNode(this);
    C._ts_node_next_sibling_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /** Get this node's previous sibling. */
  get previousSibling() {
    marshalNode(this);
    C._ts_node_prev_sibling_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /**
   * Get this node's next *named* sibling.
   *
   * See also {@link Node#isNamed}.
   */
  get nextNamedSibling() {
    marshalNode(this);
    C._ts_node_next_named_sibling_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /**
   * Get this node's previous *named* sibling.
   *
   * See also {@link Node#isNamed}.
   */
  get previousNamedSibling() {
    marshalNode(this);
    C._ts_node_prev_named_sibling_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /** Get the node's number of descendants, including one for the node itself. */
  get descendantCount() {
    marshalNode(this);
    return C._ts_node_descendant_count_wasm(this.tree[0]);
  }
  /**
   * Get this node's immediate parent.
   * Prefer {@link Node#childWithDescendant} for iterating over this node's ancestors.
   */
  get parent() {
    marshalNode(this);
    C._ts_node_parent_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /**
   * Get the node that contains `descendant`.
   *
   * Note that this can return `descendant` itself.
   */
  childWithDescendant(descendant) {
    marshalNode(this);
    marshalNode(descendant, 1);
    C._ts_node_child_with_descendant_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /** Get the smallest node within this node that spans the given byte range. */
  descendantForIndex(start2, end = start2) {
    if (typeof start2 !== "number" || typeof end !== "number") {
      throw new Error("Arguments must be numbers");
    }
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, start2, "i32");
    C.setValue(address + SIZE_OF_INT, end, "i32");
    C._ts_node_descendant_for_index_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /** Get the smallest named node within this node that spans the given byte range. */
  namedDescendantForIndex(start2, end = start2) {
    if (typeof start2 !== "number" || typeof end !== "number") {
      throw new Error("Arguments must be numbers");
    }
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, start2, "i32");
    C.setValue(address + SIZE_OF_INT, end, "i32");
    C._ts_node_named_descendant_for_index_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /** Get the smallest node within this node that spans the given point range. */
  descendantForPosition(start2, end = start2) {
    if (!isPoint(start2) || !isPoint(end)) {
      throw new Error("Arguments must be {row, column} objects");
    }
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    marshalPoint(address, start2);
    marshalPoint(address + SIZE_OF_POINT, end);
    C._ts_node_descendant_for_position_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /** Get the smallest named node within this node that spans the given point range. */
  namedDescendantForPosition(start2, end = start2) {
    if (!isPoint(start2) || !isPoint(end)) {
      throw new Error("Arguments must be {row, column} objects");
    }
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    marshalPoint(address, start2);
    marshalPoint(address + SIZE_OF_POINT, end);
    C._ts_node_named_descendant_for_position_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  /**
   * Create a new {@link TreeCursor} starting from this node.
   *
   * Note that the given node is considered the root of the cursor,
   * and the cursor cannot walk outside this node.
   */
  walk() {
    marshalNode(this);
    C._ts_tree_cursor_new_wasm(this.tree[0]);
    return new TreeCursor(INTERNAL, this.tree);
  }
  /**
   * Edit this node to keep it in-sync with source code that has been edited.
   *
   * This function is only rarely needed. When you edit a syntax tree with
   * the {@link Tree#edit} method, all of the nodes that you retrieve from
   * the tree afterward will already reflect the edit. You only need to
   * use {@link Node#edit} when you have a specific {@link Node} instance that
   * you want to keep and continue to use after an edit.
   */
  edit(edit) {
    if (this.startIndex >= edit.oldEndIndex) {
      this.startIndex = edit.newEndIndex + (this.startIndex - edit.oldEndIndex);
      let subbedPointRow;
      let subbedPointColumn;
      if (this.startPosition.row > edit.oldEndPosition.row) {
        subbedPointRow = this.startPosition.row - edit.oldEndPosition.row;
        subbedPointColumn = this.startPosition.column;
      } else {
        subbedPointRow = 0;
        subbedPointColumn = this.startPosition.column;
        if (this.startPosition.column >= edit.oldEndPosition.column) {
          subbedPointColumn = this.startPosition.column - edit.oldEndPosition.column;
        }
      }
      if (subbedPointRow > 0) {
        this.startPosition.row += subbedPointRow;
        this.startPosition.column = subbedPointColumn;
      } else {
        this.startPosition.column += subbedPointColumn;
      }
    } else if (this.startIndex > edit.startIndex) {
      this.startIndex = edit.newEndIndex;
      this.startPosition.row = edit.newEndPosition.row;
      this.startPosition.column = edit.newEndPosition.column;
    }
  }
  /** Get the S-expression representation of this node. */
  toString() {
    marshalNode(this);
    const address = C._ts_node_to_string_wasm(this.tree[0]);
    const result = C.AsciiToString(address);
    C._free(address);
    return result;
  }
};
function unmarshalCaptures(query, tree, address, patternIndex, result) {
  for (let i2 = 0, n = result.length; i2 < n; i2++) {
    const captureIndex = C.getValue(address, "i32");
    address += SIZE_OF_INT;
    const node = unmarshalNode(tree, address);
    address += SIZE_OF_NODE;
    result[i2] = { patternIndex, name: query.captureNames[captureIndex], node };
  }
  return address;
}
__name(unmarshalCaptures, "unmarshalCaptures");
function marshalNode(node, index = 0) {
  let address = TRANSFER_BUFFER + index * SIZE_OF_NODE;
  C.setValue(address, node.id, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startPosition.row, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startPosition.column, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node[0], "i32");
}
__name(marshalNode, "marshalNode");
function unmarshalNode(tree, address = TRANSFER_BUFFER) {
  const id = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  if (id === 0) return null;
  const index = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const row = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const column = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const other = C.getValue(address, "i32");
  const result = new Node(INTERNAL, {
    id,
    tree,
    startIndex: index,
    startPosition: { row, column },
    other
  });
  return result;
}
__name(unmarshalNode, "unmarshalNode");
function marshalTreeCursor(cursor, address = TRANSFER_BUFFER) {
  C.setValue(address + 0 * SIZE_OF_INT, cursor[0], "i32");
  C.setValue(address + 1 * SIZE_OF_INT, cursor[1], "i32");
  C.setValue(address + 2 * SIZE_OF_INT, cursor[2], "i32");
  C.setValue(address + 3 * SIZE_OF_INT, cursor[3], "i32");
}
__name(marshalTreeCursor, "marshalTreeCursor");
function unmarshalTreeCursor(cursor) {
  cursor[0] = C.getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32");
  cursor[1] = C.getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32");
  cursor[2] = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
  cursor[3] = C.getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32");
}
__name(unmarshalTreeCursor, "unmarshalTreeCursor");
function marshalPoint(address, point) {
  C.setValue(address, point.row, "i32");
  C.setValue(address + SIZE_OF_INT, point.column, "i32");
}
__name(marshalPoint, "marshalPoint");
function unmarshalPoint(address) {
  const result = {
    row: C.getValue(address, "i32") >>> 0,
    column: C.getValue(address + SIZE_OF_INT, "i32") >>> 0
  };
  return result;
}
__name(unmarshalPoint, "unmarshalPoint");
function marshalRange(address, range) {
  marshalPoint(address, range.startPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, range.endPosition);
  address += SIZE_OF_POINT;
  C.setValue(address, range.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, range.endIndex, "i32");
  address += SIZE_OF_INT;
}
__name(marshalRange, "marshalRange");
function unmarshalRange(address) {
  const result = {};
  result.startPosition = unmarshalPoint(address);
  address += SIZE_OF_POINT;
  result.endPosition = unmarshalPoint(address);
  address += SIZE_OF_POINT;
  result.startIndex = C.getValue(address, "i32") >>> 0;
  address += SIZE_OF_INT;
  result.endIndex = C.getValue(address, "i32") >>> 0;
  return result;
}
__name(unmarshalRange, "unmarshalRange");
function marshalEdit(edit, address = TRANSFER_BUFFER) {
  marshalPoint(address, edit.startPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, edit.oldEndPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, edit.newEndPosition);
  address += SIZE_OF_POINT;
  C.setValue(address, edit.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, edit.oldEndIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, edit.newEndIndex, "i32");
  address += SIZE_OF_INT;
}
__name(marshalEdit, "marshalEdit");
function unmarshalLanguageMetadata(address) {
  const major_version = C.getValue(address, "i32");
  const minor_version = C.getValue(address += SIZE_OF_INT, "i32");
  const patch_version = C.getValue(address += SIZE_OF_INT, "i32");
  return { major_version, minor_version, patch_version };
}
__name(unmarshalLanguageMetadata, "unmarshalLanguageMetadata");
var LANGUAGE_FUNCTION_REGEX = /^tree_sitter_\w+$/;
var Language = class _Language {
  static {
    __name(this, "Language");
  }
  /** @internal */
  [0] = 0;
  // Internal handle for Wasm
  /**
   * A list of all node types in the language. The index of each type in this
   * array is its node type id.
   */
  types;
  /**
   * A list of all field names in the language. The index of each field name in
   * this array is its field id.
   */
  fields;
  /** @internal */
  constructor(internal, address) {
    assertInternal(internal);
    this[0] = address;
    this.types = new Array(C._ts_language_symbol_count(this[0]));
    for (let i2 = 0, n = this.types.length; i2 < n; i2++) {
      if (C._ts_language_symbol_type(this[0], i2) < 2) {
        this.types[i2] = C.UTF8ToString(C._ts_language_symbol_name(this[0], i2));
      }
    }
    this.fields = new Array(C._ts_language_field_count(this[0]) + 1);
    for (let i2 = 0, n = this.fields.length; i2 < n; i2++) {
      const fieldName = C._ts_language_field_name_for_id(this[0], i2);
      if (fieldName !== 0) {
        this.fields[i2] = C.UTF8ToString(fieldName);
      } else {
        this.fields[i2] = null;
      }
    }
  }
  /**
   * Gets the name of the language.
   */
  get name() {
    const ptr = C._ts_language_name(this[0]);
    if (ptr === 0) return null;
    return C.UTF8ToString(ptr);
  }
  /**
   * Gets the ABI version of the language.
   */
  get abiVersion() {
    return C._ts_language_abi_version(this[0]);
  }
  /**
  * Get the metadata for this language. This information is generated by the
  * CLI, and relies on the language author providing the correct metadata in
  * the language's `tree-sitter.json` file.
  */
  get metadata() {
    C._ts_language_metadata_wasm(this[0]);
    const length = C.getValue(TRANSFER_BUFFER, "i32");
    if (length === 0) return null;
    return unmarshalLanguageMetadata(TRANSFER_BUFFER + SIZE_OF_INT);
  }
  /**
   * Gets the number of fields in the language.
   */
  get fieldCount() {
    return this.fields.length - 1;
  }
  /**
   * Gets the number of states in the language.
   */
  get stateCount() {
    return C._ts_language_state_count(this[0]);
  }
  /**
   * Get the field id for a field name.
   */
  fieldIdForName(fieldName) {
    const result = this.fields.indexOf(fieldName);
    return result !== -1 ? result : null;
  }
  /**
   * Get the field name for a field id.
   */
  fieldNameForId(fieldId) {
    return this.fields[fieldId] ?? null;
  }
  /**
   * Get the node type id for a node type name.
   */
  idForNodeType(type, named) {
    const typeLength = C.lengthBytesUTF8(type);
    const typeAddress = C._malloc(typeLength + 1);
    C.stringToUTF8(type, typeAddress, typeLength + 1);
    const result = C._ts_language_symbol_for_name(this[0], typeAddress, typeLength, named ? 1 : 0);
    C._free(typeAddress);
    return result || null;
  }
  /**
   * Gets the number of node types in the language.
   */
  get nodeTypeCount() {
    return C._ts_language_symbol_count(this[0]);
  }
  /**
   * Get the node type name for a node type id.
   */
  nodeTypeForId(typeId) {
    const name2 = C._ts_language_symbol_name(this[0], typeId);
    return name2 ? C.UTF8ToString(name2) : null;
  }
  /**
   * Check if a node type is named.
   *
   * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/2-basic-parsing.html#named-vs-anonymous-nodes}
   */
  nodeTypeIsNamed(typeId) {
    return C._ts_language_type_is_named_wasm(this[0], typeId) ? true : false;
  }
  /**
   * Check if a node type is visible.
   */
  nodeTypeIsVisible(typeId) {
    return C._ts_language_type_is_visible_wasm(this[0], typeId) ? true : false;
  }
  /**
   * Get the supertypes ids of this language.
   *
   * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types.html?highlight=supertype#supertype-nodes}
   */
  get supertypes() {
    C._ts_language_supertypes_wasm(this[0]);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0; i2 < count; i2++) {
        result[i2] = C.getValue(address, "i16");
        address += SIZE_OF_SHORT;
      }
    }
    return result;
  }
  /**
   * Get the subtype ids for a given supertype node id.
   */
  subtypes(supertype) {
    C._ts_language_subtypes_wasm(this[0], supertype);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0; i2 < count; i2++) {
        result[i2] = C.getValue(address, "i16");
        address += SIZE_OF_SHORT;
      }
    }
    return result;
  }
  /**
   * Get the next state id for a given state id and node type id.
   */
  nextState(stateId, typeId) {
    return C._ts_language_next_state(this[0], stateId, typeId);
  }
  /**
   * Create a new lookahead iterator for this language and parse state.
   *
   * This returns `null` if state is invalid for this language.
   *
   * Iterating {@link LookaheadIterator} will yield valid symbols in the given
   * parse state. Newly created lookahead iterators will return the `ERROR`
   * symbol from {@link LookaheadIterator#currentType}.
   *
   * Lookahead iterators can be useful for generating suggestions and improving
   * syntax error diagnostics. To get symbols valid in an `ERROR` node, use the
   * lookahead iterator on its first leaf node state. For `MISSING` nodes, a
   * lookahead iterator created on the previous non-extra leaf node may be
   * appropriate.
   */
  lookaheadIterator(stateId) {
    const address = C._ts_lookahead_iterator_new(this[0], stateId);
    if (address) return new LookaheadIterator(INTERNAL, address, this);
    return null;
  }
  /**
   * Load a language from a WebAssembly module.
   * The module can be provided as a path to a file or as a buffer.
   */
  static async load(input) {
    let binary2;
    if (input instanceof Uint8Array) {
      binary2 = input;
    } else if (globalThis.process?.versions.node) {
      const fs2 = await import("fs/promises");
      binary2 = await fs2.readFile(input);
    } else {
      const response = await fetch(input);
      if (!response.ok) {
        const body2 = await response.text();
        throw new Error(`Language.load failed with status ${response.status}.

${body2}`);
      }
      const retryResp = response.clone();
      try {
        binary2 = await WebAssembly.compileStreaming(response);
      } catch (reason) {
        console.error("wasm streaming compile failed:", reason);
        console.error("falling back to ArrayBuffer instantiation");
        binary2 = new Uint8Array(await retryResp.arrayBuffer());
      }
    }
    const mod = await C.loadWebAssemblyModule(binary2, { loadAsync: true });
    const symbolNames = Object.keys(mod);
    const functionName = symbolNames.find((key) => LANGUAGE_FUNCTION_REGEX.test(key) && !key.includes("external_scanner_"));
    if (!functionName) {
      console.log(`Couldn't find language function in Wasm file. Symbols:
${JSON.stringify(symbolNames, null, 2)}`);
      throw new Error("Language.load failed: no language function found in Wasm file");
    }
    const languageAddress = mod[functionName]();
    return new _Language(INTERNAL, languageAddress);
  }
};
async function Module2(moduleArg = {}) {
  var moduleRtn;
  var Module = moduleArg;
  var ENVIRONMENT_IS_WEB = typeof window == "object";
  var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";
  var ENVIRONMENT_IS_NODE = typeof process == "object" && process.versions?.node && process.type != "renderer";
  if (ENVIRONMENT_IS_NODE) {
    const { createRequire } = await import("module");
    var require = createRequire(__codegraphImportMetaUrl);
  }
  Module.currentQueryProgressCallback = null;
  Module.currentProgressCallback = null;
  Module.currentLogCallback = null;
  Module.currentParseCallback = null;
  var arguments_ = [];
  var thisProgram = "./this.program";
  var quit_ = /* @__PURE__ */ __name((status, toThrow) => {
    throw toThrow;
  }, "quit_");
  var _scriptName = __codegraphImportMetaUrl;
  var scriptDirectory = "";
  function locateFile(path) {
    if (Module["locateFile"]) {
      return Module["locateFile"](path, scriptDirectory);
    }
    return scriptDirectory + path;
  }
  __name(locateFile, "locateFile");
  var readAsync, readBinary;
  if (ENVIRONMENT_IS_NODE) {
    var fs = require("fs");
    if (_scriptName.startsWith("file:")) {
      scriptDirectory = require("path").dirname(require("url").fileURLToPath(_scriptName)) + "/";
    }
    readBinary = /* @__PURE__ */ __name((filename) => {
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename);
      return ret;
    }, "readBinary");
    readAsync = /* @__PURE__ */ __name(async (filename, binary2 = true) => {
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename, binary2 ? void 0 : "utf8");
      return ret;
    }, "readAsync");
    if (process.argv.length > 1) {
      thisProgram = process.argv[1].replace(/\\/g, "/");
    }
    arguments_ = process.argv.slice(2);
    quit_ = /* @__PURE__ */ __name((status, toThrow) => {
      process.exitCode = status;
      throw toThrow;
    }, "quit_");
  } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
      scriptDirectory = new URL(".", _scriptName).href;
    } catch {
    }
    {
      if (ENVIRONMENT_IS_WORKER) {
        readBinary = /* @__PURE__ */ __name((url) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.responseType = "arraybuffer";
          xhr.send(null);
          return new Uint8Array(
            /** @type{!ArrayBuffer} */
            xhr.response
          );
        }, "readBinary");
      }
      readAsync = /* @__PURE__ */ __name(async (url) => {
        if (isFileURI(url)) {
          return new Promise((resolve3, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.responseType = "arraybuffer";
            xhr.onload = () => {
              if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                resolve3(xhr.response);
                return;
              }
              reject(xhr.status);
            };
            xhr.onerror = reject;
            xhr.send(null);
          });
        }
        var response = await fetch(url, {
          credentials: "same-origin"
        });
        if (response.ok) {
          return response.arrayBuffer();
        }
        throw new Error(response.status + " : " + response.url);
      }, "readAsync");
    }
  } else {
  }
  var out = console.log.bind(console);
  var err = console.error.bind(console);
  var dynamicLibraries = [];
  var wasmBinary;
  var ABORT = false;
  var EXITSTATUS;
  var isFileURI = /* @__PURE__ */ __name((filename) => filename.startsWith("file://"), "isFileURI");
  var readyPromiseResolve, readyPromiseReject;
  var wasmMemory;
  var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
  var HEAP64, HEAPU64;
  var HEAP_DATA_VIEW;
  var runtimeInitialized = false;
  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    Module["HEAP8"] = HEAP8 = new Int8Array(b);
    Module["HEAP16"] = HEAP16 = new Int16Array(b);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
    Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
    Module["HEAP32"] = HEAP32 = new Int32Array(b);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
    Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
    Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
    Module["HEAP64"] = HEAP64 = new BigInt64Array(b);
    Module["HEAPU64"] = HEAPU64 = new BigUint64Array(b);
    Module["HEAP_DATA_VIEW"] = HEAP_DATA_VIEW = new DataView(b);
    LE_HEAP_UPDATE();
  }
  __name(updateMemoryViews, "updateMemoryViews");
  function initMemory() {
    if (Module["wasmMemory"]) {
      wasmMemory = Module["wasmMemory"];
    } else {
      var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 33554432;
      wasmMemory = new WebAssembly.Memory({
        "initial": INITIAL_MEMORY / 65536,
        // In theory we should not need to emit the maximum if we want "unlimited"
        // or 4GB of memory, but VMs error on that atm, see
        // https://github.com/emscripten-core/emscripten/issues/14130
        // And in the pthreads case we definitely need to emit a maximum. So
        // always emit one.
        "maximum": 32768
      });
    }
    updateMemoryViews();
  }
  __name(initMemory, "initMemory");
  var __RELOC_FUNCS__ = [];
  function preRun() {
    if (Module["preRun"]) {
      if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
      while (Module["preRun"].length) {
        addOnPreRun(Module["preRun"].shift());
      }
    }
    callRuntimeCallbacks(onPreRuns);
  }
  __name(preRun, "preRun");
  function initRuntime() {
    runtimeInitialized = true;
    callRuntimeCallbacks(__RELOC_FUNCS__);
    wasmExports["__wasm_call_ctors"]();
    callRuntimeCallbacks(onPostCtors);
  }
  __name(initRuntime, "initRuntime");
  function preMain() {
  }
  __name(preMain, "preMain");
  function postRun() {
    if (Module["postRun"]) {
      if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
      while (Module["postRun"].length) {
        addOnPostRun(Module["postRun"].shift());
      }
    }
    callRuntimeCallbacks(onPostRuns);
  }
  __name(postRun, "postRun");
  function abort(what) {
    Module["onAbort"]?.(what);
    what = "Aborted(" + what + ")";
    err(what);
    ABORT = true;
    what += ". Build with -sASSERTIONS for more info.";
    var e = new WebAssembly.RuntimeError(what);
    readyPromiseReject?.(e);
    throw e;
  }
  __name(abort, "abort");
  var wasmBinaryFile;
  function findWasmBinary() {
    if (Module["locateFile"]) {
      return locateFile("web-tree-sitter.wasm");
    }
    return new URL("web-tree-sitter.wasm", __codegraphImportMetaUrl).href;
  }
  __name(findWasmBinary, "findWasmBinary");
  function getBinarySync(file) {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    if (readBinary) {
      return readBinary(file);
    }
    throw "both async and sync fetching of the wasm failed";
  }
  __name(getBinarySync, "getBinarySync");
  async function getWasmBinary(binaryFile) {
    if (!wasmBinary) {
      try {
        var response = await readAsync(binaryFile);
        return new Uint8Array(response);
      } catch {
      }
    }
    return getBinarySync(binaryFile);
  }
  __name(getWasmBinary, "getWasmBinary");
  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary2 = await getWasmBinary(binaryFile);
      var instance2 = await WebAssembly.instantiate(binary2, imports);
      return instance2;
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`);
      abort(reason);
    }
  }
  __name(instantiateArrayBuffer, "instantiateArrayBuffer");
  async function instantiateAsync(binary2, binaryFile, imports) {
    if (!binary2 && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {
      try {
        var response = fetch(binaryFile, {
          credentials: "same-origin"
        });
        var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
        return instantiationResult;
      } catch (reason) {
        err(`wasm streaming compile failed: ${reason}`);
        err("falling back to ArrayBuffer instantiation");
      }
    }
    return instantiateArrayBuffer(binaryFile, imports);
  }
  __name(instantiateAsync, "instantiateAsync");
  function getWasmImports() {
    return {
      "env": wasmImports,
      "wasi_snapshot_preview1": wasmImports,
      "GOT.mem": new Proxy(wasmImports, GOTHandler),
      "GOT.func": new Proxy(wasmImports, GOTHandler)
    };
  }
  __name(getWasmImports, "getWasmImports");
  async function createWasm() {
    function receiveInstance(instance2, module2) {
      wasmExports = instance2.exports;
      wasmExports = relocateExports(wasmExports, 1024);
      var metadata2 = getDylinkMetadata(module2);
      if (metadata2.neededDynlibs) {
        dynamicLibraries = metadata2.neededDynlibs.concat(dynamicLibraries);
      }
      mergeLibSymbols(wasmExports, "main");
      LDSO.init();
      loadDylibs();
      __RELOC_FUNCS__.push(wasmExports["__wasm_apply_data_relocs"]);
      assignWasmExports(wasmExports);
      return wasmExports;
    }
    __name(receiveInstance, "receiveInstance");
    function receiveInstantiationResult(result2) {
      return receiveInstance(result2["instance"], result2["module"]);
    }
    __name(receiveInstantiationResult, "receiveInstantiationResult");
    var info2 = getWasmImports();
    if (Module["instantiateWasm"]) {
      return new Promise((resolve3, reject) => {
        Module["instantiateWasm"](info2, (mod, inst) => {
          resolve3(receiveInstance(mod, inst));
        });
      });
    }
    wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info2);
    var exports = receiveInstantiationResult(result);
    return exports;
  }
  __name(createWasm, "createWasm");
  class ExitStatus {
    static {
      __name(this, "ExitStatus");
    }
    name = "ExitStatus";
    constructor(status) {
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
  }
  var GOT = {};
  var currentModuleWeakSymbols = /* @__PURE__ */ new Set([]);
  var GOTHandler = {
    get(obj, symName) {
      var rtn = GOT[symName];
      if (!rtn) {
        rtn = GOT[symName] = new WebAssembly.Global({
          "value": "i32",
          "mutable": true
        });
      }
      if (!currentModuleWeakSymbols.has(symName)) {
        rtn.required = true;
      }
      return rtn;
    }
  };
  var LE_ATOMICS_NATIVE_BYTE_ORDER = [];
  var LE_HEAP_LOAD_F32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat32(byteOffset, true), "LE_HEAP_LOAD_F32");
  var LE_HEAP_LOAD_F64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat64(byteOffset, true), "LE_HEAP_LOAD_F64");
  var LE_HEAP_LOAD_I16 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt16(byteOffset, true), "LE_HEAP_LOAD_I16");
  var LE_HEAP_LOAD_I32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt32(byteOffset, true), "LE_HEAP_LOAD_I32");
  var LE_HEAP_LOAD_I64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getBigInt64(byteOffset, true), "LE_HEAP_LOAD_I64");
  var LE_HEAP_LOAD_U32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getUint32(byteOffset, true), "LE_HEAP_LOAD_U32");
  var LE_HEAP_STORE_F32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat32(byteOffset, value, true), "LE_HEAP_STORE_F32");
  var LE_HEAP_STORE_F64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat64(byteOffset, value, true), "LE_HEAP_STORE_F64");
  var LE_HEAP_STORE_I16 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt16(byteOffset, value, true), "LE_HEAP_STORE_I16");
  var LE_HEAP_STORE_I32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt32(byteOffset, value, true), "LE_HEAP_STORE_I32");
  var LE_HEAP_STORE_I64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setBigInt64(byteOffset, value, true), "LE_HEAP_STORE_I64");
  var LE_HEAP_STORE_U32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setUint32(byteOffset, value, true), "LE_HEAP_STORE_U32");
  var callRuntimeCallbacks = /* @__PURE__ */ __name((callbacks) => {
    while (callbacks.length > 0) {
      callbacks.shift()(Module);
    }
  }, "callRuntimeCallbacks");
  var onPostRuns = [];
  var addOnPostRun = /* @__PURE__ */ __name((cb) => onPostRuns.push(cb), "addOnPostRun");
  var onPreRuns = [];
  var addOnPreRun = /* @__PURE__ */ __name((cb) => onPreRuns.push(cb), "addOnPreRun");
  var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
  var findStringEnd = /* @__PURE__ */ __name((heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead;
    if (ignoreNul) return maxIdx;
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
    return idx;
  }, "findStringEnd");
  var UTF8ArrayToString = /* @__PURE__ */ __name((heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
    if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
      return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
    }
    var str = "";
    while (idx < endPtr) {
      var u0 = heapOrArray[idx++];
      if (!(u0 & 128)) {
        str += String.fromCharCode(u0);
        continue;
      }
      var u1 = heapOrArray[idx++] & 63;
      if ((u0 & 224) == 192) {
        str += String.fromCharCode((u0 & 31) << 6 | u1);
        continue;
      }
      var u2 = heapOrArray[idx++] & 63;
      if ((u0 & 240) == 224) {
        u0 = (u0 & 15) << 12 | u1 << 6 | u2;
      } else {
        u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
      }
      if (u0 < 65536) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 65536;
        str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
      }
    }
    return str;
  }, "UTF8ArrayToString");
  var getDylinkMetadata = /* @__PURE__ */ __name((binary2) => {
    var offset = 0;
    var end = 0;
    function getU8() {
      return binary2[offset++];
    }
    __name(getU8, "getU8");
    function getLEB() {
      var ret = 0;
      var mul = 1;
      while (1) {
        var byte = binary2[offset++];
        ret += (byte & 127) * mul;
        mul *= 128;
        if (!(byte & 128)) break;
      }
      return ret;
    }
    __name(getLEB, "getLEB");
    function getString() {
      var len = getLEB();
      offset += len;
      return UTF8ArrayToString(binary2, offset - len, len);
    }
    __name(getString, "getString");
    function getStringList() {
      var count2 = getLEB();
      var rtn = [];
      while (count2--) rtn.push(getString());
      return rtn;
    }
    __name(getStringList, "getStringList");
    function failIf(condition, message) {
      if (condition) throw new Error(message);
    }
    __name(failIf, "failIf");
    if (binary2 instanceof WebAssembly.Module) {
      var dylinkSection = WebAssembly.Module.customSections(binary2, "dylink.0");
      failIf(dylinkSection.length === 0, "need dylink section");
      binary2 = new Uint8Array(dylinkSection[0]);
      end = binary2.length;
    } else {
      var int32View = new Uint32Array(new Uint8Array(binary2.subarray(0, 24)).buffer);
      var magicNumberFound = int32View[0] == 1836278016 || int32View[0] == 6386541;
      failIf(!magicNumberFound, "need to see wasm magic number");
      failIf(binary2[8] !== 0, "need the dylink section to be first");
      offset = 9;
      var section_size = getLEB();
      end = offset + section_size;
      var name2 = getString();
      failIf(name2 !== "dylink.0");
    }
    var customSection = {
      neededDynlibs: [],
      tlsExports: /* @__PURE__ */ new Set(),
      weakImports: /* @__PURE__ */ new Set(),
      runtimePaths: []
    };
    var WASM_DYLINK_MEM_INFO = 1;
    var WASM_DYLINK_NEEDED = 2;
    var WASM_DYLINK_EXPORT_INFO = 3;
    var WASM_DYLINK_IMPORT_INFO = 4;
    var WASM_DYLINK_RUNTIME_PATH = 5;
    var WASM_SYMBOL_TLS = 256;
    var WASM_SYMBOL_BINDING_MASK = 3;
    var WASM_SYMBOL_BINDING_WEAK = 1;
    while (offset < end) {
      var subsectionType = getU8();
      var subsectionSize = getLEB();
      if (subsectionType === WASM_DYLINK_MEM_INFO) {
        customSection.memorySize = getLEB();
        customSection.memoryAlign = getLEB();
        customSection.tableSize = getLEB();
        customSection.tableAlign = getLEB();
      } else if (subsectionType === WASM_DYLINK_NEEDED) {
        customSection.neededDynlibs = getStringList();
      } else if (subsectionType === WASM_DYLINK_EXPORT_INFO) {
        var count = getLEB();
        while (count--) {
          var symname = getString();
          var flags2 = getLEB();
          if (flags2 & WASM_SYMBOL_TLS) {
            customSection.tlsExports.add(symname);
          }
        }
      } else if (subsectionType === WASM_DYLINK_IMPORT_INFO) {
        var count = getLEB();
        while (count--) {
          var modname = getString();
          var symname = getString();
          var flags2 = getLEB();
          if ((flags2 & WASM_SYMBOL_BINDING_MASK) == WASM_SYMBOL_BINDING_WEAK) {
            customSection.weakImports.add(symname);
          }
        }
      } else if (subsectionType === WASM_DYLINK_RUNTIME_PATH) {
        customSection.runtimePaths = getStringList();
      } else {
        offset += subsectionSize;
      }
    }
    return customSection;
  }, "getDylinkMetadata");
  function getValue(ptr, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        return HEAP8[ptr];
      case "i8":
        return HEAP8[ptr];
      case "i16":
        return LE_HEAP_LOAD_I16((ptr >> 1) * 2);
      case "i32":
        return LE_HEAP_LOAD_I32((ptr >> 2) * 4);
      case "i64":
        return LE_HEAP_LOAD_I64((ptr >> 3) * 8);
      case "float":
        return LE_HEAP_LOAD_F32((ptr >> 2) * 4);
      case "double":
        return LE_HEAP_LOAD_F64((ptr >> 3) * 8);
      case "*":
        return LE_HEAP_LOAD_U32((ptr >> 2) * 4);
      default:
        abort(`invalid type for getValue: ${type}`);
    }
  }
  __name(getValue, "getValue");
  var newDSO = /* @__PURE__ */ __name((name2, handle2, syms) => {
    var dso = {
      refcount: Infinity,
      name: name2,
      exports: syms,
      global: true
    };
    LDSO.loadedLibsByName[name2] = dso;
    if (handle2 != void 0) {
      LDSO.loadedLibsByHandle[handle2] = dso;
    }
    return dso;
  }, "newDSO");
  var LDSO = {
    loadedLibsByName: {},
    loadedLibsByHandle: {},
    init() {
      newDSO("__main__", 0, wasmImports);
    }
  };
  var ___heap_base = 78240;
  var alignMemory = /* @__PURE__ */ __name((size, alignment) => Math.ceil(size / alignment) * alignment, "alignMemory");
  var getMemory = /* @__PURE__ */ __name((size) => {
    if (runtimeInitialized) {
      return _calloc(size, 1);
    }
    var ret = ___heap_base;
    var end = ret + alignMemory(size, 16);
    ___heap_base = end;
    GOT["__heap_base"].value = end;
    return ret;
  }, "getMemory");
  var isInternalSym = /* @__PURE__ */ __name((symName) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(symName) || symName.startsWith("__em_js__"), "isInternalSym");
  var uleb128EncodeWithLen = /* @__PURE__ */ __name((arr) => {
    const n = arr.length;
    return [n % 128 | 128, n >> 7, ...arr];
  }, "uleb128EncodeWithLen");
  var wasmTypeCodes = {
    "i": 127,
    // i32
    "p": 127,
    // i32
    "j": 126,
    // i64
    "f": 125,
    // f32
    "d": 124,
    // f64
    "e": 111
  };
  var generateTypePack = /* @__PURE__ */ __name((types) => uleb128EncodeWithLen(Array.from(types, (type) => {
    var code = wasmTypeCodes[type];
    return code;
  })), "generateTypePack");
  var convertJsFunctionToWasm = /* @__PURE__ */ __name((func2, sig) => {
    var bytes = Uint8Array.of(
      0,
      97,
      115,
      109,
      // magic ("\0asm")
      1,
      0,
      0,
      0,
      // version: 1
      1,
      ...uleb128EncodeWithLen([
        1,
        // count: 1
        96,
        // param types
        ...generateTypePack(sig.slice(1)),
        // return types (for now only supporting [] if `void` and single [T] otherwise)
        ...generateTypePack(sig[0] === "v" ? "" : sig[0])
      ]),
      // The rest of the module is static
      2,
      7,
      // import section
      // (import "e" "f" (func 0 (type 0)))
      1,
      1,
      101,
      1,
      102,
      0,
      0,
      7,
      5,
      // export section
      // (export "f" (func 0 (type 0)))
      1,
      1,
      102,
      0,
      0
    );
    var module2 = new WebAssembly.Module(bytes);
    var instance2 = new WebAssembly.Instance(module2, {
      "e": {
        "f": func2
      }
    });
    var wrappedFunc = instance2.exports["f"];
    return wrappedFunc;
  }, "convertJsFunctionToWasm");
  var wasmTableMirror = [];
  var wasmTable = new WebAssembly.Table({
    "initial": 31,
    "element": "anyfunc"
  });
  var getWasmTableEntry = /* @__PURE__ */ __name((funcPtr) => {
    var func2 = wasmTableMirror[funcPtr];
    if (!func2) {
      wasmTableMirror[funcPtr] = func2 = wasmTable.get(funcPtr);
    }
    return func2;
  }, "getWasmTableEntry");
  var updateTableMap = /* @__PURE__ */ __name((offset, count) => {
    if (functionsInTableMap) {
      for (var i2 = offset; i2 < offset + count; i2++) {
        var item = getWasmTableEntry(i2);
        if (item) {
          functionsInTableMap.set(item, i2);
        }
      }
    }
  }, "updateTableMap");
  var functionsInTableMap;
  var getFunctionAddress = /* @__PURE__ */ __name((func2) => {
    if (!functionsInTableMap) {
      functionsInTableMap = /* @__PURE__ */ new WeakMap();
      updateTableMap(0, wasmTable.length);
    }
    return functionsInTableMap.get(func2) || 0;
  }, "getFunctionAddress");
  var freeTableIndexes = [];
  var getEmptyTableSlot = /* @__PURE__ */ __name(() => {
    if (freeTableIndexes.length) {
      return freeTableIndexes.pop();
    }
    return wasmTable["grow"](1);
  }, "getEmptyTableSlot");
  var setWasmTableEntry = /* @__PURE__ */ __name((idx, func2) => {
    wasmTable.set(idx, func2);
    wasmTableMirror[idx] = wasmTable.get(idx);
  }, "setWasmTableEntry");
  var addFunction = /* @__PURE__ */ __name((func2, sig) => {
    var rtn = getFunctionAddress(func2);
    if (rtn) {
      return rtn;
    }
    var ret = getEmptyTableSlot();
    try {
      setWasmTableEntry(ret, func2);
    } catch (err2) {
      if (!(err2 instanceof TypeError)) {
        throw err2;
      }
      var wrapped = convertJsFunctionToWasm(func2, sig);
      setWasmTableEntry(ret, wrapped);
    }
    functionsInTableMap.set(func2, ret);
    return ret;
  }, "addFunction");
  var updateGOT = /* @__PURE__ */ __name((exports, replace) => {
    for (var symName in exports) {
      if (isInternalSym(symName)) {
        continue;
      }
      var value = exports[symName];
      GOT[symName] ||= new WebAssembly.Global({
        "value": "i32",
        "mutable": true
      });
      if (replace || GOT[symName].value == 0) {
        if (typeof value == "function") {
          GOT[symName].value = addFunction(value);
        } else if (typeof value == "number") {
          GOT[symName].value = value;
        } else {
          err(`unhandled export type for '${symName}': ${typeof value}`);
        }
      }
    }
  }, "updateGOT");
  var relocateExports = /* @__PURE__ */ __name((exports, memoryBase2, replace) => {
    var relocated = {};
    for (var e in exports) {
      var value = exports[e];
      if (typeof value == "object") {
        value = value.value;
      }
      if (typeof value == "number") {
        value += memoryBase2;
      }
      relocated[e] = value;
    }
    updateGOT(relocated, replace);
    return relocated;
  }, "relocateExports");
  var isSymbolDefined = /* @__PURE__ */ __name((symName) => {
    var existing = wasmImports[symName];
    if (!existing || existing.stub) {
      return false;
    }
    return true;
  }, "isSymbolDefined");
  var dynCall = /* @__PURE__ */ __name((sig, ptr, args2 = [], promising = false) => {
    var func2 = getWasmTableEntry(ptr);
    var rtn = func2(...args2);
    function convert(rtn2) {
      return rtn2;
    }
    __name(convert, "convert");
    return convert(rtn);
  }, "dynCall");
  var stackSave = /* @__PURE__ */ __name(() => _emscripten_stack_get_current(), "stackSave");
  var stackRestore = /* @__PURE__ */ __name((val) => __emscripten_stack_restore(val), "stackRestore");
  var createInvokeFunction = /* @__PURE__ */ __name((sig) => (ptr, ...args2) => {
    var sp = stackSave();
    try {
      return dynCall(sig, ptr, args2);
    } catch (e) {
      stackRestore(sp);
      if (e !== e + 0) throw e;
      _setThrew(1, 0);
      if (sig[0] == "j") return 0n;
    }
  }, "createInvokeFunction");
  var resolveGlobalSymbol = /* @__PURE__ */ __name((symName, direct = false) => {
    var sym;
    if (isSymbolDefined(symName)) {
      sym = wasmImports[symName];
    } else if (symName.startsWith("invoke_")) {
      sym = wasmImports[symName] = createInvokeFunction(symName.split("_")[1]);
    }
    return {
      sym,
      name: symName
    };
  }, "resolveGlobalSymbol");
  var onPostCtors = [];
  var addOnPostCtor = /* @__PURE__ */ __name((cb) => onPostCtors.push(cb), "addOnPostCtor");
  var UTF8ToString = /* @__PURE__ */ __name((ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "", "UTF8ToString");
  var loadWebAssemblyModule = /* @__PURE__ */ __name((binary, flags, libName, localScope, handle) => {
    var metadata = getDylinkMetadata(binary);
    function loadModule() {
      var memAlign = Math.pow(2, metadata.memoryAlign);
      var memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0;
      var tableBase = metadata.tableSize ? wasmTable.length : 0;
      if (handle) {
        HEAP8[handle + 8] = 1;
        LE_HEAP_STORE_U32((handle + 12 >> 2) * 4, memoryBase);
        LE_HEAP_STORE_I32((handle + 16 >> 2) * 4, metadata.memorySize);
        LE_HEAP_STORE_U32((handle + 20 >> 2) * 4, tableBase);
        LE_HEAP_STORE_I32((handle + 24 >> 2) * 4, metadata.tableSize);
      }
      if (metadata.tableSize) {
        wasmTable.grow(metadata.tableSize);
      }
      var moduleExports;
      function resolveSymbol(sym) {
        var resolved = resolveGlobalSymbol(sym).sym;
        if (!resolved && localScope) {
          resolved = localScope[sym];
        }
        if (!resolved) {
          resolved = moduleExports[sym];
        }
        return resolved;
      }
      __name(resolveSymbol, "resolveSymbol");
      var proxyHandler = {
        get(stubs, prop) {
          switch (prop) {
            case "__memory_base":
              return memoryBase;
            case "__table_base":
              return tableBase;
          }
          if (prop in wasmImports && !wasmImports[prop].stub) {
            var res = wasmImports[prop];
            return res;
          }
          if (!(prop in stubs)) {
            var resolved;
            stubs[prop] = (...args2) => {
              resolved ||= resolveSymbol(prop);
              return resolved(...args2);
            };
          }
          return stubs[prop];
        }
      };
      var proxy = new Proxy({}, proxyHandler);
      currentModuleWeakSymbols = metadata.weakImports;
      var info = {
        "GOT.mem": new Proxy({}, GOTHandler),
        "GOT.func": new Proxy({}, GOTHandler),
        "env": proxy,
        "wasi_snapshot_preview1": proxy
      };
      function postInstantiation(module, instance) {
        updateTableMap(tableBase, metadata.tableSize);
        moduleExports = relocateExports(instance.exports, memoryBase);
        if (!flags.allowUndefined) {
          reportUndefinedSymbols();
        }
        function addEmAsm(addr, body) {
          var args = [];
          var arity = 0;
          for (; arity < 16; arity++) {
            if (body.indexOf("$" + arity) != -1) {
              args.push("$" + arity);
            } else {
              break;
            }
          }
          args = args.join(",");
          var func = `(${args}) => { ${body} };`;
          ASM_CONSTS[start] = eval(func);
        }
        __name(addEmAsm, "addEmAsm");
        if ("__start_em_asm" in moduleExports) {
          var start = moduleExports["__start_em_asm"];
          var stop = moduleExports["__stop_em_asm"];
          while (start < stop) {
            var jsString = UTF8ToString(start);
            addEmAsm(start, jsString);
            start = HEAPU8.indexOf(0, start) + 1;
          }
        }
        function addEmJs(name, cSig, body) {
          var jsArgs = [];
          cSig = cSig.slice(1, -1);
          if (cSig != "void") {
            cSig = cSig.split(",");
            for (var i in cSig) {
              var jsArg = cSig[i].split(" ").pop();
              jsArgs.push(jsArg.replace("*", ""));
            }
          }
          var func = `(${jsArgs}) => ${body};`;
          moduleExports[name] = eval(func);
        }
        __name(addEmJs, "addEmJs");
        for (var name in moduleExports) {
          if (name.startsWith("__em_js__")) {
            var start = moduleExports[name];
            var jsString = UTF8ToString(start);
            var parts = jsString.split("<::>");
            addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]);
            delete moduleExports[name];
          }
        }
        var applyRelocs = moduleExports["__wasm_apply_data_relocs"];
        if (applyRelocs) {
          if (runtimeInitialized) {
            applyRelocs();
          } else {
            __RELOC_FUNCS__.push(applyRelocs);
          }
        }
        var init = moduleExports["__wasm_call_ctors"];
        if (init) {
          if (runtimeInitialized) {
            init();
          } else {
            addOnPostCtor(init);
          }
        }
        return moduleExports;
      }
      __name(postInstantiation, "postInstantiation");
      if (flags.loadAsync) {
        return (async () => {
          var instance2;
          if (binary instanceof WebAssembly.Module) {
            instance2 = new WebAssembly.Instance(binary, info);
          } else {
            ({ module: binary, instance: instance2 } = await WebAssembly.instantiate(binary, info));
          }
          return postInstantiation(binary, instance2);
        })();
      }
      var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary);
      var instance = new WebAssembly.Instance(module, info);
      return postInstantiation(module, instance);
    }
    __name(loadModule, "loadModule");
    flags = {
      ...flags,
      rpath: {
        parentLibPath: libName,
        paths: metadata.runtimePaths
      }
    };
    if (flags.loadAsync) {
      return metadata.neededDynlibs.reduce((chain, dynNeeded) => chain.then(() => loadDynamicLibrary(dynNeeded, flags, localScope)), Promise.resolve()).then(loadModule);
    }
    metadata.neededDynlibs.forEach((needed) => loadDynamicLibrary(needed, flags, localScope));
    return loadModule();
  }, "loadWebAssemblyModule");
  var mergeLibSymbols = /* @__PURE__ */ __name((exports, libName2) => {
    for (var [sym, exp] of Object.entries(exports)) {
      const setImport = /* @__PURE__ */ __name((target) => {
        if (!isSymbolDefined(target)) {
          wasmImports[target] = exp;
        }
      }, "setImport");
      setImport(sym);
      const main_alias = "__main_argc_argv";
      if (sym == "main") {
        setImport(main_alias);
      }
      if (sym == main_alias) {
        setImport("main");
      }
    }
  }, "mergeLibSymbols");
  var asyncLoad = /* @__PURE__ */ __name(async (url) => {
    var arrayBuffer = await readAsync(url);
    return new Uint8Array(arrayBuffer);
  }, "asyncLoad");
  function loadDynamicLibrary(libName2, flags2 = {
    global: true,
    nodelete: true
  }, localScope2, handle2) {
    var dso = LDSO.loadedLibsByName[libName2];
    if (dso) {
      if (!flags2.global) {
        if (localScope2) {
          Object.assign(localScope2, dso.exports);
        }
      } else if (!dso.global) {
        dso.global = true;
        mergeLibSymbols(dso.exports, libName2);
      }
      if (flags2.nodelete && dso.refcount !== Infinity) {
        dso.refcount = Infinity;
      }
      dso.refcount++;
      if (handle2) {
        LDSO.loadedLibsByHandle[handle2] = dso;
      }
      return flags2.loadAsync ? Promise.resolve(true) : true;
    }
    dso = newDSO(libName2, handle2, "loading");
    dso.refcount = flags2.nodelete ? Infinity : 1;
    dso.global = flags2.global;
    function loadLibData() {
      if (handle2) {
        var data = LE_HEAP_LOAD_U32((handle2 + 28 >> 2) * 4);
        var dataSize = LE_HEAP_LOAD_U32((handle2 + 32 >> 2) * 4);
        if (data && dataSize) {
          var libData = HEAP8.slice(data, data + dataSize);
          return flags2.loadAsync ? Promise.resolve(libData) : libData;
        }
      }
      var libFile = locateFile(libName2);
      if (flags2.loadAsync) {
        return asyncLoad(libFile);
      }
      if (!readBinary) {
        throw new Error(`${libFile}: file not found, and synchronous loading of external files is not available`);
      }
      return readBinary(libFile);
    }
    __name(loadLibData, "loadLibData");
    function getExports() {
      if (flags2.loadAsync) {
        return loadLibData().then((libData) => loadWebAssemblyModule(libData, flags2, libName2, localScope2, handle2));
      }
      return loadWebAssemblyModule(loadLibData(), flags2, libName2, localScope2, handle2);
    }
    __name(getExports, "getExports");
    function moduleLoaded(exports) {
      if (dso.global) {
        mergeLibSymbols(exports, libName2);
      } else if (localScope2) {
        Object.assign(localScope2, exports);
      }
      dso.exports = exports;
    }
    __name(moduleLoaded, "moduleLoaded");
    if (flags2.loadAsync) {
      return getExports().then((exports) => {
        moduleLoaded(exports);
        return true;
      });
    }
    moduleLoaded(getExports());
    return true;
  }
  __name(loadDynamicLibrary, "loadDynamicLibrary");
  var reportUndefinedSymbols = /* @__PURE__ */ __name(() => {
    for (var [symName, entry] of Object.entries(GOT)) {
      if (entry.value == 0) {
        var value = resolveGlobalSymbol(symName, true).sym;
        if (!value && !entry.required) {
          continue;
        }
        if (typeof value == "function") {
          entry.value = addFunction(value, value.sig);
        } else if (typeof value == "number") {
          entry.value = value;
        } else {
          throw new Error(`bad export type for '${symName}': ${typeof value}`);
        }
      }
    }
  }, "reportUndefinedSymbols");
  var runDependencies = 0;
  var dependenciesFulfilled = null;
  var removeRunDependency = /* @__PURE__ */ __name((id) => {
    runDependencies--;
    Module["monitorRunDependencies"]?.(runDependencies);
    if (runDependencies == 0) {
      if (dependenciesFulfilled) {
        var callback = dependenciesFulfilled;
        dependenciesFulfilled = null;
        callback();
      }
    }
  }, "removeRunDependency");
  var addRunDependency = /* @__PURE__ */ __name((id) => {
    runDependencies++;
    Module["monitorRunDependencies"]?.(runDependencies);
  }, "addRunDependency");
  var loadDylibs = /* @__PURE__ */ __name(async () => {
    if (!dynamicLibraries.length) {
      reportUndefinedSymbols();
      return;
    }
    addRunDependency("loadDylibs");
    for (var lib of dynamicLibraries) {
      await loadDynamicLibrary(lib, {
        loadAsync: true,
        global: true,
        nodelete: true,
        allowUndefined: true
      });
    }
    reportUndefinedSymbols();
    removeRunDependency("loadDylibs");
  }, "loadDylibs");
  var noExitRuntime = true;
  function setValue(ptr, value, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        HEAP8[ptr] = value;
        break;
      case "i8":
        HEAP8[ptr] = value;
        break;
      case "i16":
        LE_HEAP_STORE_I16((ptr >> 1) * 2, value);
        break;
      case "i32":
        LE_HEAP_STORE_I32((ptr >> 2) * 4, value);
        break;
      case "i64":
        LE_HEAP_STORE_I64((ptr >> 3) * 8, BigInt(value));
        break;
      case "float":
        LE_HEAP_STORE_F32((ptr >> 2) * 4, value);
        break;
      case "double":
        LE_HEAP_STORE_F64((ptr >> 3) * 8, value);
        break;
      case "*":
        LE_HEAP_STORE_U32((ptr >> 2) * 4, value);
        break;
      default:
        abort(`invalid type for setValue: ${type}`);
    }
  }
  __name(setValue, "setValue");
  var ___memory_base = new WebAssembly.Global({
    "value": "i32",
    "mutable": false
  }, 1024);
  var ___stack_high = 78240;
  var ___stack_low = 12704;
  var ___stack_pointer = new WebAssembly.Global({
    "value": "i32",
    "mutable": true
  }, 78240);
  var ___table_base = new WebAssembly.Global({
    "value": "i32",
    "mutable": false
  }, 1);
  var __abort_js = /* @__PURE__ */ __name(() => abort(""), "__abort_js");
  __abort_js.sig = "v";
  var getHeapMax = /* @__PURE__ */ __name(() => (
    // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
    // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
    // for any code that deals with heap sizes, which would require special
    // casing all heap size related code to treat 0 specially.
    2147483648
  ), "getHeapMax");
  var growMemory = /* @__PURE__ */ __name((size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength;
    var pages = (size - oldHeapSize + 65535) / 65536 | 0;
    try {
      wasmMemory.grow(pages);
      updateMemoryViews();
      return 1;
    } catch (e) {
    }
  }, "growMemory");
  var _emscripten_resize_heap = /* @__PURE__ */ __name((requestedSize) => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize) {
      return false;
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
      var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
      var replacement = growMemory(newSize);
      if (replacement) {
        return true;
      }
    }
    return false;
  }, "_emscripten_resize_heap");
  _emscripten_resize_heap.sig = "ip";
  var _fd_close = /* @__PURE__ */ __name((fd) => 52, "_fd_close");
  _fd_close.sig = "ii";
  var INT53_MAX = 9007199254740992;
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = /* @__PURE__ */ __name((num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num), "bigintToI53Checked");
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
    return 70;
  }
  __name(_fd_seek, "_fd_seek");
  _fd_seek.sig = "iijip";
  var printCharBuffers = [null, [], []];
  var printChar = /* @__PURE__ */ __name((stream, curr) => {
    var buffer = printCharBuffers[stream];
    if (curr === 0 || curr === 10) {
      (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
      buffer.length = 0;
    } else {
      buffer.push(curr);
    }
  }, "printChar");
  var _fd_write = /* @__PURE__ */ __name((fd, iov, iovcnt, pnum) => {
    var num = 0;
    for (var i2 = 0; i2 < iovcnt; i2++) {
      var ptr = LE_HEAP_LOAD_U32((iov >> 2) * 4);
      var len = LE_HEAP_LOAD_U32((iov + 4 >> 2) * 4);
      iov += 8;
      for (var j = 0; j < len; j++) {
        printChar(fd, HEAPU8[ptr + j]);
      }
      num += len;
    }
    LE_HEAP_STORE_U32((pnum >> 2) * 4, num);
    return 0;
  }, "_fd_write");
  _fd_write.sig = "iippp";
  function _tree_sitter_log_callback(isLexMessage, messageAddress) {
    if (Module.currentLogCallback) {
      const message = UTF8ToString(messageAddress);
      Module.currentLogCallback(message, isLexMessage !== 0);
    }
  }
  __name(_tree_sitter_log_callback, "_tree_sitter_log_callback");
  function _tree_sitter_parse_callback(inputBufferAddress, index, row, column, lengthAddress) {
    const INPUT_BUFFER_SIZE = 10 * 1024;
    const string = Module.currentParseCallback(index, {
      row,
      column
    });
    if (typeof string === "string") {
      setValue(lengthAddress, string.length, "i32");
      stringToUTF16(string, inputBufferAddress, INPUT_BUFFER_SIZE);
    } else {
      setValue(lengthAddress, 0, "i32");
    }
  }
  __name(_tree_sitter_parse_callback, "_tree_sitter_parse_callback");
  function _tree_sitter_progress_callback(currentOffset, hasError) {
    if (Module.currentProgressCallback) {
      return Module.currentProgressCallback({
        currentOffset,
        hasError
      });
    }
    return false;
  }
  __name(_tree_sitter_progress_callback, "_tree_sitter_progress_callback");
  function _tree_sitter_query_progress_callback(currentOffset) {
    if (Module.currentQueryProgressCallback) {
      return Module.currentQueryProgressCallback({
        currentOffset
      });
    }
    return false;
  }
  __name(_tree_sitter_query_progress_callback, "_tree_sitter_query_progress_callback");
  var runtimeKeepaliveCounter = 0;
  var keepRuntimeAlive = /* @__PURE__ */ __name(() => noExitRuntime || runtimeKeepaliveCounter > 0, "keepRuntimeAlive");
  var _proc_exit = /* @__PURE__ */ __name((code) => {
    EXITSTATUS = code;
    if (!keepRuntimeAlive()) {
      Module["onExit"]?.(code);
      ABORT = true;
    }
    quit_(code, new ExitStatus(code));
  }, "_proc_exit");
  _proc_exit.sig = "vi";
  var exitJS = /* @__PURE__ */ __name((status, implicit) => {
    EXITSTATUS = status;
    _proc_exit(status);
  }, "exitJS");
  var handleException = /* @__PURE__ */ __name((e) => {
    if (e instanceof ExitStatus || e == "unwind") {
      return EXITSTATUS;
    }
    quit_(1, e);
  }, "handleException");
  var lengthBytesUTF8 = /* @__PURE__ */ __name((str) => {
    var len = 0;
    for (var i2 = 0; i2 < str.length; ++i2) {
      var c = str.charCodeAt(i2);
      if (c <= 127) {
        len++;
      } else if (c <= 2047) {
        len += 2;
      } else if (c >= 55296 && c <= 57343) {
        len += 4;
        ++i2;
      } else {
        len += 3;
      }
    }
    return len;
  }, "lengthBytesUTF8");
  var stringToUTF8Array = /* @__PURE__ */ __name((str, heap, outIdx, maxBytesToWrite) => {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i2 = 0; i2 < str.length; ++i2) {
      var u = str.codePointAt(i2);
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 192 | u >> 6;
        heap[outIdx++] = 128 | u & 63;
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 224 | u >> 12;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
      } else {
        if (outIdx + 3 >= endIdx) break;
        heap[outIdx++] = 240 | u >> 18;
        heap[outIdx++] = 128 | u >> 12 & 63;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
        i2++;
      }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx;
  }, "stringToUTF8Array");
  var stringToUTF8 = /* @__PURE__ */ __name((str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite), "stringToUTF8");
  var stackAlloc = /* @__PURE__ */ __name((sz) => __emscripten_stack_alloc(sz), "stackAlloc");
  var stringToUTF8OnStack = /* @__PURE__ */ __name((str) => {
    var size = lengthBytesUTF8(str) + 1;
    var ret = stackAlloc(size);
    stringToUTF8(str, ret, size);
    return ret;
  }, "stringToUTF8OnStack");
  var AsciiToString = /* @__PURE__ */ __name((ptr) => {
    var str = "";
    while (1) {
      var ch = HEAPU8[ptr++];
      if (!ch) return str;
      str += String.fromCharCode(ch);
    }
  }, "AsciiToString");
  var stringToUTF16 = /* @__PURE__ */ __name((str, outPtr, maxBytesToWrite) => {
    maxBytesToWrite ??= 2147483647;
    if (maxBytesToWrite < 2) return 0;
    maxBytesToWrite -= 2;
    var startPtr = outPtr;
    var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
    for (var i2 = 0; i2 < numCharsToWrite; ++i2) {
      var codeUnit = str.charCodeAt(i2);
      LE_HEAP_STORE_I16((outPtr >> 1) * 2, codeUnit);
      outPtr += 2;
    }
    LE_HEAP_STORE_I16((outPtr >> 1) * 2, 0);
    return outPtr - startPtr;
  }, "stringToUTF16");
  LE_ATOMICS_NATIVE_BYTE_ORDER = new Int8Array(new Int16Array([1]).buffer)[0] === 1 ? [
    /* little endian */
    ((x) => x),
    ((x) => x),
    void 0,
    ((x) => x)
  ] : [
    /* big endian */
    ((x) => x),
    ((x) => ((x & 65280) << 8 | (x & 255) << 24) >> 16),
    void 0,
    ((x) => x >> 24 & 255 | x >> 8 & 65280 | (x & 65280) << 8 | (x & 255) << 24)
  ];
  function LE_HEAP_UPDATE() {
    HEAPU16.unsigned = ((x) => x & 65535);
    HEAPU32.unsigned = ((x) => x >>> 0);
  }
  __name(LE_HEAP_UPDATE, "LE_HEAP_UPDATE");
  {
    initMemory();
    if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
    if (Module["print"]) out = Module["print"];
    if (Module["printErr"]) err = Module["printErr"];
    if (Module["dynamicLibraries"]) dynamicLibraries = Module["dynamicLibraries"];
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].shift()();
      }
    }
  }
  Module["setValue"] = setValue;
  Module["getValue"] = getValue;
  Module["UTF8ToString"] = UTF8ToString;
  Module["stringToUTF8"] = stringToUTF8;
  Module["lengthBytesUTF8"] = lengthBytesUTF8;
  Module["AsciiToString"] = AsciiToString;
  Module["stringToUTF16"] = stringToUTF16;
  Module["loadWebAssemblyModule"] = loadWebAssemblyModule;
  Module["LE_HEAP_STORE_I64"] = LE_HEAP_STORE_I64;
  var ASM_CONSTS = {};
  var _malloc, _calloc, _realloc, _free, _ts_range_edit, _memcmp, _ts_language_symbol_count, _ts_language_state_count, _ts_language_abi_version, _ts_language_name, _ts_language_field_count, _ts_language_next_state, _ts_language_symbol_name, _ts_language_symbol_for_name, _strncmp, _ts_language_symbol_type, _ts_language_field_name_for_id, _ts_lookahead_iterator_new, _ts_lookahead_iterator_delete, _ts_lookahead_iterator_reset_state, _ts_lookahead_iterator_reset, _ts_lookahead_iterator_next, _ts_lookahead_iterator_current_symbol, _ts_point_edit, _ts_parser_delete, _ts_parser_reset, _ts_parser_set_language, _ts_parser_set_included_ranges, _ts_query_new, _ts_query_delete, _iswspace, _iswalnum, _ts_query_pattern_count, _ts_query_capture_count, _ts_query_string_count, _ts_query_capture_name_for_id, _ts_query_capture_quantifier_for_id, _ts_query_string_value_for_id, _ts_query_predicates_for_pattern, _ts_query_start_byte_for_pattern, _ts_query_end_byte_for_pattern, _ts_query_is_pattern_rooted, _ts_query_is_pattern_non_local, _ts_query_is_pattern_guaranteed_at_step, _ts_query_disable_capture, _ts_query_disable_pattern, _ts_tree_copy, _ts_tree_delete, _ts_init, _ts_parser_new_wasm, _ts_parser_enable_logger_wasm, _ts_parser_parse_wasm, _ts_parser_included_ranges_wasm, _ts_language_type_is_named_wasm, _ts_language_type_is_visible_wasm, _ts_language_metadata_wasm, _ts_language_supertypes_wasm, _ts_language_subtypes_wasm, _ts_tree_root_node_wasm, _ts_tree_root_node_with_offset_wasm, _ts_tree_edit_wasm, _ts_tree_included_ranges_wasm, _ts_tree_get_changed_ranges_wasm, _ts_tree_cursor_new_wasm, _ts_tree_cursor_copy_wasm, _ts_tree_cursor_delete_wasm, _ts_tree_cursor_reset_wasm, _ts_tree_cursor_reset_to_wasm, _ts_tree_cursor_goto_first_child_wasm, _ts_tree_cursor_goto_last_child_wasm, _ts_tree_cursor_goto_first_child_for_index_wasm, _ts_tree_cursor_goto_first_child_for_position_wasm, _ts_tree_cursor_goto_next_sibling_wasm, _ts_tree_cursor_goto_previous_sibling_wasm, _ts_tree_cursor_goto_descendant_wasm, _ts_tree_cursor_goto_parent_wasm, _ts_tree_cursor_current_node_type_id_wasm, _ts_tree_cursor_current_node_state_id_wasm, _ts_tree_cursor_current_node_is_named_wasm, _ts_tree_cursor_current_node_is_missing_wasm, _ts_tree_cursor_current_node_id_wasm, _ts_tree_cursor_start_position_wasm, _ts_tree_cursor_end_position_wasm, _ts_tree_cursor_start_index_wasm, _ts_tree_cursor_end_index_wasm, _ts_tree_cursor_current_field_id_wasm, _ts_tree_cursor_current_depth_wasm, _ts_tree_cursor_current_descendant_index_wasm, _ts_tree_cursor_current_node_wasm, _ts_node_symbol_wasm, _ts_node_field_name_for_child_wasm, _ts_node_field_name_for_named_child_wasm, _ts_node_children_by_field_id_wasm, _ts_node_first_child_for_byte_wasm, _ts_node_first_named_child_for_byte_wasm, _ts_node_grammar_symbol_wasm, _ts_node_child_count_wasm, _ts_node_named_child_count_wasm, _ts_node_child_wasm, _ts_node_named_child_wasm, _ts_node_child_by_field_id_wasm, _ts_node_next_sibling_wasm, _ts_node_prev_sibling_wasm, _ts_node_next_named_sibling_wasm, _ts_node_prev_named_sibling_wasm, _ts_node_descendant_count_wasm, _ts_node_parent_wasm, _ts_node_child_with_descendant_wasm, _ts_node_descendant_for_index_wasm, _ts_node_named_descendant_for_index_wasm, _ts_node_descendant_for_position_wasm, _ts_node_named_descendant_for_position_wasm, _ts_node_start_point_wasm, _ts_node_end_point_wasm, _ts_node_start_index_wasm, _ts_node_end_index_wasm, _ts_node_to_string_wasm, _ts_node_children_wasm, _ts_node_named_children_wasm, _ts_node_descendants_of_type_wasm, _ts_node_is_named_wasm, _ts_node_has_changes_wasm, _ts_node_has_error_wasm, _ts_node_is_error_wasm, _ts_node_is_missing_wasm, _ts_node_is_extra_wasm, _ts_node_parse_state_wasm, _ts_node_next_parse_state_wasm, _ts_query_matches_wasm, _ts_query_captures_wasm, _memset, _memcpy, _memmove, _iswalpha, _iswblank, _iswdigit, _iswlower, _iswupper, _iswxdigit, _memchr, _strlen, _strcmp, _strncat, _strncpy, _towlower, _towupper, _setThrew, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, ___wasm_apply_data_relocs;
  function assignWasmExports(wasmExports2) {
    Module["_malloc"] = _malloc = wasmExports2["malloc"];
    Module["_calloc"] = _calloc = wasmExports2["calloc"];
    Module["_realloc"] = _realloc = wasmExports2["realloc"];
    Module["_free"] = _free = wasmExports2["free"];
    Module["_ts_range_edit"] = _ts_range_edit = wasmExports2["ts_range_edit"];
    Module["_memcmp"] = _memcmp = wasmExports2["memcmp"];
    Module["_ts_language_symbol_count"] = _ts_language_symbol_count = wasmExports2["ts_language_symbol_count"];
    Module["_ts_language_state_count"] = _ts_language_state_count = wasmExports2["ts_language_state_count"];
    Module["_ts_language_abi_version"] = _ts_language_abi_version = wasmExports2["ts_language_abi_version"];
    Module["_ts_language_name"] = _ts_language_name = wasmExports2["ts_language_name"];
    Module["_ts_language_field_count"] = _ts_language_field_count = wasmExports2["ts_language_field_count"];
    Module["_ts_language_next_state"] = _ts_language_next_state = wasmExports2["ts_language_next_state"];
    Module["_ts_language_symbol_name"] = _ts_language_symbol_name = wasmExports2["ts_language_symbol_name"];
    Module["_ts_language_symbol_for_name"] = _ts_language_symbol_for_name = wasmExports2["ts_language_symbol_for_name"];
    Module["_strncmp"] = _strncmp = wasmExports2["strncmp"];
    Module["_ts_language_symbol_type"] = _ts_language_symbol_type = wasmExports2["ts_language_symbol_type"];
    Module["_ts_language_field_name_for_id"] = _ts_language_field_name_for_id = wasmExports2["ts_language_field_name_for_id"];
    Module["_ts_lookahead_iterator_new"] = _ts_lookahead_iterator_new = wasmExports2["ts_lookahead_iterator_new"];
    Module["_ts_lookahead_iterator_delete"] = _ts_lookahead_iterator_delete = wasmExports2["ts_lookahead_iterator_delete"];
    Module["_ts_lookahead_iterator_reset_state"] = _ts_lookahead_iterator_reset_state = wasmExports2["ts_lookahead_iterator_reset_state"];
    Module["_ts_lookahead_iterator_reset"] = _ts_lookahead_iterator_reset = wasmExports2["ts_lookahead_iterator_reset"];
    Module["_ts_lookahead_iterator_next"] = _ts_lookahead_iterator_next = wasmExports2["ts_lookahead_iterator_next"];
    Module["_ts_lookahead_iterator_current_symbol"] = _ts_lookahead_iterator_current_symbol = wasmExports2["ts_lookahead_iterator_current_symbol"];
    Module["_ts_point_edit"] = _ts_point_edit = wasmExports2["ts_point_edit"];
    Module["_ts_parser_delete"] = _ts_parser_delete = wasmExports2["ts_parser_delete"];
    Module["_ts_parser_reset"] = _ts_parser_reset = wasmExports2["ts_parser_reset"];
    Module["_ts_parser_set_language"] = _ts_parser_set_language = wasmExports2["ts_parser_set_language"];
    Module["_ts_parser_set_included_ranges"] = _ts_parser_set_included_ranges = wasmExports2["ts_parser_set_included_ranges"];
    Module["_ts_query_new"] = _ts_query_new = wasmExports2["ts_query_new"];
    Module["_ts_query_delete"] = _ts_query_delete = wasmExports2["ts_query_delete"];
    Module["_iswspace"] = _iswspace = wasmExports2["iswspace"];
    Module["_iswalnum"] = _iswalnum = wasmExports2["iswalnum"];
    Module["_ts_query_pattern_count"] = _ts_query_pattern_count = wasmExports2["ts_query_pattern_count"];
    Module["_ts_query_capture_count"] = _ts_query_capture_count = wasmExports2["ts_query_capture_count"];
    Module["_ts_query_string_count"] = _ts_query_string_count = wasmExports2["ts_query_string_count"];
    Module["_ts_query_capture_name_for_id"] = _ts_query_capture_name_for_id = wasmExports2["ts_query_capture_name_for_id"];
    Module["_ts_query_capture_quantifier_for_id"] = _ts_query_capture_quantifier_for_id = wasmExports2["ts_query_capture_quantifier_for_id"];
    Module["_ts_query_string_value_for_id"] = _ts_query_string_value_for_id = wasmExports2["ts_query_string_value_for_id"];
    Module["_ts_query_predicates_for_pattern"] = _ts_query_predicates_for_pattern = wasmExports2["ts_query_predicates_for_pattern"];
    Module["_ts_query_start_byte_for_pattern"] = _ts_query_start_byte_for_pattern = wasmExports2["ts_query_start_byte_for_pattern"];
    Module["_ts_query_end_byte_for_pattern"] = _ts_query_end_byte_for_pattern = wasmExports2["ts_query_end_byte_for_pattern"];
    Module["_ts_query_is_pattern_rooted"] = _ts_query_is_pattern_rooted = wasmExports2["ts_query_is_pattern_rooted"];
    Module["_ts_query_is_pattern_non_local"] = _ts_query_is_pattern_non_local = wasmExports2["ts_query_is_pattern_non_local"];
    Module["_ts_query_is_pattern_guaranteed_at_step"] = _ts_query_is_pattern_guaranteed_at_step = wasmExports2["ts_query_is_pattern_guaranteed_at_step"];
    Module["_ts_query_disable_capture"] = _ts_query_disable_capture = wasmExports2["ts_query_disable_capture"];
    Module["_ts_query_disable_pattern"] = _ts_query_disable_pattern = wasmExports2["ts_query_disable_pattern"];
    Module["_ts_tree_copy"] = _ts_tree_copy = wasmExports2["ts_tree_copy"];
    Module["_ts_tree_delete"] = _ts_tree_delete = wasmExports2["ts_tree_delete"];
    Module["_ts_init"] = _ts_init = wasmExports2["ts_init"];
    Module["_ts_parser_new_wasm"] = _ts_parser_new_wasm = wasmExports2["ts_parser_new_wasm"];
    Module["_ts_parser_enable_logger_wasm"] = _ts_parser_enable_logger_wasm = wasmExports2["ts_parser_enable_logger_wasm"];
    Module["_ts_parser_parse_wasm"] = _ts_parser_parse_wasm = wasmExports2["ts_parser_parse_wasm"];
    Module["_ts_parser_included_ranges_wasm"] = _ts_parser_included_ranges_wasm = wasmExports2["ts_parser_included_ranges_wasm"];
    Module["_ts_language_type_is_named_wasm"] = _ts_language_type_is_named_wasm = wasmExports2["ts_language_type_is_named_wasm"];
    Module["_ts_language_type_is_visible_wasm"] = _ts_language_type_is_visible_wasm = wasmExports2["ts_language_type_is_visible_wasm"];
    Module["_ts_language_metadata_wasm"] = _ts_language_metadata_wasm = wasmExports2["ts_language_metadata_wasm"];
    Module["_ts_language_supertypes_wasm"] = _ts_language_supertypes_wasm = wasmExports2["ts_language_supertypes_wasm"];
    Module["_ts_language_subtypes_wasm"] = _ts_language_subtypes_wasm = wasmExports2["ts_language_subtypes_wasm"];
    Module["_ts_tree_root_node_wasm"] = _ts_tree_root_node_wasm = wasmExports2["ts_tree_root_node_wasm"];
    Module["_ts_tree_root_node_with_offset_wasm"] = _ts_tree_root_node_with_offset_wasm = wasmExports2["ts_tree_root_node_with_offset_wasm"];
    Module["_ts_tree_edit_wasm"] = _ts_tree_edit_wasm = wasmExports2["ts_tree_edit_wasm"];
    Module["_ts_tree_included_ranges_wasm"] = _ts_tree_included_ranges_wasm = wasmExports2["ts_tree_included_ranges_wasm"];
    Module["_ts_tree_get_changed_ranges_wasm"] = _ts_tree_get_changed_ranges_wasm = wasmExports2["ts_tree_get_changed_ranges_wasm"];
    Module["_ts_tree_cursor_new_wasm"] = _ts_tree_cursor_new_wasm = wasmExports2["ts_tree_cursor_new_wasm"];
    Module["_ts_tree_cursor_copy_wasm"] = _ts_tree_cursor_copy_wasm = wasmExports2["ts_tree_cursor_copy_wasm"];
    Module["_ts_tree_cursor_delete_wasm"] = _ts_tree_cursor_delete_wasm = wasmExports2["ts_tree_cursor_delete_wasm"];
    Module["_ts_tree_cursor_reset_wasm"] = _ts_tree_cursor_reset_wasm = wasmExports2["ts_tree_cursor_reset_wasm"];
    Module["_ts_tree_cursor_reset_to_wasm"] = _ts_tree_cursor_reset_to_wasm = wasmExports2["ts_tree_cursor_reset_to_wasm"];
    Module["_ts_tree_cursor_goto_first_child_wasm"] = _ts_tree_cursor_goto_first_child_wasm = wasmExports2["ts_tree_cursor_goto_first_child_wasm"];
    Module["_ts_tree_cursor_goto_last_child_wasm"] = _ts_tree_cursor_goto_last_child_wasm = wasmExports2["ts_tree_cursor_goto_last_child_wasm"];
    Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = _ts_tree_cursor_goto_first_child_for_index_wasm = wasmExports2["ts_tree_cursor_goto_first_child_for_index_wasm"];
    Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = _ts_tree_cursor_goto_first_child_for_position_wasm = wasmExports2["ts_tree_cursor_goto_first_child_for_position_wasm"];
    Module["_ts_tree_cursor_goto_next_sibling_wasm"] = _ts_tree_cursor_goto_next_sibling_wasm = wasmExports2["ts_tree_cursor_goto_next_sibling_wasm"];
    Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = _ts_tree_cursor_goto_previous_sibling_wasm = wasmExports2["ts_tree_cursor_goto_previous_sibling_wasm"];
    Module["_ts_tree_cursor_goto_descendant_wasm"] = _ts_tree_cursor_goto_descendant_wasm = wasmExports2["ts_tree_cursor_goto_descendant_wasm"];
    Module["_ts_tree_cursor_goto_parent_wasm"] = _ts_tree_cursor_goto_parent_wasm = wasmExports2["ts_tree_cursor_goto_parent_wasm"];
    Module["_ts_tree_cursor_current_node_type_id_wasm"] = _ts_tree_cursor_current_node_type_id_wasm = wasmExports2["ts_tree_cursor_current_node_type_id_wasm"];
    Module["_ts_tree_cursor_current_node_state_id_wasm"] = _ts_tree_cursor_current_node_state_id_wasm = wasmExports2["ts_tree_cursor_current_node_state_id_wasm"];
    Module["_ts_tree_cursor_current_node_is_named_wasm"] = _ts_tree_cursor_current_node_is_named_wasm = wasmExports2["ts_tree_cursor_current_node_is_named_wasm"];
    Module["_ts_tree_cursor_current_node_is_missing_wasm"] = _ts_tree_cursor_current_node_is_missing_wasm = wasmExports2["ts_tree_cursor_current_node_is_missing_wasm"];
    Module["_ts_tree_cursor_current_node_id_wasm"] = _ts_tree_cursor_current_node_id_wasm = wasmExports2["ts_tree_cursor_current_node_id_wasm"];
    Module["_ts_tree_cursor_start_position_wasm"] = _ts_tree_cursor_start_position_wasm = wasmExports2["ts_tree_cursor_start_position_wasm"];
    Module["_ts_tree_cursor_end_position_wasm"] = _ts_tree_cursor_end_position_wasm = wasmExports2["ts_tree_cursor_end_position_wasm"];
    Module["_ts_tree_cursor_start_index_wasm"] = _ts_tree_cursor_start_index_wasm = wasmExports2["ts_tree_cursor_start_index_wasm"];
    Module["_ts_tree_cursor_end_index_wasm"] = _ts_tree_cursor_end_index_wasm = wasmExports2["ts_tree_cursor_end_index_wasm"];
    Module["_ts_tree_cursor_current_field_id_wasm"] = _ts_tree_cursor_current_field_id_wasm = wasmExports2["ts_tree_cursor_current_field_id_wasm"];
    Module["_ts_tree_cursor_current_depth_wasm"] = _ts_tree_cursor_current_depth_wasm = wasmExports2["ts_tree_cursor_current_depth_wasm"];
    Module["_ts_tree_cursor_current_descendant_index_wasm"] = _ts_tree_cursor_current_descendant_index_wasm = wasmExports2["ts_tree_cursor_current_descendant_index_wasm"];
    Module["_ts_tree_cursor_current_node_wasm"] = _ts_tree_cursor_current_node_wasm = wasmExports2["ts_tree_cursor_current_node_wasm"];
    Module["_ts_node_symbol_wasm"] = _ts_node_symbol_wasm = wasmExports2["ts_node_symbol_wasm"];
    Module["_ts_node_field_name_for_child_wasm"] = _ts_node_field_name_for_child_wasm = wasmExports2["ts_node_field_name_for_child_wasm"];
    Module["_ts_node_field_name_for_named_child_wasm"] = _ts_node_field_name_for_named_child_wasm = wasmExports2["ts_node_field_name_for_named_child_wasm"];
    Module["_ts_node_children_by_field_id_wasm"] = _ts_node_children_by_field_id_wasm = wasmExports2["ts_node_children_by_field_id_wasm"];
    Module["_ts_node_first_child_for_byte_wasm"] = _ts_node_first_child_for_byte_wasm = wasmExports2["ts_node_first_child_for_byte_wasm"];
    Module["_ts_node_first_named_child_for_byte_wasm"] = _ts_node_first_named_child_for_byte_wasm = wasmExports2["ts_node_first_named_child_for_byte_wasm"];
    Module["_ts_node_grammar_symbol_wasm"] = _ts_node_grammar_symbol_wasm = wasmExports2["ts_node_grammar_symbol_wasm"];
    Module["_ts_node_child_count_wasm"] = _ts_node_child_count_wasm = wasmExports2["ts_node_child_count_wasm"];
    Module["_ts_node_named_child_count_wasm"] = _ts_node_named_child_count_wasm = wasmExports2["ts_node_named_child_count_wasm"];
    Module["_ts_node_child_wasm"] = _ts_node_child_wasm = wasmExports2["ts_node_child_wasm"];
    Module["_ts_node_named_child_wasm"] = _ts_node_named_child_wasm = wasmExports2["ts_node_named_child_wasm"];
    Module["_ts_node_child_by_field_id_wasm"] = _ts_node_child_by_field_id_wasm = wasmExports2["ts_node_child_by_field_id_wasm"];
    Module["_ts_node_next_sibling_wasm"] = _ts_node_next_sibling_wasm = wasmExports2["ts_node_next_sibling_wasm"];
    Module["_ts_node_prev_sibling_wasm"] = _ts_node_prev_sibling_wasm = wasmExports2["ts_node_prev_sibling_wasm"];
    Module["_ts_node_next_named_sibling_wasm"] = _ts_node_next_named_sibling_wasm = wasmExports2["ts_node_next_named_sibling_wasm"];
    Module["_ts_node_prev_named_sibling_wasm"] = _ts_node_prev_named_sibling_wasm = wasmExports2["ts_node_prev_named_sibling_wasm"];
    Module["_ts_node_descendant_count_wasm"] = _ts_node_descendant_count_wasm = wasmExports2["ts_node_descendant_count_wasm"];
    Module["_ts_node_parent_wasm"] = _ts_node_parent_wasm = wasmExports2["ts_node_parent_wasm"];
    Module["_ts_node_child_with_descendant_wasm"] = _ts_node_child_with_descendant_wasm = wasmExports2["ts_node_child_with_descendant_wasm"];
    Module["_ts_node_descendant_for_index_wasm"] = _ts_node_descendant_for_index_wasm = wasmExports2["ts_node_descendant_for_index_wasm"];
    Module["_ts_node_named_descendant_for_index_wasm"] = _ts_node_named_descendant_for_index_wasm = wasmExports2["ts_node_named_descendant_for_index_wasm"];
    Module["_ts_node_descendant_for_position_wasm"] = _ts_node_descendant_for_position_wasm = wasmExports2["ts_node_descendant_for_position_wasm"];
    Module["_ts_node_named_descendant_for_position_wasm"] = _ts_node_named_descendant_for_position_wasm = wasmExports2["ts_node_named_descendant_for_position_wasm"];
    Module["_ts_node_start_point_wasm"] = _ts_node_start_point_wasm = wasmExports2["ts_node_start_point_wasm"];
    Module["_ts_node_end_point_wasm"] = _ts_node_end_point_wasm = wasmExports2["ts_node_end_point_wasm"];
    Module["_ts_node_start_index_wasm"] = _ts_node_start_index_wasm = wasmExports2["ts_node_start_index_wasm"];
    Module["_ts_node_end_index_wasm"] = _ts_node_end_index_wasm = wasmExports2["ts_node_end_index_wasm"];
    Module["_ts_node_to_string_wasm"] = _ts_node_to_string_wasm = wasmExports2["ts_node_to_string_wasm"];
    Module["_ts_node_children_wasm"] = _ts_node_children_wasm = wasmExports2["ts_node_children_wasm"];
    Module["_ts_node_named_children_wasm"] = _ts_node_named_children_wasm = wasmExports2["ts_node_named_children_wasm"];
    Module["_ts_node_descendants_of_type_wasm"] = _ts_node_descendants_of_type_wasm = wasmExports2["ts_node_descendants_of_type_wasm"];
    Module["_ts_node_is_named_wasm"] = _ts_node_is_named_wasm = wasmExports2["ts_node_is_named_wasm"];
    Module["_ts_node_has_changes_wasm"] = _ts_node_has_changes_wasm = wasmExports2["ts_node_has_changes_wasm"];
    Module["_ts_node_has_error_wasm"] = _ts_node_has_error_wasm = wasmExports2["ts_node_has_error_wasm"];
    Module["_ts_node_is_error_wasm"] = _ts_node_is_error_wasm = wasmExports2["ts_node_is_error_wasm"];
    Module["_ts_node_is_missing_wasm"] = _ts_node_is_missing_wasm = wasmExports2["ts_node_is_missing_wasm"];
    Module["_ts_node_is_extra_wasm"] = _ts_node_is_extra_wasm = wasmExports2["ts_node_is_extra_wasm"];
    Module["_ts_node_parse_state_wasm"] = _ts_node_parse_state_wasm = wasmExports2["ts_node_parse_state_wasm"];
    Module["_ts_node_next_parse_state_wasm"] = _ts_node_next_parse_state_wasm = wasmExports2["ts_node_next_parse_state_wasm"];
    Module["_ts_query_matches_wasm"] = _ts_query_matches_wasm = wasmExports2["ts_query_matches_wasm"];
    Module["_ts_query_captures_wasm"] = _ts_query_captures_wasm = wasmExports2["ts_query_captures_wasm"];
    Module["_memset"] = _memset = wasmExports2["memset"];
    Module["_memcpy"] = _memcpy = wasmExports2["memcpy"];
    Module["_memmove"] = _memmove = wasmExports2["memmove"];
    Module["_iswalpha"] = _iswalpha = wasmExports2["iswalpha"];
    Module["_iswblank"] = _iswblank = wasmExports2["iswblank"];
    Module["_iswdigit"] = _iswdigit = wasmExports2["iswdigit"];
    Module["_iswlower"] = _iswlower = wasmExports2["iswlower"];
    Module["_iswupper"] = _iswupper = wasmExports2["iswupper"];
    Module["_iswxdigit"] = _iswxdigit = wasmExports2["iswxdigit"];
    Module["_memchr"] = _memchr = wasmExports2["memchr"];
    Module["_strlen"] = _strlen = wasmExports2["strlen"];
    Module["_strcmp"] = _strcmp = wasmExports2["strcmp"];
    Module["_strncat"] = _strncat = wasmExports2["strncat"];
    Module["_strncpy"] = _strncpy = wasmExports2["strncpy"];
    Module["_towlower"] = _towlower = wasmExports2["towlower"];
    Module["_towupper"] = _towupper = wasmExports2["towupper"];
    _setThrew = wasmExports2["setThrew"];
    __emscripten_stack_restore = wasmExports2["_emscripten_stack_restore"];
    __emscripten_stack_alloc = wasmExports2["_emscripten_stack_alloc"];
    _emscripten_stack_get_current = wasmExports2["emscripten_stack_get_current"];
    ___wasm_apply_data_relocs = wasmExports2["__wasm_apply_data_relocs"];
  }
  __name(assignWasmExports, "assignWasmExports");
  var wasmImports = {
    /** @export */
    __heap_base: ___heap_base,
    /** @export */
    __indirect_function_table: wasmTable,
    /** @export */
    __memory_base: ___memory_base,
    /** @export */
    __stack_high: ___stack_high,
    /** @export */
    __stack_low: ___stack_low,
    /** @export */
    __stack_pointer: ___stack_pointer,
    /** @export */
    __table_base: ___table_base,
    /** @export */
    _abort_js: __abort_js,
    /** @export */
    emscripten_resize_heap: _emscripten_resize_heap,
    /** @export */
    fd_close: _fd_close,
    /** @export */
    fd_seek: _fd_seek,
    /** @export */
    fd_write: _fd_write,
    /** @export */
    memory: wasmMemory,
    /** @export */
    tree_sitter_log_callback: _tree_sitter_log_callback,
    /** @export */
    tree_sitter_parse_callback: _tree_sitter_parse_callback,
    /** @export */
    tree_sitter_progress_callback: _tree_sitter_progress_callback,
    /** @export */
    tree_sitter_query_progress_callback: _tree_sitter_query_progress_callback
  };
  function callMain(args2 = []) {
    var entryFunction = resolveGlobalSymbol("main").sym;
    if (!entryFunction) return;
    args2.unshift(thisProgram);
    var argc = args2.length;
    var argv = stackAlloc((argc + 1) * 4);
    var argv_ptr = argv;
    args2.forEach((arg) => {
      LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, stringToUTF8OnStack(arg));
      argv_ptr += 4;
    });
    LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, 0);
    try {
      var ret = entryFunction(argc, argv);
      exitJS(
        ret,
        /* implicit = */
        true
      );
      return ret;
    } catch (e) {
      return handleException(e);
    }
  }
  __name(callMain, "callMain");
  function run(args2 = arguments_) {
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    preRun();
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    function doRun() {
      Module["calledRun"] = true;
      if (ABORT) return;
      initRuntime();
      preMain();
      readyPromiseResolve?.(Module);
      Module["onRuntimeInitialized"]?.();
      var noInitialRun = Module["noInitialRun"] || false;
      if (!noInitialRun) callMain(args2);
      postRun();
    }
    __name(doRun, "doRun");
    if (Module["setStatus"]) {
      Module["setStatus"]("Running...");
      setTimeout(() => {
        setTimeout(() => Module["setStatus"](""), 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
  }
  __name(run, "run");
  var wasmExports;
  wasmExports = await createWasm();
  run();
  if (runtimeInitialized) {
    moduleRtn = Module;
  } else {
    moduleRtn = new Promise((resolve3, reject) => {
      readyPromiseResolve = resolve3;
      readyPromiseReject = reject;
    });
  }
  return moduleRtn;
}
__name(Module2, "Module");
var web_tree_sitter_default = Module2;
var Module3 = null;
async function initializeBinding(moduleOptions) {
  return Module3 ??= await web_tree_sitter_default(moduleOptions);
}
__name(initializeBinding, "initializeBinding");
function checkModule() {
  return !!Module3;
}
__name(checkModule, "checkModule");
var TRANSFER_BUFFER;
var LANGUAGE_VERSION;
var MIN_COMPATIBLE_VERSION;
var Parser = class {
  static {
    __name(this, "Parser");
  }
  /** @internal */
  [0] = 0;
  // Internal handle for Wasm
  /** @internal */
  [1] = 0;
  // Internal handle for Wasm
  /** @internal */
  logCallback = null;
  /** The parser's current language. */
  language = null;
  /**
   * This must always be called before creating a Parser.
   *
   * You can optionally pass in options to configure the Wasm module, the most common
   * one being `locateFile` to help the module find the `.wasm` file.
   */
  static async init(moduleOptions) {
    setModule(await initializeBinding(moduleOptions));
    TRANSFER_BUFFER = C._ts_init();
    LANGUAGE_VERSION = C.getValue(TRANSFER_BUFFER, "i32");
    MIN_COMPATIBLE_VERSION = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
  }
  /**
   * Create a new parser.
   */
  constructor() {
    this.initialize();
  }
  /** @internal */
  initialize() {
    if (!checkModule()) {
      throw new Error("cannot construct a Parser before calling `init()`");
    }
    C._ts_parser_new_wasm();
    this[0] = C.getValue(TRANSFER_BUFFER, "i32");
    this[1] = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
  }
  /** Delete the parser, freeing its resources. */
  delete() {
    C._ts_parser_delete(this[0]);
    C._free(this[1]);
    this[0] = 0;
    this[1] = 0;
  }
  /**
   * Set the language that the parser should use for parsing.
   *
   * If the language was not successfully assigned, an error will be thrown.
   * This happens if the language was generated with an incompatible
   * version of the Tree-sitter CLI. Check the language's version using
   * {@link Language#version} and compare it to this library's
   * {@link LANGUAGE_VERSION} and {@link MIN_COMPATIBLE_VERSION} constants.
   */
  setLanguage(language) {
    let address;
    if (!language) {
      address = 0;
      this.language = null;
    } else if (language.constructor === Language) {
      address = language[0];
      const version = C._ts_language_abi_version(address);
      if (version < MIN_COMPATIBLE_VERSION || LANGUAGE_VERSION < version) {
        throw new Error(
          `Incompatible language version ${version}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${LANGUAGE_VERSION}.`
        );
      }
      this.language = language;
    } else {
      throw new Error("Argument must be a Language");
    }
    C._ts_parser_set_language(this[0], address);
    return this;
  }
  /**
   * Parse a slice of UTF8 text.
   *
   * @param {string | ParseCallback} callback - The UTF8-encoded text to parse or a callback function.
   *
   * @param {Tree | null} [oldTree] - A previous syntax tree parsed from the same document. If the text of the
   *   document has changed since `oldTree` was created, then you must edit `oldTree` to match
   *   the new text using {@link Tree#edit}.
   *
   * @param {ParseOptions} [options] - Options for parsing the text.
   *  This can be used to set the included ranges, or a progress callback.
   *
   * @returns {Tree | null} A {@link Tree} if parsing succeeded, or `null` if:
   *  - The parser has not yet had a language assigned with {@link Parser#setLanguage}.
   *  - The progress callback returned true.
   */
  parse(callback, oldTree, options) {
    if (typeof callback === "string") {
      C.currentParseCallback = (index) => callback.slice(index);
    } else if (typeof callback === "function") {
      C.currentParseCallback = callback;
    } else {
      throw new Error("Argument must be a string or a function");
    }
    if (options?.progressCallback) {
      C.currentProgressCallback = options.progressCallback;
    } else {
      C.currentProgressCallback = null;
    }
    if (this.logCallback) {
      C.currentLogCallback = this.logCallback;
      C._ts_parser_enable_logger_wasm(this[0], 1);
    } else {
      C.currentLogCallback = null;
      C._ts_parser_enable_logger_wasm(this[0], 0);
    }
    let rangeCount = 0;
    let rangeAddress = 0;
    if (options?.includedRanges) {
      rangeCount = options.includedRanges.length;
      rangeAddress = C._calloc(rangeCount, SIZE_OF_RANGE);
      let address = rangeAddress;
      for (let i2 = 0; i2 < rangeCount; i2++) {
        marshalRange(address, options.includedRanges[i2]);
        address += SIZE_OF_RANGE;
      }
    }
    const treeAddress = C._ts_parser_parse_wasm(
      this[0],
      this[1],
      oldTree ? oldTree[0] : 0,
      rangeAddress,
      rangeCount
    );
    if (!treeAddress) {
      C.currentParseCallback = null;
      C.currentLogCallback = null;
      C.currentProgressCallback = null;
      return null;
    }
    if (!this.language) {
      throw new Error("Parser must have a language to parse");
    }
    const result = new Tree(INTERNAL, treeAddress, this.language, C.currentParseCallback);
    C.currentParseCallback = null;
    C.currentLogCallback = null;
    C.currentProgressCallback = null;
    return result;
  }
  /**
   * Instruct the parser to start the next parse from the beginning.
   *
   * If the parser previously failed because of a callback, 
   * then by default, it will resume where it left off on the
   * next call to {@link Parser#parse} or other parsing functions.
   * If you don't want to resume, and instead intend to use this parser to
   * parse some other document, you must call `reset` first.
   */
  reset() {
    C._ts_parser_reset(this[0]);
  }
  /** Get the ranges of text that the parser will include when parsing. */
  getIncludedRanges() {
    C._ts_parser_included_ranges_wasm(this[0]);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0; i2 < count; i2++) {
        result[i2] = unmarshalRange(address);
        address += SIZE_OF_RANGE;
      }
      C._free(buffer);
    }
    return result;
  }
  /** Set the logging callback that a parser should use during parsing. */
  setLogger(callback) {
    if (!callback) {
      this.logCallback = null;
    } else if (typeof callback !== "function") {
      throw new Error("Logger callback must be a function");
    } else {
      this.logCallback = callback;
    }
    return this;
  }
  /** Get the parser's current logger. */
  getLogger() {
    return this.logCallback;
  }
};
var PREDICATE_STEP_TYPE_CAPTURE = 1;
var PREDICATE_STEP_TYPE_STRING = 2;
var QUERY_WORD_REGEX = /[\w-]+/g;
var CaptureQuantifier = {
  Zero: 0,
  ZeroOrOne: 1,
  ZeroOrMore: 2,
  One: 3,
  OneOrMore: 4
};
var isCaptureStep = /* @__PURE__ */ __name((step) => step.type === "capture", "isCaptureStep");
var isStringStep = /* @__PURE__ */ __name((step) => step.type === "string", "isStringStep");
var QueryErrorKind = {
  Syntax: 1,
  NodeName: 2,
  FieldName: 3,
  CaptureName: 4,
  PatternStructure: 5
};
var QueryError = class _QueryError extends Error {
  constructor(kind, info2, index, length) {
    super(_QueryError.formatMessage(kind, info2));
    this.kind = kind;
    this.info = info2;
    this.index = index;
    this.length = length;
    this.name = "QueryError";
  }
  static {
    __name(this, "QueryError");
  }
  /** Formats an error message based on the error kind and info */
  static formatMessage(kind, info2) {
    switch (kind) {
      case QueryErrorKind.NodeName:
        return `Bad node name '${info2.word}'`;
      case QueryErrorKind.FieldName:
        return `Bad field name '${info2.word}'`;
      case QueryErrorKind.CaptureName:
        return `Bad capture name @${info2.word}`;
      case QueryErrorKind.PatternStructure:
        return `Bad pattern structure at offset ${info2.suffix}`;
      case QueryErrorKind.Syntax:
        return `Bad syntax at offset ${info2.suffix}`;
    }
  }
};
function parseAnyPredicate(steps, index, operator, textPredicates) {
  if (steps.length !== 3) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}`
    );
  }
  if (!isCaptureStep(steps[1])) {
    throw new Error(
      `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}"`
    );
  }
  const isPositive = operator === "eq?" || operator === "any-eq?";
  const matchAll = !operator.startsWith("any-");
  if (isCaptureStep(steps[2])) {
    const captureName1 = steps[1].name;
    const captureName2 = steps[2].name;
    textPredicates[index].push((captures) => {
      const nodes1 = [];
      const nodes2 = [];
      for (const c of captures) {
        if (c.name === captureName1) nodes1.push(c.node);
        if (c.name === captureName2) nodes2.push(c.node);
      }
      const compare = /* @__PURE__ */ __name((n1, n2, positive) => {
        return positive ? n1.text === n2.text : n1.text !== n2.text;
      }, "compare");
      return matchAll ? nodes1.every((n1) => nodes2.some((n2) => compare(n1, n2, isPositive))) : nodes1.some((n1) => nodes2.some((n2) => compare(n1, n2, isPositive)));
    });
  } else {
    const captureName = steps[1].name;
    const stringValue = steps[2].value;
    const matches = /* @__PURE__ */ __name((n) => n.text === stringValue, "matches");
    const doesNotMatch = /* @__PURE__ */ __name((n) => n.text !== stringValue, "doesNotMatch");
    textPredicates[index].push((captures) => {
      const nodes = [];
      for (const c of captures) {
        if (c.name === captureName) nodes.push(c.node);
      }
      const test = isPositive ? matches : doesNotMatch;
      return matchAll ? nodes.every(test) : nodes.some(test);
    });
  }
}
__name(parseAnyPredicate, "parseAnyPredicate");
function parseMatchPredicate(steps, index, operator, textPredicates) {
  if (steps.length !== 3) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}.`
    );
  }
  if (steps[1].type !== "capture") {
    throw new Error(
      `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
    );
  }
  if (steps[2].type !== "string") {
    throw new Error(
      `Second argument of \`#${operator}\` predicate must be a string. Got @${steps[2].name}.`
    );
  }
  const isPositive = operator === "match?" || operator === "any-match?";
  const matchAll = !operator.startsWith("any-");
  const captureName = steps[1].name;
  const regex = new RegExp(steps[2].value);
  textPredicates[index].push((captures) => {
    const nodes = [];
    for (const c of captures) {
      if (c.name === captureName) nodes.push(c.node.text);
    }
    const test = /* @__PURE__ */ __name((text, positive) => {
      return positive ? regex.test(text) : !regex.test(text);
    }, "test");
    if (nodes.length === 0) return !isPositive;
    return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
  });
}
__name(parseMatchPredicate, "parseMatchPredicate");
function parseAnyOfPredicate(steps, index, operator, textPredicates) {
  if (steps.length < 2) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${steps.length - 1}.`
    );
  }
  if (steps[1].type !== "capture") {
    throw new Error(
      `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
    );
  }
  const isPositive = operator === "any-of?";
  const captureName = steps[1].name;
  const stringSteps = steps.slice(2);
  if (!stringSteps.every(isStringStep)) {
    throw new Error(
      `Arguments to \`#${operator}\` predicate must be strings.".`
    );
  }
  const values = stringSteps.map((s) => s.value);
  textPredicates[index].push((captures) => {
    const nodes = [];
    for (const c of captures) {
      if (c.name === captureName) nodes.push(c.node.text);
    }
    if (nodes.length === 0) return !isPositive;
    return nodes.every((text) => values.includes(text)) === isPositive;
  });
}
__name(parseAnyOfPredicate, "parseAnyOfPredicate");
function parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties) {
  if (steps.length < 2 || steps.length > 3) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`
    );
  }
  if (!steps.every(isStringStep)) {
    throw new Error(
      `Arguments to \`#${operator}\` predicate must be strings.".`
    );
  }
  const properties = operator === "is?" ? assertedProperties : refutedProperties;
  if (!properties[index]) properties[index] = {};
  properties[index][steps[1].value] = steps[2]?.value ?? null;
}
__name(parseIsPredicate, "parseIsPredicate");
function parseSetDirective(steps, index, setProperties) {
  if (steps.length < 2 || steps.length > 3) {
    throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
  }
  if (!steps.every(isStringStep)) {
    throw new Error(`Arguments to \`#set!\` predicate must be strings.".`);
  }
  if (!setProperties[index]) setProperties[index] = {};
  setProperties[index][steps[1].value] = steps[2]?.value ?? null;
}
__name(parseSetDirective, "parseSetDirective");
function parsePattern(index, stepType, stepValueId, captureNames, stringValues, steps, textPredicates, predicates, setProperties, assertedProperties, refutedProperties) {
  if (stepType === PREDICATE_STEP_TYPE_CAPTURE) {
    const name2 = captureNames[stepValueId];
    steps.push({ type: "capture", name: name2 });
  } else if (stepType === PREDICATE_STEP_TYPE_STRING) {
    steps.push({ type: "string", value: stringValues[stepValueId] });
  } else if (steps.length > 0) {
    if (steps[0].type !== "string") {
      throw new Error("Predicates must begin with a literal value");
    }
    const operator = steps[0].value;
    switch (operator) {
      case "any-not-eq?":
      case "not-eq?":
      case "any-eq?":
      case "eq?":
        parseAnyPredicate(steps, index, operator, textPredicates);
        break;
      case "any-not-match?":
      case "not-match?":
      case "any-match?":
      case "match?":
        parseMatchPredicate(steps, index, operator, textPredicates);
        break;
      case "not-any-of?":
      case "any-of?":
        parseAnyOfPredicate(steps, index, operator, textPredicates);
        break;
      case "is?":
      case "is-not?":
        parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties);
        break;
      case "set!":
        parseSetDirective(steps, index, setProperties);
        break;
      default:
        predicates[index].push({ operator, operands: steps.slice(1) });
    }
    steps.length = 0;
  }
}
__name(parsePattern, "parsePattern");
var Query = class {
  static {
    __name(this, "Query");
  }
  /** @internal */
  [0] = 0;
  // Internal handle for Wasm
  /** @internal */
  exceededMatchLimit;
  /** @internal */
  textPredicates;
  /** The names of the captures used in the query. */
  captureNames;
  /** The quantifiers of the captures used in the query. */
  captureQuantifiers;
  /**
   * The other user-defined predicates associated with the given index.
   *
   * This includes predicates with operators other than:
   * - `match?`
   * - `eq?` and `not-eq?`
   * - `any-of?` and `not-any-of?`
   * - `is?` and `is-not?`
   * - `set!`
   */
  predicates;
  /** The properties for predicates with the operator `set!`. */
  setProperties;
  /** The properties for predicates with the operator `is?`. */
  assertedProperties;
  /** The properties for predicates with the operator `is-not?`. */
  refutedProperties;
  /** The maximum number of in-progress matches for this cursor. */
  matchLimit;
  /**
   * Create a new query from a string containing one or more S-expression
   * patterns.
   *
   * The query is associated with a particular language, and can only be run
   * on syntax nodes parsed with that language. References to Queries can be
   * shared between multiple threads.
   *
   * @link {@see https://tree-sitter.github.io/tree-sitter/using-parsers/queries}
   */
  constructor(language, source) {
    const sourceLength = C.lengthBytesUTF8(source);
    const sourceAddress = C._malloc(sourceLength + 1);
    C.stringToUTF8(source, sourceAddress, sourceLength + 1);
    const address = C._ts_query_new(
      language[0],
      sourceAddress,
      sourceLength,
      TRANSFER_BUFFER,
      TRANSFER_BUFFER + SIZE_OF_INT
    );
    if (!address) {
      const errorId = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const errorByte = C.getValue(TRANSFER_BUFFER, "i32");
      const errorIndex = C.UTF8ToString(sourceAddress, errorByte).length;
      const suffix = source.slice(errorIndex, errorIndex + 100).split("\n")[0];
      const word = suffix.match(QUERY_WORD_REGEX)?.[0] ?? "";
      C._free(sourceAddress);
      switch (errorId) {
        case QueryErrorKind.Syntax:
          throw new QueryError(QueryErrorKind.Syntax, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
        case QueryErrorKind.NodeName:
          throw new QueryError(errorId, { word }, errorIndex, word.length);
        case QueryErrorKind.FieldName:
          throw new QueryError(errorId, { word }, errorIndex, word.length);
        case QueryErrorKind.CaptureName:
          throw new QueryError(errorId, { word }, errorIndex, word.length);
        case QueryErrorKind.PatternStructure:
          throw new QueryError(errorId, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
      }
    }
    const stringCount = C._ts_query_string_count(address);
    const captureCount = C._ts_query_capture_count(address);
    const patternCount = C._ts_query_pattern_count(address);
    const captureNames = new Array(captureCount);
    const captureQuantifiers = new Array(patternCount);
    const stringValues = new Array(stringCount);
    for (let i2 = 0; i2 < captureCount; i2++) {
      const nameAddress = C._ts_query_capture_name_for_id(
        address,
        i2,
        TRANSFER_BUFFER
      );
      const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
      captureNames[i2] = C.UTF8ToString(nameAddress, nameLength);
    }
    for (let i2 = 0; i2 < patternCount; i2++) {
      const captureQuantifiersArray = new Array(captureCount);
      for (let j = 0; j < captureCount; j++) {
        const quantifier = C._ts_query_capture_quantifier_for_id(address, i2, j);
        captureQuantifiersArray[j] = quantifier;
      }
      captureQuantifiers[i2] = captureQuantifiersArray;
    }
    for (let i2 = 0; i2 < stringCount; i2++) {
      const valueAddress = C._ts_query_string_value_for_id(
        address,
        i2,
        TRANSFER_BUFFER
      );
      const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
      stringValues[i2] = C.UTF8ToString(valueAddress, nameLength);
    }
    const setProperties = new Array(patternCount);
    const assertedProperties = new Array(patternCount);
    const refutedProperties = new Array(patternCount);
    const predicates = new Array(patternCount);
    const textPredicates = new Array(patternCount);
    for (let i2 = 0; i2 < patternCount; i2++) {
      const predicatesAddress = C._ts_query_predicates_for_pattern(address, i2, TRANSFER_BUFFER);
      const stepCount = C.getValue(TRANSFER_BUFFER, "i32");
      predicates[i2] = [];
      textPredicates[i2] = [];
      const steps = new Array();
      let stepAddress = predicatesAddress;
      for (let j = 0; j < stepCount; j++) {
        const stepType = C.getValue(stepAddress, "i32");
        stepAddress += SIZE_OF_INT;
        const stepValueId = C.getValue(stepAddress, "i32");
        stepAddress += SIZE_OF_INT;
        parsePattern(
          i2,
          stepType,
          stepValueId,
          captureNames,
          stringValues,
          steps,
          textPredicates,
          predicates,
          setProperties,
          assertedProperties,
          refutedProperties
        );
      }
      Object.freeze(textPredicates[i2]);
      Object.freeze(predicates[i2]);
      Object.freeze(setProperties[i2]);
      Object.freeze(assertedProperties[i2]);
      Object.freeze(refutedProperties[i2]);
    }
    C._free(sourceAddress);
    this[0] = address;
    this.captureNames = captureNames;
    this.captureQuantifiers = captureQuantifiers;
    this.textPredicates = textPredicates;
    this.predicates = predicates;
    this.setProperties = setProperties;
    this.assertedProperties = assertedProperties;
    this.refutedProperties = refutedProperties;
    this.exceededMatchLimit = false;
  }
  /** Delete the query, freeing its resources. */
  delete() {
    C._ts_query_delete(this[0]);
    this[0] = 0;
  }
  /**
   * Iterate over all of the matches in the order that they were found.
   *
   * Each match contains the index of the pattern that matched, and a list of
   * captures. Because multiple patterns can match the same set of nodes,
   * one match may contain captures that appear *before* some of the
   * captures from a previous match.
   *
   * @param {Node} node - The node to execute the query on.
   *
   * @param {QueryOptions} options - Options for query execution.
   */
  matches(node, options = {}) {
    const startPosition = options.startPosition ?? ZERO_POINT;
    const endPosition = options.endPosition ?? ZERO_POINT;
    const startIndex = options.startIndex ?? 0;
    const endIndex = options.endIndex ?? 0;
    const startContainingPosition = options.startContainingPosition ?? ZERO_POINT;
    const endContainingPosition = options.endContainingPosition ?? ZERO_POINT;
    const startContainingIndex = options.startContainingIndex ?? 0;
    const endContainingIndex = options.endContainingIndex ?? 0;
    const matchLimit = options.matchLimit ?? 4294967295;
    const maxStartDepth = options.maxStartDepth ?? 4294967295;
    const progressCallback = options.progressCallback;
    if (typeof matchLimit !== "number") {
      throw new Error("Arguments must be numbers");
    }
    this.matchLimit = matchLimit;
    if (endIndex !== 0 && startIndex > endIndex) {
      throw new Error("`startIndex` cannot be greater than `endIndex`");
    }
    if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
      throw new Error("`startPosition` cannot be greater than `endPosition`");
    }
    if (endContainingIndex !== 0 && startContainingIndex > endContainingIndex) {
      throw new Error("`startContainingIndex` cannot be greater than `endContainingIndex`");
    }
    if (endContainingPosition !== ZERO_POINT && (startContainingPosition.row > endContainingPosition.row || startContainingPosition.row === endContainingPosition.row && startContainingPosition.column > endContainingPosition.column)) {
      throw new Error("`startContainingPosition` cannot be greater than `endContainingPosition`");
    }
    if (progressCallback) {
      C.currentQueryProgressCallback = progressCallback;
    }
    marshalNode(node);
    C._ts_query_matches_wasm(
      this[0],
      node.tree[0],
      startPosition.row,
      startPosition.column,
      endPosition.row,
      endPosition.column,
      startIndex,
      endIndex,
      startContainingPosition.row,
      startContainingPosition.column,
      endContainingPosition.row,
      endContainingPosition.column,
      startContainingIndex,
      endContainingIndex,
      matchLimit,
      maxStartDepth
    );
    const rawCount = C.getValue(TRANSFER_BUFFER, "i32");
    const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
    const result = new Array(rawCount);
    this.exceededMatchLimit = Boolean(didExceedMatchLimit);
    let filteredCount = 0;
    let address = startAddress;
    for (let i2 = 0; i2 < rawCount; i2++) {
      const patternIndex = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const captureCount = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const captures = new Array(captureCount);
      address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
      if (this.textPredicates[patternIndex].every((p) => p(captures))) {
        result[filteredCount] = { patternIndex, captures };
        const setProperties = this.setProperties[patternIndex];
        result[filteredCount].setProperties = setProperties;
        const assertedProperties = this.assertedProperties[patternIndex];
        result[filteredCount].assertedProperties = assertedProperties;
        const refutedProperties = this.refutedProperties[patternIndex];
        result[filteredCount].refutedProperties = refutedProperties;
        filteredCount++;
      }
    }
    result.length = filteredCount;
    C._free(startAddress);
    C.currentQueryProgressCallback = null;
    return result;
  }
  /**
   * Iterate over all of the individual captures in the order that they
   * appear.
   *
   * This is useful if you don't care about which pattern matched, and just
   * want a single, ordered sequence of captures.
   *
   * @param {Node} node - The node to execute the query on.
   *
   * @param {QueryOptions} options - Options for query execution.
   */
  captures(node, options = {}) {
    const startPosition = options.startPosition ?? ZERO_POINT;
    const endPosition = options.endPosition ?? ZERO_POINT;
    const startIndex = options.startIndex ?? 0;
    const endIndex = options.endIndex ?? 0;
    const startContainingPosition = options.startContainingPosition ?? ZERO_POINT;
    const endContainingPosition = options.endContainingPosition ?? ZERO_POINT;
    const startContainingIndex = options.startContainingIndex ?? 0;
    const endContainingIndex = options.endContainingIndex ?? 0;
    const matchLimit = options.matchLimit ?? 4294967295;
    const maxStartDepth = options.maxStartDepth ?? 4294967295;
    const progressCallback = options.progressCallback;
    if (typeof matchLimit !== "number") {
      throw new Error("Arguments must be numbers");
    }
    this.matchLimit = matchLimit;
    if (endIndex !== 0 && startIndex > endIndex) {
      throw new Error("`startIndex` cannot be greater than `endIndex`");
    }
    if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
      throw new Error("`startPosition` cannot be greater than `endPosition`");
    }
    if (endContainingIndex !== 0 && startContainingIndex > endContainingIndex) {
      throw new Error("`startContainingIndex` cannot be greater than `endContainingIndex`");
    }
    if (endContainingPosition !== ZERO_POINT && (startContainingPosition.row > endContainingPosition.row || startContainingPosition.row === endContainingPosition.row && startContainingPosition.column > endContainingPosition.column)) {
      throw new Error("`startContainingPosition` cannot be greater than `endContainingPosition`");
    }
    if (progressCallback) {
      C.currentQueryProgressCallback = progressCallback;
    }
    marshalNode(node);
    C._ts_query_captures_wasm(
      this[0],
      node.tree[0],
      startPosition.row,
      startPosition.column,
      endPosition.row,
      endPosition.column,
      startIndex,
      endIndex,
      startContainingPosition.row,
      startContainingPosition.column,
      endContainingPosition.row,
      endContainingPosition.column,
      startContainingIndex,
      endContainingIndex,
      matchLimit,
      maxStartDepth
    );
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
    const result = new Array();
    this.exceededMatchLimit = Boolean(didExceedMatchLimit);
    const captures = new Array();
    let address = startAddress;
    for (let i2 = 0; i2 < count; i2++) {
      const patternIndex = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const captureCount = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const captureIndex = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      captures.length = captureCount;
      address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
      if (this.textPredicates[patternIndex].every((p) => p(captures))) {
        const capture = captures[captureIndex];
        const setProperties = this.setProperties[patternIndex];
        capture.setProperties = setProperties;
        const assertedProperties = this.assertedProperties[patternIndex];
        capture.assertedProperties = assertedProperties;
        const refutedProperties = this.refutedProperties[patternIndex];
        capture.refutedProperties = refutedProperties;
        result.push(capture);
      }
    }
    C._free(startAddress);
    C.currentQueryProgressCallback = null;
    return result;
  }
  /** Get the predicates for a given pattern. */
  predicatesForPattern(patternIndex) {
    return this.predicates[patternIndex];
  }
  /**
   * Disable a certain capture within a query.
   *
   * This prevents the capture from being returned in matches, and also
   * avoids any resource usage associated with recording the capture.
   */
  disableCapture(captureName) {
    const captureNameLength = C.lengthBytesUTF8(captureName);
    const captureNameAddress = C._malloc(captureNameLength + 1);
    C.stringToUTF8(captureName, captureNameAddress, captureNameLength + 1);
    C._ts_query_disable_capture(this[0], captureNameAddress, captureNameLength);
    C._free(captureNameAddress);
  }
  /**
   * Disable a certain pattern within a query.
   *
   * This prevents the pattern from matching, and also avoids any resource
   * usage associated with the pattern. This throws an error if the pattern
   * index is out of bounds.
   */
  disablePattern(patternIndex) {
    if (patternIndex >= this.predicates.length) {
      throw new Error(
        `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
      );
    }
    C._ts_query_disable_pattern(this[0], patternIndex);
  }
  /**
   * Check if, on its last execution, this cursor exceeded its maximum number
   * of in-progress matches.
   */
  didExceedMatchLimit() {
    return this.exceededMatchLimit;
  }
  /** Get the byte offset where the given pattern starts in the query's source. */
  startIndexForPattern(patternIndex) {
    if (patternIndex >= this.predicates.length) {
      throw new Error(
        `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
      );
    }
    return C._ts_query_start_byte_for_pattern(this[0], patternIndex);
  }
  /** Get the byte offset where the given pattern ends in the query's source. */
  endIndexForPattern(patternIndex) {
    if (patternIndex >= this.predicates.length) {
      throw new Error(
        `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
      );
    }
    return C._ts_query_end_byte_for_pattern(this[0], patternIndex);
  }
  /** Get the number of patterns in the query. */
  patternCount() {
    return C._ts_query_pattern_count(this[0]);
  }
  /** Get the index for a given capture name. */
  captureIndexForName(captureName) {
    return this.captureNames.indexOf(captureName);
  }
  /** Check if a given pattern within a query has a single root node. */
  isPatternRooted(patternIndex) {
    return C._ts_query_is_pattern_rooted(this[0], patternIndex) === 1;
  }
  /** Check if a given pattern within a query has a single root node. */
  isPatternNonLocal(patternIndex) {
    return C._ts_query_is_pattern_non_local(this[0], patternIndex) === 1;
  }
  /**
   * Check if a given step in a query is 'definite'.
   *
   * A query step is 'definite' if its parent pattern will be guaranteed to
   * match successfully once it reaches the step.
   */
  isPatternGuaranteedAtStep(byteIndex) {
    return C._ts_query_is_pattern_guaranteed_at_step(this[0], byteIndex) === 1;
  }
};

// src/assets.js
import { readFile as readFile2 } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAsset, isSea } from "node:sea";
var rootDirectory = isSea() ? process.cwd() : join(dirname(fileURLToPath(__codegraphImportMetaUrl)), "..");
var ASSET_PATHS = Object.freeze({
  "tree-sitter.wasm": join(
    rootDirectory,
    "node_modules",
    "web-tree-sitter",
    "web-tree-sitter.wasm"
  ),
  "tree-sitter-python.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-python.wasm"
  ),
  "tree-sitter-javascript.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-javascript.wasm"
  ),
  "tree-sitter-typescript.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-typescript.wasm"
  ),
  "tree-sitter-tsx.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-tsx.wasm"
  ),
  "tree-sitter-java.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-java.wasm"
  ),
  "tree-sitter-go.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-go.wasm"
  )
});
async function loadAsset(name2) {
  if (!(name2 in ASSET_PATHS)) {
    throw new Error(`Unknown embedded asset: ${name2}`);
  }
  if (isSea()) {
    return new Uint8Array(getAsset(name2));
  }
  return readFile2(ASSET_PATHS[name2]);
}

// src/parser.js
var LANGUAGE_ASSET = Object.freeze({
  python: "tree-sitter-python.wasm",
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  java: "tree-sitter-java.wasm",
  go: "tree-sitter-go.wasm"
});
var initialization;
var languages = /* @__PURE__ */ new Map();
async function initializeParserRuntime() {
  initialization ??= loadAsset("tree-sitter.wasm").then((wasmBinary2) => Parser.init({ wasmBinary: wasmBinary2 }));
  await initialization;
}
async function languageFor(name2) {
  await initializeParserRuntime();
  if (!languages.has(name2)) {
    const asset = LANGUAGE_ASSET[name2];
    if (!asset) throw new Error(`Unsupported language: ${name2}`);
    languages.set(name2, Language.load(await loadAsset(asset)));
  }
  return languages.get(name2);
}
function stripQuotes(value) {
  const text = value.trim();
  if (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'") || text.startsWith("`") && text.endsWith("`")) {
    return text.slice(1, -1);
  }
  return text;
}
function firstDescendant(node, types) {
  if (!node) return null;
  if (types.has(node.type)) return node;
  for (const child of node.namedChildren) {
    const result = firstDescendant(child, types);
    if (result) return result;
  }
  return null;
}
function descendants(node, type, output2 = []) {
  if (!node) return output2;
  if (node.type === type) output2.push(node);
  for (const child of node.namedChildren) descendants(child, type, output2);
  return output2;
}
function textBeforeBody(node, body2) {
  if (!body2) return node.text;
  const relativeEnd = body2.startIndex - node.startIndex;
  return node.text.slice(0, Math.max(0, relativeEnd));
}
function parameterName(node) {
  return node.childForFieldName("name")?.text ?? node.childForFieldName("pattern")?.text ?? firstDescendant(node, /* @__PURE__ */ new Set(["identifier", "field_identifier"]))?.text ?? node.text;
}
function parameterType(node) {
  const type = node.childForFieldName("type");
  return type ? normalizeSemanticText(type.text.replace(/^:\s*/u, "")) : null;
}
function parameterDefault(node) {
  const value = node.childForFieldName("value") ?? node.childForFieldName("default");
  return value ? normalizeSemanticText(value.text) : null;
}
function parseInputs(parameters) {
  if (!parameters) return [];
  const wrapperTypes = /* @__PURE__ */ new Set([
    "default_parameter",
    "typed_parameter",
    "typed_default_parameter",
    "list_splat_pattern",
    "dictionary_splat_pattern",
    "required_parameter",
    "optional_parameter",
    "rest_pattern",
    "formal_parameter",
    "spread_parameter",
    "receiver_parameter",
    "parameter_declaration",
    "variadic_parameter_declaration"
  ]);
  const inputs = [];
  for (const child of parameters.namedChildren) {
    if (child.type === "identifier") {
      inputs.push({ name: child.text, type: null, optional: false, default: null });
      continue;
    }
    if (!wrapperTypes.has(child.type)) continue;
    const names = child.type === "parameter_declaration" ? child.namedChildren.filter((part) => part.type === "identifier") : [];
    if (names.length > 1) {
      for (const name2 of names) {
        inputs.push({ name: name2.text, type: parameterType(child), optional: false, default: null });
      }
      continue;
    }
    const defaultValue = parameterDefault(child);
    inputs.push({
      name: parameterName(child),
      type: parameterType(child),
      optional: child.type.includes("optional") || defaultValue !== null,
      default: defaultValue
    });
  }
  return inputs;
}
function parseOutputs(declaration) {
  const output2 = declaration.childForFieldName("return_type") ?? declaration.childForFieldName("result") ?? (declaration.type === "method_declaration" ? declaration.childForFieldName("type") : null);
  if (!output2) return [];
  return [{ type: normalizeSemanticText(output2.text.replace(/^:\s*/u, "")), condition: null }];
}
function parameterTypes(parameters) {
  if (!parameters) return "";
  return parameters.namedChildren.map((parameter) => parameterType(parameter) ?? "?").join(",");
}
function receiverType(receiver) {
  if (!receiver) return null;
  const type = receiver.childForFieldName("type") ?? firstDescendant(receiver, /* @__PURE__ */ new Set(["type_identifier"]));
  return type ? type.text.replace(/^\*/u, "") : null;
}
function declarationInfo(language, node, scope, namespace) {
  const nameNode = node.childForFieldName("name");
  const parameters = node.childForFieldName("parameters");
  let body2 = node.childForFieldName("body");
  let kind;
  let name2;
  let identitySuffix = "";
  let effectiveScope = scope;
  if (language === "python") {
    if (node.type === "class_definition") kind = "class";
    else if (node.type === "function_definition") {
      kind = ["class", "interface"].includes(scope.at(-1)?.kind) ? "method" : "function";
    } else return null;
    name2 = nameNode?.text;
  } else if (language === "javascript" || language === "typescript" || language === "tsx") {
    const kindByType = {
      class_declaration: "class",
      abstract_class_declaration: "class",
      interface_declaration: "interface",
      function_declaration: "function",
      generator_function_declaration: "function",
      method_definition: "method",
      method_signature: "method"
    };
    kind = kindByType[node.type];
    name2 = nameNode?.text;
    if (!kind && node.type === "variable_declarator") {
      const value = node.childForFieldName("value");
      if (value && ["arrow_function", "function_expression", "generator_function"].includes(value.type)) {
        kind = "function";
        name2 = node.childForFieldName("name")?.text;
        return {
          kind,
          name: name2,
          body: value.childForFieldName("body") ?? value,
          signatureNode: value,
          parameters: value.childForFieldName("parameters"),
          outputs: parseOutputs(value),
          qualifiedName: [namespace, ...scope.map((part) => part.name), name2].filter(Boolean).join(".")
        };
      }
    }
    if (!kind) return null;
    if (["typescript", "tsx"].includes(language) && ["method_definition", "method_signature"].includes(node.type)) {
      identitySuffix = `(${parameterTypes(parameters)})`;
    }
  } else if (language === "java") {
    const kindByType = {
      class_declaration: "class",
      record_declaration: "class",
      enum_declaration: "class",
      interface_declaration: "interface",
      method_declaration: "method",
      constructor_declaration: "method"
    };
    kind = kindByType[node.type];
    name2 = nameNode?.text;
    if (!kind) return null;
    if (kind === "method") identitySuffix = `(${parameterTypes(parameters)})`;
  } else if (language === "go") {
    if (node.type === "function_declaration") {
      kind = "function";
      name2 = nameNode?.text;
    } else if (node.type === "method_declaration") {
      kind = "method";
      name2 = nameNode?.text;
      const receiver = receiverType(node.childForFieldName("receiver"));
      effectiveScope = receiver ? [{ name: receiver, kind: "class" }] : scope;
    } else if (node.type === "type_spec") {
      const type = node.childForFieldName("type");
      if (type?.type === "interface_type") kind = "interface";
      else if (type?.type === "struct_type") kind = "class";
      else return null;
      name2 = nameNode?.text;
      body2 = type;
    } else {
      return null;
    }
  }
  if (!name2) return null;
  const scopedName = [...effectiveScope.map((part) => part.name), `${name2}${identitySuffix}`].filter(Boolean).join(".");
  return {
    kind,
    name: name2,
    body: body2,
    signatureNode: node,
    parameters,
    outputs: parseOutputs(node),
    qualifiedName: namespace ? `${namespace}.${scopedName}` : scopedName
  };
}
function namespaceFor(language, root, path) {
  if (language === "java") {
    const packageDeclaration = root.namedChildren.find((child) => child.type === "package_declaration");
    const packageName = packageDeclaration?.namedChildren.at(-1)?.text;
    if (packageName) return packageName;
  }
  if (language === "go") {
    const packageClause = root.namedChildren.find((child) => child.type === "package_clause");
    const packageName = packageClause?.namedChildren.at(-1)?.text;
    if (packageName) return packageName;
  }
  return moduleNameForPath(path);
}
function tagsForDeclaration(language, info2, decorators, node) {
  const tags = [];
  const decoratorText = decorators.join(" ");
  if (/\b(route|get|post|put|patch|delete|requestmapping|controller)\b/iu.test(decoratorText)) tags.push("entry_point:http");
  if (/\b(command|cli)\b/iu.test(decoratorText) || /^(main|cli)$/iu.test(info2.name)) tags.push("entry_point:cli");
  if (/\b(subscribe|listener|consumer|eventhandler)\b/iu.test(decoratorText)) tags.push("entry_point:event");
  if (/\b(schedule|cron|job)\b/iu.test(decoratorText)) tags.push("entry_point:scheduled");
  if (/\b(export|public)\b/u.test(node.text.slice(0, 100))) tags.push("public");
  if (language === "go" && /^[A-Z]/u.test(info2.name)) tags.push("public");
  return tags;
}
function dynamicRisks(target, node) {
  const risks = [];
  const lower = `${target} ${node.text}`.toLowerCase();
  if (/\b(getattr|setattr|hasattr|eval|class\.forname|getmethod|reflect)\b/u.test(lower)) risks.push(RISK.REFLECTION);
  if (/\b(__import__|import_module|dynamic import|import\s*\()/u.test(lower)) risks.push(RISK.DYNAMIC_DISPATCH);
  if (/\b(container|inject|provider|dependency|service_locator)\b/u.test(lower)) risks.push(RISK.DEPENDENCY_INJECTION);
  if (/\b(register|registry|plugin|entry_point)\b/u.test(lower)) risks.push(RISK.RUNTIME_REGISTRATION);
  if (/\b(grpc|rpc|ffi|jni|native|extern)\b/u.test(lower)) risks.push(RISK.CROSS_LANGUAGE_BOUNDARY);
  return uniqueSorted(risks);
}
function callTarget(language, node) {
  if (language === "python" && node.type === "call") return node.childForFieldName("function")?.text ?? null;
  if (["javascript", "typescript", "tsx", "go"].includes(language) && node.type === "call_expression") {
    return node.childForFieldName("function")?.text ?? null;
  }
  if (language === "java" && node.type === "method_invocation") {
    const object = node.childForFieldName("object")?.text;
    const name2 = node.childForFieldName("name")?.text;
    return [object, name2].filter(Boolean).join(".") || null;
  }
  return null;
}
function isCallNode(language, node) {
  return language === "python" && node.type === "call" || ["javascript", "typescript", "tsx", "go"].includes(language) && node.type === "call_expression" || language === "java" && node.type === "method_invocation";
}
function constructorTarget(language, node) {
  if (["javascript", "typescript", "tsx"].includes(language) && node.type === "new_expression") {
    return node.childForFieldName("constructor")?.text ?? node.namedChildren.find((child) => child.type !== "arguments")?.text ?? null;
  }
  if (language === "java" && node.type === "object_creation_expression") {
    return node.childForFieldName("type")?.text ?? null;
  }
  return null;
}
function isAnonymousCallable(language, node) {
  if (language === "python") return node.type === "lambda";
  if (["javascript", "typescript", "tsx"].includes(language)) {
    return ["arrow_function", "function_expression", "generator_function"].includes(node.type) || ["function_declaration", "generator_function_declaration"].includes(node.type) && !node.childForFieldName("name");
  }
  if (language === "java") return node.type === "lambda_expression";
  if (language === "go") return node.type === "func_literal";
  return false;
}
function conditionParts(node) {
  if (["if_statement", "elif_clause", "conditional_expression", "ternary_expression"].includes(node.type)) {
    return {
      condition: node.childForFieldName("condition"),
      consequence: node.childForFieldName("consequence"),
      alternatives: node.childrenForFieldName("alternative")
    };
  }
  return null;
}
function shortCircuitParts(language, node) {
  const supported = language === "python" && node.type === "boolean_operator" || ["javascript", "typescript", "tsx"].includes(language) && node.type === "binary_expression";
  if (!supported) return null;
  const left = node.childForFieldName("left");
  const right = node.childForFieldName("right");
  if (!left || !right) return null;
  const operator = node.text.slice(
    left.endIndex - node.startIndex,
    right.startIndex - node.startIndex
  ).trim();
  if (!["and", "or", "&&", "||"].includes(operator)) return null;
  return { left, right, negate: operator === "or" || operator === "||" };
}
function isNestedDeclaration(language, node) {
  if (language === "python") return ["function_definition", "class_definition"].includes(node.type);
  if (["javascript", "typescript", "tsx"].includes(language)) {
    return [
      "function_declaration",
      "generator_function_declaration",
      "class_declaration",
      "interface_declaration",
      "method_definition",
      "method_signature",
      "arrow_function",
      "function_expression"
    ].includes(node.type);
  }
  if (language === "java") {
    return ["class_declaration", "interface_declaration", "method_declaration", "constructor_declaration"].includes(node.type);
  }
  if (language === "go") return ["function_declaration", "method_declaration", "type_spec"].includes(node.type);
  return false;
}
function collectBindingIdentifiers(node, output2) {
  if (!node) return;
  if (["identifier", "shorthand_property_identifier_pattern"].includes(node.type)) {
    output2.add(node.text);
    return;
  }
  if ([
    "attribute",
    "subscript",
    "member_expression",
    "selector_expression",
    "field_expression"
  ].includes(node.type)) return;
  for (const child of node.namedChildren) collectBindingIdentifiers(child, output2);
}
function parameterBindingNames(parameters) {
  const output2 = /* @__PURE__ */ new Set();
  for (const parameter of parameters?.namedChildren ?? []) {
    const target = parameter.childForFieldName("name") ?? parameter.childForFieldName("pattern") ?? (["identifier", "object_pattern", "array_pattern"].includes(parameter.type) ? parameter : null);
    collectBindingIdentifiers(target, output2);
  }
  return output2;
}
function bindingTarget(node) {
  if ([
    "assignment",
    "assignment_expression",
    "named_expression",
    "variable_declarator",
    "short_var_declaration",
    "range_clause"
  ].includes(node.type)) {
    return node.childForFieldName("left") ?? node.childForFieldName("name") ?? node.childForFieldName("target");
  }
  if (["for_statement", "for_in_clause"].includes(node.type)) {
    return node.childForFieldName("left") ?? node.childForFieldName("pattern");
  }
  if (["with_item", "except_clause"].includes(node.type)) {
    return node.childForFieldName("alias") ?? node.childForFieldName("name");
  }
  if (node.type === "catch_clause") return node.childForFieldName("parameter");
  if (["capture_pattern", "as_pattern"].includes(node.type)) {
    return node.childForFieldName("alias") ?? node.childForFieldName("name") ?? node;
  }
  return null;
}
function collectLocalBindings(node, language, output2 = /* @__PURE__ */ new Set(), root = true, includeDeclarations = true) {
  if (!node) return output2;
  if (!root && isNestedDeclaration(language, node)) {
    if (includeDeclarations) collectBindingIdentifiers(node.childForFieldName("name"), output2);
    return output2;
  }
  if (["var_spec", "const_spec"].includes(node.type)) {
    for (const name2 of node.childrenForFieldName("name")) collectBindingIdentifiers(name2, output2);
  }
  collectBindingIdentifiers(bindingTarget(node), output2);
  for (const child of node.namedChildren) {
    collectLocalBindings(child, language, output2, false, includeDeclarations);
  }
  return output2;
}
function importInfo(language, node, namespace, path) {
  const imports = [];
  if (language === "python" && node.type === "import_statement") {
    for (const child of node.namedChildren) {
      const nameNode = child.childForFieldName("name") ?? child;
      const aliasNode = child.childForFieldName("alias");
      const target = nameNode.text;
      imports.push({ alias: aliasNode?.text ?? target.split(".")[0], target, typeOnly: false });
    }
  } else if (language === "python" && node.type === "import_from_statement") {
    const moduleNode = node.childForFieldName("module_name");
    const rawModule = node.text.match(/^from\s+([^\s]+)\s+import\b/u)?.[1] ?? moduleNode?.text ?? "";
    const leadingDots = rawModule.match(/^\.+/u)?.[0].length ?? 0;
    const moduleRemainder = rawModule.slice(leadingDots);
    const packageParts = path.split("/").slice(0, -1);
    const retainedParts = leadingDots > 0 ? packageParts.slice(0, Math.max(0, packageParts.length - (leadingDots - 1))) : [];
    const module2 = leadingDots > 0 ? [...retainedParts, ...moduleRemainder.split(".").filter(Boolean)].join(".") : moduleRemainder;
    if (node.namedChildren.some((child) => child.type === "wildcard_import")) {
      imports.push({
        alias: "*",
        target: `${module2}.*`.replace(/^\./u, ""),
        typeOnly: false,
        wildcard: true
      });
      return imports;
    }
    const imported = node.childrenForFieldName("name");
    const names = imported.length > 0 ? imported : node.namedChildren.filter((child) => child !== moduleNode && child.type !== "wildcard_import");
    for (const child of names) {
      const nameNode = child.childForFieldName("name") ?? child;
      const aliasNode = child.childForFieldName("alias");
      const name2 = nameNode.text;
      imports.push({
        alias: aliasNode?.text ?? name2,
        target: `${module2}.${name2}`.replace(/^\./u, ""),
        typeOnly: false,
        wildcard: false
      });
    }
  } else if (["javascript", "typescript", "tsx"].includes(language) && node.type === "import_statement") {
    const source = stripQuotes(node.childForFieldName("source")?.text ?? "");
    const typeOnly = /^import\s+type\b/u.test(node.text);
    const specifiers = descendants(node, "import_specifier");
    for (const specifier of specifiers) {
      const name2 = specifier.childForFieldName("name")?.text;
      const alias = specifier.childForFieldName("alias")?.text ?? name2;
      if (name2) imports.push({ alias, target: `${source}.${name2}`, typeOnly });
    }
    const clause = node.namedChildren.find((child) => child.type === "import_clause");
    const defaultName = clause?.namedChildren.find((child) => child.type === "identifier");
    if (defaultName) imports.push({ alias: defaultName.text, target: source, typeOnly });
    if (imports.length === 0 && source) imports.push({ alias: source, target: source, typeOnly });
  } else if (language === "java" && node.type === "import_declaration") {
    const target = node.namedChildren.find((child) => child.type.includes("identifier"))?.text;
    if (target) imports.push({ alias: target.split(".").at(-1), target, typeOnly: false });
  } else if (language === "go" && node.type === "import_spec") {
    const target = stripQuotes(node.childForFieldName("path")?.text ?? "");
    const alias = node.childForFieldName("name")?.text ?? target.split("/").at(-1);
    if (target) imports.push({ alias, target, typeOnly: false });
  }
  return imports;
}
function importNode(language, node) {
  return language === "python" && ["import_statement", "import_from_statement"].includes(node.type) || ["javascript", "typescript", "tsx"].includes(language) && node.type === "import_statement" || language === "java" && node.type === "import_declaration" || language === "go" && node.type === "import_spec";
}
function directTypeName(node) {
  if (!node) return null;
  return node.childForFieldName("name")?.text ?? node.namedChildren.find((child) => ["identifier", "type_identifier"].includes(child.type))?.text ?? (["identifier", "type_identifier"].includes(node.type) ? node.text : null);
}
function inheritanceTargets(language, node) {
  const targets = [];
  if (language === "python" && node.type === "class_definition") {
    const superclasses = node.childForFieldName("superclasses");
    if (superclasses) {
      targets.push(...superclasses.namedChildren.map((child) => ({ target: child.text, kind: "INHERITS" })));
    }
  } else if (["javascript", "typescript", "tsx"].includes(language) && ["class_declaration", "abstract_class_declaration", "interface_declaration"].includes(node.type)) {
    const heritage = node.namedChildren.find((child) => ["class_heritage", "extends_type_clause"].includes(child.type));
    if (heritage) {
      for (const child of heritage.namedChildren) {
        const kind = child.type === "implements_clause" ? "IMPLEMENTS" : "INHERITS";
        const typeNodes = child.namedChildren.length > 0 ? child.namedChildren : [child];
        for (const typeNode of typeNodes) {
          const target = directTypeName(typeNode);
          if (target) targets.push({ target, kind });
        }
      }
    }
  } else if (language === "java" && ["class_declaration", "record_declaration", "interface_declaration"].includes(node.type)) {
    const superclass = node.childForFieldName("superclass");
    const superclassName = directTypeName(superclass);
    if (superclassName) targets.push({ target: superclassName, kind: "INHERITS" });
    const interfaces = node.childForFieldName("interfaces");
    const typeList = interfaces?.namedChildren.find((child) => child.type === "type_list") ?? interfaces;
    for (const item of typeList?.namedChildren ?? []) {
      const target = directTypeName(item);
      if (target) {
        targets.push({
          target,
          kind: node.type === "interface_declaration" ? "INHERITS" : "IMPLEMENTS"
        });
      }
    }
  }
  return [...new Map(targets.map((item) => [`${item.kind}:${item.target}`, item])).values()];
}
function combineCondition(previous, next, negate = false) {
  const expression = negate ? `NOT (${next.expression})` : next.expression;
  if (!previous) return { ...next, expression };
  return { ...next, expression: `(${previous.expression}) AND (${expression})` };
}
function goBuildCondition(path, root) {
  const packageClause = root.namedChildren.find((child) => child.type === "package_clause");
  const headerComments = root.namedChildren.filter((child) => child.type === "comment" && (!packageClause || child.startPosition.row < packageClause.startPosition.row));
  const directive = headerComments.find((comment) => /^\/\/go:build\s+/u.test(comment.text));
  if (directive) return makeCondition(path, directive, directive.text.replace(/^\/\/go:build\s+/u, ""));
  const legacy = headerComments.filter((comment) => /^\/\/\s*\+build\s+/u.test(comment.text));
  if (legacy.length === 0) return null;
  return makeCondition(
    path,
    legacy[0],
    legacy.map((comment) => comment.text.replace(/^\/\/\s*\+build\s+/u, "")).join(" AND ")
  );
}
function declarationDocumentation(node) {
  const previous = node.previousNamedSibling;
  if (previous?.type === "comment") return previous.text.replace(/^\s*(?:#|\/\/|\/\*+|\*+)\s?/gmu, "");
  const body2 = node.childForFieldName("body");
  const first = body2?.namedChildren[0];
  if (first?.type === "expression_statement" && /string/u.test(first.namedChildren[0]?.type ?? "")) {
    return stripQuotes(first.namedChildren[0].text);
  }
  return "";
}
function addRisk(target, riskFlags, entityById, currentEntityId) {
  for (const risk of target) riskFlags.add(risk);
  const entity = entityById.get(currentEntityId);
  if (entity) entity.risk_flags = uniqueSorted([...entity.risk_flags, ...target]);
}
function buildParsedFile(file, source, tree, config) {
  const namespace = namespaceFor(file.language, tree.rootNode, file.path);
  const regionId = regionIdForPath(file.path);
  const buildCondition = file.language === "go" ? goBuildCondition(file.path, tree.rootNode) : null;
  const entities = [];
  const relations = [];
  const imports = {};
  const riskFlags = new Set([
    file.classification === CLASSIFICATION.GENERATED ? RISK.GENERATED_CODE : null,
    buildCondition ? RISK.CONDITIONAL_COMPILATION : null
  ].filter(Boolean));
  const entityById = /* @__PURE__ */ new Map();
  const localBindings = /* @__PURE__ */ new Map();
  const lexicalBindings = /* @__PURE__ */ new Map();
  const moduleEntity = createEntity({
    language: file.language,
    path: file.path,
    kind: "module",
    name: namespace.split(".").at(-1),
    qualifiedName: namespace,
    regionId,
    conditions: buildCondition ? [buildCondition] : [],
    node: tree.rootNode,
    classification: file.classification,
    semanticTags: ["module"],
    riskFlags: [...riskFlags],
    signature: namespace
  });
  entities.push(moduleEntity);
  entityById.set(moduleEntity.stable_id, moduleEntity);
  localBindings.set(moduleEntity.stable_id, collectLocalBindings(tree.rootNode, file.language));
  lexicalBindings.set(
    moduleEntity.stable_id,
    collectLocalBindings(tree.rootNode, file.language, /* @__PURE__ */ new Set(), true, false)
  );
  const shallow = file.classification === CLASSIFICATION.GENERATED;
  if (shallow) {
    const header = source.subarray(0, Math.min(source.length, 4096)).toString("utf8");
    const generatorSource = header.match(/(?:generated\s+(?:from|by)|source)\s*[:=]?\s*["'`]?([^\s"'`]+\.(?:ya?ml|json|proto|graphql|toml))/iu)?.[1];
    if (generatorSource) {
      relations.push(createRelation({
        src: moduleEntity.stable_id,
        unresolvedTarget: generatorSource,
        kind: "DEPENDS_ON",
        path: file.path,
        node: tree.rootNode,
        riskFlags: [RISK.GENERATED_CODE]
      }));
    }
  }
  function recordUnsupportedCalls(node, currentEntityId, activeCondition) {
    if (!node || isNestedDeclaration(file.language, node) || isAnonymousCallable(file.language, node)) return;
    const target = isCallNode(file.language, node) ? callTarget(file.language, node) : null;
    if (target) {
      const risks = uniqueSorted([...dynamicRisks(target, node), RISK.UNSUPPORTED_SEMANTICS]);
      addRisk(risks, riskFlags, entityById, currentEntityId);
      relations.push(createRelation({
        src: currentEntityId,
        unresolvedTarget: target,
        kind: "CALLS",
        path: file.path,
        node,
        condition: activeCondition,
        riskFlags: risks
      }));
    }
    for (const child of node.namedChildren) recordUnsupportedCalls(child, currentEntityId, activeCondition);
  }
  function visit(node, scope, currentEntityId, activeCondition = null, decorators = [], depth = 0) {
    if (node.type === "decorated_definition") {
      const decoratorNodes = node.namedChildren.filter((child) => child.type === "decorator");
      const decoratorTexts = decoratorNodes.map((child) => child.text.replace(/^@/u, ""));
      for (const decorator of decoratorNodes) {
        recordUnsupportedCalls(decorator, currentEntityId, activeCondition);
      }
      const definition = node.childForFieldName("definition") ?? node.namedChildren.find((child) => child.type !== "decorator");
      if (definition) visit(definition, scope, currentEntityId, activeCondition, decoratorTexts, depth);
      return;
    }
    const declaration = declarationInfo(file.language, node, scope, namespace);
    if (declaration) {
      if (shallow && depth > 1) return;
      const tags = tagsForDeclaration(file.language, declaration, decorators, node);
      const inferredEntryPoint = tags.some((tag) => tag.startsWith("entry_point:"));
      const declarationRisks = [
        file.classification === CLASSIFICATION.GENERATED ? RISK.GENERATED_CODE : null,
        buildCondition ? RISK.CONDITIONAL_COMPILATION : null,
        inferredEntryPoint ? RISK.UNSUPPORTED_SEMANTICS : null
      ].filter(Boolean);
      if (inferredEntryPoint) riskFlags.add(RISK.UNSUPPORTED_SEMANTICS);
      const entity = createEntity({
        language: file.language,
        path: file.path,
        kind: declaration.kind,
        name: declaration.name,
        qualifiedName: declaration.qualifiedName,
        regionId,
        inputs: parseInputs(declaration.parameters),
        outputs: declaration.outputs,
        conditions: activeCondition ? [activeCondition] : [],
        node,
        classification: file.classification,
        semanticTags: tags,
        riskFlags: declarationRisks,
        signature: textBeforeBody(declaration.signatureNode, declaration.body),
        documentation: declarationDocumentation(node)
      });
      entities.push(entity);
      entityById.set(entity.stable_id, entity);
      recordUnsupportedCalls(declaration.parameters, currentEntityId, activeCondition);
      const inheritedBindings = lexicalBindings.get(currentEntityId) ?? /* @__PURE__ */ new Set();
      const ownLexicalBindings = /* @__PURE__ */ new Set([
        ...entity.inputs.map((input) => input.name),
        ...parameterBindingNames(declaration.parameters),
        ...collectLocalBindings(declaration.body, file.language, /* @__PURE__ */ new Set(), true, false)
      ]);
      localBindings.set(entity.stable_id, /* @__PURE__ */ new Set([
        ...inheritedBindings,
        ...entity.inputs.map((input) => input.name),
        ...parameterBindingNames(declaration.parameters),
        ...collectLocalBindings(declaration.body, file.language)
      ]));
      lexicalBindings.set(entity.stable_id, /* @__PURE__ */ new Set([...inheritedBindings, ...ownLexicalBindings]));
      for (const inheritance of inheritanceTargets(file.language, node)) {
        relations.push(createRelation({
          src: entity.stable_id,
          unresolvedTarget: inheritance.target,
          kind: inheritance.kind,
          path: file.path,
          node,
          condition: activeCondition
        }));
      }
      if (tags.some((tag) => tag.startsWith("entry_point:"))) {
        relations.push(createRelation({
          src: moduleEntity.stable_id,
          dst: entity.stable_id,
          kind: "ROUTES_TO",
          confidence: CONFIDENCE.LOW,
          path: file.path,
          node,
          condition: activeCondition,
          riskFlags: [RISK.UNSUPPORTED_SEMANTICS]
        }));
      }
      const nextScope = declaration.kind === "class" || declaration.kind === "interface" ? [...scope, { name: declaration.name, kind: declaration.kind }] : [...scope, { name: declaration.name, kind: declaration.kind }];
      const body2 = declaration.body;
      if (body2 && body2 !== node) {
        visit(body2, nextScope, entity.stable_id, activeCondition, [], depth + 1);
      }
      return;
    }
    if (isAnonymousCallable(file.language, node)) {
      addRisk([RISK.UNSUPPORTED_SEMANTICS], riskFlags, entityById, currentEntityId);
      return;
    }
    if (importNode(file.language, node)) {
      for (const imported of importInfo(file.language, node, namespace, file.path)) {
        const bindings = imports[imported.alias] ?? [];
        bindings.push({
          target: imported.target,
          scope_entity_id: currentEntityId,
          condition: activeCondition,
          type_only: imported.typeOnly,
          wildcard: Boolean(imported.wildcard),
          source_location: sourceLocation(file.path, node)
        });
        imports[imported.alias] = bindings;
        relations.push(createRelation({
          src: currentEntityId,
          unresolvedTarget: imported.target,
          kind: "IMPORTS",
          confidence: CONFIDENCE.UNKNOWN,
          path: file.path,
          node,
          condition: activeCondition,
          typeOnly: imported.typeOnly,
          riskFlags: imported.wildcard ? [RISK.UNSUPPORTED_SEMANTICS] : []
        }));
        if (imported.wildcard) addRisk(
          [RISK.UNSUPPORTED_SEMANTICS],
          riskFlags,
          entityById,
          currentEntityId
        );
      }
      return;
    }
    const condition = conditionParts(node);
    if (condition?.condition && condition.consequence) {
      recordUnsupportedCalls(condition.condition, currentEntityId, activeCondition);
      const rawCondition = makeCondition(file.path, condition.condition);
      const conditionValue = combineCondition(activeCondition, rawCondition);
      if (/\b(?:feature[_-]?(?:flag|enabled)?|flag|enabled|env|environment|platform|os|arch)\b/iu.test(conditionValue.expression)) {
        addRisk([RISK.CONDITIONAL_COMPILATION], riskFlags, entityById, currentEntityId);
      }
      visit(condition.consequence, scope, currentEntityId, conditionValue, decorators, depth);
      let alternativeCondition = combineCondition(activeCondition, rawCondition, true);
      for (const alternative of condition.alternatives) {
        visit(
          alternative,
          scope,
          currentEntityId,
          alternativeCondition,
          decorators,
          depth
        );
        if (alternative.type === "elif_clause") {
          const alternativePredicate = alternative.childForFieldName("condition");
          if (alternativePredicate) {
            alternativeCondition = combineCondition(
              alternativeCondition,
              makeCondition(file.path, alternativePredicate),
              true
            );
          }
        }
      }
      return;
    }
    const shortCircuit = shortCircuitParts(file.language, node);
    if (shortCircuit) {
      visit(shortCircuit.left, scope, currentEntityId, activeCondition, decorators, depth);
      const rightCondition = combineCondition(
        activeCondition,
        makeCondition(file.path, shortCircuit.left),
        shortCircuit.negate
      );
      visit(shortCircuit.right, scope, currentEntityId, rightCondition, decorators, depth);
      return;
    }
    const constructed = constructorTarget(file.language, node);
    if (constructed) {
      const constructorRisks = [RISK.UNSUPPORTED_SEMANTICS];
      addRisk(constructorRisks, riskFlags, entityById, currentEntityId);
      relations.push(createRelation({
        src: currentEntityId,
        unresolvedTarget: constructed,
        kind: "CREATES",
        path: file.path,
        node,
        condition: activeCondition,
        riskFlags: constructorRisks
      }));
    }
    if (isCallNode(file.language, node)) {
      const target = callTarget(file.language, node);
      if (target) {
        const targetHead = target.replaceAll("?.", ".").split(".")[0];
        const shadowed = localBindings.get(currentEntityId)?.has(targetHead);
        const risks = uniqueSorted([
          ...dynamicRisks(target, node),
          shadowed ? RISK.DYNAMIC_DISPATCH : null
        ]);
        addRisk(risks, riskFlags, entityById, currentEntityId);
        relations.push(createRelation({
          src: currentEntityId,
          unresolvedTarget: target,
          kind: "CALLS",
          path: file.path,
          node,
          condition: activeCondition,
          riskFlags: risks
        }));
        if (/\b(app|router|server)\.(get|post|put|patch|delete|route|handle)\b/iu.test(target) || /\bhttp\.handlefunc\b/iu.test(target)) {
          const handler = node.childForFieldName("arguments")?.namedChildren.at(-1)?.text;
          if (handler) {
            relations.push(createRelation({
              src: currentEntityId,
              unresolvedTarget: handler,
              kind: "ROUTES_TO",
              path: file.path,
              node,
              condition: activeCondition,
              confidence: CONFIDENCE.UNKNOWN,
              riskFlags: [RISK.RUNTIME_REGISTRATION]
            }));
            addRisk([RISK.RUNTIME_REGISTRATION], riskFlags, entityById, currentEntityId);
          }
        }
      }
    }
    if (["raise_statement", "throw_statement"].includes(node.type)) {
      const entity = entityById.get(currentEntityId);
      if (entity) entity.effects = uniqueSorted([...entity.effects, "RAISE_ERROR"]);
    }
    if (["assignment", "assignment_expression", "variable_declarator"].includes(node.type)) {
      const left = node.childForFieldName("left") ?? node.childForFieldName("name");
      if (left?.type === "identifier") localBindings.get(currentEntityId)?.add(left.text);
      if (/(?:\.|\[)/u.test(left?.text ?? "")) {
        addRisk([RISK.DYNAMIC_DISPATCH], riskFlags, entityById, currentEntityId);
        const entity = entityById.get(currentEntityId);
        if (entity) entity.effects = uniqueSorted([...entity.effects, "MUTATE_STATE"]);
      }
    }
    if (node.type === "go_statement") {
      const entity = entityById.get(currentEntityId);
      if (entity) entity.semantic_tags = uniqueSorted([...entity.semantic_tags, "async"]);
    }
    for (const child of node.namedChildren) visit(child, scope, currentEntityId, activeCondition, decorators, depth);
  }
  for (const child of tree.rootNode.namedChildren) {
    visit(child, [], moduleEntity.stable_id, buildCondition);
  }
  if (buildCondition) {
    for (const relation of relations) {
      relation.risk_flags = uniqueSorted([...relation.risk_flags, RISK.CONDITIONAL_COMPILATION]);
    }
  }
  const parsed = {
    ...file,
    content_hash: hashBytes(source),
    semantic_hash: "",
    parse_status: shallow ? "SHALLOW" : "OK",
    parse_error: null,
    entities,
    relations,
    imports,
    risk_flags: uniqueSorted([...riskFlags])
  };
  parsed.semantic_hash = semanticHash(parsed);
  return parsed;
}
async function parseSourceFile(file, config) {
  const source = await readFileNoFollow(file.absolutePath);
  const contentHash = hashBytes(source);
  const sizeLimit = file.classification === CLASSIFICATION.GENERATED ? config.generated_file_size_limit : config.source_file_size_limit;
  if (source.length > sizeLimit) {
    if (file.classification === CLASSIFICATION.GENERATED) {
      const fakeNode = {
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 0, column: 0 }
      };
      const namespace = moduleNameForPath(file.path);
      const entity = createEntity({
        language: file.language,
        path: file.path,
        kind: "module",
        name: namespace.split(".").at(-1),
        qualifiedName: namespace,
        regionId: regionIdForPath(file.path),
        node: fakeNode,
        classification: file.classification,
        semanticTags: ["module", "shallow"],
        riskFlags: [RISK.GENERATED_CODE],
        signature: namespace
      });
      const parsed = {
        ...file,
        content_hash: contentHash,
        semantic_hash: "",
        parse_status: "SHALLOW",
        parse_error: null,
        entities: [entity],
        relations: [],
        imports: {},
        risk_flags: [RISK.GENERATED_CODE]
      };
      parsed.semantic_hash = semanticHash(parsed);
      return parsed;
    }
    return {
      ...file,
      content_hash: contentHash,
      semantic_hash: null,
      parse_status: "FAILED",
      parse_error: `File exceeds source_file_size_limit (${sizeLimit} bytes)`,
      entities: [],
      relations: [],
      imports: {},
      risk_flags: [RISK.UNSUPPORTED_SEMANTICS, RISK.PARTIAL_PARSE]
    };
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch (error) {
    return {
      ...file,
      content_hash: contentHash,
      semantic_hash: null,
      parse_status: "FAILED",
      parse_error: `Invalid UTF-8: ${error.message}`,
      entities: [],
      relations: [],
      imports: {},
      risk_flags: [RISK.PARTIAL_PARSE]
    };
  }
  const language = await languageFor(file.language);
  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(language);
    tree = parser.parse(text);
    if (!tree || tree.rootNode.hasError) {
      return {
        ...file,
        content_hash: contentHash,
        semantic_hash: null,
        parse_status: "FAILED",
        parse_error: "Tree-sitter reported a syntax error",
        entities: [],
        relations: [],
        imports: {},
        risk_flags: [RISK.PARTIAL_PARSE]
      };
    }
    return buildParsedFile(file, source, tree, config);
  } finally {
    tree?.delete();
    parser.delete();
  }
}

// src/project.js
import { lstat, readdir, stat } from "node:fs/promises";
import { basename, dirname as dirname2, extname as extname2, join as join2, relative, resolve, sep } from "node:path";
async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function detectProjectRoot(start2 = process.cwd(), initializedOnly = false) {
  let current = resolve(start2);
  while (true) {
    if (await exists(join2(current, CODEGRAPH_DIR))) return current;
    if (!initializedOnly && await exists(join2(current, ".git"))) return current;
    const parent = dirname2(current);
    if (parent === current) break;
    current = parent;
  }
  if (initializedOnly) {
    throw new CodeGraphError(
      "PROJECT_NOT_INITIALIZED",
      "No initialized .codegraph directory was found in this directory or its parents.",
      2
    );
  }
  return resolve(start2);
}
function normalizePath(path) {
  return path.split(sep).join("/");
}
function wildcardToRegExp(pattern) {
  const normalized = pattern.replace(/^\//u, "").replace(/\/$/u, "/**");
  let expression = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
    }
  }
  return new RegExp(`(^|/)${expression}($|/)`, "u");
}
async function readIgnorePatterns(root, configured) {
  const patterns = configured.map((pattern) => ({ pattern, negated: false }));
  try {
    const gitignore = (await readFileNoFollow(join2(root, ".gitignore"))).toString("utf8");
    for (const rawLine of gitignore.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const negated = line.startsWith("!");
      const pattern = negated ? line.slice(1) : line;
      if (pattern) patterns.push({ pattern, negated });
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return patterns.map((rule) => ({ ...rule, expression: wildcardToRegExp(rule.pattern) }));
}
function isIgnored(relativePath, name2, isDirectory, patterns) {
  if (relativePath === MAP_FILE && !isDirectory) return true;
  if (isDirectory && DEFAULT_IGNORED_DIRECTORIES.has(name2)) return true;
  const candidate = isDirectory ? `${relativePath}/` : relativePath;
  let ignored = false;
  for (const rule of patterns) {
    if (rule.expression.test(candidate)) ignored = !rule.negated;
  }
  return ignored;
}
function generatedByPath(relativePath) {
  return /(^|\/)(generated|gen|autogen|vendor)(\/|$)/iu.test(relativePath) || /(?:\.generated|\.g)\.[^.]+$/iu.test(relativePath) || /(?:^|\/)(?:package-lock|yarn\.lock|pnpm-lock)\./iu.test(relativePath);
}
function classifyFile(relativePath, prefix = "") {
  const normalized = normalizePath(relativePath);
  const file = basename(normalized).toLowerCase();
  if (generatedByPath(normalized) || /generated|do not edit/iu.test(prefix)) {
    return CLASSIFICATION.GENERATED;
  }
  if (/(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/iu.test(normalized) || /(?:^|[._-])(?:test|spec)\.[^.]+$/iu.test(file)) {
    return CLASSIFICATION.TEST;
  }
  if (/(^|\/)(infra|infrastructure|terraform|deploy|deployment)(\/|$)/iu.test(normalized)) {
    return CLASSIFICATION.INFRASTRUCTURE;
  }
  if (/(?:^|\/)(?:makefile|dockerfile)$/iu.test(normalized) || /\.(?:gradle|lock)$/iu.test(file)) {
    return CLASSIFICATION.BUILD;
  }
  if (/\.(?:json|toml|ya?ml|ini|properties)$/iu.test(file)) {
    return CLASSIFICATION.CONFIG;
  }
  if (/\.(?:md|rst|txt)$/iu.test(file)) return CLASSIFICATION.DOCUMENTATION;
  if (/^(?:readme|license|notice|changelog|contributing)(?:\.|$)/iu.test(file)) {
    return CLASSIFICATION.DOCUMENTATION;
  }
  if (/^(?:\.gitignore|\.gitattributes|\.env(?:\..*)?)$/iu.test(file) || /\.(?:xml|cfg|conf)$/iu.test(file)) return CLASSIFICATION.CONFIG;
  return CLASSIFICATION.FIRST_PARTY;
}
function detectLanguage(relativePath) {
  return LANGUAGE_BY_EXTENSION[extname2(relativePath).toLowerCase()] ?? null;
}
async function scanProject(root, config) {
  const ignorePatterns = await readIgnorePatterns(root, config.exclude ?? []);
  const files = [];
  const unsupportedFiles = [];
  const diagnostics = [];
  const casePaths = /* @__PURE__ */ new Map();
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      diagnostics.push({ code: "DIRECTORY_UNREADABLE", path: normalizePath(relative(root, directory)), message: error.message });
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = join2(directory, entry.name);
      const relativePath = normalizePath(relative(root, absolutePath));
      let metadata2;
      try {
        metadata2 = await lstat(absolutePath);
      } catch (error) {
        diagnostics.push({ code: "PATH_UNREADABLE", path: relativePath, message: error.message });
        continue;
      }
      if (metadata2.isSymbolicLink()) {
        diagnostics.push({ code: "SYMLINK_SKIPPED", path: relativePath });
        continue;
      }
      if (isIgnored(relativePath, entry.name, metadata2.isDirectory(), ignorePatterns)) continue;
      if (metadata2.isDirectory()) {
        let nestedRepository;
        try {
          nestedRepository = await exists(join2(absolutePath, ".git"));
        } catch (error) {
          diagnostics.push({ code: "DIRECTORY_UNREADABLE", path: relativePath, message: error.message });
          continue;
        }
        if (nestedRepository) {
          diagnostics.push({ code: "NESTED_REPOSITORY_SKIPPED", path: relativePath });
          continue;
        }
        stack.push(absolutePath);
        continue;
      }
      if (!metadata2.isFile()) continue;
      const language = detectLanguage(relativePath);
      const caseKey = relativePath.toLocaleLowerCase("en-US");
      const previous = casePaths.get(caseKey);
      if (previous && previous !== relativePath) {
        diagnostics.push({ code: "PATH_CASE_COLLISION", path: relativePath, other_path: previous });
      } else {
        casePaths.set(caseKey, relativePath);
      }
      let prefix = "";
      let textFile = true;
      try {
        const prefixBytes = await readPrefixNoFollow(absolutePath, 2048);
        if (prefixBytes.includes(0)) textFile = false;
        else prefix = new TextDecoder("utf-8", { fatal: true }).decode(prefixBytes);
      } catch (error) {
        if (error instanceof TypeError) textFile = false;
        else {
          diagnostics.push({ code: "FILE_UNREADABLE", path: relativePath, message: error.message });
          continue;
        }
      }
      const classification = classifyFile(relativePath, prefix);
      if (!language && (!textFile || classification === CLASSIFICATION.DOCUMENTATION)) continue;
      const file = {
        absolutePath,
        path: relativePath,
        classification,
        size: metadata2.size,
        mtimeMs: metadata2.mtimeMs
      };
      if (language) files.push({ ...file, language });
      else unsupportedFiles.push({ ...file, reason: "UNSUPPORTED_LANGUAGE_OR_CONFIG" });
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  unsupportedFiles.sort((left, right) => left.path.localeCompare(right.path));
  return { files, unsupportedFiles, diagnostics };
}

// src/resolver.js
import { posix } from "node:path";
function stripLanguageExtension(value) {
  return value.replace(/\.(?:py|jsx?|mjs|cjs|tsx?|mts|cts|java|go)$/iu, "");
}
function normalizeRelativeImport(rawTarget, sourcePath) {
  if (!rawTarget.startsWith(".")) return rawTarget;
  const extensionMatch = rawTarget.match(/\.(?:jsx?|mjs|cjs|tsx?|mts|cts)(?=\.|$)/iu);
  let modulePart = extensionMatch ? rawTarget.slice(0, extensionMatch.index + extensionMatch[0].length) : rawTarget;
  let suffix = extensionMatch ? rawTarget.slice(extensionMatch.index + extensionMatch[0].length) : "";
  if (!extensionMatch) {
    const segments = rawTarget.split(".");
    if (segments.length > 2 && !rawTarget.includes("/")) {
      modulePart = rawTarget.replace(/^\.+/u, "");
      suffix = "";
    }
  }
  const resolved = posix.normalize(posix.join(posix.dirname(sourcePath), modulePart));
  return `${stripLanguageExtension(resolved).replaceAll("/", ".")}${suffix}`;
}
function cleanedTarget(rawTarget, sourcePath) {
  let target = rawTarget.replaceAll("?.", ".").replace(/<[^<>]*>/gu, "").replace(/^await\s+/u, "").trim();
  target = normalizeRelativeImport(target, sourcePath);
  return target.replace(/^\.+/u, "").replace(/\.+/gu, ".");
}
function entityNameCandidates(target, byName) {
  const name2 = target.split(".").at(-1);
  return byName.get(name2) ?? [];
}
function scopedImportBindings(rawBindings, source, byId) {
  if (!rawBindings) return [];
  const bindings = Array.isArray(rawBindings) ? rawBindings : [{ target: rawBindings, scope_entity_id: null, condition: null, type_only: false }];
  return bindings.filter((binding) => {
    if (!binding.scope_entity_id) return true;
    if (binding.scope_entity_id === source.stable_id) return true;
    const scope = byId.get(binding.scope_entity_id);
    if (!scope || scope.file_path !== source.file_path) return false;
    if (scope.kind === "module") return true;
    if (["class", "interface"].includes(scope.kind)) return false;
    return source.qualified_name.startsWith(`${scope.qualified_name}.`);
  });
}
function importBindings(target, imports, source, sourcePath, byId) {
  const [head, ...tail] = target.split(".");
  return scopedImportBindings(imports[head], source, byId).map((binding) => ({
    ...binding,
    expanded_target: [normalizeRelativeImport(binding.target, sourcePath), ...tail].filter(Boolean).join(".")
  }));
}
function bindingFollowsReference(binding, source, relation) {
  if (binding.scope_entity_id !== source.stable_id || !binding.source_location) return false;
  const bindingLocation = binding.source_location;
  const reference = relation.source_location;
  return bindingLocation.start_line > reference.start_line || bindingLocation.start_line === reference.start_line && bindingLocation.start_column > reference.start_column;
}
function exactCandidates(target, entities) {
  return entities.filter((entity) => entity.qualified_name === target);
}
function candidatesForRelation(relation, candidates) {
  if (relation.kind === "CALLS" || relation.kind === "ROUTES_TO") {
    return candidates.filter((candidate) => ["function", "method", "class"].includes(candidate.kind));
  }
  if (relation.kind === "CREATES") return candidates.filter((candidate) => candidate.kind === "class");
  if (relation.kind === "INHERITS") return candidates.filter((candidate) => ["class", "interface"].includes(candidate.kind));
  if (relation.kind === "IMPLEMENTS") return candidates.filter((candidate) => candidate.kind === "interface");
  return candidates;
}
function addEntityRisk(entity, risks) {
  entity.risk_flags = uniqueSorted([...entity.risk_flags ?? [], ...risks]);
}
function withoutResolverAmbiguity(risks = []) {
  return risks.filter((risk) => risk !== RISK.AMBIGUOUS_SYMBOL);
}
function normalizedResolverInput(parsedFiles) {
  const files = structuredClone(parsedFiles);
  const normalizedIds = /* @__PURE__ */ new Map();
  for (const file of files) {
    file.risk_flags = withoutResolverAmbiguity(file.risk_flags);
    for (const entity of file.entities) {
      const normalized = stableEntityId(file.language, file.path, entity.qualified_name, entity.kind);
      normalizedIds.set(entity.stable_id, normalized);
      entity.stable_id = normalized;
      entity.risk_flags = withoutResolverAmbiguity(entity.risk_flags);
    }
  }
  for (const file of files) {
    for (const relation of file.relations) {
      if (!("source_condition" in relation)) {
        relation.source_condition = relation.condition ? structuredClone(relation.condition) : null;
      }
      relation.condition = relation.source_condition ? structuredClone(relation.source_condition) : null;
      relation.src_entity_id = normalizedIds.get(relation.src_entity_id) ?? relation.src_entity_id;
      relation.dst_entity_id = normalizedIds.get(relation.dst_entity_id) ?? relation.dst_entity_id;
      relation.risk_flags = withoutResolverAmbiguity(relation.risk_flags);
      relation.candidates = (relation.candidates ?? []).map((candidate) => normalizedIds.get(candidate) ?? candidate);
    }
    for (const rawBindings of Object.values(file.imports ?? {})) {
      if (!Array.isArray(rawBindings)) continue;
      for (const binding of rawBindings) {
        binding.scope_entity_id = normalizedIds.get(binding.scope_entity_id) ?? binding.scope_entity_id;
      }
    }
  }
  return files;
}
function locationInside(location, entity) {
  if (!location) return false;
  return location.start_line >= entity.source_location.start_line && location.end_line <= entity.source_location.end_line;
}
function ensureUniqueEntityIds(files) {
  const seen = /* @__PURE__ */ new Map();
  const collisionCounts = /* @__PURE__ */ new Map();
  for (const file of files) {
    for (const entity of file.entities) {
      const previous = seen.get(entity.stable_id);
      if (!previous) {
        seen.set(entity.stable_id, entity);
        continue;
      }
      const original = entity.stable_id;
      const collision = (collisionCounts.get(original) ?? 0) + 1;
      collisionCounts.set(original, collision);
      const discriminator = hashBytes(entity.signature).slice(0, 10);
      entity.stable_id = `${original}#ambiguous-${discriminator}-${collision}`;
      addEntityRisk(entity, [RISK.AMBIGUOUS_SYMBOL]);
      addEntityRisk(previous, [RISK.AMBIGUOUS_SYMBOL]);
      file.risk_flags = uniqueSorted([...file.risk_flags ?? [], RISK.AMBIGUOUS_SYMBOL]);
      for (const relation of file.relations) {
        if (relation.src_entity_id === original && locationInside(relation.source_location, entity)) {
          relation.src_entity_id = entity.stable_id;
        }
        if (relation.dst_entity_id === original && locationInside(relation.source_location, entity)) {
          relation.dst_entity_id = entity.stable_id;
        }
      }
      for (const rawBindings of Object.values(file.imports ?? {})) {
        if (!Array.isArray(rawBindings)) continue;
        for (const binding of rawBindings) {
          if (binding.scope_entity_id === original && locationInside(binding.source_location, entity)) {
            binding.scope_entity_id = entity.stable_id;
          }
        }
      }
      seen.set(entity.stable_id, entity);
    }
  }
}
function stabilizeRelationIds(files) {
  const counts = /* @__PURE__ */ new Map();
  const ordered = files.flatMap((file) => file.relations).sort((left, right) => {
    const leftLocation = left.source_location;
    const rightLocation = right.source_location;
    return leftLocation.file_path.localeCompare(rightLocation.file_path) || leftLocation.start_line - rightLocation.start_line || leftLocation.start_column - rightLocation.start_column || left.kind.localeCompare(right.kind) || (left.unresolved_target ?? left.dst_entity_id ?? "").localeCompare(right.unresolved_target ?? right.dst_entity_id ?? "");
  });
  for (const relation of ordered) {
    const base = [
      relation.src_entity_id,
      relation.kind,
      relation.unresolved_target ?? relation.dst_entity_id ?? "",
      relation.condition?.expression ?? "",
      relation.type_only ? "type" : "runtime"
    ].join("\0");
    const occurrence = (counts.get(base) ?? 0) + 1;
    counts.set(base, occurrence);
    relation.stable_id = `relation:${hashBytes(base).slice(0, 24)}:${occurrence}`;
  }
}
function mergeRelationCondition(relation, condition) {
  if (!condition) return;
  if (!relation.condition) {
    relation.condition = structuredClone(condition);
    return;
  }
  if (relation.condition.expression === condition.expression) return;
  const prefix = `(${condition.expression}) AND (`;
  if (relation.condition.expression.startsWith(prefix) && relation.condition.expression.endsWith(")")) return;
  relation.condition = {
    ...condition,
    expression: `(${condition.expression}) AND (${relation.condition.expression})`
  };
}
function addRelationRisk(relation, file, risks) {
  relation.risk_flags = uniqueSorted([...relation.risk_flags ?? [], ...risks]);
  file.risk_flags = uniqueSorted([...file.risk_flags ?? [], ...risks]);
}
function hasLexicalCallableAncestor(candidate, entities) {
  let parent = candidate.qualified_name.slice(0, candidate.qualified_name.lastIndexOf("."));
  while (parent) {
    const owner = entities.find((entity) => entity.file_path === candidate.file_path && entity.qualified_name === parent);
    if (owner && ["function", "method"].includes(owner.kind)) return true;
    const separator = parent.lastIndexOf(".");
    if (separator < 0) break;
    parent = parent.slice(0, separator);
  }
  return false;
}
function applyCandidateConditions(relation, candidate, file) {
  if ((candidate.conditions ?? []).length === 0) return false;
  for (const condition of candidate.conditions) mergeRelationCondition(relation, condition);
  addRelationRisk(relation, file, [RISK.CONDITIONAL_COMPILATION]);
  return true;
}
function resolveOne(relation, source, file, entities, byName, byId) {
  if (relation.dst_entity_id && !relation.unresolved_target && byId.has(relation.dst_entity_id)) return relation;
  if (relation.unresolved_target) {
    relation.dst_entity_id = null;
    relation.confidence = CONFIDENCE.UNKNOWN;
    relation.candidates = [];
  }
  const rawTarget = relation.unresolved_target;
  if (!rawTarget) return relation;
  const target = cleanedTarget(rawTarget, file.path);
  const candidates = candidatesForRelation(relation, entityNameCandidates(target, byName));
  const dynamicallyShadowed = relation.risk_flags.includes(RISK.DYNAMIC_DISPATCH) || source.inputs.some((input) => input.name === target.split(".")[0]);
  const highConfidenceBlocked = () => relation.risk_flags.some((risk) => INCOMPLETE_RISKS.has(risk));
  const module2 = entities.find((entity) => entity.file_path === source.file_path && entity.kind === "module");
  const local = candidates.filter((candidate) => {
    if (candidate.file_path !== source.file_path || !module2) return false;
    if (candidate.kind === "method") return false;
    const separator = candidate.qualified_name.lastIndexOf(".");
    const parent = separator < 0 ? "" : candidate.qualified_name.slice(0, separator);
    const parentEntity = entities.find((entity) => entity.file_path === candidate.file_path && entity.qualified_name === parent);
    if (file.language === "python" && parentEntity?.kind === "class") return false;
    return parent === module2.qualified_name || parent === source.qualified_name || source.qualified_name.startsWith(`${parent}.`);
  });
  const wildcardBindings = scopedImportBindings(file.imports?.["*"], source, byId);
  if (wildcardBindings.length > 0) addRelationRisk(relation, file, [RISK.UNSUPPORTED_SEMANTICS]);
  const bindings = importBindings(target, file.imports ?? {}, source, file.path, byId);
  if (bindings.length > 1) {
    addRelationRisk(relation, file, [RISK.AMBIGUOUS_SYMBOL]);
  }
  const binding = bindings.length === 1 ? bindings[0] : null;
  if (binding && bindingFollowsReference(binding, source, relation)) {
    addRelationRisk(relation, file, [RISK.UNSUPPORTED_SEMANTICS]);
  }
  if (binding?.condition) {
    mergeRelationCondition(relation, binding.condition);
    addRelationRisk(relation, file, [RISK.CONDITIONAL_COMPILATION]);
  }
  if (binding && !dynamicallyShadowed && !binding.type_only) {
    const imported = candidatesForRelation(relation, exactCandidates(binding.expanded_target, entities));
    if (imported.length === 1) {
      const lexicalMember = hasLexicalCallableAncestor(imported[0], entities);
      const competingLocal = !target.includes(".") && local.some((candidate) => candidate.stable_id !== imported[0].stable_id);
      if (lexicalMember) addRelationRisk(relation, file, [RISK.UNSUPPORTED_SEMANTICS]);
      if (competingLocal) addRelationRisk(relation, file, [RISK.AMBIGUOUS_SYMBOL]);
      applyCandidateConditions(relation, imported[0], file);
      if (!lexicalMember && !competingLocal && !highConfidenceBlocked()) {
        relation.dst_entity_id = imported[0].stable_id;
        relation.confidence = CONFIDENCE.HIGH;
        relation.candidates = [];
        return relation;
      }
      candidates.push(...imported);
    }
    if (imported.length > 1) candidates.push(...imported);
  }
  const localConditional = local.length === 1 ? applyCandidateConditions(relation, local[0], file) : false;
  if (local.length === 1 && !target.includes(".") && !dynamicallyShadowed && !localConditional && !highConfidenceBlocked()) {
    relation.dst_entity_id = local[0].stable_id;
    relation.confidence = CONFIDENCE.HIGH;
    relation.candidates = [];
    return relation;
  }
  const exact = candidatesForRelation(relation, exactCandidates(target, entities));
  const exactConditional = exact.length === 1 ? applyCandidateConditions(relation, exact[0], file) : false;
  if (exact.length === 1 && ["IMPORTS", "INHERITS", "IMPLEMENTS"].includes(relation.kind) && !dynamicallyShadowed && !exactConditional && !highConfidenceBlocked()) {
    relation.dst_entity_id = exact[0].stable_id;
    relation.confidence = CONFIDENCE.HIGH;
    relation.candidates = [];
    return relation;
  }
  const uniqueCandidates = [...new Map(
    [...candidates, ...exact].map((candidate) => [candidate.stable_id, candidate])
  ).values()];
  if (uniqueCandidates.length > 1) {
    relation.confidence = CONFIDENCE.MEDIUM;
    relation.candidates = uniqueCandidates.map((candidate) => candidate.stable_id).sort();
    relation.risk_flags = uniqueSorted([
      ...relation.risk_flags ?? [],
      RISK.AMBIGUOUS_SYMBOL
    ]);
    addEntityRisk(source, relation.risk_flags);
    file.risk_flags = uniqueSorted([...file.risk_flags ?? [], ...relation.risk_flags]);
    return relation;
  }
  if (uniqueCandidates.length === 1) {
    relation.confidence = CONFIDENCE.LOW;
    relation.candidates = [uniqueCandidates[0].stable_id];
  } else {
    relation.confidence = CONFIDENCE.UNKNOWN;
  }
  if (dynamicallyShadowed) {
    relation.confidence = CONFIDENCE.UNKNOWN;
    relation.dst_entity_id = null;
    relation.risk_flags = uniqueSorted([...relation.risk_flags, RISK.DYNAMIC_DISPATCH]);
    file.risk_flags = uniqueSorted([...file.risk_flags, RISK.DYNAMIC_DISPATCH]);
  }
  if (relation.risk_flags.length > 0) addEntityRisk(source, relation.risk_flags);
  return relation;
}
function profileGraph(files, entities, relations, regions, parseDurationMs = 0, syncDurationMs = 0) {
  const languages2 = new Set(files.map((file) => file.language));
  const unresolved = relations.filter((relation) => !relation.dst_entity_id).length;
  const entityById = new Map(entities.map((entity) => [entity.stable_id, entity]));
  const crossRegion = relations.filter((relation) => {
    if (!relation.dst_entity_id) return false;
    const source = entityById.get(relation.src_entity_id);
    const target = entityById.get(relation.dst_entity_id);
    return source && target && source.region_id !== target.region_id;
  }).length;
  const failed = files.filter((file) => file.parse_status === "FAILED").length;
  return {
    file_count: files.length,
    entity_count: entities.length,
    relation_count: relations.length,
    region_count: regions.length,
    language_count: languages2.size,
    languages: [...languages2].sort(),
    cross_region_relation_count: crossRegion,
    estimated_codegraph_tokens: 0,
    parse_failure_rate: files.length === 0 ? 0 : failed / files.length,
    unresolved_relation_rate: relations.length === 0 ? 0 : unresolved / relations.length,
    parse_latency_ms: parseDurationMs,
    sync_latency_ms: syncDurationMs
  };
}
function healthFor(files, relations) {
  const supported = files.length;
  const failed = files.filter((file) => file.parse_status === "FAILED");
  const stale = files.filter((file) => file.stale);
  const resolvedImports = relations.filter((relation) => relation.kind === "IMPORTS" && relation.dst_entity_id).length;
  const imports = relations.filter((relation) => relation.kind === "IMPORTS").length;
  const resolvedCalls = relations.filter((relation) => relation.kind === "CALLS" && relation.dst_entity_id).length;
  const calls = relations.filter((relation) => relation.kind === "CALLS").length;
  const low = relations.filter((relation) => relation.confidence === CONFIDENCE.LOW).length;
  const unknown = relations.filter((relation) => relation.confidence === CONFIDENCE.UNKNOWN).length;
  const risks = uniqueSorted(files.flatMap((file) => file.risk_flags ?? []));
  const status = failed.length > 0 || stale.length > 0 ? GRAPH_STATUS.PARTIAL : GRAPH_STATUS.FRESH;
  return {
    status,
    supported_file_coverage: 1,
    parse_success_rate: supported === 0 ? 1 : (supported - failed.length) / supported,
    resolved_import_rate: imports === 0 ? 1 : resolvedImports / imports,
    resolved_call_rate: calls === 0 ? 1 : resolvedCalls / calls,
    low_confidence_relation_count: low,
    unknown_relation_count: unknown,
    stale_file_count: stale.length,
    stale_files: stale.map((file) => file.path).sort(),
    parse_failures: failed.map((file) => ({ path: file.path, error: file.parse_error })),
    risk_flags: risks,
    impact_completeness: risks.some((risk) => INCOMPLETE_RISKS.has(risk)) || low > 0 || unknown > 0 ? "INCOMPLETE" : "SCOPED_STATIC"
  };
}
function resolveGraph(parsedFiles, timings = {}) {
  const files = normalizedResolverInput(parsedFiles);
  ensureUniqueEntityIds(files);
  const entities = files.flatMap((file) => file.entities);
  const byId = new Map(entities.map((entity) => [entity.stable_id, entity]));
  const byName = /* @__PURE__ */ new Map();
  for (const entity of entities) {
    const values = byName.get(entity.name) ?? [];
    values.push(entity);
    byName.set(entity.name, values);
  }
  for (const file of files) {
    for (const relation of file.relations) {
      const source = byId.get(relation.src_entity_id);
      if (!source) {
        relation.confidence = CONFIDENCE.UNKNOWN;
        relation.risk_flags = uniqueSorted([...relation.risk_flags ?? [], RISK.UNSUPPORTED_SEMANTICS]);
        file.risk_flags = uniqueSorted([...file.risk_flags ?? [], RISK.UNSUPPORTED_SEMANTICS]);
        continue;
      }
      resolveOne(relation, source, file, entities, byName, byId);
    }
  }
  stabilizeRelationIds(files);
  for (const file of files) file.semantic_hash = semanticHash(file);
  const relations = files.flatMap((file) => file.relations);
  const regions = buildRegions(files);
  const health = healthFor(files, relations);
  const profile = profileGraph(
    files,
    entities,
    relations,
    regions,
    timings.parseDurationMs,
    timings.syncDurationMs
  );
  return { files, entities, relations, regions, health, profile };
}

// src/store.js
import { lstatSync } from "node:fs";
import { stat as stat2 } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
var INTEGRITY_VERSION = "3";
function json(value) {
  return JSON.stringify(value ?? null);
}
function fromJson(value, fallback, field = "persisted JSON") {
  if (value === null || value === void 0 || value === "") return fallback;
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
    location.end_column
  ];
}
function rowLocation(row) {
  return {
    file_path: row.file_path,
    start_line: row.start_line,
    start_column: row.start_column,
    end_line: row.end_line,
    end_column: row.end_column
  };
}
function assertGraphReferences(files, entities, relations, regions, ftsIds) {
  const filePaths = new Set(files.map((file) => file.path));
  const entityIds = new Set(entities.map((entity) => entity.stable_id));
  const entitiesById = new Map(entities.map((entity) => [entity.stable_id, entity]));
  const regionIds = new Set(regions.map((region) => region.stable_id));
  const invalidEntity = entities.find((entity) => !filePaths.has(entity.file_path) || !regionIds.has(entity.region_id));
  const invalidRelation = relations.find((relation) => !filePaths.has(relation.source_location.file_path) || !entityIds.has(relation.src_entity_id) || entitiesById.get(relation.src_entity_id)?.file_path !== relation.source_location.file_path || relation.dst_entity_id !== null && !entityIds.has(relation.dst_entity_id) || relation.candidates.some((candidate) => !entityIds.has(candidate)));
  const invalidRegion = regions.find((region) => region.parent_id !== null && !regionIds.has(region.parent_id));
  const sortedEntities = [...entityIds].sort();
  const sortedFts = [...ftsIds].sort();
  const invalidFts = sortedEntities.length !== sortedFts.length || sortedEntities.some((id, index) => id !== sortedFts[index]);
  if (invalidEntity || invalidRelation || invalidRegion || invalidFts) {
    throw new CodeGraphError(
      "GRAPH_CORRUPTED",
      "Published graph contains orphaned semantic or search-index rows. Run codegraph rebuild.",
      3
    );
  }
}
var SqliteGraphStore = class {
  constructor(path, { readOnly = false } = {}) {
    try {
      for (const artifact of [path, `${path}-wal`, `${path}-shm`]) {
        try {
          const metadata2 = lstatSync(artifact);
          if (metadata2.isSymbolicLink() || !metadata2.isFile() || metadata2.nlink !== 1) {
            throw new CodeGraphError(
              "UNSAFE_ARTIFACT_PATH",
              `SQLite artifact must be a single-link regular non-symlink file: ${artifact}`,
              3
            );
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      this.path = path;
      this.db = new DatabaseSync(path, {
        readOnly,
        timeout: 5e3,
        enableForeignKeyConstraints: true,
        defensive: true
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
    const required = /* @__PURE__ */ new Set([
      "metadata",
      "revisions",
      "files",
      "regions",
      "entities",
      "relations",
      "aliases",
      "health",
      "entity_fts"
    ]);
    const present = new Set(this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type IN ('table', 'view')
    `).all().map((row) => row.name));
    const missing = [...required].filter((name2) => !present.has(name2));
    if (missing.length > 0) {
      throw new CodeGraphError(
        "GRAPH_CORRUPTED",
        `Graph schema is incomplete (${missing.join(", ")}). Run codegraph rebuild.`,
        3
      );
    }
    const schemaVersion = Number(this.getMetadata("schema_version"));
    const parserVersion = this.getMetadata("parser_version");
    const integrityVersion = this.getMetadata("integrity_version");
    if (schemaVersion !== SCHEMA_VERSION || parserVersion !== PARSER_VERSION || integrityVersion !== INTEGRITY_VERSION) {
      throw new CodeGraphError(
        "GRAPH_VERSION_MISMATCH",
        "Graph schema/parser/integrity version differs from this executable. Run codegraph rebuild.",
        3
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
      health: fromJson(row.health_json, {}, "revision health JSON")
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
      relations: []
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
          3
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
      semantic_revision: row.semantic_revision
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
        `source condition for ${row.stable_id}`
      ),
      risk_flags: fromJson(row.risk_flags_json, [], `risks for ${row.stable_id}`),
      candidates: fromJson(row.candidates_json, [], `candidates for ${row.stable_id}`),
      type_only: Boolean(row.type_only),
      semantic_revision: row.semantic_revision
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
      revision: row.revision
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
      const ftsIds = this.db.prepare("SELECT stable_id FROM entity_fts ORDER BY stable_id").all().map((row) => row.stable_id);
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
        regions
      };
      const healthRow = this.db.prepare("SELECT * FROM health WHERE revision = ?").get(revision.revision);
      const persistedHealth = healthRow ? fromJson(healthRow.metrics_json, {}, `health for revision ${revision.revision}`) : null;
      if (!healthRow || revision.status !== revision.health.status || healthRow.status !== revision.status || JSON.stringify(persistedHealth) !== JSON.stringify(revision.health)) {
        throw new CodeGraphError(
          "GRAPH_CORRUPTED",
          "Published revision status and health metadata are inconsistent. Run codegraph rebuild.",
          3
        );
      }
      const actualDigest = this.persistedGraphDigest(revision.revision);
      if (actualDigest !== revision.graph_digest) {
        throw new CodeGraphError(
          "GRAPH_CORRUPTED",
          "Persisted semantic rows do not match the published revision digest. Run codegraph rebuild.",
          3
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
      `).all()
    };
    return hashBytes(JSON.stringify(snapshot));
  }
  stagePublish(graph, {
    revision,
    sourceFingerprint: sourceFingerprint2,
    mode,
    semanticConfigHash
  }) {
    assertGraphReferences(
      graph.files,
      graph.entities,
      graph.relations,
      graph.regions,
      graph.entities.map((entity) => entity.stable_id)
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
        sourceFingerprint2,
        graph.health.status,
        mode,
        (/* @__PURE__ */ new Date()).toISOString(),
        json(graph.profile),
        json(graph.health),
        ""
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
          json(file.imports ?? {})
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
          revision
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
          entity.semantic_revision ?? revision
        );
        insertFts.run(
          entity.stable_id,
          entity.name,
          entity.qualified_name,
          entity.signature,
          entity.file_path,
          entity.semantic_tags.join(" "),
          entity.documentation
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
          relation.semantic_revision ?? revision
        );
      }
      this.db.prepare("INSERT INTO health(revision, status, metrics_json) VALUES(?, ?, ?)").run(
        revision,
        graph.health.status,
        json(graph.health)
      );
      this.setMetadata("schema_version", String(SCHEMA_VERSION));
      this.setMetadata("parser_version", PARSER_VERSION);
      this.setMetadata("integrity_version", INTEGRITY_VERSION);
      this.setMetadata("semantic_config_hash", semanticConfigHash);
      const graphDigest = this.persistedGraphDigest(revision);
      this.db.prepare("UPDATE revisions SET graph_digest = ? WHERE revision = ?").run(graphDigest, revision);
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
                  stack: error.stack
                }
              },
              error
            );
          }
          finished = true;
        },
        rollback: () => {
          if (finished) return;
          if (this.db.isTransaction) this.db.exec("ROLLBACK");
          finished = true;
        }
      };
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  searchEntities(terms, limit = 20) {
    const tokens2 = terms.flatMap((term) => term.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_]+/gu) ?? []).filter((token) => token.length > 1).slice(0, 12);
    if (tokens2.length === 0) {
      return this.db.prepare("SELECT * FROM entities ORDER BY qualified_name LIMIT ?").all(limit);
    }
    const expression = tokens2.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" OR ");
    try {
      return this.db.prepare(`
        SELECT e.*, bm25(entity_fts, 0, 8, 6, 3, 2, 2, 1) AS rank
        FROM entity_fts JOIN entities e USING(stable_id)
        WHERE entity_fts MATCH ?
        ORDER BY rank, e.qualified_name
        LIMIT ?
      `).all(expression, limit);
    } catch {
      const pattern = `%${tokens2[0]}%`;
      return this.db.prepare(`
        SELECT * FROM entities
        WHERE name LIKE ? OR qualified_name LIKE ? OR file_path LIKE ?
        ORDER BY qualified_name LIMIT ?
      `).all(pattern, pattern, pattern, limit);
    }
  }
  quickCheck() {
    const quick = this.db.prepare("PRAGMA quick_check").all();
    const foreignKeys = this.db.prepare("PRAGMA foreign_key_check").all();
    const schemaVersion = Number(this.getMetadata("schema_version"));
    const parserVersion = this.getMetadata("parser_version");
    const integrityVersion = this.getMetadata("integrity_version");
    const currentRevision = this.currentRevision();
    const revisionExists = currentRevision === 0 || Boolean(this.db.prepare("SELECT 1 AS ok FROM revisions WHERE revision = ?").get(currentRevision));
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
      ok: quick.every((row) => row.quick_check === "ok") && foreignKeys.length === 0 && schemaVersion === SCHEMA_VERSION && parserVersion === PARSER_VERSION && integrityVersion === INTEGRITY_VERSION && revisionExists && ftsReadable && semanticReadable,
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
      semantic_error: semanticError
    };
  }
  checkpoint() {
    return this.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  }
  async size() {
    try {
      return (await stat2(this.path)).size;
    } catch {
      return 0;
    }
  }
};

// src/sync.js
var inProcessSynchronizations = /* @__PURE__ */ new Map();
var MATERIAL_SCAN_DIAGNOSTICS = /* @__PURE__ */ new Set([
  "DIRECTORY_UNREADABLE",
  "PATH_UNREADABLE",
  "FILE_UNREADABLE",
  "PATH_CASE_COLLISION",
  "SYMLINK_SKIPPED",
  "NESTED_REPOSITORY_SKIPPED"
]);
function artifactPaths(root) {
  const directory = join3(root, CODEGRAPH_DIR);
  return {
    directory,
    db: join3(directory, DB_FILE),
    state: join3(directory, STATE_FILE),
    config: join3(directory, CONFIG_FILE),
    map: join3(root, MAP_FILE),
    publication: join3(directory, "publication.json"),
    publicationArtifacts: join3(directory, "publication-artifacts.json"),
    rebuild: join3(directory, "rebuild.json")
  };
}
async function pathExists(path) {
  try {
    await stat3(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return false;
    throw error;
  }
}
async function validateArtifactPaths(root, paths, { allowMissingDirectory = false } = {}) {
  let directoryMetadata;
  try {
    directoryMetadata = await lstat2(paths.directory);
  } catch (error) {
    if (error.code === "ENOENT" && allowMissingDirectory) return;
    throw error;
  }
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new CodeGraphError(
      "UNSAFE_ARTIFACT_PATH",
      ".codegraph must be a real project-local directory, not a symlink or another file type.",
      3
    );
  }
  const canonicalRoot = await realpath(root);
  const canonicalDirectory = await realpath(paths.directory);
  if (canonicalDirectory !== join3(canonicalRoot, CODEGRAPH_DIR)) {
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
    join3(paths.directory, "sync.lock")
  ];
  for (const path of artifactFiles) {
    try {
      const metadata2 = await lstat2(path);
      if (metadata2.isSymbolicLink() || !metadata2.isFile() || metadata2.nlink !== 1) {
        throw new CodeGraphError(
          "UNSAFE_ARTIFACT_PATH",
          `Derived artifact must be a single-link regular non-symlink file: ${path}`,
          3
        );
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
function syncFailure(code, operation, path, error) {
  return new CodeGraphError(
    code,
    `${operation} failed for ${path}: ${error.message}`,
    3,
    {
      operation,
      path,
      original: {
        name: error.name,
        message: error.message,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        path: error.path,
        stack: error.stack
      }
    },
    error
  );
}
async function syncPreparedFile(path) {
  const handle2 = await open2(path, "r");
  let failure;
  try {
    await handle2.sync();
  } catch (error) {
    failure = syncFailure("STORAGE_FILE_SYNC_FAILED", "PREPARED_FILE_SYNC", path, error);
  } finally {
    try {
      await handle2.close();
    } catch (error) {
      if (!failure) throw error;
    }
  }
  if (failure) throw failure;
}
function isUnsupportedDirectorySyncError(error, platform) {
  return ["EINVAL", "ENOTSUP", "EISDIR", "EPERM"].includes(error.code) || platform === "win32" && error.syscall === "fsync";
}
async function syncDirectoryBestEffort(path) {
  let handle2;
  try {
    handle2 = await open2(path, "r");
    await handle2.sync();
  } catch (error) {
    if (!isUnsupportedDirectorySyncError(error, process.platform)) {
      throw syncFailure("STORAGE_DIRECTORY_SYNC_FAILED", "DIRECTORY_SYNC", path, error);
    }
  } finally {
    await handle2?.close();
  }
}
async function writePrepared(path, value) {
  await writeFile2(path, value, { encoding: "utf8", flag: "wx" });
  await syncPreparedFile(path);
}
function configFingerprint(config) {
  return hashBytes(JSON.stringify(config));
}
function semanticConfigFingerprint(config) {
  return hashBytes(JSON.stringify({
    exclude: config.exclude ?? [],
    generated_file_size_limit: config.generated_file_size_limit,
    source_file_size_limit: config.source_file_size_limit
  }));
}
function canonicalDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    path: diagnostic.path ?? "",
    other_path: diagnostic.other_path ?? null,
    message: diagnostic.message ?? null
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
function diagnosticsMatch(left, right) {
  return JSON.stringify(canonicalDiagnostics(left)) === JSON.stringify(canonicalDiagnostics(right));
}
function materialDiagnosticPaths(diagnostics) {
  return uniqueSorted(diagnostics.filter((diagnostic) => MATERIAL_SCAN_DIAGNOSTICS.has(diagnostic.code)).map((diagnostic) => diagnostic.path || "."));
}
async function inspectArtifactFile(path) {
  try {
    const before = await lstat2(path);
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
      throw new CodeGraphError(
        "UNSAFE_ARTIFACT_PATH",
        `Artifact must be a single-link regular non-symlink file: ${path}`,
        3
      );
    }
    const bytes = await readFileNoFollow(path);
    const after = await lstat2(path);
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
    2
  );
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
  const confirmed = await lstat2(path);
  if (confirmed.dev !== expected.metadata.dev || confirmed.ino !== expected.metadata.ino) return false;
  await unlink(path);
  return true;
}
async function withProjectLock(root, operation) {
  const lockPath = join3(root, CODEGRAPH_DIR, "sync.lock");
  const deadline = Date.now() + 1e4;
  let handle2;
  let ownership;
  while (!handle2) {
    try {
      const token = randomUUID();
      handle2 = await open2(lockPath, "wx");
      const metadata2 = await handle2.stat();
      ownership = { metadata: metadata2, token };
      await handle2.writeFile(`${JSON.stringify({ pid: process.pid, created_at: Date.now(), token })}
`, "utf8");
    } catch (error) {
      if (error.code !== "EEXIST") {
        await handle2?.close().catch(() => {
        });
        if (ownership) await removeMatchingLock(lockPath, ownership).catch(() => {
        });
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
          stale = Date.now() - lock.createdAt > 6e4;
        }
        if (stale) await removeMatchingLock(lockPath, lock, { requireToken: Boolean(lock.token) });
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
  try {
    return await operation();
  } finally {
    await handle2.close();
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
  const confirmed = await lstat2(path);
  if (confirmed.dev !== inspected.metadata.dev || confirmed.ino !== inspected.metadata.ino) {
    throw new CodeGraphError("ARTIFACT_PATH_CONFLICT", `Recovery journal changed before removal: ${path}`, 3);
  }
  await unlink(path);
}
function sourceFingerprint(files, unsupportedFiles = []) {
  return hashBytes([...files, ...unsupportedFiles].map((file) => `${file.path}\0${file.content_hash ?? "UNREADABLE"}`).sort().join("\0"));
}
async function observeUnsupportedFiles(scan) {
  const observed = [];
  for (const file of scan.unsupportedFiles ?? []) {
    try {
      observed.push({
        path: file.path,
        classification: file.classification,
        content_hash: hashBytes(await readFileNoFollow(file.absolutePath))
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
    generated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function prepareMaterialization(paths, mapContent, state) {
  const nonce = `${process.pid}-${randomUUID()}`;
  const mapTemp = `${paths.map}.new-${nonce}`;
  const stateTemp = `${paths.state}.new-${nonce}`;
  const stateContent = `${JSON.stringify(state, null, 2)}
`;
  try {
    await writePrepared(mapTemp, mapContent);
    await writePrepared(stateTemp, stateContent);
    return {
      mapTemp,
      stateTemp,
      mapSha256: hashBytes(mapContent),
      stateSha256: hashBytes(stateContent)
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
      stateSha256: stateFile?.digest ?? null
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
      await removeIfPresent(temporary).catch(() => {
      });
      throw error;
    }
  };
  await install(
    prepared.mapTemp,
    paths.map,
    prepared.mapSha256,
    () => assertMapReplaceable(paths.map, [backup.mapSha256, prepared.mapSha256].filter(Boolean))
  );
  await install(prepared.stateTemp, paths.state, prepared.stateSha256);
  await syncDirectoryBestEffort(dirname3(paths.map));
  await syncDirectoryBestEffort(dirname3(paths.state));
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
    await removeIfPresent(temporary).catch(() => {
    });
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
      () => assertMapReplaceable(paths.map, allowedDigests)
    );
  } else {
    await assertMapReplaceable(paths.map, [prepared?.mapSha256].filter(Boolean));
    await removeIfPresent(paths.map);
  }
  if (backup.hadState) {
    await restoreBackupFile(backup.stateBackup, paths.state, backup.stateSha256);
  } else await removeIfPresent(paths.state);
  await syncDirectoryBestEffort(dirname3(paths.map));
  await syncDirectoryBestEffort(dirname3(paths.state));
}
async function removeRecordedArtifact(path, expectedDigest) {
  const inspected = await inspectArtifactFile(path);
  if (!inspected) return;
  if (!expectedDigest || inspected.digest !== expectedDigest) {
    throw new CodeGraphError(
      "ARTIFACT_PATH_CONFLICT",
      `Refusing to remove an unrecognized file at a journal artifact path: ${path}`,
      3
    );
  }
  const confirmed = await lstat2(path);
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
  return typeof candidate === "string" && dirname3(candidate) === dirname3(prefix) && candidate.startsWith(prefix);
}
async function writePublicationJournal(paths, publication) {
  const temporary = `${paths.publication}.new-${process.pid}-${randomUUID()}`;
  await writePrepared(temporary, `${JSON.stringify(publication, null, 2)}
`);
  await rename(temporary, paths.publication);
  await syncDirectoryBestEffort(paths.directory);
}
async function writePublicationArtifactRegistry(paths, prepared, backup) {
  const document = { prepared, backup };
  const content = `${JSON.stringify(document, null, 2)}
`;
  const temporary = `${paths.publicationArtifacts}.new-${process.pid}-${randomUUID()}`;
  await writePrepared(temporary, content);
  await rename(temporary, paths.publicationArtifacts);
  await syncDirectoryBestEffort(paths.directory);
  return hashBytes(content);
}
async function readPublicationArtifactRegistry(paths) {
  try {
    const bytes = await readFileNoFollow(paths.publicationArtifacts);
    return {
      document: JSON.parse(bytes.toString("utf8")),
      digest: hashBytes(bytes)
    };
  } catch (error) {
    throw new CodeGraphError("GRAPH_CORRUPTED", `Invalid publication artifact registry: ${error.message}`, 3);
  }
}
async function clearPublicationJournal(paths) {
  await removeIfPresent(paths.publication);
  await syncDirectoryBestEffort(paths.directory);
}
async function writeRebuildJournal(paths, rebuild) {
  const temporary = `${paths.rebuild}.new-${process.pid}-${randomUUID()}`;
  await writePrepared(temporary, `${JSON.stringify(rebuild, null, 2)}
`);
  await rename(temporary, paths.rebuild);
  await syncDirectoryBestEffort(paths.directory);
}
async function clearRebuildJournal(paths) {
  await removeIfPresent(paths.rebuild);
  await syncDirectoryBestEffort(paths.directory);
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
  const valid = Number.isSafeInteger(rebuild.previous_revision) && rebuild.previous_revision >= 0 && Array.isArray(rebuild.members) && rebuild.members.length === canonicalMembers.length && rebuild.members.every((member, index) => member.path === canonicalMembers[index] && safePublicationPath(member.backup, `${canonicalMembers[index]}.rebuild-backup-`) && typeof member.had_file === "boolean" && (member.had_file ? validDigest(member.digest) : member.digest === null));
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
  if (!(currentValid && (currentRevision > rebuild.previous_revision || currentRevision === rebuild.previous_revision && backupPresence.every((present) => !present)))) {
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
    await syncDirectoryBestEffort(paths.directory);
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
  const valid = Number.isSafeInteger(publication.revision) && publication.revision > 0 && digest(publication.graph_digest) && digest(publication.artifact_registry_digest) && publication.artifact_registry_digest === artifactRegistry.digest && JSON.stringify(publication.prepared) === JSON.stringify(artifactRegistry.document.prepared) && JSON.stringify(publication.backup) === JSON.stringify(artifactRegistry.document.backup) && safePublicationPath(publication.prepared?.mapTemp, `${paths.map}.new-`) && safePublicationPath(publication.prepared?.stateTemp, `${paths.state}.new-`) && digest(publication.prepared?.mapSha256) && digest(publication.prepared?.stateSha256) && safePublicationPath(publication.backup?.mapBackup, `${paths.map}.backup-`) && safePublicationPath(publication.backup?.stateBackup, `${paths.state}.backup-`) && typeof publication.backup?.hadMap === "boolean" && typeof publication.backup?.hadState === "boolean" && (publication.backup.hadMap ? digest(publication.backup.mapSha256) : publication.backup.mapSha256 === null) && (publication.backup.hadState ? digest(publication.backup.stateSha256) : publication.backup.stateSha256 === null);
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
    risk_flags: uniqueSorted([...entity.risk_flags ?? [], RISK.STALE_SOURCE])
  }));
  const relations = current.relations.map((relation) => ({
    ...relation,
    risk_flags: uniqueSorted([...relation.risk_flags ?? [], RISK.STALE_SOURCE])
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
    risk_flags: uniqueSorted([...current.risk_flags ?? [], ...staleRisks]),
    entities,
    relations
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
  const observedHashes = /* @__PURE__ */ new Map();
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
          parse_error: `File became unreadable during synchronization: ${error.message}`
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
        mtimeMs: scanned.mtimeMs
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
      parse_error: `Source could not be reconciled: ${diagnostic.message ?? diagnostic.code}`
    };
    parsedFiles.push(copyLastKnownGood(previous, failed, currentRevision));
    if (!previous.stale || previous.parse_error !== failed.parse_error) changedPaths.push(previous.path);
  }
  return {
    parsedFiles,
    changedPaths,
    deletedPaths,
    observedHashes,
    parseDurationMs: performance.now() - parseStart
  };
}
function addScanDiagnostics(graph, diagnostics) {
  graph.health.scan_diagnostics = diagnostics;
  const hasCollision = diagnostics.some((item) => item.code === "PATH_CASE_COLLISION");
  const hasUnreadable = diagnostics.some((item) => [
    "DIRECTORY_UNREADABLE",
    "PATH_UNREADABLE",
    "FILE_UNREADABLE"
  ].includes(item.code));
  const hasBoundary = diagnostics.some((item) => [
    "SYMLINK_SKIPPED",
    "NESTED_REPOSITORY_SKIPPED"
  ].includes(item.code));
  if (hasCollision || hasUnreadable || hasBoundary) {
    const risks = [
      ...graph.health.risk_flags ?? [],
      hasCollision ? RISK.AMBIGUOUS_SYMBOL : null,
      hasUnreadable || hasBoundary ? RISK.UNSUPPORTED_SEMANTICS : null,
      hasUnreadable ? RISK.STALE_SOURCE : null
    ];
    graph.health.stale_files = uniqueSorted([
      ...graph.health.stale_files ?? [],
      ...materialDiagnosticPaths(diagnostics)
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
      unsupportedFiles.some((file) => file.classification === "CONFIG") ? RISK.RUNTIME_REGISTRATION : RISK.CROSS_LANGUAGE_BOUNDARY
    ]);
    graph.health.impact_completeness = "INCOMPLETE";
  }
}
async function repositoryStillMatches(root, config, observedHashes, expectedDiagnostics) {
  const verification = await scanProject(root, config);
  const relevantFiles = [...verification.files, ...verification.unsupportedFiles ?? []];
  if (relevantFiles.length !== observedHashes.size) return false;
  for (const file of relevantFiles) {
    const expected = observedHashes.get(file.path);
    if (expected === void 0) return false;
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
    estimated_codegraph_tokens: expectedMap.tokens
  };
  if (state?.version !== VERSION || state.graph_revision !== snapshot.revision || state.graph_digest !== snapshot.graph_digest || state.source_fingerprint !== snapshot.source_fingerprint || state.semantic_config_hash !== snapshot.semantic_config_hash || state.graph_status !== snapshot.status || state.last_known_good_revision !== snapshot.last_known_good_revision || state.mode !== expectedMap.mode || JSON.stringify(state.profile) !== JSON.stringify(expectedProfile) || JSON.stringify(state.health) !== JSON.stringify(snapshot.health) || JSON.stringify(state.stale_files) !== JSON.stringify(snapshot.health.stale_files) || JSON.stringify(state.parse_failures) !== JSON.stringify(snapshot.health.parse_failures) || state.codegraph_tokens !== expectedMap.tokens || state.map_sha256 !== hashBytes(expectedMap.content) || state.projection_config_hash !== configFingerprint(config)) return false;
  try {
    const inspected = await inspectArtifactFile(paths.map);
    if (!inspected) return false;
    const map = inspected.bytes.toString("utf8");
    const tokens2 = estimateTokens(map);
    return inspected.digest === hashBytes(expectedMap.content) && map.includes(`GRAPH_REVISION = ${snapshot.revision}`) && map.slice(0, 1024).includes(MAP_OWNERSHIP_MARKER) && state.map_sha256 === inspected.digest && state.codegraph_tokens === tokens2 && tokens2 <= config.map_hard_cap_tokens;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function rematerialize(paths, snapshot, config) {
  const map = compileContextMap(snapshot, snapshot.revision, config);
  snapshot.profile.estimated_codegraph_tokens = map.tokens;
  const state = stateDocument(
    dirname3(paths.directory),
    snapshot,
    snapshot.revision,
    snapshot.source_fingerprint,
    snapshot.graph_digest,
    map,
    config,
    snapshot.semantic_config_hash
  );
  const prepared = await prepareMaterialization(paths, map.content, state);
  await replaceMaterializationSafely(paths, prepared);
  return map;
}
async function initializeProject(root) {
  const paths = artifactPaths(root);
  await validateArtifactPaths(root, paths, { allowMissingDirectory: true });
  if (await pathExists(paths.db)) {
    throw new CodeGraphError("PROJECT_ALREADY_INITIALIZED", "This project already has a graph. Use sync or rebuild.", 2);
  }
  if (await pathExists(paths.map)) {
    throw new CodeGraphError(
      "MAP_PATH_CONFLICT",
      "A user-owned root codegraph.py already exists; initialization will not overwrite source.",
      2
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
  if (!await pathExists(paths.directory)) {
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
    const semanticConfigChanged = currentRevision > 0 && previousSnapshot.semantic_config_hash !== semanticConfigHash;
    const scan = await scanProject(root, config);
    const unsupportedFiles = await observeUnsupportedFiles(scan);
    const build = await buildParsedFiles(
      scan,
      previousFiles,
      config,
      revisionBase,
      forceFull || semanticConfigChanged
    );
    for (const file of unsupportedFiles) build.observedHashes.set(file.path, file.content_hash);
    const previousUnsupported = previousSnapshot?.health.unsupported_files ?? [];
    const unsupportedChanged = JSON.stringify(unsupportedFiles) !== JSON.stringify(previousUnsupported);
    const diagnosticsChanged = !diagnosticsMatch(
      scan.diagnostics,
      previousSnapshot?.health.scan_diagnostics ?? []
    );
    const changed = forceFull || currentRevision === 0 || semanticConfigChanged || build.changedPaths.length > 0 || build.deletedPaths.length > 0 || unsupportedChanged || diagnosticsChanged;
    if (!changed) {
      const snapshot = previousSnapshot;
      if (!await materializationMatches(paths, snapshot, config)) {
        await rematerialize(paths, snapshot, config);
      }
      return {
        changed: false,
        revision: snapshot.revision,
        status: snapshot.status,
        changed_files: [],
        deleted_files: [],
        profile: snapshot.profile,
        health: snapshot.health
      };
    }
    const revision = revisionBase + 1;
    const graph = resolveGraph(build.parsedFiles, {
      parseDurationMs: build.parseDurationMs,
      syncDurationMs: performance.now() - started
    });
    const previousSemanticHashes = new Map(previousFiles.map((file) => [file.path, file.semantic_hash]));
    for (const file of graph.files) {
      if (previousSemanticHashes.get(file.path) === file.semantic_hash) continue;
      for (const entity of file.entities) entity.semantic_revision = revision;
      for (const relation of file.relations) relation.semantic_revision = revision;
    }
    addScanDiagnostics(graph, scan.diagnostics);
    addUnsupportedCoverage(graph, unsupportedFiles);
    if (!await repositoryStillMatches(root, config, build.observedHashes, scan.diagnostics) || configFingerprint(await readConfig(paths.config)) !== configFingerprint(config)) {
      throw new CodeGraphError(
        "REVISION_CONFLICT",
        "Repository changed while a semantic revision was being built; retrying is required.",
        3
      );
    }
    const fingerprint = sourceFingerprint(graph.files, unsupportedFiles);
    graph.last_known_good_revision = graph.health.status === GRAPH_STATUS.FRESH ? revision : store.latestFreshRevision();
    const map = compileContextMap(graph, revision, config);
    graph.profile.estimated_codegraph_tokens = map.tokens;
    graph.profile.sync_latency_ms = performance.now() - started;
    backup = await backupMaterialization(paths);
    publication = store.stagePublish(graph, {
      revision,
      sourceFingerprint: fingerprint,
      mode: map.mode,
      semanticConfigHash
    });
    const state = stateDocument(
      root,
      graph,
      revision,
      fingerprint,
      publication.graphDigest,
      map,
      config,
      semanticConfigHash
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
        backup
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
      if (error.code === "STORAGE_SQLITE_COMMIT_FAILED") throw error;
      throw new CodeGraphError(
        "MATERIALIZATION_FAILED",
        databaseCommitted ? `Revision ${revision} graph data committed but projection publication is pending recovery: ${error.message}` : `Revision ${revision} was rolled back because generated files could not be published: ${error.message}`,
        3,
        { operation: "PUBLICATION_INSTALL", revision },
        error
      );
    }
    try {
      await discardPrepared(prepared);
      prepared = null;
      await discardBackup(backup);
      backup = null;
      await clearPublicationJournal(paths);
      await removeKnownJournal(paths.publicationArtifacts);
    } catch {
    }
    try {
      store.checkpoint();
    } catch {
    }
    return {
      changed: true,
      revision,
      status: graph.health.status,
      changed_files: build.changedPaths,
      deleted_files: build.deletedPaths,
      profile: graph.profile,
      health: graph.health
    };
  } finally {
    publication?.rollback();
    store.close();
    const journalPresent = await pathExists(paths.publication).catch(() => true);
    if (backup && !journalPresent) await discardBackup(backup);
    if (prepared && !journalPresent) {
      await Promise.allSettled([
        removeIfPresent(prepared.mapTemp),
        removeIfPresent(prepared.stateTemp)
      ]);
    }
  }
}
function synchronizeProject(root, options = {}) {
  const key = root;
  if (inProcessSynchronizations.has(key)) return inProcessSynchronizations.get(key);
  const operation = (async () => {
    const paths = artifactPaths(root);
    if (!await pathExists(paths.directory)) {
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
  operation.finally(() => inProcessSynchronizations.delete(key)).catch(() => {
  });
  return operation;
}
async function projectStatus(root) {
  const paths = artifactPaths(root);
  if (!await pathExists(paths.db)) {
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
      (snapshot.health.unsupported_files ?? []).map((file) => [file.path, file.content_hash])
    );
    for (const file of unsupportedFiles) {
      if (previousUnsupported.get(file.path) !== file.content_hash) staleFiles.push(file.path);
      previousUnsupported.delete(file.path);
    }
    staleFiles.push(...previousUnsupported.keys());
    const diagnosticsCurrent = diagnosticsMatch(
      scan.diagnostics,
      snapshot.health.scan_diagnostics ?? []
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
      stale_files: uniqueSorted([...staleFiles, ...snapshot.health.stale_files ?? []]),
      health: snapshot.health,
      profile: { ...snapshot.profile, graph_db_size: await store.size() },
      scan_diagnostics: scan.diagnostics
    };
  } finally {
    store.close();
  }
}
async function rebuildProject(root) {
  const paths = artifactPaths(root);
  if (!await pathExists(paths.directory)) {
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
          if (Number.isSafeInteger(candidateRevision) && candidateRevision > 0 && candidateRevision < Number.MAX_SAFE_INTEGER && state?.graph_revision === candidateRevision && state.map_sha256 === map?.digest && map?.bytes.subarray(0, 1024).toString("utf8").includes(MAP_OWNERSHIP_MARKER)) {
            revisionFloor = candidateRevision;
          }
          existing.snapshot();
          existing.checkpoint();
        } catch {
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
          digest: inspected?.digest ?? null
        });
      }
      await writeRebuildJournal(paths, {
        previous_revision: revisionFloor,
        members: journalMembers
      });
      for (let index = 0; index < members.length; index += 1) {
        if (await pathExists(members[index])) await rename(members[index], backups[index]);
      }
      await syncDirectoryBestEffort(paths.directory);
      const result = await synchronizeOnce(root, {
        forceFull: true,
        revisionFloor,
        skipRebuildRecovery: true
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

// src/doctor.js
async function diagnoseProject(root) {
  const paths = artifactPaths(root);
  let store;
  try {
    for (const journal of [paths.publication, paths.publicationArtifacts, paths.rebuild]) {
      try {
        await readFileNoFollow(journal);
        return {
          ok: false,
          graph_status: "STALE",
          error: { code: "RECOVERY_PENDING", message: `Derived-state recovery is pending: ${journal}` },
          recovery: "Run codegraph sync, or codegraph rebuild if the recovery journal is invalid."
        };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    store = new SqliteGraphStore(paths.db, { readOnly: true });
    const integrity = store.quickCheck();
    let state = null;
    let mapRevision = null;
    try {
      state = JSON.parse((await readFileNoFollow(paths.state)).toString("utf8"));
    } catch {
    }
    try {
      const map = (await readFileNoFollow(paths.map)).toString("utf8");
      mapRevision = Number(map.match(/^GRAPH_REVISION = (\d+)$/mu)?.[1] ?? NaN);
    } catch {
    }
    const freshness = integrity.ok ? await projectStatus(root) : null;
    const materializationConsistent = state?.graph_revision === integrity.current_revision && mapRevision === integrity.current_revision && freshness?.materialized === true;
    const graphStatus = integrity.ok ? materializationConsistent ? freshness.graph_status : "STALE" : "BROKEN";
    return {
      ok: integrity.ok && materializationConsistent && graphStatus === "FRESH",
      graph_status: graphStatus,
      integrity,
      state_revision: state?.graph_revision ?? null,
      map_revision: Number.isNaN(mapRevision) ? null : mapRevision,
      materialization_consistent: materializationConsistent,
      freshness,
      recovery: integrity.ok ? graphStatus === "FRESH" ? null : "Run codegraph sync; inspect any stale/parse-failed source reported by status." : "Run codegraph rebuild; source files are not modified by recovery."
    };
  } catch (error) {
    return {
      ok: false,
      graph_status: "BROKEN",
      error: { code: error.code ?? "GRAPH_CORRUPTED", message: error.message },
      recovery: "Run codegraph rebuild; source files are not modified by recovery."
    };
  } finally {
    store?.close();
  }
}

// src/instructions.js
var AGENT_INSTRUCTIONS = `For code-related tasks:

1. Use codegraph.py as the repository routing map.
2. Do not recursively scan the repository to rediscover architecture already represented by CodeGraph.
3. Use semantic MCP only when the routing map is insufficient, ambiguous, stale, low-confidence, or graph-wide relationships are required.
4. Read original source before modifying implementation.
5. Source code is authoritative when it conflicts with generated semantic information.
6. Follow YAGNI: do not add speculative abstractions, dependencies, configuration, compatibility layers, or unrelated refactors.
7. Expand context only when current context is insufficient.
8. Prefer the smallest correct change that fully satisfies the task.
`;

// src/mcp.js
import { watch } from "node:fs";

// src/query.js
import { randomUUID as randomUUID2 } from "node:crypto";
var BROAD_QUERY = /\b(show|list|return|dump|describe)\b.{0,20}\b(entire|whole|all)\b.{0,20}\b(repository|codebase|graph|symbols?)\b/iu;
var IMPACT_QUERY = /\b(impact|change|breaks?|signature|contract|endpoint|callers?|references?|invokes?|visibility|private|public|rename|remove|delete|drop|retire|replace|deprecat(?:e|ion)|alter|modify|schema|migration|public api|shared type|dependency|cross[- ]service|authentication|authorization|route removal|build|deployment)\b/iu;
function tokens(value) {
  return (value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_]+/gu) ?? []).filter((token) => token.length > 1);
}
function pathDescriptor(path) {
  return {
    basename: path.split("/").at(-1),
    path_sha256: hashBytes(path),
    path_truncated: true
  };
}
function entityView(entity) {
  return {
    stable_id: entity.stable_id,
    kind: entity.kind,
    name: entity.name,
    qualified_name: entity.qualified_name,
    signature: entity.signature,
    inputs: entity.inputs,
    outputs: entity.outputs,
    effects: entity.effects,
    confidence: entity.confidence,
    classification: entity.classification,
    semantic_tags: entity.semantic_tags,
    risk_flags: entity.risk_flags,
    source_location: entity.source_location
  };
}
function relationView(relation, entityById) {
  return {
    kind: relation.kind,
    source: entityById.get(relation.src_entity_id)?.qualified_name ?? relation.src_entity_id,
    target: entityById.get(relation.dst_entity_id)?.qualified_name ?? relation.unresolved_target,
    confidence: relation.confidence,
    condition: relation.condition,
    risk_flags: relation.risk_flags,
    candidates: relation.candidates.map((candidate) => entityById.get(candidate)?.qualified_name ?? candidate),
    source_location: relation.source_location
  };
}
function scoreEntity(entity, queryTokens, focus, knownSymbols, ftsOrder) {
  const haystack = [
    entity.name,
    entity.qualified_name,
    entity.file_path,
    entity.signature,
    ...entity.semantic_tags
  ].join(" ").toLocaleLowerCase("en-US");
  let score = Math.max(0, 100 - (ftsOrder.get(entity.stable_id) ?? 100));
  for (const token of queryTokens) {
    if (entity.name.toLocaleLowerCase("en-US") === token) score += 80;
    else if (haystack.includes(token)) score += 15;
  }
  if (focus) {
    const normalizedFocus = focus.toLocaleLowerCase("en-US");
    if (entity.name.toLocaleLowerCase("en-US") === normalizedFocus || entity.qualified_name.toLocaleLowerCase("en-US") === normalizedFocus || normalizedFocus.length > 1 && haystack.includes(normalizedFocus)) {
      score += 100;
    }
  }
  for (const symbol of knownSymbols) {
    const known = symbol.toLocaleLowerCase("en-US");
    if (entity.qualified_name.toLocaleLowerCase("en-US") === known || entity.name.toLocaleLowerCase("en-US") === known) score += 150;
    else if (known.length > 1 && haystack.includes(known)) score += 60;
  }
  if (entity.semantic_tags.some((tag) => tag.startsWith("entry_point:"))) score += 20;
  if (entity.classification === "GENERATED") score -= 60;
  return score;
}
function selectedRegions(snapshot, selectedEntities) {
  const selectedIds = new Set(selectedEntities.map((entity) => entity.region_id));
  return snapshot.regions.filter((region) => region.stable_id === "region:repository" || selectedIds.has(region.stable_id)).map((region) => ({
    id: region.stable_id,
    name: region.name,
    kind: region.kind,
    path: region.path,
    confidence: region.confidence,
    risk_flags: region.risk_flags
  }));
}
function staleProvenance(snapshot) {
  const stalePaths = new Set(snapshot.health.stale_files ?? []);
  return snapshot.files.filter((file) => file.stale || stalePaths.has(file.path)).map((file) => {
    const sourceLocation2 = file.entities?.find((entity) => entity.source_location)?.source_location ?? { file_path: file.path, start_line: 1 };
    return {
      file_path: file.path,
      last_good_revision: file.last_good_revision,
      source_location: sourceLocation2
    };
  });
}
function unsupportedPaths(snapshot) {
  return uniqueSorted((snapshot.health.unsupported_files ?? []).map((file) => file.path));
}
function safetyFor(snapshot, risks, impact, uncertainRelations) {
  const states = [];
  if (snapshot.status === "PARTIAL") states.push(SAFETY_STATE.GRAPH_PARTIAL);
  if (snapshot.status === "STALE") states.push(SAFETY_STATE.GRAPH_STALE);
  if (snapshot.status !== "FRESH") states.push(SAFETY_STATE.SOURCE_INSPECTION_REQUIRED);
  const incomplete = risks.some((risk) => INCOMPLETE_RISKS.has(risk)) || uncertainRelations.length > 0 || snapshot.health.impact_completeness === "INCOMPLETE";
  if (impact) states.push(SAFETY_STATE.IMPACT_INCOMPLETE);
  if (incomplete) states.push(SAFETY_STATE.SOURCE_INSPECTION_REQUIRED);
  if (impact) states.push(SAFETY_STATE.SOURCE_INSPECTION_REQUIRED);
  if (states.length === 0) states.push(SAFETY_STATE.NAVIGATION_SAFE);
  return uniqueSorted(states);
}
function measureResponse(response) {
  response.response_bytes = 0;
  response.response_tokens = 0;
  while (true) {
    const serialized = JSON.stringify(response);
    const bytes = utf8Bytes(serialized);
    const tokens_ = estimateTokens(serialized);
    if (response.response_bytes === bytes && response.response_tokens === tokens_) return bytes;
    response.response_bytes = bytes;
    response.response_tokens = tokens_;
  }
}
function trimToBudget(response, budget, impact = false) {
  const byteLimit = budgetByteLimit(budget);
  const mandatoryStale = response.graph_status === "PARTIAL" || response.graph_status === "STALE" ? {
    last_known_good_revision: response.last_known_good_revision,
    stale_file_count: response.stale_file_count,
    stale_files: (response.stale_files ?? []).slice(0, 1),
    stale_provenance: (response.stale_provenance ?? []).slice(0, 1).map((item) => ({
      file_path: item.file_path,
      last_good_revision: item.last_good_revision,
      source_location: item.source_location ? { start_line: item.source_location.start_line } : null
    }))
  } : null;
  const mandatoryImpact = impact ? {
    unsupported_file_count: response.unsupported_file_count ?? 0,
    unsupported_files: (response.unsupported_files ?? []).slice(0, 1),
    completeness: {
      scope: "direct static relations",
      returned_results: "BUDGET_TRUNCATED",
      impact: "INCOMPLETE",
      relation_scope: "DIRECT_STATIC"
    }
  } : null;
  measureResponse(response);
  while (response.response_bytes > byteLimit) {
    if (response.relations.length > 0) response.relations.pop();
    else if (response.entities.length > 1) response.entities.pop();
    else if (response.regions.length > 1) response.regions.pop();
    else if (response.suggestions?.length > 0) response.suggestions.pop();
    else if (response.unsupported_files?.length > (impact && response.unsupported_file_count > 0 ? 1 : 0)) {
      response.unsupported_files.pop();
    } else if (response.unresolved_areas?.length > 0) response.unresolved_areas.pop();
    else if (response.stale_provenance?.length > (mandatoryStale ? 1 : 0)) response.stale_provenance.pop();
    else if (response.source_locations?.length > (mandatoryStale ? 1 : 0)) response.source_locations.pop();
    else if (response.stale_files?.length > (mandatoryStale ? 1 : 0)) response.stale_files.pop();
    else break;
    response.truncated = true;
    response.completeness.returned_results = "BUDGET_TRUNCATED";
    if (impact) {
      response.completeness.impact = "INCOMPLETE";
      response.safety_states = uniqueSorted([
        ...response.safety_states,
        SAFETY_STATE.IMPACT_INCOMPLETE,
        SAFETY_STATE.SOURCE_INSPECTION_REQUIRED
      ]);
      response.safety_state = response.safety_states[0];
    }
    measureResponse(response);
  }
  if (response.response_bytes > byteLimit) {
    const safetyStates = uniqueSorted([
      ...impact ? [SAFETY_STATE.IMPACT_INCOMPLETE] : [],
      ...response.graph_status === "PARTIAL" ? [SAFETY_STATE.GRAPH_PARTIAL] : [],
      ...response.graph_status === "STALE" ? [SAFETY_STATE.GRAPH_STALE] : [],
      SAFETY_STATE.SOURCE_INSPECTION_REQUIRED
    ]);
    const minimal = {
      context_id: response.context_id,
      graph_revision: response.graph_revision,
      graph_status: response.graph_status,
      safety_state: safetyStates[0],
      safety_states: safetyStates,
      truncated: true,
      notice: "Omission is not absence; inspect source.",
      ...mandatoryStale ?? {},
      ...mandatoryImpact ?? {},
      response_bytes: 0,
      response_tokens: 0
    };
    measureResponse(minimal);
    if (minimal.response_bytes > byteLimit) {
      delete minimal.context_id;
      measureResponse(minimal);
    }
    const stalePath = minimal.stale_files?.[0];
    if (minimal.response_bytes > byteLimit && stalePath) {
      minimal.stale_path = pathDescriptor(stalePath);
      minimal.stale_files = [];
      minimal.stale_provenance = (minimal.stale_provenance ?? []).map((item) => ({
        last_good_revision: item.last_good_revision,
        source_location: item.source_location
      }));
      measureResponse(minimal);
    }
    const unsupportedPath = minimal.unsupported_files?.[0];
    if (minimal.response_bytes > byteLimit && unsupportedPath) {
      minimal.unsupported_path = pathDescriptor(unsupportedPath);
      minimal.unsupported_files = [];
      measureResponse(minimal);
    }
    if (minimal.response_bytes > byteLimit && minimal.stale_path) {
      delete minimal.stale_path.basename;
      measureResponse(minimal);
    }
    if (minimal.response_bytes > byteLimit && minimal.unsupported_path) {
      delete minimal.unsupported_path.basename;
      measureResponse(minimal);
    }
    if (minimal.response_bytes > byteLimit) {
      delete minimal.notice;
      measureResponse(minimal);
    }
    const compactSource = mandatoryStale?.stale_provenance?.[0];
    if (compactSource?.source_location) {
      minimal.source_locations = [{
        file_path: compactSource.file_path,
        start_line: compactSource.source_location.start_line
      }];
      measureResponse(minimal);
      if (minimal.response_bytes > byteLimit) {
        delete minimal.source_locations;
        measureResponse(minimal);
      }
    }
    if (minimal.response_bytes > byteLimit) {
      throw Object.assign(new Error("The requested budget cannot hold mandatory safety metadata"), {
        code: "QUERY_BUDGET_TOO_SMALL"
      });
    }
    return minimal;
  }
  return response;
}
function semanticUnit(prefix, value) {
  return `${prefix}:${hashBytes(JSON.stringify(value)).slice(0, 20)}`;
}
function rememberContext(contexts, contextId, response, previous) {
  const units = /* @__PURE__ */ new Set([
    ...(response.entities ?? []).map((entity) => semanticUnit("entity", entity)),
    ...(response.relations ?? []).map((relation) => semanticUnit("relation", relation))
  ]);
  if (previous?.graph_revision === response.graph_revision) {
    for (const unit of previous.units) units.add(unit);
  }
  contexts.delete(contextId);
  contexts.set(contextId, { graph_revision: response.graph_revision, units });
  while (contexts.size > 100) contexts.delete(contexts.keys().next().value);
}
function applyDelta(response, previous) {
  if (!previous || previous.graph_revision !== response.graph_revision) return response;
  response.entities = response.entities.filter((entity) => !previous.units.has(semanticUnit("entity", entity)));
  response.relations = response.relations.filter((relation) => !previous.units.has(semanticUnit("relation", relation)));
  response.delta = true;
  return response;
}
async function semanticExplore(root, request, contexts = /* @__PURE__ */ new Map()) {
  if (!request || typeof request.task !== "string" || request.task.trim() === "") {
    throw Object.assign(new Error("task must be a non-empty string"), { code: "INVALID_QUERY" });
  }
  if ([...request.task].length > 4096 || request.focus !== void 0 && (typeof request.focus !== "string" || [...request.focus].length > 512) || request.context_id !== void 0 && (typeof request.context_id !== "string" || [...request.context_id].length > 128)) {
    throw Object.assign(new Error("query text or context_id exceeds the supported bound"), { code: "INVALID_QUERY" });
  }
  await synchronizeProject(root);
  const paths = artifactPaths(root);
  const config = await readConfig(paths.config);
  const requestedBudget = request.budget ?? config.mcp_default_budget;
  if (!Number.isSafeInteger(requestedBudget) || requestedBudget < MIN_MCP_BUDGET) {
    throw Object.assign(new Error(`budget must be an integer of at least ${MIN_MCP_BUDGET} budget units`), { code: "QUERY_BUDGET_TOO_SMALL" });
  }
  const budget = Math.min(requestedBudget, config.mcp_hard_cap);
  const store = new SqliteGraphStore(paths.db, { readOnly: true });
  try {
    const snapshot = store.snapshot();
    const broad = BROAD_QUERY.test(request.task) && !request.focus && !(request.known_symbols?.length > 0);
    const impact = IMPACT_QUERY.test(request.task);
    const contextId = typeof request.context_id === "string" ? request.context_id : randomUUID2();
    const previous = contexts.get(request.context_id);
    const staleDetails = staleProvenance(snapshot);
    const sourceLocations = staleDetails.map((item) => item.source_location);
    const allUnsupportedPaths = unsupportedPaths(snapshot);
    const unsupportedFileCount = snapshot.health.unsupported_file_count ?? allUnsupportedPaths.length;
    const boundedUnsupportedPaths = impact ? allUnsupportedPaths.slice(0, 10) : [];
    if (broad) {
      const risks2 = snapshot.health.risk_flags ?? [];
      const safetyStates2 = safetyFor(snapshot, risks2, impact, []);
      let response2 = {
        context_id: contextId,
        graph_revision: snapshot.revision,
        graph_status: snapshot.status,
        last_known_good_revision: snapshot.last_known_good_revision,
        safety_state: safetyStates2[0],
        safety_states: safetyStates2,
        broad_query: true,
        regions: snapshot.regions.filter((region) => region.stable_id !== "region:repository").map((region) => ({ name: region.name, kind: region.kind, path: region.path })),
        entities: [],
        relations: [],
        completeness: {
          scope: "routing regions only",
          returned_results: "INTENTIONALLY_PARTIAL",
          impact: impact ? "INCOMPLETE" : "NOT_EVALUATED",
          relation_scope: impact ? "ROUTING_ONLY" : "NOT_EVALUATED"
        },
        unresolved_areas: risks2,
        stale_file_count: snapshot.health.stale_files?.length ?? 0,
        stale_files: snapshot.health.stale_files ?? [],
        stale_provenance: staleDetails,
        source_locations: sourceLocations,
        unsupported_file_count: impact ? unsupportedFileCount : 0,
        unsupported_files: boundedUnsupportedPaths,
        truncated: true,
        notice: "Omission is not absence. Refine focus or inspect source when completeness matters.",
        suggestions: ["Provide focus", "Provide known_symbols", "Ask about one flow or symbol"]
      };
      response2 = trimToBudget(response2, budget, impact);
      rememberContext(contexts, contextId, response2, previous);
      return response2;
    }
    const knownSymbols = Array.isArray(request.known_symbols) ? request.known_symbols.filter((value) => typeof value === "string" && [...value].length <= 256).slice(0, 20) : [];
    const queryTokens = tokens(request.task);
    const fts = store.searchEntities([request.task, request.focus ?? "", ...knownSymbols], 100);
    const ftsOrder = new Map(fts.map((row, index) => [row.stable_id, index]));
    const selectedEntities = [...snapshot.entities].map((entity) => ({
      entity,
      score: scoreEntity(entity, queryTokens, request.focus, knownSymbols, ftsOrder)
    })).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score || left.entity.qualified_name.localeCompare(right.entity.qualified_name)).slice(0, impact ? 40 : 20).map(({ entity }) => entity);
    if (selectedEntities.length === 0) {
      selectedEntities.push(...snapshot.entities.filter((entity) => entity.kind !== "module").slice(0, 5));
    }
    const selectedIds = new Set(selectedEntities.map((entity) => entity.stable_id));
    const selectedNames = new Set(selectedEntities.map((entity) => entity.name));
    const allRelevantRelations = snapshot.relations.filter((relation) => selectedIds.has(relation.src_entity_id) || selectedIds.has(relation.dst_entity_id) || impact && selectedNames.has(relation.unresolved_target?.split(".").at(-1)));
    const relationLimit = impact ? 120 : 80;
    const relevantRelations = allRelevantRelations.slice(0, relationLimit);
    const relationCandidatesTruncated = allRelevantRelations.length > relevantRelations.length;
    for (const relation of relevantRelations) {
      if (relation.src_entity_id) selectedIds.add(relation.src_entity_id);
      if (relation.dst_entity_id) selectedIds.add(relation.dst_entity_id);
    }
    const expandedEntities = snapshot.entities.filter((entity) => selectedIds.has(entity.stable_id)).sort((left, right) => {
      const selectedLeft = selectedEntities.includes(left) ? 0 : 1;
      const selectedRight = selectedEntities.includes(right) ? 0 : 1;
      return selectedLeft - selectedRight || left.qualified_name.localeCompare(right.qualified_name);
    }).slice(0, impact ? 60 : 30);
    const entityById = new Map(snapshot.entities.map((entity) => [entity.stable_id, entity]));
    const unresolved = relevantRelations.filter((relation) => !relation.dst_entity_id);
    const uncertain = relevantRelations.filter((relation) => !relation.dst_entity_id || ["LOW", "UNKNOWN"].includes(relation.confidence));
    const selectedNameCounts = /* @__PURE__ */ new Map();
    for (const entity of expandedEntities) {
      selectedNameCounts.set(entity.name, (selectedNameCounts.get(entity.name) ?? 0) + 1);
    }
    const ambiguousShortName = [...selectedNameCounts.values()].some((count) => count > 1);
    const risks = uniqueSorted([
      ...snapshot.health.risk_flags,
      ...expandedEntities.flatMap((entity) => entity.risk_flags),
      ...relevantRelations.flatMap((relation) => relation.risk_flags),
      ambiguousShortName ? "AMBIGUOUS_SYMBOL" : null
    ]);
    const safetyStates = safetyFor(snapshot, risks, impact, uncertain);
    let response = {
      context_id: contextId,
      graph_revision: snapshot.revision,
      graph_status: snapshot.status,
      last_known_good_revision: snapshot.last_known_good_revision,
      safety_state: safetyStates[0],
      safety_states: safetyStates,
      regions: selectedRegions(snapshot, expandedEntities),
      entities: expandedEntities.map(entityView),
      relations: relevantRelations.map((relation) => relationView(relation, entityById)),
      completeness: {
        scope: impact ? "direct indexed static relations at the reported graph revision" : "indexed static semantics at the reported graph revision",
        returned_results: "BUDGETED",
        impact: impact && safetyStates.includes(SAFETY_STATE.IMPACT_INCOMPLETE) ? "INCOMPLETE" : impact ? "DIRECT_STATIC" : "NOT_EVALUATED",
        relation_scope: impact ? "DIRECT_STATIC" : "NOT_EVALUATED",
        known_unresolved_relations: unresolved.length,
        relevant_relation_count: allRelevantRelations.length,
        returned_relation_count: relevantRelations.length
      },
      unresolved_areas: risks,
      stale_file_count: snapshot.health.stale_files?.length ?? 0,
      stale_files: snapshot.health.stale_files ?? [],
      stale_provenance: staleDetails,
      source_locations: sourceLocations,
      unsupported_file_count: impact ? unsupportedFileCount : 0,
      unsupported_files: boundedUnsupportedPaths,
      truncated: relationCandidatesTruncated,
      delta: false,
      notice: "Omission is not absence. Source code is authoritative before implementation changes.",
      suggestions: []
    };
    if (impact) {
      response.suggestions.push("Inspect source, configuration, and tests before a destructive edit");
    }
    if (relationCandidatesTruncated) {
      response.completeness.returned_results = "CANDIDATE_LIMIT";
      response.suggestions.push("Narrow focus to retrieve omitted direct relations");
    }
    applyDelta(response, previous);
    response = trimToBudget(response, budget, impact);
    rememberContext(contexts, contextId, response, previous);
    return response;
  } finally {
    store.close();
  }
}

// src/mcp.js
var MCP_PROTOCOL_VERSION = "2025-06-18";
var MAX_INPUT_FRAME_BYTES = 64 * 1024;
var TOOL_ARGUMENT_KEYS = /* @__PURE__ */ new Set(["task", "focus", "known_symbols", "context_id", "budget"]);
function errorResponse(id, code, message, data = void 0) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...data === void 0 ? {} : { data } }
  };
}
var InputFramer = class {
  constructor(onMessage) {
    this.buffer = Buffer.alloc(0);
    this.discardingOversizedFrame = false;
    this.onMessage = onMessage;
  }
  push(chunk) {
    if (this.discardingOversizedFrame) {
      const newline = chunk.indexOf(10);
      if (newline < 0) return;
      chunk = chunk.subarray(newline + 1);
      this.discardingOversizedFrame = false;
    }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length > 0) {
      const newline = this.buffer.indexOf(10);
      if (newline < 0) {
        if (this.buffer.length > MAX_INPUT_FRAME_BYTES) {
          this.buffer = Buffer.alloc(0);
          this.discardingOversizedFrame = true;
          const error = Object.assign(new Error("MCP input frame exceeds 65536 bytes"), {
            code: "MCP_FRAME_TOO_LARGE"
          });
          this.onMessage(null, error);
        }
        return;
      }
      if (newline > MAX_INPUT_FRAME_BYTES) {
        this.buffer = this.buffer.subarray(newline + 1);
        const error = Object.assign(new Error("MCP input frame exceeds 65536 bytes"), {
          code: "MCP_FRAME_TOO_LARGE"
        });
        this.onMessage(null, error);
        continue;
      }
      const frame = this.buffer.subarray(0, newline);
      this.buffer = this.buffer.subarray(newline + 1);
      if (frame.length > 0) {
        try {
          const line = new TextDecoder("utf-8", { fatal: true }).decode(frame).trim();
          if (line) this.parse(line);
        } catch (error) {
          error.code = "MCP_INVALID_UTF8";
          this.onMessage(null, error);
        }
      }
    }
  }
  parse(value) {
    try {
      this.onMessage(JSON.parse(value), null);
    } catch (error) {
      this.onMessage(null, error);
    }
  }
};
function writeMessage(message) {
  const body2 = JSON.stringify(message);
  process.stdout.write(`${body2}
`);
}
function wireBytes(id, result) {
  return utf8Bytes(`${JSON.stringify({ jsonrpc: "2.0", id, result })}
`);
}
function pathDescriptor2(path) {
  return {
    basename: path.split("/").at(-1),
    path_sha256: hashBytes(path),
    path_truncated: true
  };
}
function fullToolResult(explored) {
  return {
    content: [{ type: "text", text: "Semantic result is in structuredContent." }],
    structuredContent: explored,
    isError: false
  };
}
function boundedToolResult(id, explored, budget) {
  const byteLimit = budgetByteLimit(budget);
  const full = fullToolResult(explored);
  if (wireBytes(id, full) <= byteLimit) return full;
  const stale = explored.stale_provenance?.find((item) => item.file_path);
  const stalePath = stale?.file_path ?? explored.stale_files?.[0];
  const unsupportedPath = explored.unsupported_files?.[0];
  const compact = {
    content: [],
    structuredContent: {
      context_id: explored.context_id,
      graph_revision: explored.graph_revision,
      graph_status: explored.graph_status,
      last_known_good_revision: explored.last_known_good_revision ?? null,
      safety_states: (explored.safety_states ?? [explored.safety_state]).filter(Boolean),
      truncated: true,
      stale_file_count: explored.stale_file_count ?? explored.stale_files?.length ?? 0,
      stale_files: stalePath ? [stalePath] : [],
      stale_provenance: stale ? [{
        file_path: stale.file_path,
        last_good_revision: stale.last_good_revision,
        source_location: stale.source_location ? { start_line: stale.source_location.start_line } : null
      }] : [],
      ...explored.stale_path ? { stale_path: explored.stale_path } : {},
      unsupported_file_count: explored.unsupported_file_count ?? 0,
      unsupported_files: unsupportedPath ? [unsupportedPath] : [],
      ...explored.unsupported_path ? { unsupported_path: explored.unsupported_path } : {},
      impact: explored.completeness?.impact ?? "NOT_EVALUATED",
      relation_scope: explored.completeness?.relation_scope ?? "NOT_EVALUATED",
      notice: "Omission is not absence; inspect source."
    },
    isError: false
  };
  if (wireBytes(id, compact) > byteLimit) delete compact.structuredContent.context_id;
  if (wireBytes(id, compact) > byteLimit && stale) {
    compact.structuredContent.stale_provenance = [{
      file_path: stale.file_path,
      last_good_revision: stale.last_good_revision
    }];
  }
  if (wireBytes(id, compact) > byteLimit && stalePath) {
    compact.structuredContent.stale_path = pathDescriptor2(stalePath);
    compact.structuredContent.stale_files = [];
    compact.structuredContent.stale_provenance = [];
  }
  if (wireBytes(id, compact) > byteLimit && unsupportedPath) {
    compact.structuredContent.unsupported_path = pathDescriptor2(unsupportedPath);
    compact.structuredContent.unsupported_files = [];
  }
  if (wireBytes(id, compact) > byteLimit && compact.structuredContent.stale_path) {
    delete compact.structuredContent.stale_path.basename;
  }
  if (wireBytes(id, compact) > byteLimit && compact.structuredContent.unsupported_path) {
    delete compact.structuredContent.unsupported_path.basename;
  }
  if (wireBytes(id, compact) > byteLimit) delete compact.structuredContent.notice;
  if (wireBytes(id, compact) > byteLimit) {
    throw Object.assign(new Error("The requested budget cannot hold mandatory MCP safety metadata"), {
      code: "QUERY_BUDGET_TOO_SMALL"
    });
  }
  return compact;
}
function validateToolArguments(arguments_2) {
  if (!arguments_2 || typeof arguments_2 !== "object" || Array.isArray(arguments_2)) {
    return "semantic_explore arguments must be an object";
  }
  if (Object.keys(arguments_2).some((key) => !TOOL_ARGUMENT_KEYS.has(key))) {
    return "semantic_explore arguments contain unsupported properties";
  }
  if (typeof arguments_2.task !== "string" || arguments_2.task.trim() === "" || [...arguments_2.task].length > 4096) {
    return "task must be a non-empty string of at most 4096 characters";
  }
  if (arguments_2.focus !== void 0 && (typeof arguments_2.focus !== "string" || [...arguments_2.focus].length > 512)) {
    return "focus must be a string of at most 512 characters";
  }
  if (arguments_2.known_symbols !== void 0 && (!Array.isArray(arguments_2.known_symbols) || arguments_2.known_symbols.length > 20 || !arguments_2.known_symbols.every((value) => typeof value === "string" && [...value].length <= 256))) {
    return "known_symbols must contain at most 20 strings of at most 256 characters";
  }
  if (arguments_2.context_id !== void 0 && (typeof arguments_2.context_id !== "string" || [...arguments_2.context_id].length > 128)) {
    return "context_id must be a string of at most 128 characters";
  }
  if (arguments_2.budget !== void 0 && (!Number.isSafeInteger(arguments_2.budget) || arguments_2.budget < MIN_MCP_BUDGET)) {
    return `budget must be an integer of at least ${MIN_MCP_BUDGET} budget units`;
  }
  return null;
}
function startWatcher(root) {
  let timer = null;
  let syncing = false;
  let queued = false;
  let watcher;
  const sync = async () => {
    if (syncing) {
      queued = true;
      return;
    }
    syncing = true;
    try {
      await synchronizeProject(root);
    } catch (error) {
      process.stderr.write(`WATCH_SYNC_FAILED: ${error.message}
`);
    } finally {
      syncing = false;
      if (queued) {
        queued = false;
        void sync();
      }
    }
  };
  try {
    watcher = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
      const path = String(filename ?? "").replaceAll("\\", "/");
      if (path === "codegraph.py" || path.startsWith(".codegraph/") || path.startsWith(".git/")) return;
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), 150);
    });
    watcher.on("error", (error) => {
      process.stderr.write(`WATCHER_UNAVAILABLE: ${error.message}; freshness barriers remain active.
`);
      watcher.close();
    });
  } catch (error) {
    process.stderr.write(`WATCHER_UNAVAILABLE: ${error.message}; freshness barriers remain active.
`);
  }
  return () => {
    clearTimeout(timer);
    watcher?.close();
  };
}
async function runMcpServer(root) {
  const config = await readConfig(artifactPaths(root).config);
  const contexts = /* @__PURE__ */ new Map();
  const closeWatcher = startWatcher(root);
  let chain = Promise.resolve();
  let initialized = false;
  async function handle2(message) {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      writeMessage(errorResponse(message?.id ?? null, -32600, "Invalid JSON-RPC request"));
      return;
    }
    if (!Object.hasOwn(message, "id")) return;
    const id = message.id ?? null;
    if (!(typeof id === "string" || typeof id === "number" && Number.isSafeInteger(id))) {
      writeMessage(errorResponse(null, -32600, "JSON-RPC id must be a string or safe integer"));
      return;
    }
    try {
      let result;
      if (message.method === "initialize") {
        const params = message.params;
        if (!params || typeof params !== "object" || Array.isArray(params) || typeof params.protocolVersion !== "string" || !params.capabilities || typeof params.capabilities !== "object" || Array.isArray(params.capabilities) || !params.clientInfo || typeof params.clientInfo !== "object" || Array.isArray(params.clientInfo) || typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string") {
          writeMessage(errorResponse(id, -32602, "initialize params must include protocolVersion, capabilities, and clientInfo"));
          return;
        }
        if (initialized) {
          writeMessage(errorResponse(id, -32600, "Server is already initialized"));
          return;
        }
        initialized = true;
        result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "portable-codegraph", version: "0.1.0" },
          instructions: "Use semantic_explore for minimum sufficient navigation context. Source remains authoritative."
        };
      } else if (message.method === "ping") {
        result = {};
      } else if (message.method === "tools/list") {
        if (!initialized) {
          writeMessage(errorResponse(id, -32002, "Server is not initialized"));
          return;
        }
        result = {
          tools: [{
            name: "semantic_explore",
            description: "Retrieve bounded, confidence-aware semantic context. Omission is not absence.",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              required: ["task"],
              properties: {
                task: { type: "string", minLength: 1, maxLength: 4096, pattern: "\\S" },
                focus: { type: "string", maxLength: 512 },
                known_symbols: {
                  type: "array",
                  items: { type: "string", maxLength: 256 },
                  maxItems: 20
                },
                context_id: { type: "string", maxLength: 128 },
                budget: {
                  type: "integer",
                  minimum: MIN_MCP_BUDGET,
                  maximum: Number.MAX_SAFE_INTEGER,
                  description: "Conservative token upper bound; one unit permits one serialized UTF-8 byte."
                }
              }
            }
          }]
        };
      } else if (message.method === "tools/call") {
        if (!initialized) {
          writeMessage(errorResponse(id, -32002, "Server is not initialized"));
          return;
        }
        if (message.params?.name !== "semantic_explore") {
          writeMessage(errorResponse(id, -32602, `Unknown tool: ${message.params?.name}`));
          return;
        }
        const validationError = validateToolArguments(message.params.arguments);
        if (validationError) {
          writeMessage(errorResponse(id, -32602, validationError));
          return;
        }
        const arguments_2 = { ...message.params.arguments };
        const outerBudget = Math.min(
          Number.isSafeInteger(arguments_2.budget) ? arguments_2.budget : config.mcp_default_budget,
          config.mcp_hard_cap
        );
        const shellOverhead = wireBytes(id, fullToolResult({})) - utf8Bytes("{}");
        const availableStructuredBytes = Math.max(0, budgetByteLimit(outerBudget) - shellOverhead);
        arguments_2.budget = Math.max(
          MIN_MCP_BUDGET,
          Math.floor(availableStructuredBytes / BUDGET_BYTES_PER_UNIT)
        );
        const explored = await semanticExplore(root, arguments_2, contexts);
        result = boundedToolResult(id, explored, outerBudget);
      } else {
        writeMessage(errorResponse(id, -32601, `Method not found: ${message.method}`));
        return;
      }
      writeMessage({ jsonrpc: "2.0", id, result });
    } catch (error) {
      const jsonRpcCode = ["INVALID_QUERY", "QUERY_BUDGET_TOO_SMALL"].includes(error.code) ? -32602 : -32e3;
      writeMessage(errorResponse(id, jsonRpcCode, error.message, { code: error.code ?? "INTERNAL_ERROR" }));
    }
  }
  const framer = new InputFramer((message, error) => {
    if (error) {
      const code = error.code === "MCP_FRAME_TOO_LARGE" ? -32600 : -32700;
      writeMessage(errorResponse(null, code, error.message));
      return;
    }
    chain = chain.then(() => handle2(message));
  });
  process.stdin.on("data", (chunk) => framer.push(chunk));
  process.stdin.resume();
  await new Promise((resolve3) => process.stdin.once("end", resolve3));
  await chain;
  closeWatcher();
}

// src/cli.js
function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
}
function help() {
  return `Portable CodeGraph ${VERSION}

Usage: codegraph <command>

Commands:
  init                 Initialize the project-local graph and routing map
  status               Show graph freshness, health, revision, and profile
  sync                 Reconcile source and publish one semantic revision
  rebuild              Rebuild all derived graph state from source
  mcp                  Run the stdio MCP server
  doctor               Check graph integrity and materialization consistency
  instructions         Print compact coding-agent instructions
  integrate <client>   Print an absolute-path MCP registration descriptor
  version              Print the executable version
  help                 Show this help
`;
}
function integrationDescriptor(client) {
  const script = resolve2(process.argv[1]);
  const command = process.execPath;
  const args2 = isSea2() ? ["mcp"] : [script, "mcp"];
  return {
    client,
    transport: "stdio",
    command,
    args: args2,
    tool: "semantic_explore",
    instructions: AGENT_INSTRUCTIONS,
    note: "Register this descriptor in the named client's MCP configuration. No PATH installation is required."
  };
}
async function run2(arguments_2) {
  const [command = "help", ...argumentsRest] = arguments_2;
  if (command === "integrate") {
    if (argumentsRest.length !== 1) {
      throw new CodeGraphError("CLIENT_REQUIRED", "Usage: codegraph integrate <client>", 2);
    }
    output(integrationDescriptor(argumentsRest[0]));
    return;
  }
  if (argumentsRest.length > 0) {
    throw new CodeGraphError("INVALID_ARGUMENT", `Unexpected arguments for ${command}: ${argumentsRest.join(" ")}`, 2);
  }
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(help());
    return;
  }
  if (["version", "--version", "-v"].includes(command)) {
    process.stdout.write(`${VERSION}
`);
    return;
  }
  if (command === "instructions") {
    process.stdout.write(AGENT_INSTRUCTIONS);
    return;
  }
  if (command === "init") {
    const root2 = await detectProjectRoot(process.cwd(), false);
    output({ command, project_root: root2, ...await initializeProject(root2) });
    return;
  }
  const root = await detectProjectRoot(process.cwd(), true);
  if (command === "status") {
    output({ command, project_root: root, ...await projectStatus(root) });
  } else if (command === "sync") {
    output({ command, project_root: root, ...await synchronizeProject(root) });
  } else if (command === "rebuild") {
    output({ command, project_root: root, ...await rebuildProject(root) });
  } else if (command === "doctor") {
    const diagnosis = await diagnoseProject(root);
    output({ command, project_root: root, ...diagnosis });
    if (!diagnosis.ok) process.exitCode = 3;
  } else if (command === "mcp") {
    await runMcpServer(root);
  } else {
    throw new CodeGraphError("UNKNOWN_COMMAND", `Unknown command: ${command}

${help()}`, 2);
  }
}

// bin/codegraph.js
run2(process.argv.slice(2)).catch((error) => {
  const code = error.code ?? "INTERNAL_ERROR";
  process.stderr.write(`${code}: ${error.message}
`);
  process.exitCode = error.exitCode ?? 1;
});

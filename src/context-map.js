import { CLASSIFICATION, CONFIDENCE } from "./constants.js";

export const BUDGET_BYTES_PER_UNIT = 1;

export function utf8Bytes(value) {
  return Buffer.byteLength(value, "utf8");
}

export function budgetByteLimit(budget) {
  return budget * BUDGET_BYTES_PER_UNIT;
}

export function estimateBudgetUnits(value) {
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
  return `  (${pythonString(entity.qualified_name)}, ${pythonString(entity.kind)}, ${pythonString(entity.signature)}, ${pythonString(location.file_path)}, ${location.start_line}, ${pythonString(entity.confidence)}),\n`;
}

function lineForRelation(relation, entitiesById) {
  const source = entitiesById.get(relation.src_entity_id)?.qualified_name ?? relation.src_entity_id;
  const target = entitiesById.get(relation.dst_entity_id)?.qualified_name
    ?? relation.unresolved_target
    ?? "UNKNOWN";
  const condition = relation.condition?.expression ?? "";
  return `  (${pythonString(source)}, ${pythonString(relation.kind)}, ${pythonString(target)}, ${pythonString(condition)}, ${pythonString(relation.confidence)}),\n`;
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
    `GRAPH_REVISION = ${revision}\n`,
    `GRAPH_STATUS = ${pythonString(graph.health.status)}\n`,
    `MODE = ${pythonString(mode)}\n`,
    "SOURCE_IS_AUTHORITATIVE = True\n",
    "OMISSION_IS_NOT_ABSENCE = True\n\n",
    "REGIONS = (\n",
  ];
}

function projectedMapBytes(
  graph,
  revision,
  rankedRegions,
  rankedEntities,
  entryPoints,
  rankedRelations,
  warningValues,
  entitiesById,
) {
  const entryPointIds = new Set(entryPoints.map((entity) => entity.stable_id));
  const lines = [...headerLines(graph, revision, "COMPACT")];
  lines.push(...rankedRegions.map((region) => (
    `  (${pythonString(region.name)}, ${pythonString(region.path)}, ${pythonString(region.confidence)}),\n`
  )));
  lines.push(")\n\n", "ENTRY_POINTS = (\n");
  lines.push(...entryPoints.map(lineForEntity));
  lines.push(")\n\n", "IMPORTANT_SYMBOLS = (\n");
  lines.push(...rankedEntities
    .filter((entity) => !entryPointIds.has(entity.stable_id))
    .map(lineForEntity));
  lines.push(")\n\n", "MAIN_FLOWS = (\n");
  lines.push(...rankedRelations
    .filter((relation) => ["CALLS", "ROUTES_TO", "INHERITS", "IMPLEMENTS"].includes(relation.kind))
    .map((relation) => lineForRelation(relation, entitiesById)));
  lines.push(")\n\n", "WARNINGS = (\n");
  lines.push(...warningValues.map((warning) => `  ${pythonString(warning)},\n`));
  lines.push(")\n", "MAP_TRUNCATED = False\n", 'MCP_TOOL = "semantic_explore"\n');
  return utf8Bytes(lines.join(""));
}

export function compileContextMap(graph, revision, config) {
  const entitiesById = new Map(graph.entities.map((entity) => [entity.stable_id, entity]));
  const rankedEntities = [...graph.entities].sort((left, right) => (
    entityScore(right) - entityScore(left)
    || left.qualified_name.localeCompare(right.qualified_name)
  ));
  const rankedRelations = [...graph.relations].sort((left, right) => (
    relationScore(right, entitiesById) - relationScore(left, entitiesById)
    || left.stable_id.localeCompare(right.stable_id)
  ));
  const firstPartyRegionCounts = new Map();
  for (const entity of graph.entities.filter((item) => item.classification === CLASSIFICATION.FIRST_PARTY)) {
    firstPartyRegionCounts.set(entity.region_id, (firstPartyRegionCounts.get(entity.region_id) ?? 0) + 1);
  }
  const rankedRegions = graph.regions
    .filter((item) => item.stable_id !== "region:repository")
    .sort((left, right) => (
      (firstPartyRegionCounts.get(right.stable_id) ?? 0) - (firstPartyRegionCounts.get(left.stable_id) ?? 0)
      || left.path.localeCompare(right.path)
    ));
  const entryPoints = rankedEntities.filter((entity) => (
    entity.semantic_tags.some((tag) => tag.startsWith("entry_point:"))
  ));
  const warningValues = [
    ...graph.health.risk_flags.map((risk) => `Risk: ${risk}`),
    ...graph.health.stale_files.map((path) => `Stale source: ${path}`),
  ];
  const compactWithinTarget = graph.entities.length <= config.compact_entity_limit
    && projectedMapBytes(
      graph,
      revision,
      rankedRegions,
      rankedEntities,
      entryPoints,
      rankedRelations,
      warningValues,
      entitiesById,
    ) <= budgetByteLimit(config.map_target_tokens);
  const mode = compactWithinTarget
    ? "COMPACT"
    : "HYBRID";
  const hardByteCap = budgetByteLimit(config.map_hard_cap_tokens);
  const lines = headerLines(graph, revision, mode);
  let truncated = false;

  for (const region of rankedRegions) {
    const regionLine = `  (${pythonString(region.name)}, ${pythonString(region.path)}, ${pythonString(region.confidence)}),\n`;
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
    if (!appendWithin(lines, `  ${pythonString(warning)},\n`, hardByteCap - budgetByteLimit(30))) {
      truncated = true;
      break;
    }
  }
  lines.push(")\n");
  lines.push(`MAP_TRUNCATED = ${truncated ? "True" : "False"}\n`);
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
  const budgetUnits = estimateBudgetUnits(content);
  if (bytes > hardByteCap) {
    throw new Error(`Mandatory codegraph.py content exceeds map_hard_cap_tokens (${config.map_hard_cap_tokens})`);
  }
  return { content, bytes, budgetUnits, mode, truncated };
}

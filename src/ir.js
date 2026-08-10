import { createHash } from "node:crypto";
import { extname } from "node:path";
import { CONFIDENCE } from "./constants.js";

export function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeSemanticText(value) {
  return value.replace(/\s+/gu, " ").trim();
}

export function compareText(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort(compareText);
}

export function moduleNameForPath(path) {
  const extension = extname(path);
  let moduleName = path.slice(0, extension ? -extension.length : undefined).replaceAll("/", ".");
  moduleName = moduleName.replace(/\.__init__$/u, "");
  return moduleName || "repository";
}

export function sourceLocation(path, node) {
  return {
    file_path: path,
    start_line: node.startPosition.row + 1,
    start_column: node.startPosition.column,
    end_line: node.endPosition.row + 1,
    end_column: node.endPosition.column,
  };
}

export function stableEntityId(language, path, qualifiedName, kind) {
  return `${language}:${path}:${qualifiedName}:${kind}`;
}

export function createEntity({
  language,
  path,
  kind,
  name,
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
  documentation = "",
}) {
  return {
    stable_id: stableEntityId(language, path, qualifiedName, kind),
    kind,
    name,
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
    documentation: normalizeSemanticText(documentation),
  };
}

export function createRelation({
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
  typeOnly = false,
}) {
  const location = sourceLocation(path, node);
  const identity = [
    src,
    dst ?? unresolvedTarget ?? "",
    kind,
    condition?.expression ?? "",
    normalizeSemanticText(node.text ?? ""),
  ].join("\u0000");
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
    type_only: typeOnly,
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
    signature: entity.signature,
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
    type_only: relation.type_only,
  };
}

function semanticImports(imports) {
  return Object.fromEntries(Object.entries(imports)
    .sort(([a], [b]) => compareText(a, b))
    .map(([alias, rawBindings]) => {
      if (!Array.isArray(rawBindings)) return [alias, rawBindings];
      return [alias, rawBindings.map((binding) => ({
        target: binding.target,
        scope_entity_id: binding.scope_entity_id ?? null,
        condition: binding.condition?.expression ?? null,
        type_only: Boolean(binding.type_only),
        wildcard: Boolean(binding.wildcard),
      }))];
    }));
}

export function semanticHash(parsedFile) {
  const normalized = {
    entities: parsedFile.entities.map(semanticEntity).sort((a, b) => compareText(a.stable_id, b.stable_id)),
    relations: parsedFile.relations.map(semanticRelation).sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b))),
    imports: semanticImports(parsedFile.imports),
    risk_flags: uniqueSorted(parsedFile.risk_flags),
  };
  return hashBytes(JSON.stringify(normalized));
}

export function makeCondition(path, node, expression = node.text) {
  return {
    expression: normalizeSemanticText(expression),
    source_location: sourceLocation(path, node),
  };
}

export function regionIdForPath(path) {
  const topLevel = path.includes("/") ? path.slice(0, path.indexOf("/")) : ".";
  return `region:${topLevel}`;
}

export function buildRegions(files) {
  const regions = [{
    stable_id: "region:repository",
    parent_id: null,
    kind: "repository",
    name: "repository",
    path: ".",
    confidence: CONFIDENCE.HIGH,
    risk_flags: [],
  }];
  const topLevels = new Map();
  for (const file of files) {
    const topLevel = file.path.includes("/") ? file.path.slice(0, file.path.indexOf("/")) : ".";
    const current = topLevels.get(topLevel) ?? [];
    current.push(...(file.risk_flags ?? []));
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
      risk_flags: uniqueSorted(risks),
    });
  }
  return regions;
}

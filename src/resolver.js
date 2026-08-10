import { posix } from "node:path";
import {
  CONFIDENCE,
  GRAPH_STATUS,
  INCOMPLETE_RISKS,
  RISK,
} from "./constants.js";
import {
  buildRegions,
  hashBytes,
  semanticHash,
  stableEntityId,
  uniqueSorted,
} from "./ir.js";

function stripLanguageExtension(value) {
  return value.replace(/\.(?:py|jsx?|mjs|cjs|tsx?|mts|cts|java|go)$/iu, "");
}

function normalizeRelativeImport(rawTarget, sourcePath) {
  if (!rawTarget.startsWith(".")) return rawTarget;
  const extensionMatch = rawTarget.match(/\.(?:jsx?|mjs|cjs|tsx?|mts|cts)(?=\.|$)/iu);
  let modulePart = extensionMatch
    ? rawTarget.slice(0, extensionMatch.index + extensionMatch[0].length)
    : rawTarget;
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
  let target = rawTarget
    .replaceAll("?.", ".")
    .replace(/<[^<>]*>/gu, "")
    .replace(/^await\s+/u, "")
    .trim();
  target = normalizeRelativeImport(target, sourcePath);
  return target.replace(/^\.+/u, "").replace(/\.+/gu, ".");
}

function entityNameCandidates(target, byName) {
  const name = target.split(".").at(-1);
  return byName.get(name) ?? [];
}

function scopedImportBindings(rawBindings, source, byId) {
  if (!rawBindings) return [];
  const bindings = Array.isArray(rawBindings)
    ? rawBindings
    : [{ target: rawBindings, scope_entity_id: null, condition: null, type_only: false }];
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
  return scopedImportBindings(imports[head], source, byId)
    .map((binding) => ({
      ...binding,
      expanded_target: [normalizeRelativeImport(binding.target, sourcePath), ...tail]
        .filter(Boolean)
        .join("."),
    }));
}

function bindingFollowsReference(binding, source, relation) {
  if (binding.scope_entity_id !== source.stable_id || !binding.source_location) return false;
  const bindingLocation = binding.source_location;
  const reference = relation.source_location;
  return bindingLocation.start_line > reference.start_line
    || (bindingLocation.start_line === reference.start_line
      && bindingLocation.start_column > reference.start_column);
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
  entity.risk_flags = uniqueSorted([...(entity.risk_flags ?? []), ...risks]);
}

function withoutResolverAmbiguity(risks = []) {
  return risks.filter((risk) => risk !== RISK.AMBIGUOUS_SYMBOL);
}

function normalizedResolverInput(parsedFiles) {
  const files = structuredClone(parsedFiles);
  const normalizedIds = new Map();
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
      relation.candidates = (relation.candidates ?? [])
        .map((candidate) => normalizedIds.get(candidate) ?? candidate);
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
  return location.start_line >= entity.source_location.start_line
    && location.end_line <= entity.source_location.end_line;
}

function ensureUniqueEntityIds(files) {
  const seen = new Map();
  const collisionCounts = new Map();
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
      file.risk_flags = uniqueSorted([...(file.risk_flags ?? []), RISK.AMBIGUOUS_SYMBOL]);
      for (const relation of file.relations) {
        if (relation.src_entity_id === original
            && locationInside(relation.source_location, entity)) {
          relation.src_entity_id = entity.stable_id;
        }
        if (relation.dst_entity_id === original
            && locationInside(relation.source_location, entity)) {
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
  const counts = new Map();
  const ordered = files.flatMap((file) => file.relations).sort((left, right) => {
    const leftLocation = left.source_location;
    const rightLocation = right.source_location;
    return leftLocation.file_path.localeCompare(rightLocation.file_path)
      || leftLocation.start_line - rightLocation.start_line
      || leftLocation.start_column - rightLocation.start_column
      || left.kind.localeCompare(right.kind)
      || (left.unresolved_target ?? left.dst_entity_id ?? "")
        .localeCompare(right.unresolved_target ?? right.dst_entity_id ?? "");
  });
  for (const relation of ordered) {
    const base = [
      relation.src_entity_id,
      relation.kind,
      relation.unresolved_target ?? relation.dst_entity_id ?? "",
      relation.condition?.expression ?? "",
      relation.type_only ? "type" : "runtime",
    ].join("\u0000");
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
  if (relation.condition.expression.startsWith(prefix)
      && relation.condition.expression.endsWith(")")) return;
  relation.condition = {
    ...condition,
    expression: `(${condition.expression}) AND (${relation.condition.expression})`,
  };
}

function addRelationRisk(relation, file, risks) {
  relation.risk_flags = uniqueSorted([...(relation.risk_flags ?? []), ...risks]);
  file.risk_flags = uniqueSorted([...(file.risk_flags ?? []), ...risks]);
}

function hasLexicalCallableAncestor(candidate, entities) {
  let parent = candidate.qualified_name.slice(0, candidate.qualified_name.lastIndexOf("."));
  while (parent) {
    const owner = entities.find((entity) => entity.file_path === candidate.file_path
      && entity.qualified_name === parent);
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
  const dynamicallyShadowed = relation.risk_flags.includes(RISK.DYNAMIC_DISPATCH)
    || source.inputs.some((input) => input.name === target.split(".")[0]);
  const highConfidenceBlocked = () => relation.risk_flags.some((risk) => INCOMPLETE_RISKS.has(risk));

  const module = entities.find((entity) => entity.file_path === source.file_path && entity.kind === "module");
  const local = candidates.filter((candidate) => {
    if (candidate.file_path !== source.file_path || !module) return false;
    if (candidate.kind === "method") return false;
    const separator = candidate.qualified_name.lastIndexOf(".");
    const parent = separator < 0 ? "" : candidate.qualified_name.slice(0, separator);
    const parentEntity = entities.find((entity) => (
      entity.file_path === candidate.file_path && entity.qualified_name === parent
    ));
    if (file.language === "python" && parentEntity?.kind === "class") return false;
    return parent === module.qualified_name
      || parent === source.qualified_name
      || source.qualified_name.startsWith(`${parent}.`);
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
      const competingLocal = !target.includes(".")
        && local.some((candidate) => candidate.stable_id !== imported[0].stable_id);
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

  const localConditional = local.length === 1
    ? applyCandidateConditions(relation, local[0], file)
    : false;
  if (local.length === 1
      && !target.includes(".")
      && !dynamicallyShadowed
      && !localConditional
      && !highConfidenceBlocked()) {
    relation.dst_entity_id = local[0].stable_id;
    relation.confidence = CONFIDENCE.HIGH;
    relation.candidates = [];
    return relation;
  }

  const exact = candidatesForRelation(relation, exactCandidates(target, entities));
  const exactConditional = exact.length === 1
    ? applyCandidateConditions(relation, exact[0], file)
    : false;
  if (exact.length === 1
      && ["IMPORTS", "INHERITS", "IMPLEMENTS"].includes(relation.kind)
      && !dynamicallyShadowed
      && !exactConditional
      && !highConfidenceBlocked()) {
    relation.dst_entity_id = exact[0].stable_id;
    relation.confidence = CONFIDENCE.HIGH;
    relation.candidates = [];
    return relation;
  }

  const uniqueCandidates = [...new Map(
    [...candidates, ...exact].map((candidate) => [candidate.stable_id, candidate]),
  ).values()];
  if (uniqueCandidates.length > 1) {
    relation.confidence = CONFIDENCE.MEDIUM;
    relation.candidates = uniqueCandidates.map((candidate) => candidate.stable_id).sort();
    relation.risk_flags = uniqueSorted([
      ...(relation.risk_flags ?? []),
      RISK.AMBIGUOUS_SYMBOL,
    ]);
    addEntityRisk(source, relation.risk_flags);
    file.risk_flags = uniqueSorted([...(file.risk_flags ?? []), ...relation.risk_flags]);
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
  const languages = new Set(files.map((file) => file.language));
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
    language_count: languages.size,
    languages: [...languages].sort(),
    cross_region_relation_count: crossRegion,
    estimated_codegraph_tokens: 0,
    parse_failure_rate: files.length === 0 ? 0 : failed / files.length,
    unresolved_relation_rate: relations.length === 0 ? 0 : unresolved / relations.length,
    parse_latency_ms: parseDurationMs,
    sync_latency_ms: syncDurationMs,
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
    impact_completeness: risks.some((risk) => INCOMPLETE_RISKS.has(risk)) || low > 0 || unknown > 0
      ? "INCOMPLETE"
      : "SCOPED_STATIC",
  };
}

export function resolveGraph(parsedFiles, timings = {}) {
  const files = normalizedResolverInput(parsedFiles);
  ensureUniqueEntityIds(files);
  const entities = files.flatMap((file) => file.entities);
  const byId = new Map(entities.map((entity) => [entity.stable_id, entity]));
  const byName = new Map();
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
        relation.risk_flags = uniqueSorted([...(relation.risk_flags ?? []), RISK.UNSUPPORTED_SEMANTICS]);
        file.risk_flags = uniqueSorted([...(file.risk_flags ?? []), RISK.UNSUPPORTED_SEMANTICS]);
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
    timings.syncDurationMs,
  );
  return { files, entities, relations, regions, health, profile };
}

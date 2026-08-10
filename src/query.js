import { randomUUID } from "node:crypto";
import { INCOMPLETE_RISKS, MIN_MCP_BUDGET, SAFETY_STATE } from "./constants.js";
import {
  budgetByteLimit,
  estimateTokens,
  utf8Bytes,
} from "./context-map.js";
import { readConfig } from "./config.js";
import { hashBytes, uniqueSorted } from "./ir.js";
import { SqliteGraphStore } from "./store.js";
import { artifactPaths, synchronizeProject } from "./sync.js";

const BROAD_QUERY = /\b(show|list|return|dump|describe)\b.{0,20}\b(entire|whole|all)\b.{0,20}\b(repository|codebase|graph|symbols?)\b/iu;
const IMPACT_QUERY = /\b(impact|change|breaks?|signature|contract|endpoint|callers?|references?|invokes?|visibility|private|public|rename|remove|delete|drop|retire|replace|deprecat(?:e|ion)|alter|modify|schema|migration|public api|shared type|dependency|cross[- ]service|authentication|authorization|route removal|build|deployment)\b/iu;

function tokens(value) {
  return (value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_]+/gu) ?? [])
    .filter((token) => token.length > 1);
}

function pathDescriptor(path) {
  return {
    basename: path.split("/").at(-1),
    path_sha256: hashBytes(path),
    path_truncated: true,
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
    source_location: entity.source_location,
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
    candidates: relation.candidates.map((candidate) => (
      entityById.get(candidate)?.qualified_name ?? candidate
    )),
    source_location: relation.source_location,
  };
}

function scoreEntity(entity, queryTokens, focus, knownSymbols, ftsOrder) {
  const haystack = [
    entity.name,
    entity.qualified_name,
    entity.file_path,
    entity.signature,
    ...entity.semantic_tags,
  ].join(" ").toLocaleLowerCase("en-US");
  let score = Math.max(0, 100 - (ftsOrder.get(entity.stable_id) ?? 100));
  for (const token of queryTokens) {
    if (entity.name.toLocaleLowerCase("en-US") === token) score += 80;
    else if (haystack.includes(token)) score += 15;
  }
  if (focus) {
    const normalizedFocus = focus.toLocaleLowerCase("en-US");
    if (entity.name.toLocaleLowerCase("en-US") === normalizedFocus
        || entity.qualified_name.toLocaleLowerCase("en-US") === normalizedFocus
        || (normalizedFocus.length > 1 && haystack.includes(normalizedFocus))) {
      score += 100;
    }
  }
  for (const symbol of knownSymbols) {
    const known = symbol.toLocaleLowerCase("en-US");
    if (entity.qualified_name.toLocaleLowerCase("en-US") === known
        || entity.name.toLocaleLowerCase("en-US") === known) score += 150;
    else if (known.length > 1 && haystack.includes(known)) score += 60;
  }
  if (entity.semantic_tags.some((tag) => tag.startsWith("entry_point:"))) score += 20;
  if (entity.classification === "GENERATED") score -= 60;
  return score;
}

function selectedRegions(snapshot, selectedEntities) {
  const selectedIds = new Set(selectedEntities.map((entity) => entity.region_id));
  return snapshot.regions
    .filter((region) => region.stable_id === "region:repository" || selectedIds.has(region.stable_id))
    .map((region) => ({
      id: region.stable_id,
      name: region.name,
      kind: region.kind,
      path: region.path,
      confidence: region.confidence,
      risk_flags: region.risk_flags,
    }));
}

function staleProvenance(snapshot) {
  const stalePaths = new Set(snapshot.health.stale_files ?? []);
  return snapshot.files
    .filter((file) => file.stale || stalePaths.has(file.path))
    .map((file) => {
      const sourceLocation = file.entities
        ?.find((entity) => entity.source_location)?.source_location
        ?? { file_path: file.path, start_line: 1 };
      return {
        file_path: file.path,
        last_good_revision: file.last_good_revision,
        source_location: sourceLocation,
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
  const incomplete = risks.some((risk) => INCOMPLETE_RISKS.has(risk))
    || uncertainRelations.length > 0
    || snapshot.health.impact_completeness === "INCOMPLETE";
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
  const mandatoryStale = response.graph_status === "PARTIAL" || response.graph_status === "STALE"
    ? {
      last_known_good_revision: response.last_known_good_revision,
      stale_file_count: response.stale_file_count,
      stale_files: (response.stale_files ?? []).slice(0, 1),
      stale_provenance: (response.stale_provenance ?? []).slice(0, 1).map((item) => ({
        file_path: item.file_path,
        last_good_revision: item.last_good_revision,
        source_location: item.source_location
          ? { start_line: item.source_location.start_line }
          : null,
      })),
    }
    : null;
  const mandatoryImpact = impact
    ? {
      unsupported_file_count: response.unsupported_file_count ?? 0,
      unsupported_files: (response.unsupported_files ?? []).slice(0, 1),
      completeness: {
        scope: "direct static relations",
        returned_results: "BUDGET_TRUNCATED",
        impact: "INCOMPLETE",
        relation_scope: "DIRECT_STATIC",
      },
    }
    : null;
  measureResponse(response);
  while (response.response_bytes > byteLimit) {
    if (response.relations.length > 0) response.relations.pop();
    else if (response.entities.length > 1) response.entities.pop();
    else if (response.regions.length > 1) response.regions.pop();
    else if (response.suggestions?.length > 0) response.suggestions.pop();
    else if (response.unsupported_files?.length > (impact && response.unsupported_file_count > 0 ? 1 : 0)) {
      response.unsupported_files.pop();
    }
    else if (response.unresolved_areas?.length > 0) response.unresolved_areas.pop();
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
        SAFETY_STATE.SOURCE_INSPECTION_REQUIRED,
      ]);
      response.safety_state = response.safety_states[0];
    }
    measureResponse(response);
  }
  if (response.response_bytes > byteLimit) {
    const safetyStates = uniqueSorted([
      ...(impact ? [SAFETY_STATE.IMPACT_INCOMPLETE] : []),
      ...(response.graph_status === "PARTIAL" ? [SAFETY_STATE.GRAPH_PARTIAL] : []),
      ...(response.graph_status === "STALE" ? [SAFETY_STATE.GRAPH_STALE] : []),
      SAFETY_STATE.SOURCE_INSPECTION_REQUIRED,
    ]);
    const minimal = {
      context_id: response.context_id,
      graph_revision: response.graph_revision,
      graph_status: response.graph_status,
      safety_state: safetyStates[0],
      safety_states: safetyStates,
      truncated: true,
      notice: "Omission is not absence; inspect source.",
      ...(mandatoryStale ?? {}),
      ...(mandatoryImpact ?? {}),
      response_bytes: 0,
      response_tokens: 0,
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
        source_location: item.source_location,
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
        start_line: compactSource.source_location.start_line,
      }];
      measureResponse(minimal);
      if (minimal.response_bytes > byteLimit) {
        delete minimal.source_locations;
        measureResponse(minimal);
      }
    }
    if (minimal.response_bytes > byteLimit) {
      throw Object.assign(new Error("The requested budget cannot hold mandatory safety metadata"), {
        code: "QUERY_BUDGET_TOO_SMALL",
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
  const units = new Set([
    ...(response.entities ?? []).map((entity) => semanticUnit("entity", entity)),
    ...(response.relations ?? []).map((relation) => semanticUnit("relation", relation)),
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
  response.relations = response.relations.filter((relation) => (
    !previous.units.has(semanticUnit("relation", relation))
  ));
  response.delta = true;
  return response;
}

export async function semanticExplore(root, request, contexts = new Map()) {
  if (!request || typeof request.task !== "string" || request.task.trim() === "") {
    throw Object.assign(new Error("task must be a non-empty string"), { code: "INVALID_QUERY" });
  }
  if ([...request.task].length > 4096
      || (request.focus !== undefined && (typeof request.focus !== "string" || [...request.focus].length > 512))
      || (request.context_id !== undefined
        && (typeof request.context_id !== "string" || [...request.context_id].length > 128))) {
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
    const contextId = typeof request.context_id === "string" ? request.context_id : randomUUID();
    const previous = contexts.get(request.context_id);
    const staleDetails = staleProvenance(snapshot);
    const sourceLocations = staleDetails.map((item) => item.source_location);
    const allUnsupportedPaths = unsupportedPaths(snapshot);
    const unsupportedFileCount = snapshot.health.unsupported_file_count ?? allUnsupportedPaths.length;
    const boundedUnsupportedPaths = impact ? allUnsupportedPaths.slice(0, 10) : [];

    if (broad) {
      const risks = snapshot.health.risk_flags ?? [];
      const safetyStates = safetyFor(snapshot, risks, impact, []);
      let response = {
        context_id: contextId,
        graph_revision: snapshot.revision,
        graph_status: snapshot.status,
        last_known_good_revision: snapshot.last_known_good_revision,
        safety_state: safetyStates[0],
        safety_states: safetyStates,
        broad_query: true,
        regions: snapshot.regions
          .filter((region) => region.stable_id !== "region:repository")
          .map((region) => ({ name: region.name, kind: region.kind, path: region.path })),
        entities: [],
        relations: [],
        completeness: {
          scope: "routing regions only",
          returned_results: "INTENTIONALLY_PARTIAL",
          impact: impact ? "INCOMPLETE" : "NOT_EVALUATED",
          relation_scope: impact ? "ROUTING_ONLY" : "NOT_EVALUATED",
        },
        unresolved_areas: risks,
        stale_file_count: snapshot.health.stale_files?.length ?? 0,
        stale_files: snapshot.health.stale_files ?? [],
        stale_provenance: staleDetails,
        source_locations: sourceLocations,
        unsupported_file_count: impact ? unsupportedFileCount : 0,
        unsupported_files: boundedUnsupportedPaths,
        truncated: true,
        notice: "Omission is not absence. Refine focus or inspect source when completeness matters.",
        suggestions: ["Provide focus", "Provide known_symbols", "Ask about one flow or symbol"],
      };
      response = trimToBudget(response, budget, impact);
      rememberContext(contexts, contextId, response, previous);
      return response;
    }

    const knownSymbols = Array.isArray(request.known_symbols)
      ? request.known_symbols
        .filter((value) => typeof value === "string" && [...value].length <= 256)
        .slice(0, 20)
      : [];
    const queryTokens = tokens(request.task);
    const fts = store.searchEntities([request.task, request.focus ?? "", ...knownSymbols], 100);
    const ftsOrder = new Map(fts.map((row, index) => [row.stable_id, index]));
    const selectedEntities = [...snapshot.entities]
      .map((entity) => ({
        entity,
        score: scoreEntity(entity, queryTokens, request.focus, knownSymbols, ftsOrder),
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score
        || left.entity.qualified_name.localeCompare(right.entity.qualified_name))
      .slice(0, impact ? 40 : 20)
      .map(({ entity }) => entity);

    if (selectedEntities.length === 0) {
      selectedEntities.push(...snapshot.entities
        .filter((entity) => entity.kind !== "module")
        .slice(0, 5));
    }
    const selectedIds = new Set(selectedEntities.map((entity) => entity.stable_id));
    const selectedNames = new Set(selectedEntities.map((entity) => entity.name));
    const allRelevantRelations = snapshot.relations.filter((relation) => (
      selectedIds.has(relation.src_entity_id)
      || selectedIds.has(relation.dst_entity_id)
      || (impact && selectedNames.has(relation.unresolved_target?.split(".").at(-1)))
    ));
    const relationLimit = impact ? 120 : 80;
    const relevantRelations = allRelevantRelations.slice(0, relationLimit);
    const relationCandidatesTruncated = allRelevantRelations.length > relevantRelations.length;
    for (const relation of relevantRelations) {
      if (relation.src_entity_id) selectedIds.add(relation.src_entity_id);
      if (relation.dst_entity_id) selectedIds.add(relation.dst_entity_id);
    }
    const expandedEntities = snapshot.entities
      .filter((entity) => selectedIds.has(entity.stable_id))
      .sort((left, right) => {
        const selectedLeft = selectedEntities.includes(left) ? 0 : 1;
        const selectedRight = selectedEntities.includes(right) ? 0 : 1;
        return selectedLeft - selectedRight || left.qualified_name.localeCompare(right.qualified_name);
      })
      .slice(0, impact ? 60 : 30);
    const entityById = new Map(snapshot.entities.map((entity) => [entity.stable_id, entity]));
    const unresolved = relevantRelations.filter((relation) => !relation.dst_entity_id);
    const uncertain = relevantRelations.filter((relation) => (
      !relation.dst_entity_id || ["LOW", "UNKNOWN"].includes(relation.confidence)
    ));
    const selectedNameCounts = new Map();
    for (const entity of expandedEntities) {
      selectedNameCounts.set(entity.name, (selectedNameCounts.get(entity.name) ?? 0) + 1);
    }
    const ambiguousShortName = [...selectedNameCounts.values()].some((count) => count > 1);
    const risks = uniqueSorted([
      ...snapshot.health.risk_flags,
      ...expandedEntities.flatMap((entity) => entity.risk_flags),
      ...relevantRelations.flatMap((relation) => relation.risk_flags),
      ambiguousShortName ? "AMBIGUOUS_SYMBOL" : null,
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
        scope: impact
          ? "direct indexed static relations at the reported graph revision"
          : "indexed static semantics at the reported graph revision",
        returned_results: "BUDGETED",
        impact: impact && safetyStates.includes(SAFETY_STATE.IMPACT_INCOMPLETE)
          ? "INCOMPLETE"
          : (impact ? "DIRECT_STATIC" : "NOT_EVALUATED"),
        relation_scope: impact ? "DIRECT_STATIC" : "NOT_EVALUATED",
        known_unresolved_relations: unresolved.length,
        relevant_relation_count: allRelevantRelations.length,
        returned_relation_count: relevantRelations.length,
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
      suggestions: [],
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

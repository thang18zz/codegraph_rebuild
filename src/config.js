import { readFile, writeFile } from "node:fs/promises";
import { DEFAULT_CONFIG, MIN_MCP_BUDGET } from "./constants.js";

function parseScalar(value) {
  const trimmed = value.trim();
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const body = trimmed.slice(1, -1).trim();
    if (!body) return [];
    return body.split(",").map((item) => JSON.parse(item.trim()));
  }
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  return trimmed;
}

export function parseConfig(text) {
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

export function validateConfig(config) {
  const positiveIntegers = [
    "map_target_tokens",
    "map_hard_cap_tokens",
    "mcp_default_budget",
    "mcp_hard_cap",
    "compact_entity_limit",
    "generated_file_size_limit",
    "source_file_size_limit",
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

export function serializeConfig(config = DEFAULT_CONFIG) {
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
    "",
  ].join("\n");
}

export async function readConfig(path) {
  try {
    return parseConfig(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { ...DEFAULT_CONFIG, exclude: [] };
    throw error;
  }
}

export async function writeDefaultConfig(path) {
  await writeFile(path, serializeConfig(), { encoding: "utf8", flag: "wx" });
}

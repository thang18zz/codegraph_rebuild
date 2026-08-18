export const VERSION = "0.1.0";
export const SCHEMA_VERSION = 3;
export const PARSER_VERSION = "tree-sitter-wasm-vscode-0.3.1-csharp-1";

export const CODEGRAPH_DIR = ".codegraph";
export const DB_FILE = "graph.db";
export const STATE_FILE = "state.json";
export const CONFIG_FILE = "config.toml";
export const MAP_FILE = "codegraph.py";
export const MIN_MCP_BUDGET = 1024;

export const GRAPH_STATUS = Object.freeze({
  FRESH: "FRESH",
  SYNCING: "SYNCING",
  PARTIAL: "PARTIAL",
  STALE: "STALE",
  BROKEN: "BROKEN",
});

export const CONFIDENCE = Object.freeze({
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  UNKNOWN: "UNKNOWN",
});

export const CLASSIFICATION = Object.freeze({
  FIRST_PARTY: "FIRST_PARTY",
  TEST: "TEST",
  CONFIG: "CONFIG",
  INFRASTRUCTURE: "INFRASTRUCTURE",
  GENERATED: "GENERATED",
  VENDOR: "VENDOR",
  BUILD: "BUILD",
  DOCUMENTATION: "DOCUMENTATION",
  UNKNOWN: "UNKNOWN",
});

export const RISK = Object.freeze({
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
  AMBIGUOUS_SYMBOL: "AMBIGUOUS_SYMBOL",
});

export const SAFETY_STATE = Object.freeze({
  NAVIGATION_SAFE: "NAVIGATION_SAFE",
  SOURCE_INSPECTION_REQUIRED: "SOURCE_INSPECTION_REQUIRED",
  IMPACT_INCOMPLETE: "IMPACT_INCOMPLETE",
  GRAPH_STALE: "GRAPH_STALE",
  GRAPH_PARTIAL: "GRAPH_PARTIAL",
});

export const RETRIEVAL_STATUS = Object.freeze({
  EXACT: "EXACT",
  STRONG: "STRONG",
  WEAK: "WEAK",
  NO_MATCH: "NO_MATCH",
  ROUTING: "ROUTING",
});

export const DEFAULT_CONFIG = Object.freeze({
  map_target_tokens: 1000,
  map_hard_cap_tokens: 1500,
  mcp_default_budget: 2000,
  mcp_hard_cap: 3000,
  compact_entity_limit: 250,
  generated_file_size_limit: 1_000_000,
  source_file_size_limit: 5_000_000,
  exclude: [],
});

export const MAP_OWNERSHIP_MARKER = "PORTABLE CODEGRAPH SEMANTIC MAP";

export const LANGUAGE_BY_EXTENSION = Object.freeze({
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
  ".go": "go",
  ".cs": "csharp",
});

export const DEFAULT_IGNORED_DIRECTORIES = new Set([
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
  "venv",
]);

export const INCOMPLETE_RISKS = new Set([
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
  RISK.AMBIGUOUS_SYMBOL,
]);

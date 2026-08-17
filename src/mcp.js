import { watch } from "node:fs";
import { readConfig } from "./config.js";
import { MIN_MCP_BUDGET } from "./constants.js";
import {
  BUDGET_BYTES_PER_UNIT,
  budgetByteLimit,
  utf8Bytes,
} from "./context-map.js";
import { semanticExplore } from "./query.js";
import { artifactPaths, synchronizeProject } from "./sync.js";
import { hashBytes } from "./ir.js";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const MAX_INPUT_FRAME_BYTES = 64 * 1024;
const TOOL_ARGUMENT_KEYS = new Set(["task", "focus", "known_symbols", "context_id", "budget"]);

function errorResponse(id, code, message, data = undefined) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

class InputFramer {
  constructor(onMessage) {
    this.buffer = Buffer.alloc(0);
    this.discardingOversizedFrame = false;
    this.onMessage = onMessage;
  }

  push(chunk) {
    if (this.discardingOversizedFrame) {
      const newline = chunk.indexOf(0x0a);
      if (newline < 0) return;
      chunk = chunk.subarray(newline + 1);
      this.discardingOversizedFrame = false;
    }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length > 0) {
      const newline = this.buffer.indexOf(0x0a);
      if (newline < 0) {
        if (this.buffer.length > MAX_INPUT_FRAME_BYTES) {
          this.buffer = Buffer.alloc(0);
          this.discardingOversizedFrame = true;
          const error = Object.assign(new Error("MCP input frame exceeds 65536 bytes"), {
            code: "MCP_FRAME_TOO_LARGE",
          });
          this.onMessage(null, error);
        }
        return;
      }
      if (newline > MAX_INPUT_FRAME_BYTES) {
        this.buffer = this.buffer.subarray(newline + 1);
        const error = Object.assign(new Error("MCP input frame exceeds 65536 bytes"), {
          code: "MCP_FRAME_TOO_LARGE",
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
}

function writeMessage(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`${body}\n`);
}

function wireBytes(id, result) {
  return utf8Bytes(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function pathDescriptor(path) {
  return {
    basename: path.split("/").at(-1),
    path_sha256: hashBytes(path),
    path_truncated: true,
  };
}

function fullToolResult(explored) {
  return {
    content: [{ type: "text", text: "Semantic result is in structuredContent." }],
    structuredContent: explored,
    isError: false,
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
      retrieval_status: explored.retrieval_status,
      last_known_good_revision: explored.last_known_good_revision ?? null,
      safety_states: (explored.safety_states ?? [explored.safety_state]).filter(Boolean),
      truncated: true,
      stale_file_count: explored.stale_file_count ?? explored.stale_files?.length ?? 0,
      stale_files: stalePath ? [stalePath] : [],
      stale_provenance: stale
        ? [{
          file_path: stale.file_path,
          last_good_revision: stale.last_good_revision,
          source_location: stale.source_location
            ? { start_line: stale.source_location.start_line }
            : null,
        }]
        : [],
      ...(explored.stale_path ? { stale_path: explored.stale_path } : {}),
      unsupported_file_count: explored.unsupported_file_count ?? 0,
      unsupported_files: unsupportedPath ? [unsupportedPath] : [],
      ...(explored.unsupported_path ? { unsupported_path: explored.unsupported_path } : {}),
      impact: explored.completeness?.impact ?? "NOT_EVALUATED",
      relation_scope: explored.completeness?.relation_scope ?? "NOT_EVALUATED",
      notice: "Omission is not absence; inspect source.",
    },
    isError: false,
  };
  if (wireBytes(id, compact) > byteLimit) delete compact.structuredContent.context_id;
  if (wireBytes(id, compact) > byteLimit && stale) {
    compact.structuredContent.stale_provenance = [{
      file_path: stale.file_path,
      last_good_revision: stale.last_good_revision,
    }];
  }
  if (wireBytes(id, compact) > byteLimit && stalePath) {
    compact.structuredContent.stale_path = pathDescriptor(stalePath);
    compact.structuredContent.stale_files = [];
    compact.structuredContent.stale_provenance = [];
  }
  if (wireBytes(id, compact) > byteLimit && unsupportedPath) {
    compact.structuredContent.unsupported_path = pathDescriptor(unsupportedPath);
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
      code: "QUERY_BUDGET_TOO_SMALL",
    });
  }
  return compact;
}

function validateToolArguments(arguments_) {
  if (!arguments_ || typeof arguments_ !== "object" || Array.isArray(arguments_)) {
    return "semantic_explore arguments must be an object";
  }
  if (Object.keys(arguments_).some((key) => !TOOL_ARGUMENT_KEYS.has(key))) {
    return "semantic_explore arguments contain unsupported properties";
  }
  if (typeof arguments_.task !== "string" || arguments_.task.trim() === "" || [...arguments_.task].length > 4096) {
    return "task must be a non-empty string of at most 4096 characters";
  }
  if (arguments_.focus !== undefined
      && (typeof arguments_.focus !== "string" || [...arguments_.focus].length > 512)) {
    return "focus must be a string of at most 512 characters";
  }
  if (arguments_.known_symbols !== undefined
      && (!Array.isArray(arguments_.known_symbols)
        || arguments_.known_symbols.length > 20
        || !arguments_.known_symbols.every((value) => typeof value === "string" && [...value].length <= 256))) {
    return "known_symbols must contain at most 20 strings of at most 256 characters";
  }
  if (arguments_.context_id !== undefined
      && (typeof arguments_.context_id !== "string" || [...arguments_.context_id].length > 128)) {
    return "context_id must be a string of at most 128 characters";
  }
  if (arguments_.budget !== undefined
      && (!Number.isSafeInteger(arguments_.budget) || arguments_.budget < MIN_MCP_BUDGET)) {
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
      process.stderr.write(`WATCH_SYNC_FAILED: ${error.message}\n`);
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
      process.stderr.write(`WATCHER_UNAVAILABLE: ${error.message}; freshness barriers remain active.\n`);
      watcher.close();
    });
  } catch (error) {
    process.stderr.write(`WATCHER_UNAVAILABLE: ${error.message}; freshness barriers remain active.\n`);
  }
  return () => {
    clearTimeout(timer);
    watcher?.close();
  };
}

export async function runMcpServer(root) {
  const config = await readConfig(artifactPaths(root).config);
  const contexts = new Map();
  const closeWatcher = startWatcher(root);
  let chain = Promise.resolve();
  let initialized = false;

  async function handle(message) {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      writeMessage(errorResponse(message?.id ?? null, -32600, "Invalid JSON-RPC request"));
      return;
    }
    if (!Object.hasOwn(message, "id")) return;
    const id = message.id ?? null;
    if (!(typeof id === "string" || (typeof id === "number" && Number.isSafeInteger(id)))) {
      writeMessage(errorResponse(null, -32600, "JSON-RPC id must be a string or safe integer"));
      return;
    }
    try {
      let result;
      if (message.method === "initialize") {
        const params = message.params;
        if (!params || typeof params !== "object" || Array.isArray(params)
            || typeof params.protocolVersion !== "string"
            || !params.capabilities || typeof params.capabilities !== "object" || Array.isArray(params.capabilities)
            || !params.clientInfo || typeof params.clientInfo !== "object" || Array.isArray(params.clientInfo)
            || typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string") {
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
          instructions: "Use semantic_explore for minimum sufficient navigation context. Source remains authoritative.",
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
                  maxItems: 20,
                },
                context_id: { type: "string", maxLength: 128 },
                budget: {
                  type: "integer",
                  minimum: MIN_MCP_BUDGET,
                  maximum: Number.MAX_SAFE_INTEGER,
                  description: "Serialized-response budget; one unit permits one UTF-8 byte. This is not a model-token count.",
                },
              },
            },
          }],
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
        const arguments_ = { ...message.params.arguments };
        const outerBudget = Math.min(
          Number.isSafeInteger(arguments_.budget) ? arguments_.budget : config.mcp_default_budget,
          config.mcp_hard_cap,
        );
        const shellOverhead = wireBytes(id, fullToolResult({})) - utf8Bytes("{}");
        const availableStructuredBytes = Math.max(0, budgetByteLimit(outerBudget) - shellOverhead);
        arguments_.budget = Math.max(
          MIN_MCP_BUDGET,
          Math.floor(availableStructuredBytes / BUDGET_BYTES_PER_UNIT),
        );
        const explored = await semanticExplore(root, arguments_, contexts);
        result = boundedToolResult(id, explored, outerBudget);
      } else {
        writeMessage(errorResponse(id, -32601, `Method not found: ${message.method}`));
        return;
      }
      writeMessage({ jsonrpc: "2.0", id, result });
    } catch (error) {
      const jsonRpcCode = ["INVALID_QUERY", "QUERY_BUDGET_TOO_SMALL"].includes(error.code) ? -32602 : -32000;
      writeMessage(errorResponse(id, jsonRpcCode, error.message, { code: error.code ?? "INTERNAL_ERROR" }));
    }
  }

  const framer = new InputFramer((message, error) => {
    if (error) {
      const code = error.code === "MCP_FRAME_TOO_LARGE" ? -32600 : -32700;
      writeMessage(errorResponse(null, code, error.message));
      return;
    }
    chain = chain.then(() => handle(message));
  });
  process.stdin.on("data", (chunk) => framer.push(chunk));
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once("end", resolve));
  await chain;
  closeWatcher();
}

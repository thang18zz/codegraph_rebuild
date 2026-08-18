import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { artifactPaths, initializeProject } from "../src/sync.js";
import { requireSymlinkCapability, temporaryProject } from "./helpers.js";

const launcher = resolve("bin/codegraph.js");
const initialize = (id = 1) => ({
  jsonrpc: "2.0",
  id,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
});

function runMcpInput(cwd, input) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [launcher, "mcp"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("MCP subprocess timed out"));
    }, 10_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`MCP exited ${code}: ${stderr}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function runMcp(cwd, messages) {
  return runMcpInput(cwd, messages.map((message) => `${JSON.stringify(message)}\n`).join(""));
}

function framedBytes(line) {
  return Buffer.byteLength(`${line}\n`, "utf8");
}

test("stdio MCP negotiates a fixed protocol and serves one bounded semantic tool", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    helper()\n\ndef helper():\n    pass\n");
  await initializeProject(project.root);
  const messages = [
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { ...initialize(), params: { ...initialize().params, protocolVersion: "unsupported-version" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "missing", arguments: {} } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "semantic_explore", arguments: { task: "inspect main", focus: "main", budget: 2000 } } },
  ];
  const { stdout } = await runMcp(project.root, messages);
  assert.equal(stdout.includes("Content-Length:"), false);
  const responses = stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(responses.map((response) => response.id), [1, 2, 3, 4]);
  assert.equal(responses[0].result.protocolVersion, "2025-06-18");
  assert.deepEqual(responses[1].result.tools.map((tool) => tool.name), ["semantic_explore"]);
  assert.equal(responses[2].error.code, -32602);
  assert.ok(responses[3].result.structuredContent.graph_revision >= 1);
  assert.equal(responses[3].result.structuredContent.graph_status, "FRESH");
  assert.equal(responses[3].result.content.length, 1);
  assert.ok(framedBytes(stdout.trim().split("\n").at(-1)) <= 2000);
});

test("bounded MCP keeps a direct graph expansion before dropping entities", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("AuthController.cs", `namespace Demo;
public interface IAuthService {}
public class AuthController
{
    private readonly IAuthService _authService;
    public AuthController(IAuthService authService) { _authService = authService; }
}
`);
  await initializeProject(project.root);
  const { stdout } = await runMcp(project.root, [
    initialize(),
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "semantic_explore",
        arguments: { task: "Trace AuthController dependencies", focus: "AuthController", budget: 3000 },
      },
    },
  ]);
  const line = stdout.trim().split("\n").at(-1);
  const response = JSON.parse(line);
  assert.ok(framedBytes(line) <= 3000);
  assert.ok(response.result.structuredContent.entities.some((entity) => (
    entity.qualified_name === "Demo.IAuthService" && entity.selection_origin === "GRAPH_EXPANSION"
  )));
});

test("tiny-budget MCP stale responses retain mandatory safety provenance", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("auth.py", "def login():\n    return True\n");
  await initializeProject(project.root);
  await project.write("auth.py", "def login(:\n");
  const { stdout } = await runMcp(project.root, [
    initialize(),
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "semantic_explore", arguments: { task: "inspect login", focus: "login", budget: 1024 } } },
  ]);
  const line = stdout.trim().split("\n").at(-1);
  const response = JSON.parse(line);
  assert.ok(framedBytes(line) <= 1024);
  const structured = response.result.structuredContent;
  assert.equal(structured.graph_status, "PARTIAL");
  assert.equal(structured.last_known_good_revision, 1);
  assert.ok(structured.safety_states.includes("GRAPH_PARTIAL"));
  assert.ok(structured.safety_states.includes("SOURCE_INSPECTION_REQUIRED"));
  assert.equal(structured.stale_provenance[0].file_path, "auth.py");
  assert.equal(structured.stale_provenance[0].last_good_revision, 1);
  assert.equal(structured.stale_provenance[0].source_location.start_line, 1);
});

test("tiny-budget MCP impact responses retain structured fail-closed scope", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("api.py", "def public_api():\n    pass\n");
  await initializeProject(project.root);
  const { stdout } = await runMcp(project.root, [
    initialize(),
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "semantic_explore",
        arguments: { task: "retire public_api", focus: "public_api", budget: 1024 },
      },
    },
  ]);
  const line = stdout.trim().split("\n").at(-1);
  const response = JSON.parse(line);
  assert.ok(framedBytes(line) <= 1024);
  const structured = response.result.structuredContent;
  assert.equal(structured.completeness?.impact ?? structured.impact, "INCOMPLETE");
  assert.equal(structured.completeness?.relation_scope ?? structured.relation_scope, "DIRECT_STATIC");
  assert.ok(structured.safety_states.includes("IMPACT_INCOMPLETE"));
  assert.ok(structured.safety_states.includes("SOURCE_INSPECTION_REQUIRED"));
});

test("minimum-budget MCP responses retain combined stale and impact safety", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("api.py", "def target():\n    pass\n");
  await initializeProject(project.root);
  await project.write("api.py", "def target(:\n");
  const { stdout } = await runMcp(project.root, [
    initialize(),
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "semantic_explore",
        arguments: { task: "remove target", focus: "target", budget: 1024 },
      },
    },
  ]);
  const line = stdout.trim().split("\n").at(-1);
  const response = JSON.parse(line);
  assert.ok(framedBytes(line) <= 1024);
  assert.equal(response.error, undefined);
  const structured = response.result.structuredContent;
  assert.equal(structured.graph_status, "PARTIAL");
  assert.ok(structured.safety_states.includes("GRAPH_PARTIAL"));
  assert.ok(structured.safety_states.includes("IMPACT_INCOMPLETE"));
  assert.ok(structured.safety_states.includes("SOURCE_INSPECTION_REQUIRED"));
  assert.equal(structured.completeness?.impact ?? structured.impact, "INCOMPLETE");
});

test("MCP rejects arguments that do not match the advertised tool schema", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const { stdout } = await runMcp(project.root, [
    initialize(),
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "semantic_explore", arguments: { task: "inspect main", unexpected: true } },
    },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "semantic_explore", arguments: { task: "inspect main", known_symbols: "main" } },
    },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "semantic_explore",
        arguments: { task: "inspect main", known_symbols: Array.from({ length: 21 }, () => "main") },
      },
    },
  ]);
  const responses = stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(responses.slice(1).map((response) => response.error.code), [-32602, -32602, -32602]);
});

test("stdio MCP rejects an oversized frame and continues at the next frame", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const input = `${"x".repeat((64 * 1024) + 1)}\n${JSON.stringify(initialize())}\n`;
  const { stdout } = await runMcpInput(project.root, input);
  const responses = stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses[0].id, null);
  assert.equal(responses[0].error.code, -32600);
  assert.equal(responses[1].id, 1);
  assert.equal(responses[1].result.protocolVersion, "2025-06-18");
});

test("MCP validates initialization and rejects repeated initialization", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const { stdout } = await runMcp(project.root, [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: [] },
    initialize(2),
    initialize(3),
  ]);
  const responses = stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses[0].error.code, -32602);
  assert.equal(responses[1].result.protocolVersion, "2025-06-18");
  assert.equal(responses[2].error.code, -32600);
});

test("MCP reports graph corruption as a correlated JSON-RPC error", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const database = new DatabaseSync(artifactPaths(project.root).db);
  database.prepare("UPDATE entities SET signature = ? WHERE name = ?").run("forged", "main");
  database.close();
  const { stdout } = await runMcp(project.root, [
    initialize(),
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "semantic_explore", arguments: { task: "inspect main", focus: "main" } },
    },
  ]);
  const responses = stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses[0].result.protocolVersion, "2025-06-18");
  assert.equal(responses[1].error.code, -32000);
  assert.equal(responses[1].error.data.code, "GRAPH_CORRUPTED");
});

test("MCP rejects invalid UTF-8 and invalid IDs without losing the next request", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const malformed = Buffer.concat([
    Buffer.from('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"', "utf8"),
    Buffer.from([0x80]),
    Buffer.from('","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}\n', "utf8"),
  ]);
  const messages = [
    { jsonrpc: "2.0", id: null, method: "initialize", params: initialize().params },
    { jsonrpc: "2.0", id: 1.5, method: "initialize", params: initialize().params },
    initialize("x".repeat(65)),
  ].map((message) => `${JSON.stringify(message)}\n`).join("");
  const { stdout } = await runMcpInput(project.root, Buffer.concat([malformed, Buffer.from(messages)]));
  const responses = stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses[0].error.code, -32700);
  assert.equal(responses[1].error.code, -32600);
  assert.equal(responses[2].error.code, -32600);
  assert.equal(responses[3].id, "x".repeat(65));
  assert.equal(responses[3].result.protocolVersion, "2025-06-18");
});

test("MCP validates schema string lengths by Unicode code points", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("app.py", "def main():\n    pass\n");
  await initializeProject(project.root);
  const { stdout } = await runMcp(project.root, [
    initialize(),
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "semantic_explore", arguments: { task: "😀".repeat(3000) } },
    },
  ]);
  const response = JSON.parse(stdout.trim().split("\n").at(-1));
  assert.equal(response.id, 2);
  assert.equal(response.error, undefined);
  assert.ok(response.result.structuredContent.graph_revision >= 1);
});

test("compact MCP provenance uses exact paths or explicit hashed truncation", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const relativePath = `${Array.from({ length: 8 }, (_, index) => `deep_segment_${index}`).join("/")}/auth_source_module.py`;
  await project.write(relativePath, "def login():\n    return True\n");
  await initializeProject(project.root);
  await project.write(relativePath, "def login(:\n");
  const { stdout } = await runMcp(project.root, [
    initialize(),
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "semantic_explore",
        arguments: {
          task: "inspect login",
          focus: "login",
          context_id: "c".repeat(128),
          budget: 1024,
        },
      },
    },
  ]);
  const line = stdout.trim().split("\n").at(-1);
  const response = JSON.parse(line);
  assert.ok(framedBytes(line) <= 1024);
  assert.equal(response.error, undefined);
  const structured = response.result.structuredContent;
  const exactPath = structured.stale_files?.[0] ?? structured.stale_provenance?.[0]?.file_path;
  if (exactPath) assert.equal(exactPath, relativePath);
  else {
    assert.equal(structured.stale_path.path_truncated, true);
    assert.match(structured.stale_path.path_sha256, /^[a-f0-9]{64}$/u);
  }
  assert.equal(JSON.stringify(structured).includes("..."), false);
});

test("compact MCP preserves skipped-boundary path evidence without file provenance", async (t) => {
  if (!(await requireSymlinkCapability(t))) return;
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await symlink("missing-target.py", join(project.root, "plugin.py"));
  await initializeProject(project.root);
  const { stdout } = await runMcp(project.root, [
    initialize(),
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "semantic_explore",
        arguments: { task: "what breaks if plugin changes?", budget: 1024 },
      },
    },
  ]);
  const response = JSON.parse(stdout.trim().split("\n").at(-1));
  const structured = response.result.structuredContent;
  assert.ok(structured.stale_files?.includes("plugin.py") || structured.stale_path?.path_sha256);
  assert.ok(structured.safety_states.includes("GRAPH_PARTIAL"));
});

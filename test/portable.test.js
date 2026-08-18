import assert from "node:assert/strict";
import { chmod, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { sourceHashes, temporaryProject } from "./helpers.js";

function execute(command, args, cwd, input = null) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { PATH: "", NODE_PATH: "/nonexistent", HOME: process.env.HOME ?? "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    if (input === null) child.stdin.end();
    else child.stdin.end(input);
  });
}

test("relocated standalone runs lifecycle and semantic MCP without project runtimes", {
  skip: process.env.CODEGRAPH_BIN ? false : "CODEGRAPH_BIN is set by npm run verify",
}, async (t) => {
  const project = await temporaryProject("codegraph portable \u0111\u1ed3-");
  const toolProject = await temporaryProject("codegraph tools \u0111\u1ed3-");
  t.after(() => project.cleanup());
  t.after(() => toolProject.cleanup());
  await project.write("src/app.py", "def main():\n    return 1\n");
  await project.write("src/AuthController.cs", `
namespace Portable.Api;
[ApiController]
[Route("api/auth")]
public class AuthController {
  [HttpPost("login")]
  public void Login() {}
}
`);
  await project.write("src/OrderService.java", `
package portable.shop;
enum OrderState { OPEN, PAID }
class OrderRepository { void save(String id) {} }
public class OrderService {
  private OrderRepository repository;
  public void checkout(String id) { repository.save(id); }
}
`);
  const before = await sourceHashes(project.root);
  const moved = join(toolProject.root, process.platform === "win32" ? "renamed-codegraph.exe" : "renamed-codegraph");
  await copyFile(process.env.CODEGRAPH_BIN, moved);
  if (process.platform !== "win32") await chmod(moved, 0o755);

  const initialized = await execute(moved, ["init"], project.root);
  assert.equal(initialized.code, 0, initialized.stderr);
  const initResult = JSON.parse(initialized.stdout);
  assert.equal(initResult.revision, 1);
  assert.equal(initResult.status, "FRESH");
  assert.deepEqual(await sourceHashes(project.root), before);

  const status = await execute(moved, ["status"], project.root);
  assert.equal(status.code, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).graph_status, "FRESH");
  const synced = await execute(moved, ["sync"], project.root);
  assert.equal(synced.code, 0, synced.stderr);
  assert.equal(JSON.parse(synced.stdout).changed, false);
  await project.write("src/app.py", "def main():\n    return 2\n");
  const resynced = await execute(moved, ["sync"], project.root);
  assert.equal(resynced.code, 0, resynced.stderr);
  assert.equal(JSON.parse(resynced.stdout).revision, 2);
  const reopened = await execute(moved, ["status"], project.root);
  assert.equal(reopened.code, 0, reopened.stderr);
  assert.equal(JSON.parse(reopened.stdout).graph_revision, 2);
  assert.equal(JSON.parse(reopened.stdout).graph_status, "FRESH");
  const doctor = await execute(moved, ["doctor"], project.root);
  assert.equal(doctor.code, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).ok, true);
  const beforeMcp = await sourceHashes(project.root);
  const mcpMessages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "portable-test", version: "1" } },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "semantic_explore",
        arguments: { task: "inspect main", focus: "main", budget: 3000 },
      },
    },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "semantic_explore",
        arguments: { task: "inspect AuthController", focus: "AuthController", budget: 3000 },
      },
    },
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "semantic_explore",
        arguments: { task: "inspect Java OrderService", focus: "portable.shop.OrderService", budget: 3000 },
      },
    },
  ];
  const mcp = await execute(
    moved,
    ["mcp"],
    project.root,
    `${mcpMessages.map((message) => JSON.stringify(message)).join("\n")}\n`,
  );
  assert.equal(mcp.code, 0, mcp.stderr);
  const mcpLines = mcp.stdout.trim().split("\n");
  const mcpResponses = mcpLines.map((line) => JSON.parse(line));
  assert.equal(mcpResponses[0].result.protocolVersion, "2025-06-18");
  assert.deepEqual(mcpResponses[1].result.tools.map((tool) => tool.name), ["semantic_explore"]);
  const explored = mcpResponses[2].result.structuredContent;
  assert.equal(explored.graph_revision, 2);
  assert.equal(explored.retrieval_status, "EXACT");
  assert.ok(explored.entities.some((entity) => entity.name === "main"));
  assert.ok(Array.isArray(explored.safety_states));
  assert.ok(Buffer.byteLength(`${mcpLines[2]}\n`, "utf8") <= 3000);
  const csharpExplored = mcpResponses[3].result.structuredContent;
  assert.equal(csharpExplored.retrieval_status, "EXACT");
  assert.ok(csharpExplored.entities.some((entity) => entity.name === "AuthController"));
  assert.ok(Buffer.byteLength(`${mcpLines[3]}\n`, "utf8") <= 3000);
  const javaExplored = mcpResponses[4].result.structuredContent;
  assert.equal(javaExplored.retrieval_status, "EXACT");
  assert.ok(javaExplored.entities.some((entity) => entity.name === "OrderService"));
  assert.ok(Buffer.byteLength(`${mcpLines[4]}\n`, "utf8") <= 3000);
  assert.deepEqual(await sourceHashes(project.root), beforeMcp);
  const integration = await execute(moved, ["integrate", "test-client"], project.root);
  assert.equal(integration.code, 0, integration.stderr);
  assert.equal(JSON.parse(integration.stdout).command, moved);
  assert.deepEqual(await sourceHashes(project.root), beforeMcp);
});

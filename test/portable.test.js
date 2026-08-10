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

test("relocated standalone executable runs init and status without PATH or project runtimes", {
  skip: process.env.CODEGRAPH_BIN ? false : "CODEGRAPH_BIN is set by npm run verify",
}, async (t) => {
  const project = await temporaryProject("codegraph-portable-");
  const toolProject = await temporaryProject("codegraph-tools-");
  t.after(() => project.cleanup());
  t.after(() => toolProject.cleanup());
  await project.write("src/app.py", "def main():\n    return 1\n");
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
  const doctor = await execute(moved, ["doctor"], project.root);
  assert.equal(doctor.code, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).ok, true);
  const mcp = await execute(moved, ["mcp"], project.root, `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "portable-test", version: "1" } },
  })}\n`);
  assert.equal(mcp.code, 0, mcp.stderr);
  assert.equal(JSON.parse(mcp.stdout.trim()).result.protocolVersion, "2025-06-18");
  const integration = await execute(moved, ["integrate", "test-client"], project.root);
  assert.equal(integration.code, 0, integration.stderr);
  assert.equal(JSON.parse(integration.stdout).command, moved);
});

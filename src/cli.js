import { resolve } from "node:path";
import { isSea } from "node:sea";
import { VERSION } from "./constants.js";
import { diagnoseProject } from "./doctor.js";
import { CodeGraphError } from "./errors.js";
import { AGENT_INSTRUCTIONS } from "./instructions.js";
import { runMcpServer } from "./mcp.js";
import { detectProjectRoot } from "./project.js";
import {
  initializeProject,
  projectStatus,
  rebuildProject,
  synchronizeProject,
} from "./sync.js";

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function help() {
  return `Portable CodeGraph ${VERSION}

Usage: codegraph <command>

Commands:
  init                 Initialize the project-local graph and routing map
  status               Show graph freshness, health, revision, and profile
  sync                 Reconcile source and publish one semantic revision
  rebuild              Rebuild all derived graph state from source
  mcp                  Run the stdio MCP server
  doctor               Check graph integrity and materialization consistency
  instructions         Print compact coding-agent instructions
  integrate <client>   Print an absolute-path MCP registration descriptor
  version              Print the executable version
  help                 Show this help
`;
}

function integrationDescriptor(client) {
  const script = resolve(process.argv[1]);
  const command = process.execPath;
  const args = isSea() ? ["mcp"] : [script, "mcp"];
  return {
    client,
    transport: "stdio",
    command,
    args,
    tool: "semantic_explore",
    instructions: AGENT_INSTRUCTIONS,
    note: "Register this descriptor in the named client's MCP configuration. No PATH installation is required.",
  };
}

export async function run(arguments_) {
  const [command = "help", ...argumentsRest] = arguments_;
  if (command === "integrate") {
    if (argumentsRest.length !== 1) {
      throw new CodeGraphError("CLIENT_REQUIRED", "Usage: codegraph integrate <client>", 2);
    }
    output(integrationDescriptor(argumentsRest[0]));
    return;
  }
  if (argumentsRest.length > 0) {
    throw new CodeGraphError("INVALID_ARGUMENT", `Unexpected arguments for ${command}: ${argumentsRest.join(" ")}`, 2);
  }
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(help());
    return;
  }
  if (["version", "--version", "-v"].includes(command)) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (command === "instructions") {
    process.stdout.write(AGENT_INSTRUCTIONS);
    return;
  }
  if (command === "init") {
    const root = await detectProjectRoot(process.cwd(), false);
    output({ command, project_root: root, ...(await initializeProject(root)) });
    return;
  }
  const root = await detectProjectRoot(process.cwd(), true);
  if (command === "status") {
    output({ command, project_root: root, ...(await projectStatus(root)) });
  } else if (command === "sync") {
    output({ command, project_root: root, ...(await synchronizeProject(root)) });
  } else if (command === "rebuild") {
    output({ command, project_root: root, ...(await rebuildProject(root)) });
  } else if (command === "doctor") {
    const diagnosis = await diagnoseProject(root);
    output({ command, project_root: root, ...diagnosis });
    if (!diagnosis.ok) process.exitCode = 3;
  } else if (command === "mcp") {
    await runMcpServer(root);
  } else {
    throw new CodeGraphError("UNKNOWN_COMMAND", `Unknown command: ${command}\n\n${help()}`, 2);
  }
}

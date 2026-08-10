import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const [command, arguments_] of [
  [process.execPath, [join(root, "scripts", "build.js")]],
  [process.execPath, ["--test"]],
]) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CODEGRAPH_BIN: join(root, "dist", process.platform === "win32" ? "codegraph.exe" : "codegraph"),
    },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { assetPaths } from "../src/assets.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(projectRoot, "dist");
const bundle = join(dist, "codegraph.bundle.mjs");
const executable = join(dist, process.platform === "win32" ? "codegraph.exe" : "codegraph");
const configDirectory = await mkdtemp(join(tmpdir(), "codegraph-sea-"));
const configPath = join(configDirectory, "sea-config.json");

await mkdir(dist, { recursive: true });
await build({
  entryPoints: [join(projectRoot, "bin", "codegraph.js")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node25",
  sourcemap: false,
  minify: false,
  define: { "import.meta.url": "__codegraphImportMetaUrl" },
  banner: {
    js: 'import { pathToFileURL as __codegraphPathToFileURL } from "node:url"; const __codegraphImportMetaUrl = __codegraphPathToFileURL(process.execPath).href;',
  },
});

const config = {
  main: bundle,
  mainFormat: "module",
  executable: process.execPath,
  output: executable,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  execArgv: ["--no-warnings"],
  execArgvExtension: "none",
  assets: Object.fromEntries(Object.entries(assetPaths()).map(([key, value]) => [key, value])),
};
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
const result = spawnSync(process.execPath, ["--build-sea", configPath], {
  cwd: projectRoot,
  encoding: "utf8",
});
await rm(configDirectory, { recursive: true, force: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "SEA build failed\n");
  process.exit(result.status ?? 1);
}
if (process.platform !== "win32") await chmod(executable, 0o755);
if (process.platform === "darwin") {
  const signing = spawnSync("codesign", ["--sign", "-", executable], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (signing.status !== 0) {
    process.stderr.write(signing.stderr || signing.stdout || "SEA ad-hoc signing failed\n");
    process.exit(signing.status ?? 1);
  }
}
await copyFile(join(projectRoot, "THIRD_PARTY_NOTICES.md"), join(dist, "THIRD_PARTY_NOTICES.md"));
process.stdout.write(`${executable}\n`);

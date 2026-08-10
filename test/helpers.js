import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function temporaryProject(prefix = "codegraph-test-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, ".git"));
  return {
    root,
    async write(path, content) {
      const absolute = join(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
      return absolute;
    },
    async read(path) {
      return readFile(join(root, path), "utf8");
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function hashDirectory(directory, root, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if ([".git", ".codegraph"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await hashDirectory(absolute, root, output);
    else if (entry.isFile()) {
      const relative = absolute.slice(root.length + 1).replaceAll("\\", "/");
      const bytes = await readFile(absolute);
      if (relative === "codegraph.py"
          && bytes.subarray(0, 512).toString("utf8").includes("PORTABLE CODEGRAPH SEMANTIC MAP")) {
        continue;
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      output.push([relative, digest]);
    }
  }
}

export async function sourceHashes(root) {
  const values = [];
  await hashDirectory(root, root, values);
  return values;
}

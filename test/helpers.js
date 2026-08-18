import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const symlinkCapabilities = new Map();

export function symlinkCapability(type = "file") {
  if (symlinkCapabilities.has(type)) return symlinkCapabilities.get(type);
  const probe = (async () => {
    const root = await mkdtemp(join(tmpdir(), "codegraph-symlink-capability-"));
    const target = join(root, type === "dir" ? "target-directory" : "target-file");
    const link = join(root, "probe-link");
    try {
      if (type === "dir") await mkdir(target);
      else await writeFile(target, "probe", "utf8");
      try {
        await symlink(target, link, type === "dir" ? "dir" : "file");
      } catch (error) {
        if (["EACCES", "EPERM"].includes(error.code)) {
          return { status: "UNAVAILABLE_PRIVILEGE", error_code: error.code };
        }
        if (["ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(error.code)) {
          return { status: "UNAVAILABLE_FILESYSTEM", error_code: error.code };
        }
        return { status: "UNEXPECTED_ERROR", error_code: error.code ?? "UNKNOWN", message: error.message };
      }
      const metadata = await lstat(link);
      if (!metadata.isSymbolicLink()) {
        return { status: "UNEXPECTED_ERROR", error_code: "NOT_A_SYMLINK" };
      }
      return { status: "SUPPORTED", error_code: null };
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  })();
  symlinkCapabilities.set(type, probe);
  return probe;
}

export async function requireSymlinkCapability(t, type = "file") {
  const capability = await symlinkCapability(type);
  if (capability.status === "SUPPORTED") return true;
  if (["UNAVAILABLE_PRIVILEGE", "UNAVAILABLE_FILESYSTEM"].includes(capability.status)) {
    t.skip(`SKIP_CAPABILITY: ${capability.status} (${capability.error_code})`);
    return false;
  }
  throw new Error(`Symlink capability probe failed unexpectedly: ${JSON.stringify(capability)}`);
}

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

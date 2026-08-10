import { lstat, readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import {
  CLASSIFICATION,
  CODEGRAPH_DIR,
  DEFAULT_IGNORED_DIRECTORIES,
  LANGUAGE_BY_EXTENSION,
  MAP_FILE,
} from "./constants.js";
import { CodeGraphError } from "./errors.js";
import { readFileNoFollow, readPrefixNoFollow } from "./fs-safe.js";

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function detectProjectRoot(start = process.cwd(), initializedOnly = false) {
  let current = resolve(start);
  while (true) {
    if (await exists(join(current, CODEGRAPH_DIR))) return current;
    if (!initializedOnly && (await exists(join(current, ".git")))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (initializedOnly) {
    throw new CodeGraphError(
      "PROJECT_NOT_INITIALIZED",
      "No initialized .codegraph directory was found in this directory or its parents.",
      2,
    );
  }
  return resolve(start);
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function wildcardToRegExp(pattern) {
  const normalized = pattern.replace(/^\//u, "").replace(/\/$/u, "/**");
  let expression = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
    }
  }
  return new RegExp(`(^|/)${expression}($|/)`, "u");
}

async function readIgnorePatterns(root, configured) {
  const patterns = configured.map((pattern) => ({ pattern, negated: false }));
  try {
    const gitignore = (await readFileNoFollow(join(root, ".gitignore"))).toString("utf8");
    for (const rawLine of gitignore.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const negated = line.startsWith("!");
      const pattern = negated ? line.slice(1) : line;
      if (pattern) patterns.push({ pattern, negated });
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return patterns.map((rule) => ({ ...rule, expression: wildcardToRegExp(rule.pattern) }));
}

function isIgnored(relativePath, name, isDirectory, patterns) {
  if (relativePath === MAP_FILE && !isDirectory) return true;
  if (isDirectory && DEFAULT_IGNORED_DIRECTORIES.has(name)) return true;
  const candidate = isDirectory ? `${relativePath}/` : relativePath;
  let ignored = false;
  for (const rule of patterns) {
    if (rule.expression.test(candidate)) ignored = !rule.negated;
  }
  return ignored;
}

function generatedByPath(relativePath) {
  return /(^|\/)(generated|gen|autogen|vendor)(\/|$)/iu.test(relativePath)
    || /(?:\.generated|\.g)\.[^.]+$/iu.test(relativePath)
    || /(?:^|\/)(?:package-lock|yarn\.lock|pnpm-lock)\./iu.test(relativePath);
}

export function classifyFile(relativePath, prefix = "") {
  const normalized = normalizePath(relativePath);
  const file = basename(normalized).toLowerCase();
  if (generatedByPath(normalized) || /generated|do not edit/iu.test(prefix)) {
    return CLASSIFICATION.GENERATED;
  }
  if (/(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/iu.test(normalized)
      || /(?:^|[._-])(?:test|spec)\.[^.]+$/iu.test(file)) {
    return CLASSIFICATION.TEST;
  }
  if (/(^|\/)(infra|infrastructure|terraform|deploy|deployment)(\/|$)/iu.test(normalized)) {
    return CLASSIFICATION.INFRASTRUCTURE;
  }
  if (/(?:^|\/)(?:makefile|dockerfile)$/iu.test(normalized)
      || /\.(?:gradle|lock)$/iu.test(file)) {
    return CLASSIFICATION.BUILD;
  }
  if (/\.(?:json|toml|ya?ml|ini|properties)$/iu.test(file)) {
    return CLASSIFICATION.CONFIG;
  }
  if (/\.(?:md|rst|txt)$/iu.test(file)) return CLASSIFICATION.DOCUMENTATION;
  if (/^(?:readme|license|notice|changelog|contributing)(?:\.|$)/iu.test(file)) {
    return CLASSIFICATION.DOCUMENTATION;
  }
  if (/^(?:\.gitignore|\.gitattributes|\.env(?:\..*)?)$/iu.test(file)
      || /\.(?:xml|cfg|conf)$/iu.test(file)) return CLASSIFICATION.CONFIG;
  return CLASSIFICATION.FIRST_PARTY;
}

export function detectLanguage(relativePath) {
  return LANGUAGE_BY_EXTENSION[extname(relativePath).toLowerCase()] ?? null;
}

export async function scanProject(root, config) {
  const ignorePatterns = await readIgnorePatterns(root, config.exclude ?? []);
  const files = [];
  const unsupportedFiles = [];
  const diagnostics = [];
  const casePaths = new Map();
  const stack = [root];

  while (stack.length > 0) {
    const directory = stack.pop();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      diagnostics.push({ code: "DIRECTORY_UNREADABLE", path: normalizePath(relative(root, directory)), message: error.message });
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = normalizePath(relative(root, absolutePath));
      let metadata;
      try {
        metadata = await lstat(absolutePath);
      } catch (error) {
        diagnostics.push({ code: "PATH_UNREADABLE", path: relativePath, message: error.message });
        continue;
      }
      if (metadata.isSymbolicLink()) {
        diagnostics.push({ code: "SYMLINK_SKIPPED", path: relativePath });
        continue;
      }
      if (isIgnored(relativePath, entry.name, metadata.isDirectory(), ignorePatterns)) continue;
      if (metadata.isDirectory()) {
        let nestedRepository;
        try {
          nestedRepository = await exists(join(absolutePath, ".git"));
        } catch (error) {
          diagnostics.push({ code: "DIRECTORY_UNREADABLE", path: relativePath, message: error.message });
          continue;
        }
        if (nestedRepository) {
          diagnostics.push({ code: "NESTED_REPOSITORY_SKIPPED", path: relativePath });
          continue;
        }
        stack.push(absolutePath);
        continue;
      }
      if (!metadata.isFile()) continue;

      const language = detectLanguage(relativePath);
      const caseKey = relativePath.toLocaleLowerCase("en-US");
      const previous = casePaths.get(caseKey);
      if (previous && previous !== relativePath) {
        diagnostics.push({ code: "PATH_CASE_COLLISION", path: relativePath, other_path: previous });
      } else {
        casePaths.set(caseKey, relativePath);
      }

      let prefix = "";
      let textFile = true;
      try {
        const prefixBytes = await readPrefixNoFollow(absolutePath, 2048);
        if (prefixBytes.includes(0)) textFile = false;
        else prefix = new TextDecoder("utf-8", { fatal: true }).decode(prefixBytes);
      } catch (error) {
        if (error instanceof TypeError) textFile = false;
        else {
          diagnostics.push({ code: "FILE_UNREADABLE", path: relativePath, message: error.message });
          continue;
        }
      }
      const classification = classifyFile(relativePath, prefix);
      if (!language && (!textFile || classification === CLASSIFICATION.DOCUMENTATION)) continue;
      const file = {
        absolutePath,
        path: relativePath,
        classification,
        size: metadata.size,
        mtimeMs: metadata.mtimeMs,
      };
      if (language) files.push({ ...file, language });
      else unsupportedFiles.push({ ...file, reason: "UNSUPPORTED_LANGUAGE_OR_CONFIG" });
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  unsupportedFiles.sort((left, right) => left.path.localeCompare(right.path));
  return { files, unsupportedFiles, diagnostics };
}

export async function repositoryMetadata(path) {
  const metadata = await stat(path);
  return { size: metadata.size, mtimeMs: metadata.mtimeMs };
}

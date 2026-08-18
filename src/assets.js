import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAsset, isSea } from "node:sea";

const rootDirectory = isSea()
  ? process.cwd()
  : join(dirname(fileURLToPath(import.meta.url)), "..");

const ASSET_PATHS = Object.freeze({
  "tree-sitter.wasm": join(
    rootDirectory,
    "node_modules",
    "web-tree-sitter",
    "web-tree-sitter.wasm",
  ),
  "tree-sitter-python.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-python.wasm",
  ),
  "tree-sitter-javascript.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-javascript.wasm",
  ),
  "tree-sitter-typescript.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-typescript.wasm",
  ),
  "tree-sitter-tsx.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-tsx.wasm",
  ),
  "tree-sitter-java.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-java.wasm",
  ),
  "tree-sitter-go.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-go.wasm",
  ),
  "tree-sitter-c-sharp.wasm": join(
    rootDirectory,
    "node_modules",
    "@vscode",
    "tree-sitter-wasm",
    "wasm",
    "tree-sitter-c-sharp.wasm",
  ),
});

export async function loadAsset(name) {
  if (!(name in ASSET_PATHS)) {
    throw new Error(`Unknown embedded asset: ${name}`);
  }
  if (isSea()) {
    return new Uint8Array(getAsset(name));
  }
  return readFile(ASSET_PATHS[name]);
}

export function assetPaths() {
  return { ...ASSET_PATHS };
}

import assert from "node:assert/strict";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { detectLanguage, scanProject } from "../src/project.js";
import { requireSymlinkCapability, temporaryProject } from "./helpers.js";

test("scanner skips symlink loops and nested repositories", async (t) => {
  if (!(await requireSymlinkCapability(t, "dir"))) return;
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("src/app.py", "def main():\n    pass\n");
  await mkdir(join(project.root, "nested", ".git"), { recursive: true });
  await project.write("nested/hidden.py", "def hidden():\n    pass\n");
  await mkdir(join(project.root, "loop"));
  await symlink(join(project.root, "loop"), join(project.root, "loop", "again"));
  const scan = await scanProject(project.root, { ...DEFAULT_CONFIG, exclude: [] });
  assert.deepEqual(scan.files.map((file) => file.path), ["src/app.py"]);
  assert.ok(scan.diagnostics.some((item) => item.code === "NESTED_REPOSITORY_SKIPPED"));
  assert.ok(scan.diagnostics.some((item) => item.code === "SYMLINK_SKIPPED"));
});

test("generated and test source classifications are explicit", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("src/app.py", "def main(): pass\n");
  await project.write("generated/client.py", "# GENERATED - DO NOT EDIT\ndef call(): pass\n");
  await project.write("tests/test_app.py", "def test_main(): pass\n");
  const scan = await scanProject(project.root, { ...DEFAULT_CONFIG, exclude: [] });
  const classes = Object.fromEntries(scan.files.map((file) => [file.path, file.classification]));
  assert.equal(classes["src/app.py"], "FIRST_PARTY");
  assert.equal(classes["generated/client.py"], "GENERATED");
  assert.equal(classes["tests/test_app.py"], "TEST");
});

test("C# source extension is supported without treating project files as source", () => {
  assert.equal(detectLanguage("Controllers/AuthController.cs"), "csharp");
  assert.equal(detectLanguage("LapZoneApi.csproj"), null);
  assert.equal(detectLanguage("LapZoneApi.sln"), null);
});

test("a symlinked .gitignore fails closed instead of hiding source through an external file", async (t) => {
  if (!(await requireSymlinkCapability(t))) return;
  const project = await temporaryProject();
  const external = await temporaryProject("codegraph-ignore-");
  t.after(() => project.cleanup());
  t.after(() => external.cleanup());
  await project.write("app.py", "def main(): pass\n");
  const ignore = await external.write("external.ignore", "*.py\n");
  await symlink(ignore, join(project.root, ".gitignore"));
  await assert.rejects(scanProject(project.root, { ...DEFAULT_CONFIG, exclude: [] }));
});

test("unsupported text, build, and config files remain visible to completeness checks", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("Makefile", "build:\n\ttool build\n");
  await project.write("pom.xml", "<project><artifactId>api</artifactId></project>\n");
  await project.write("scripts/release", "#!/bin/sh\nexec tool release\n");
  await project.write("README.md", "# Documentation\n");
  await project.write("asset.bin", "\0not text");
  const scan = await scanProject(project.root, { ...DEFAULT_CONFIG, exclude: [] });
  assert.deepEqual(scan.unsupportedFiles.map((file) => file.path), [
    "Makefile",
    "pom.xml",
    "scripts/release",
  ]);
});

test("gitignore negation re-includes a source file", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write(".gitignore", "*.py\n!important.py\n");
  await project.write("ignored.py", "def ignored(): pass\n");
  await project.write("important.py", "def important(): pass\n");
  const scan = await scanProject(project.root, { ...DEFAULT_CONFIG, exclude: [] });
  assert.deepEqual(scan.files.map((file) => file.path), ["important.py"]);
});

test("source names resembling publication temporaries are never blanket-ignored", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("codegraph.py.new-feature.py", "def feature(): pass\n");
  const scan = await scanProject(project.root, { ...DEFAULT_CONFIG, exclude: [] });
  assert.deepEqual(scan.files.map((file) => file.path), ["codegraph.py.new-feature.py"]);
});

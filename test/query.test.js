import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { compileContextMap } from "../src/context-map.js";
import { semanticExplore } from "../src/query.js";
import { initializeProject, synchronizeProject } from "../src/sync.js";
import { temporaryProject } from "./helpers.js";

test("budget config rejects values too small for mandatory safety metadata", () => {
  assert.throws(
    () => validateConfig({
      ...DEFAULT_CONFIG,
      mcp_default_budget: 1023,
      mcp_hard_cap: 1023,
    }),
    /must be at least 1024/u,
  );
});

test("map target projection includes fixed content and the hard cap uses raw UTF-8 bytes", () => {
  const entities = Array.from({ length: 5 }, (_, index) => ({
    stable_id: `entity:${index}`,
    kind: "function",
    name: `handler_${index}`,
    qualified_name: `pkg.mod_${index}.handler_${index}`,
    file_path: `src/mod_${index}.py`,
    region_id: "region:src",
    signature: `def handler_${index}()`,
    confidence: "HIGH",
    classification: "FIRST_PARTY",
    semantic_tags: [],
    risk_flags: [],
    source_location: {
      file_path: `src/mod_${index}.py`,
      start_line: 1,
      start_column: 0,
      end_line: 1,
      end_column: 10,
    },
  }));
  const map = compileContextMap({
    entities,
    relations: [],
    regions: [
      {
        stable_id: "region:repository",
        name: "repository",
        kind: "repository",
        path: ".",
        confidence: "HIGH",
        risk_flags: [],
      },
      {
        stable_id: "region:src",
        name: "src",
        kind: "package",
        path: "src",
        confidence: "HIGH",
        risk_flags: [],
      },
    ],
    health: { status: "FRESH", risk_flags: [], stale_files: [] },
  }, 1, {
    compact_entity_limit: 250,
    map_target_tokens: 800,
    map_hard_cap_tokens: 1000,
  });
  assert.equal(map.mode, "HYBRID");
  assert.ok(Buffer.byteLength(map.content, "utf8") <= 1000);
});

test("mutation wording enters direct static impact mode and requires source inspection", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("api.py", "def public_api():\n    pass\n\ndef caller():\n    public_api()\n");
  await initializeProject(project.root);

  for (const task of [
    "retire public_api everywhere",
    "replace public_api with new_api",
    "deprecate public_api",
    "make public_api private",
    "find every caller of public_api",
    "who invokes public_api?",
  ]) {
    const response = await semanticExplore(project.root, { task, focus: "public_api" });
    assert.equal(response.completeness.impact, "INCOMPLETE");
    assert.equal(response.completeness.relation_scope, "DIRECT_STATIC");
    assert.match(response.completeness.scope, /direct .*static relations|direct static relations/u);
    assert.ok(response.safety_states.includes("SOURCE_INSPECTION_REQUIRED"));
    assert.equal(response.safety_states.includes("NAVIGATION_SAFE"), false);
  }
});

test("large impact queries pre-bound relation candidates before budget trimming", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  let source = "def target(): pass\n";
  for (let index = 0; index < 5000; index += 1) {
    source += `def caller_${index}(): target()\n`;
  }
  await project.write("callers.py", source);
  await initializeProject(project.root);
  const started = performance.now();
  const response = await semanticExplore(project.root, {
    task: "find every caller of target",
    focus: "target",
    budget: 3000,
  });
  const elapsed = performance.now() - started;
  assert.equal(response.completeness.impact, "INCOMPLETE");
  assert.ok(response.completeness.relevant_relation_count >= 5000);
  assert.ok(response.completeness.returned_relation_count <= 120);
  assert.equal(response.truncated, true);
  assert.ok(elapsed < 2000, `bounded query took ${elapsed.toFixed(0)}ms`);
});

test("broad partial responses preserve per-file last-known-good and source provenance", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("a.py", "def a():\n    return 1\n");
  await project.write("b.py", "def b():\n    return 1\n");
  await initializeProject(project.root);
  await project.write("a.py", "def a(:\n");
  await synchronizeProject(project.root);
  await project.write("b.py", "def b():\n    return 2\n");
  await synchronizeProject(project.root);
  await project.write("b.py", "def b(:\n");
  await synchronizeProject(project.root);

  const response = await semanticExplore(project.root, { task: "show entire repository", budget: 2000 });
  assert.equal(response.graph_status, "PARTIAL");
  assert.equal(response.last_known_good_revision, 1);
  assert.equal(response.stale_file_count, 2);
  assert.deepEqual(response.stale_files, ["a.py", "b.py"]);
  const b = response.stale_provenance.find((item) => item.file_path === "b.py");
  assert.equal(b.last_good_revision, 3);
  assert.equal(b.source_location.file_path, "b.py");
  assert.ok(response.source_locations.some((location) => location.file_path === "b.py"));
  assert.ok(Buffer.byteLength(JSON.stringify(response), "utf8") <= 2000);
});

test("impact responses identify bounded unsupported consumer paths", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  await project.write("api.py", "def public_api():\n    pass\n");
  await project.write("plugin.rb", "register(:public_api)\n");
  await project.write("routes.yaml", "handler: public_api\n");
  await initializeProject(project.root);

  const response = await semanticExplore(project.root, {
    task: "retire public_api everywhere",
    focus: "public_api",
  });
  assert.equal(response.completeness.impact, "INCOMPLETE");
  assert.equal(response.unsupported_file_count, 2);
  assert.deepEqual(response.unsupported_files, ["plugin.rb", "routes.yaml"]);
  assert.ok(response.safety_states.includes("IMPACT_INCOMPLETE"));
});

test("one-character natural-language tokens do not select unrelated entities", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  let source = "def x():\n    pass\n\ndef exact_target():\n    pass\n\n";
  for (let index = 0; index < 30; index += 1) {
    source += `def irrelevant_${String(index).padStart(2, "0")}():\n    pass\n\n`;
  }
  await project.write("many.py", source);
  await initializeProject(project.root);

  const response = await semanticExplore(project.root, {
    task: "Can I inspect exact_target safely?",
    budget: 3000,
  });
  assert.deepEqual(response.entities.map((entity) => entity.name), ["exact_target"]);

  const focused = await semanticExplore(project.root, {
    task: "inspect symbol",
    focus: "x",
    budget: 3000,
  });
  assert.deepEqual(focused.entities.map((entity) => entity.name), ["x"]);
});

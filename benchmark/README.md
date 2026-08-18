# Deterministic benchmark

`npm run benchmark` generates each source fixture and copies its independently authored oracle before CodeGraph is initialized. The runner then scores retrieval status, required/forbidden entities, relations, safety states, source integrity, precision@1/5, recall@5, wrong-region matches, false matches, false `NO_MATCH`, and false `NAVIGATION_SAFE`.

Current results are written to:

```text
benchmark/results/latest.json
benchmark/results/latest.md
```

These generated files are ignored locally and uploaded by native CI. The fixture declarations and oracle are versioned under `benchmark/fixtures` and `benchmark/oracles`.

This deterministic layer is offline and has no LLM or provider dependency. No agent adapter is configured in V1, so the repository makes no baseline-vs-CodeGraph token-saving claim. `response_budget_units` measure serialized UTF-8 bytes, not model tokens. Any future agent benchmark must use isolated workspaces, identical prompts/models/settings, independent correctness scoring, and provider usage metadata (or one documented tokenizer for both modes); token comparisons count correct runs only.

## LapZoneAPI C# acceptance

The real-repository runner requires an already cloned disposable checkout pinned to an oracle SHA:

```sh
LAPZONE_REPO=/path/to/LapZoneAPI npm run benchmark:lapzone
```

Set `CODEGRAPH_BIN` to also run the native relocated executable through `rebuild`, MCP `initialize`, `tools/list`, and selected `semantic_explore` queries. Results are written under `benchmark/results/lapzone/<lapzone-sha>/` and include `deterministic`, `traceability`, `metrics`, and `provenance` artifacts. They record both repository SHAs, host/runtime, Gate A/B coverage, confidence-stratified precision/noise, audited database boundaries, cold/unchanged/one-file timings, query latency, memory, and tracked-source integrity.

## Book1 Java acceptance

The Book1 oracle was authored and checksum-frozen from source before CodeGraph was run. Point `BOOK1_ROOT` at the discovered `VinaBookStore` project and set `CODEGRAPH_BIN` for the relocated SEA gate:

```sh
BOOK1_ROOT=/path/to/VinaBookStore CODEGRAPH_BIN=/path/to/codegraph npm run benchmark:book1
```

The runner copies only `src/` and `pom.xml` to an isolated temporary directory. It parses source without executing Maven, tests, application code, databases, or network services, then verifies source fingerprints, graph precision/recall, retrieval safety, incremental behavior, and all ten MCP queries.

C# uses `tree-sitter-c-sharp.wasm` from the existing `@vscode/tree-sitter-wasm@0.3.1` package. The package and grammar artifact are MIT-licensed and embedded into the SEA executable; no C# compiler, .NET runtime, or runtime download is used by indexing.

# Portable CodeGraph

Portable CodeGraph is a local semantic compiler and context router for coding agents. It parses repository source without executing it, publishes one canonical graph to project-local SQLite, generates a bounded `codegraph.py` routing map, and serves deeper retrieval through MCP stdio.

Source code remains authoritative. Generated graph data is navigation evidence, not implementation truth, and omission from a budgeted result is not proof of absence.

## Build

Development requires Node.js 25.7 or newer because the build uses an ESM entry point with `node --build-sea`. Release verification pins Node.js 26.7.0 through `.node-version`. Python 3 is used only by one source-level verification check. The generated single executable does not require Node.js or a project-language runtime.

```sh
npm install
npm run verify
```

The host-platform executable is written to `dist/codegraph` or `dist/codegraph.exe`.

## Commands

Run the executable by absolute or relative path; PATH installation is optional.

```sh
/path/to/codegraph init
/path/to/codegraph status
/path/to/codegraph sync
/path/to/codegraph rebuild
/path/to/codegraph doctor
/path/to/codegraph mcp
/path/to/codegraph instructions
/path/to/codegraph integrate <client>
```

`init` creates:

```text
codegraph.py
.codegraph/config.toml
.codegraph/graph.db
.codegraph/state.json
```

These are derived artifacts. `init` refuses to replace a user-owned root `codegraph.py`.

## MCP

Register the executable with stdio transport and `args: ["mcp"]`. The server exposes one tool:

```text
semantic_explore(task, focus?, known_symbols?, context_id?, budget?)
```

Responses include graph revision/status, retrieval status, source locations, confidence, risks, scoped completeness, and edit-safety states when the requested budget permits. `NO_MATCH` never fabricates entities and always requires source inspection; weak matches are routing hints rather than completeness evidence. Minimal responses retain structured retrieval/safety and stale-source provenance. Source bodies are not returned by default.

## Runtime Properties

- Local and offline: no network requests, telemetry, accounts, APIs, or cloud services.
- Parse-only: repository modules, build scripts, hooks, and dependencies are never executed.
- Supported V1 parsers: Python, JavaScript, TypeScript/TSX, Java, Go, and C#.
- Storage: bundled SQLite with WAL and FTS5.
- Freshness: content-hash reconciliation runs before graph-backed MCP responses; the watcher is only a latency optimization.
- Failure behavior: invalid or unreadable changed source retains last-known-good semantics and is marked `PARTIAL`/stale.
- Retrieval: one budget unit permits at most one serialized UTF-8 byte. Budget units are not measured model tokens. MCP enforcement includes the JSON-RPC envelope and newline framing.

## Verification

`npm test` runs the repository's source-level fixtures and deterministic retrieval corpus. `npm run verify` additionally builds, relocates, and exercises the host-platform standalone executable with no PATH or project runtimes available, including compact C# and Java fixtures. `npm run benchmark` writes current machine-readable and human-readable results to `benchmark/results/latest.json` and `benchmark/results/latest.md`. A pinned disposable LapZoneAPI clone can be checked with `LAPZONE_REPO=/path/to/LapZoneAPI npm run benchmark:lapzone`; setting `CODEGRAPH_BIN` adds the real-repository SEA/MCP gate. The independently inspected local Java project can be checked without executing Maven or application code using `BOOK1_ROOT=/path/to/VinaBookStore CODEGRAPH_BIN=/path/to/codegraph npm run benchmark:book1`.

After both real-repository gates, `npm run evidence:release` writes ignored machine-readable provenance, quality/performance metrics, the cross-repository comparison, and a release report under `release-evidence/`. Generated benchmark/evidence results are CI or release artifacts; frozen oracles and runners remain versioned.

The benchmark oracle is authored independently from CodeGraph output and covers exact/ambiguous symbols, no-match safety, FTS wording, generic queries, entry-point traps, generated noise, cross-module flow, unsupported impact, and broad routing. GitHub Actions runs the source suite, host SEA build, relocated executable verification, and benchmark on native Windows x64 and Linux x64. Agent token-saving claims require a separately configured agent benchmark with actual usage metadata; UTF-8 budget units alone are not evidence of token savings.

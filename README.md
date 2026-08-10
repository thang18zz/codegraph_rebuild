# Portable CodeGraph

Portable CodeGraph is a local semantic compiler and context router for coding agents. It parses repository source without executing it, publishes one canonical graph to project-local SQLite, generates a bounded `codegraph.py` routing map, and serves deeper retrieval through MCP stdio.

Source code remains authoritative. Generated graph data is navigation evidence, not implementation truth, and omission from a budgeted result is not proof of absence.

## Build

Development requires Node.js 25.7 or newer because the build uses an ESM entry point with `node --build-sea`. Python 3 is used only by one source-level verification check. The generated single executable does not require Node.js or a project-language runtime.

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

Responses include graph revision/status, source locations, confidence, risks, scoped completeness, and edit-safety states when the requested budget permits. Minimal responses retain structured safety and stale-source provenance. Source bodies are not returned by default.

## Runtime Properties

- Local and offline: no network requests, telemetry, accounts, APIs, or cloud services.
- Parse-only: repository modules, build scripts, hooks, and dependencies are never executed.
- Supported V1 parsers: Python, JavaScript, TypeScript/TSX, Java, and Go.
- Storage: bundled SQLite with WAL and FTS5.
- Freshness: content-hash reconciliation runs before graph-backed MCP responses; the watcher is only a latency optimization.
- Failure behavior: invalid or unreadable changed source retains last-known-good semantics and is marked `PARTIAL`/stale.
- Retrieval: one budget unit permits at most one serialized UTF-8 byte, a conservative upper bound for byte-based model tokenizers. MCP enforcement includes the JSON-RPC envelope and newline framing.

## Verification

`npm test` runs source-level fixtures. `npm run verify` additionally builds, relocates, and exercises the host-platform standalone executable with no PATH or project runtimes available.

The supplied draft test pack is declarative and currently contains no executable fixture generators or independent oracle files. Cross-platform release claims therefore require native Windows and macOS runners plus materialized test-pack fixtures; a host-only successful build does not establish those claims.

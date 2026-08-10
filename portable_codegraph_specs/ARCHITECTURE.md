---
title: "Portable CodeGraph Architecture"
version: "0.1-draft"
status: "design"
scope: "core-system"
---

# Portable CodeGraph — Architecture

## 1. Purpose

Portable CodeGraph is a **portable, local, offline-capable semantic compiler and context router for AI coding agents**.

Its purpose is not to replace source code, a coding agent, grep, or the IDE. Its purpose is to prevent an AI coding agent from having to rediscover the architecture of a repository from scratch before every task.

Core principles:

> PRELOAD THE MAP, NOT THE CODE.  
> QUERY ONLY WHAT THE TASK NEEDS.  
> CHANGE ONLY WHAT THE TASK REQUIRES.

Additional architectural constraints:

- Local-first.
- Portable-first.
- Offline-capable.
- Zero API cost.
- No mandatory cloud services.
- Parse, never execute.
- One canonical semantic graph.
- Source code remains authoritative.
- YAGNI applies to code, context, and infrastructure.

---

## 2. Distribution model

Portable CodeGraph is distributed as a **standalone native executable**.

Example release artifacts:

```text
codegraph-windows-x64.zip
codegraph-windows-arm64.zip
codegraph-linux-x64.tar.gz
codegraph-linux-arm64.tar.gz
codegraph-macos-x64.tar.gz
codegraph-macos-arm64.tar.gz
```

The executable should contain or embed:

- CodeGraph core.
- Semantic engine.
- Tree-sitter runtime.
- Supported Tree-sitter grammars.
- SQLite.
- FTS5.
- Filesystem watcher.
- Hashing engine.
- MCP stdio server.
- Project profiler.
- Health engine.
- Context compiler.

The normal user does not need:

- Python.
- Node.js.
- Java.
- Docker.
- PostgreSQL.
- Neo4j.
- Redis.
- A cloud account.
- A paid API.
- An external model.

Portable usage:

```text
D:\Tools\codegraph.exe init
D:\Tools\codegraph.exe status
D:\Tools\codegraph.exe mcp
```

The executable may live anywhere. It does not need to be installed into PATH.

---

## 3. Project-local state

After initialization:

```text
project/
├── codegraph.py
└── .codegraph/
    ├── graph.db
    ├── state.json
    └── config.toml
```

### `codegraph.py`

A small, AI-oriented semantic routing map.

It is not the full graph and not application code.

### `.codegraph/graph.db`

The local high-fidelity semantic graph.

### `.codegraph/state.json`

Stores lightweight state such as:

- Current graph revision.
- Source fingerprints.
- Project profile.
- Freshness information.
- Last-known-good revision.
- Parse failures.
- Active context mode.

### `.codegraph/config.toml`

Optional project-local configuration.

Normal usage should not require editing it.

Recommended Git ignore:

```gitignore
codegraph.py
.codegraph/
```

Both artifacts must be rebuildable from source.

---

## 4. High-level architecture

```text
                         SOURCE CODE
                              │
                     parse, never execute
                              │
                              ▼
                    ┌───────────────────┐
                    │ Semantic Engine   │
                    │                   │
                    │ parsers           │
                    │ language plugins  │
                    │ classification    │
                    │ resolvers         │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Canonical IR      │
                    │                   │
                    │ entities          │
                    │ relations         │
                    │ regions           │
                    │ conditions        │
                    │ effects           │
                    │ confidence        │
                    └─────────┬─────────┘
                              │
                        immutable revision
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
   Project Profiler       GraphStore         Health Engine
          │                   │                   │
          ▼                   ▼                   ▼
   Context Compiler       SQLite             coverage
          │               + FTS5             freshness
          ▼                                   unresolved
     codegraph.py
          │
          └──────────────┐
                         │
                         ▼
                  Local MCP Server
                  semantic_explore
                         │
                         ▼
                      AGENT
                         │
                  Semantic YAGNI
                         │
                  exact source
                         │
                         ▼
                  smallest correct
                       change
```

---

## 5. Canonical data ownership

Portable CodeGraph must have **one canonical semantic representation**.

Do not build:

```text
source -> codegraph.py graph
source -> MCP graph
```

Build:

```text
source
  ↓
Canonical Semantic IR
  ├── codegraph.py projection
  └── GraphStore / MCP
```

Benefits:

- No duplicated indexing.
- No conflicting graph states.
- One revision model.
- One resolver pipeline.
- Easier testing.
- Easier synchronization.

---

## 6. Semantic engine

The semantic engine is responsible for transforming repository content into canonical IR.

Pipeline:

```text
repository scan
    ↓
file classification
    ↓
language detection
    ↓
parse
    ↓
entity extraction
    ↓
relation extraction
    ↓
reference resolution
    ↓
region construction
    ↓
confidence assignment
    ↓
semantic validation
    ↓
publish revision
```

The engine must not execute repository code.

Forbidden during indexing:

- Importing application modules.
- Running decorators.
- Running build scripts.
- Running setup scripts.
- Installing dependencies.
- Running compiler hooks.
- Starting services.
- Executing project commands.

Principle:

> PARSE, NEVER EXECUTE.

---

## 7. Language plugin architecture

Each language or ecosystem should plug into a common interface.

Conceptual interface:

```text
LanguagePlugin

detect(file)
parse(file)
extract_entities(ast)
extract_relations(ast)
extract_regions(ast)
resolve_imports(...)
resolve_calls(...)
classify_constructs(...)
```

The core IR must not assume all projects are function-oriented.

Supported entities may include:

- Function.
- Method.
- Class.
- Interface.
- Module.
- Package.
- Service.
- API route.
- Event.
- Database table.
- SQL query.
- React component.
- Terraform resource.
- CI job.
- GraphQL resolver.
- Unity scene.
- Configuration object.

V1 should focus on a small set of high-value languages and keep the plugin boundary stable.

Recommended V1 language targets:

- Python.
- JavaScript.
- TypeScript.
- Java.
- Go.

---

## 8. Source classification

Files are not indexed equally.

Recommended classifications:

```text
FIRST_PARTY
TEST
CONFIG
INFRASTRUCTURE
GENERATED
VENDOR
BUILD
DOCUMENTATION
UNKNOWN
```

Suggested indexing depth:

| Class | Default behavior |
|---|---|
| FIRST_PARTY | Deep semantic analysis |
| TEST | Test names, targets, assertions, invariants |
| CONFIG | Keys, services, dependency relationships |
| INFRASTRUCTURE | Resources, jobs, deployment relations |
| GENERATED | Shallow index |
| VENDOR | Reference-only |
| BUILD | Mostly ignore |
| DOCUMENTATION | Optional metadata |
| UNKNOWN | Conservative parsing |

This classification is required to prevent large repositories from being dominated by generated or vendor code.

---

## 9. GraphStore abstraction

Core logic must not directly depend on SQLite APIs.

Conceptual interface:

```text
GraphStore

get_entity(...)
search_entities(...)
get_neighbors(...)
get_callers(...)
get_callees(...)
traverse(...)
get_region(...)
get_impact(...)
get_revision(...)
```

V1 backend:

```text
SQLiteGraphStore
```

Possible future backend, only if required by benchmarks:

```text
ShardedSQLiteGraphStore
```

MCP and semantic logic must remain unchanged when the storage backend changes.

---

## 10. SQLite storage strategy

V1 uses:

```text
SQLite + WAL + FTS5
```

Primary tables:

```text
files
entities
relations
regions
aliases
revisions
health
```

Do not store the entire source body by default.

Source implementation remains in the repository.

FTS should prioritize:

- Entity names.
- Qualified names.
- Signatures.
- Paths.
- Semantic tags.
- Short documentation.

Important indexes:

```text
entities(stable_id)
entities(qualified_name)
entities(file_id)
entities(region_id)

relations(src_id, kind)
relations(dst_id, kind)
```

---

## 11. Adaptive logical modes

Portable CodeGraph must adapt as a repository grows.

Logical modes:

```text
COMPACT
HYBRID
QUERY_FIRST
MASSIVE
```

V1 should implement only:

```text
COMPACT
HYBRID
```

### COMPACT

Use when the repository is small enough for `codegraph.py` to include many important symbols while staying inside the context budget.

### HYBRID

Use when `codegraph.py` should contain only module/service-level architecture and MCP becomes the normal path for deeper context.

### QUERY_FIRST

Future mode for very large repositories.

### MASSIVE

Future mode for extreme monorepos, only if benchmark evidence requires it.

YAGNI rule:

> Do not implement scaling complexity before measured performance requires it.

---

## 12. Project profiler

The profiler continuously evaluates the repository.

Track at least:

```text
file_count
entity_count
relation_count
region_count
language_count
cross_region_relation_count
graph_db_size
estimated_codegraph_tokens
query_latency
sync_latency
parse_failure_rate
unresolved_relation_rate
```

Mode selection must not use only file count.

The real question is:

> Can the current mode still satisfy context and performance budgets?

---

## 13. Automatic adaptation

As the repository changes:

```text
small project
    ↓
COMPACT
    ↓
project grows
    ↓
HYBRID
    ↓
project grows much larger
    ↓
QUERY_FIRST
```

The user should not manually select:

```text
small
medium
large
```

The system adapts automatically.

Use hysteresis to avoid mode flapping.

Promotion and demotion thresholds must be different.

---

## 14. Context compiler

The context compiler generates `codegraph.py`.

Its most important rule:

> `codegraph.py` size must not scale linearly with repository size.

Use an approximate target and hard cap.

Initial design targets may be:

```text
target: ~4k tokens
hard cap: ~8k tokens
```

These values are provisional and must be benchmarked.

If detailed output exceeds the budget, increase abstraction:

```text
function
  ↓
class
  ↓
module
  ↓
service
  ↓
system
```

The full graph remains in GraphStore.

Only the preload projection becomes more abstract.

---

## 15. `codegraph.py` contract

`codegraph.py` is an **Agent Routing Map**.

It should help the agent answer:

- What major subsystems exist?
- What are the main entry points?
- What are the important flows?
- Which modules depend on which?
- Which region is likely relevant to the current task?
- Which symbol should be queried through MCP?

It is not intended to contain:

- Every function.
- Full implementation.
- Every dependency edge.
- Full source bodies.

Required header:

```python
"""
PORTABLE CODEGRAPH SEMANTIC MAP

GENERATED FILE.
DO NOT EDIT.
DO NOT EXECUTE.

This file is an AI-oriented semantic representation
of the repository.

Original source files remain authoritative.
"""

Projection semantics:

```text
This map is intentionally incomplete.
Omitted symbols are not evidence that they do not exist.
Use semantic MCP or source when completeness matters.
```
```

The file should be:

- Valid Python syntax.
- Side-effect free.
- Free of application imports.
- Never required to execute.

---

## 16. Local MCP

MCP runs inside the same portable executable.

Command:

```text
codegraph mcp
```

Preferred transport:

```text
stdio
```

No requirement for:

- HTTP.
- Ports.
- A localhost service.
- Docker.
- A permanent daemon.
- A second terminal.

Agent lifecycle:

```text
agent starts
   ↓
spawn codegraph mcp
   ↓
freshness check
   ↓
open graph
   ↓
watch source
   ↓
serve semantic_explore
   ↓
agent closes
   ↓
process exits
```

---

## 17. Service lifecycle

Portable CodeGraph should not run continuously when no agent is using it.

No permanent daemon is required.

During active MCP use:

- Run watcher.
- Perform incremental sync.
- Maintain graph freshness.
- Serve queries.

When MCP closes:

- Flush required state.
- Exit.

If files change while CodeGraph is not running, the next MCP start performs a catch-up freshness reconciliation.

---

## 18. Security and privacy

Default guarantees:

```text
NO NETWORK REQUIRED
NO TELEMETRY
NO ANALYTICS
NO CLOUD STORAGE
NO REMOTE INDEXING
NO API KEYS
```

The graph and source remain local.

The repository must be treated as untrusted input.

---

## 19. Zero-cost guarantee

Core functionality must not depend on:

- Paid APIs.
- Hosted inference.
- Hosted embeddings.
- Cloud databases.
- Cloud graph services.
- Subscription services.
- License servers.
- Mandatory network access.

The only runtime resources used are local:

- CPU.
- RAM.
- Disk.
- Electricity.

---

## 20. CLI

Recommended V1 CLI:

```text
codegraph init
codegraph mcp
codegraph status
codegraph sync
codegraph rebuild
codegraph integrate
codegraph instructions
codegraph doctor
```

Normal workflow should primarily require:

```text
codegraph init
```

MCP should normally be launched by the coding agent.

---

## 21. Development scope

### V1

Build:

- Portable native executable.
- Tree-sitter integration.
- Language plugin framework.
- Python/JS/TS/Java/Go.
- Canonical IR.
- SQLite GraphStore.
- FTS5.
- `codegraph.py` compiler.
- Hard context budget.
- COMPACT/HYBRID modes.
- Project profiler.
- Health engine.
- Confidence model.
- File classification.
- Incremental sync.
- Freshness barrier.
- Atomic revisions.
- Last-known-good behavior.
- Filesystem watcher.
- MCP stdio.
- `semantic_explore`.
- Agent instructions.
- `status`.
- `doctor`.

### Not V1

Do not build yet:

- Cloud services.
- Web UI.
- Embeddings.
- Vector DB.
- LLM summarization.
- Neo4j.
- Docker requirement.
- Permanent daemon.
- Complex sharding.
- MASSIVE-mode optimization.
- Telemetry.

---

## 22. Success criteria

Baseline agent:

```text
prompt
→ list
→ grep
→ read
→ grep
→ read
→ inspect imports
→ reconstruct architecture
→ reason
→ edit
```

Portable CodeGraph target:

```text
prompt
→ codegraph.py
→ identify region
→ optional MCP
→ exact source read
→ reason
→ edit
```

Priority metrics:

1. Correctness.
2. Time to first correct edit.
3. Input-token reduction.
4. Tool-call reduction.
5. Source-read reduction.
6. MCP-context efficiency.

Portable CodeGraph succeeds only if it improves agent effectiveness without sacrificing correctness.

## 23. Token Economy Controller

Portable CodeGraph must optimize **net agent token cost**, not merely the size of generated summaries.

The relevant metric is:

```text
T_without =
repository discovery
+ source reads
+ repeated navigation context

T_with =
micro-map preload
+ agent instructions
+ MCP responses
+ source reads still required
```

CodeGraph is beneficial only when `T_with` is lower while correctness is preserved.

### Micro-map target

`codegraph.py` should be treated as a **Micro Mental Map**, not a broad repository summary.

Initial benchmark targets:

```text
typical target: ~600–1500 tokens
```

The exact budget is empirical, not fixed by specification.

Larger repositories should normally increase abstraction rather than preload size.

```text
small repo  -> function/module routing
medium repo -> module/service routing
large repo  -> service/system routing
huge repo   -> domain/system routing
```

### Token ROI telemetry — local only

The profiler may record local, non-network usage statistics when integration makes them available:

```text
micro_map_size
MCP_response_size
MCP_calls_per_task
context_expansion_depth
source_reads_after_MCP
duplicate_context_estimate
fallback_to_repository_search_rate
```

These metrics never need to leave the machine.

They may be used by rule-based adaptation to tune routing-map detail.

No LLM is required for optimization.

---

## 24. Safety Contract

Portable CodeGraph is a navigation and retrieval system, not an editing authority.

The architecture must assume that semantic extraction can be incomplete.

Safety principle:

> When uncertainty can materially affect a code change, fail closed: surface uncertainty and require source inspection.

The system must never claim complete impact knowledge when any relevant area contains:

```text
LOW confidence
UNKNOWN confidence
STALE semantic data
PARTIAL parsing
unsupported language semantics
dynamic resolution
generated/runtime-only behavior
```

### Mandatory edit safety information

For regions likely to be modified, CodeGraph should make available:

```text
graph revision
source revision/fingerprint
graph health
entity confidence
relation confidence
stale/partial state
exact source locations
known affected regions
known unresolved edges
```

### Navigation-only rule

`codegraph.py` must prominently state that it is generated navigation data and must never be used as the sole authority for implementation edits.

### No inferred business prose as authority

The core must prefer source-preserving facts:

```text
IF x > 3 -> CALL foo()
```

over inferred summaries such as:

```text
"Retries are exhausted."
```

This reduces the chance that an incorrect interpretation becomes an editing premise.

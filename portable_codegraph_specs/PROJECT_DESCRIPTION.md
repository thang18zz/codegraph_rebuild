---
title: "Portable CodeGraph Project Description"
version: "0.1-draft"
status: "design"
scope: "project"
---

# Portable CodeGraph

## A portable local semantic compiler and context router for AI coding agents

Portable CodeGraph is a standalone local tool designed to help AI coding agents understand software repositories quickly without repeatedly scanning an entire codebase.

The tool analyzes a repository deterministically, builds a local semantic graph, generates a compact `codegraph.py` routing map, and exposes deeper graph traversal through a local MCP interface.

Its core goal is simple:

> Give the agent the smallest amount of accurate structural context needed to start reasoning correctly.

---

## Why it exists

Coding agents often spend a large part of a task doing repository discovery:

```text
list files
→ grep
→ read
→ inspect imports
→ grep again
→ read more
→ reconstruct architecture
→ finally reason
```

Portable CodeGraph aims to replace that with:

```text
codegraph.py
→ identify region
→ optional MCP query
→ exact source
→ reason
→ edit
```

The objective is not to prevent source reads.

The objective is to prevent repeated full-codebase rediscovery.

---

## Core philosophy

```text
PRELOAD THE MAP, NOT THE CODE.

QUERY ONLY WHAT THE TASK NEEDS.

CHANGE ONLY WHAT THE TASK REQUIRES.
```

The first principle is implemented by `codegraph.py`.

The second is implemented by local MCP and progressive context.

The third is implemented through agent YAGNI behavior.

---

## Portable-first

Portable CodeGraph is not designed around global installation.

It is distributed as a standalone executable:

```text
Windows: codegraph.exe
Linux:   codegraph
macOS:   codegraph
```

The executable can be stored anywhere:

```text
USB
Downloads
Tools directory
external SSD
project utilities folder
```

Example:

```text
D:\Tools\codegraph.exe init
```

No PATH installation is required.

No project runtime is required.

---

## Local and zero-cost

Core functionality must operate locally and must not require:

- Paid APIs.
- Cloud inference.
- Hosted embeddings.
- Cloud graph databases.
- Cloud storage.
- Accounts.
- Subscriptions.
- License servers.
- Mandatory Internet access.

The tool does not use an LLM for indexing or summarization.

Instead it relies on deterministic parsing, static analysis, symbol resolution, local graph storage, and progressive retrieval.

After obtaining the executable, the core system should remain usable offline.

---

## Privacy

The source code remains on the user's machine.

Default behavior:

```text
NO NETWORK
NO TELEMETRY
NO ANALYTICS
NO REMOTE INDEXING
```

This makes Portable CodeGraph suitable for private and proprietary repositories.

---

## Repository output

After:

```text
codegraph init
```

the repository contains:

```text
project/
├── codegraph.py
└── .codegraph/
    ├── graph.db
    ├── state.json
    └── config.toml
```

`codegraph.py` is the small routing map intended for AI agents.

`.codegraph/graph.db` is the full local semantic graph.

Both are derived data and should normally be ignored by Git.

---

## `codegraph.py`

`codegraph.py` is not a full code dump.

It is a Python-shaped semantic map optimized for language models.

For a small project it may include function-level flows.

For a larger project it may include module- or service-level flows.

For a very large project it may contain only system/domain routing.

Its token size is bounded by a hard context budget.

Repository size may grow dramatically while `codegraph.py` remains approximately bounded.

---

## Local MCP

When the routing map is insufficient, the coding agent can launch:

```text
codegraph mcp
```

through MCP stdio.

The MCP server queries the same canonical semantic graph used to generate `codegraph.py`.

It returns progressively deeper context:

```text
region
→ symbols
→ relations
→ conditions
→ source locations
```

It does not dump the whole graph by default.

---

## Automatic synchronization

`codegraph init` builds the initial graph and exits.

While MCP is active:

- A watcher observes source changes.
- Changes are debounced.
- Only affected files are reparsed.
- A new immutable semantic revision is published.

Before MCP serves graph-dependent context, a freshness barrier verifies that the graph still matches the repository.

If CodeGraph was not running while files changed, the next MCP startup catches up automatically.

Manual `sync` and `rebuild` commands remain available only as recovery tools.

---

## Adaptive scale

Portable CodeGraph automatically profiles the project.

It can adapt from a detailed preload mode to a more abstract routing mode as a repository grows.

Logical modes:

```text
COMPACT
HYBRID
QUERY_FIRST
MASSIVE
```

V1 should implement only COMPACT and HYBRID.

Larger-scale modes should be added only when benchmark evidence proves they are needed.

This applies YAGNI to the tool itself.

---

## One canonical semantic graph

All output originates from one semantic model:

```text
SOURCE
  ↓
Canonical Semantic IR
  ├── codegraph.py
  └── GraphStore / MCP
```

There is no separate index for the routing map and another for MCP.

This reduces duplication, inconsistency, storage overhead, and sync complexity.

---

## Semantic model

The IR is language-neutral.

Core concepts:

```text
Entity
Relation
Region
Input
Output
Condition
Effect
SourceLocation
Confidence
```

It can represent:

```text
functions
methods
classes
services
routes
events
database tables
SQL queries
React components
Terraform resources
CI jobs
GraphQL resolvers
Unity scenes
configuration
```

The system does not force every project into a fake function hierarchy.

---

## Confidence

Static analysis cannot perfectly resolve every runtime relationship.

Graph relations therefore carry confidence:

```text
HIGH
MEDIUM
LOW
UNKNOWN
```

Agents must use source inspection for low-confidence or unresolved paths.

Graph uncertainty is surfaced rather than hidden.

---

## Source authority

Portable CodeGraph is a navigation system.

It is not the source of truth.

If graph data conflicts with source code:

```text
SOURCE CODE WINS.
```

Agents should inspect original source before modifying implementation.

---

## YAGNI

YAGNI is applied in three places.

### Code YAGNI

Do not add speculative abstractions or unrelated changes.

### Context YAGNI

Do not load semantic regions not needed for the current task.

### Infrastructure YAGNI

Do not introduce sharding, embeddings, cloud services, permanent daemons, or distributed infrastructure until measured requirements justify them.

---

## V1 focus

V1 should prioritize:

- Native portable executable.
- Tree-sitter parsing.
- Language plugin system.
- Python.
- JavaScript.
- TypeScript.
- Java.
- Go.
- Canonical IR.
- SQLite + FTS5.
- `codegraph.py`.
- Hard context budget.
- COMPACT/HYBRID adaptation.
- Project profiler.
- Health metrics.
- Confidence model.
- Incremental sync.
- Freshness barrier.
- MCP stdio.
- `semantic_explore`.
- Agent behavior instructions.
- `status`.
- `doctor`.

V1 should not include:

- Cloud services.
- LLM indexing.
- Embeddings.
- Vector databases.
- Neo4j.
- Web UI.
- Telemetry.
- Permanent daemon.
- Complex sharding.

---

## Benchmark philosophy

Portable CodeGraph must prove value through agent tasks.

Compare the same coding agent:

```text
without CodeGraph
vs
with Portable CodeGraph
```

Measure:

1. Correctness.
2. Time to first correct edit.
3. Input tokens.
4. Tool calls.
5. Grep calls.
6. Source reads.
7. MCP calls.
8. MCP context size.
9. Unnecessary edits.
10. Sync latency.

Token reduction is not success if correctness decreases.

---

## Product definition

Portable CodeGraph is best described as:

> A portable local semantic compiler and context router for AI coding agents.

It does not try to think instead of the coding agent.

It deterministically organizes the repository so the agent can think with less discovery overhead.

The final target workflow is:

```text
CODEBASE
   ↓
deterministic semantic compilation
   ↓
Canonical Graph
   ├── compact routing map
   └── local deep query
   ↓
AI coding agent
   ↓
minimum sufficient context
   ↓
smallest correct change
```

## Token-efficiency refinement

Portable CodeGraph optimizes the total token cost of completing a coding task, not merely the size of its graph.

`codegraph.py` is therefore a **Micro Mental Map**.

Initial benchmark targets should favor roughly:

```text
~600–1500 tokens
```

rather than a large repository summary.

For large repositories the map becomes more abstract instead of larger.

MCP responses are progressive and should avoid repeating previously returned context.

Source code is not returned by MCP by default because agents should read authoritative source only when implementation detail is needed.

---

## Safety model

Portable CodeGraph must assume static analysis can be incomplete.

The system explicitly represents:

```text
confidence
ambiguity
staleness
partial parsing
dynamic behavior
unsupported semantics
impact completeness
```

When uncertainty materially affects a potential edit, CodeGraph must fail closed by directing the agent to inspect source rather than inventing certainty.

The product goal is therefore not:

```text
make the agent trust the graph
```

but:

```text
make the agent know when the graph is trustworthy
and when it must inspect source.
```

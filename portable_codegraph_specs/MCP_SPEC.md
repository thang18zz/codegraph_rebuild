---
title: "Portable CodeGraph MCP Specification"
version: "0.1-draft"
status: "design"
scope: "mcp"
---

# Portable CodeGraph — MCP Specification

## 1. Purpose

MCP provides **on-demand deep semantic retrieval** when `codegraph.py` is insufficient.

It must not duplicate the entire repository into the agent context.

MCP is a progressive context router.

Absence rule:

```text
not returned
≠ proven absent
```

Unless the response explicitly declares scoped completeness, omitted entities or relations must not be treated as nonexistent.

Core principle:

> QUERY ONLY WHAT THE TASK NEEDS.

---

## 2. Transport

Preferred transport:

```text
stdio
```

Command:

```text
codegraph mcp
```

The coding agent launches the portable executable directly.

No requirement for:

- HTTP.
- Ports.
- Localhost.
- Docker.
- A permanent daemon.
- A separate terminal.

---

## 3. Lifecycle

```text
agent starts
   ↓
spawn codegraph mcp
   ↓
locate project
   ↓
ensure_fresh()
   ↓
open GraphStore
   ↓
start watcher
   ↓
serve MCP requests
   ↓
agent exits
   ↓
flush state
   ↓
process exits
```

The watcher exists only while the MCP process is active.

---

## 4. Default public tool surface

Expose one primary tool by default:

```text
semantic_explore
```

Do not expose a large menu of narrow graph tools unless benchmarks show that agents benefit from it.

Internal primitives may still exist:

```text
search
callers
callees
neighbors
trace
impact
region lookup
source locate
```

but `semantic_explore` orchestrates them internally.

---

## 5. Conceptual request schema

```text
semantic_explore(
    task,
    focus?,
    known_symbols?,
    budget?
)
```

### `task`

Natural-language description of what the agent needs to understand.

Example:

```text
Find why refresh-token validation can fail.
```

### `focus`

Optional region/module/domain hint.

Example:

```text
auth
```

### `known_symbols`

Symbols already identified by the agent.

Example:

```text
TokenService.refresh
validate_session
```

### `budget`

Maximum context budget for the response.

The server may cap this further.

---

## 6. Retrieval strategy

The MCP server should retrieve progressively.

Preferred order:

```text
1. Relevant regions
2. Relevant entities
3. Relationships / flow
4. Signatures
5. Conditions
6. Effects
7. Source locations
8. Small source excerpts only if necessary
```

Do not jump immediately to full source bodies.

---

## 7. Example response

Request:

```text
task:
Find why refresh-token validation can fail.

focus:
auth
```

Good response:

```text
Relevant flow:

POST /refresh
  → TokenController.refresh
  → TokenService.refresh_token
  → SessionRepository.find
  → validate_session
  → create_access_token

Likely failure points:
- SessionRepository.find: token not found
- validate_session: expired/revoked session

Relevant files:
- services/auth/controller.py
- services/auth/token.py
- services/auth/session.py

Confidence:
- flow edges: HIGH
```

Bad response:

```text
1200 lines of source from 17 files
```

---

## 8. Hard response budget

MCP must enforce a response budget.

Initial design range:

```text
default: ~1500–3000 tokens
```

Exact values should be benchmarked.

If the query is too broad, return a routing response.

Example:

```text
Scope is too broad.

Top relevant regions:
- frontend
- auth
- billing
- data
- infrastructure

Refine focus or ask about one flow.
```

Do not dump the whole graph.

---

## 9. Semantic YAGNI enforcement

The MCP server must not rely only on agent discipline.

It should actively resist over-broad retrieval.

Examples:

### Agent asks:

```text
Show all callers in the repository.
```

If the result is huge:

```text
Return:
- count
- important regions
- top relevant callers
- narrowing suggestions
```

Do not return tens of thousands of nodes.

### Agent asks:

```text
Show entire repository.
```

Return:

```text
system-level routing map
```

not the full graph.

---

## 10. Confidence-aware retrieval

If the graph contains LOW or UNKNOWN-confidence relationships relevant to the request, the response must surface that fact.

Example:

```text
Warning:
PluginManager.load uses dynamic resolution.
Static target confidence: LOW.

Recommended:
Inspect source or narrow to the runtime plugin path.
```

MCP must not present heuristic relations as certain.

---

## 11. Freshness requirement

Before serving graph-derived results:

```text
ensure_fresh()
```

If affected files are stale and cannot be reparsed:

```text
return graph result from last-known-good
+
explicit stale warning
+
source locations
```

Example:

```text
Graph state is PARTIAL.
src/auth.py currently fails parsing.
Auth-related semantic data is from revision 1841.
Inspect source before editing.
```

---

## 12. Revision consistency

Each query runs against one immutable revision.

Response metadata should include:

```text
graph_revision
graph_status
```

A query started on revision N must complete on revision N.

If revision N+1 is published during the request, it applies to the next request.

---

## 13. Query planning without LLM indexing

Portable CodeGraph itself does not require an LLM.

Retrieval may combine:

```text
FTS5 match
qualified-name match
path match
semantic tags
region proximity
graph proximity
known-symbol expansion
relation traversal
confidence
```

The coding agent performs high-level semantic reasoning.

Principle:

> Agent thinks. CodeGraph retrieves.

---

## 14. Search ranking signals

Potential ranking inputs:

```text
exact symbol match
qualified-name match
path match
focus-region match
relation distance from known symbols
entry-point proximity
public API relevance
test association
entity classification
confidence
```

Do not introduce embeddings until benchmarks prove they are necessary.

---

## 15. Source excerpts

MCP may return source excerpts only when they materially improve the answer.

Guidelines:

- Prefer line references first.
- Prefer small excerpts.
- Avoid returning entire files.
- Avoid duplicating source already in context.
- Prefer signatures and conditions over implementation noise.

---

## 16. Internal graph primitives

The server may internally implement:

```text
search_entities
get_entity
get_region
get_callers
get_callees
get_neighbors
trace_path
impact_analysis
get_tests
get_entry_points
get_source_locations
```

These are implementation details, not necessarily public MCP tools.

---

## 17. MCP error behavior

Errors should be explicit and actionable.

Examples:

```text
PROJECT_NOT_INITIALIZED
GRAPH_CORRUPTED
PARSER_UNAVAILABLE
GRAPH_PARTIAL
UNSUPPORTED_LANGUAGE
QUERY_TOO_BROAD
REVISION_CONFLICT
```

Avoid silently falling back to incorrect data.

---

## 18. Integration contract

Client adapters should configure:

```text
command = absolute/path/to/codegraph[.exe]
args = ["mcp"]
```

Because the tool is portable, the executable path may be anywhere.

The integration layer should not require PATH installation.

---

## 19. Future compatibility

If the storage backend later changes from:

```text
SQLiteGraphStore
```

to:

```text
ShardedSQLiteGraphStore
```

the public MCP API should remain stable.

The agent should not know or care how the graph is physically stored.

---

## 20. Success criteria

A good MCP interaction should replace workflows like:

```text
grep
→ read
→ grep
→ read
→ inspect imports
→ read more
```

with:

```text
semantic_explore
→ exact region
→ exact symbols
→ exact source
```

MCP succeeds when it provides **minimum sufficient context** without causing context bloat.

## 21. Context continuation and delta responses

Repeated MCP calls should avoid resending semantic context already returned in the same exploration chain.

A response may return:

```text
context_id
```

A later request may provide that identifier.

Conceptual example:

```text
semantic_explore(
    task="inspect validate_session",
    focus="validate_session",
    context_id="ctx_41"
)
```

The server should return primarily **new semantic context** relative to that exploration context.

Context IDs are an optimization only.

Correctness must not depend on the agent retaining them.

---

## 22. Source duplication policy

Source code is not returned by default.

Default MCP responses should prefer:

```text
symbol
signature
relations
conditions
effects
confidence
file path
line range
```

The agent should then read the exact authoritative source when implementation details are required.

This prevents:

```text
MCP source dump
+
agent source read
```

from duplicating the same tokens.

Small source excerpts may be returned only when materially necessary.

---

## 23. Safety-aware query responses

For any result that may influence editing, MCP should expose uncertainty.

Example:

```text
Graph revision: 1842
Graph status: PARTIAL

Relevant entity:
AuthService.refresh_token

Confidence: HIGH

Unresolved outgoing relations:
- PluginSessionValidator.resolve: LOW

Stale files:
- services/auth/plugin_validator.py

Edit safety:
SOURCE_INSPECTION_REQUIRED
```

Recommended safety states:

```text
NAVIGATION_SAFE
SOURCE_INSPECTION_REQUIRED
IMPACT_INCOMPLETE
GRAPH_STALE
GRAPH_PARTIAL
```

Do not report `NAVIGATION_SAFE` as equivalent to "safe to edit without reading source".

Source inspection remains required before implementation changes.

---

## 24. Broad-impact protection

For potentially destructive operations such as:

```text
public API rename
shared type change
schema change
cross-service refactor
dependency removal
route removal
database migration
```

MCP must prefer an impact summary before returning an apparently complete edit scope.

If impact completeness cannot be established, return:

```text
IMPACT_INCOMPLETE
```

with unresolved areas rather than pretending the graph is complete.

---

## 25. MCP schema economy

Keep the public schema intentionally small to reduce tool-definition context.

Preferred conceptual shape:

```text
semantic_explore(
    task,
    focus?,
    known_symbols?,
    context_id?,
    budget?
)
```

Do not add many public parameters or public graph tools unless benchmarks demonstrate a clear benefit.

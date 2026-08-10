---
title: "Portable CodeGraph Agent Behavior"
version: "0.1-draft"
status: "design"
scope: "agent-instructions"
---

# Portable CodeGraph — Agent Behavior

## 1. Purpose

This file defines how AI coding agents should use Portable CodeGraph.

The objective is to reduce unnecessary repository exploration while preserving correctness.

Core principles:

> PRELOAD THE MAP, NOT THE CODE.  
> QUERY ONLY WHAT THE TASK NEEDS.  
> CHANGE ONLY WHAT THE TASK REQUIRES.

---

## 2. Source of truth

`codegraph.py` and MCP are navigation aids.

The original repository source is authoritative.

`codegraph.py` is intentionally incomplete by design.

Never infer:

```text
not present in codegraph.py
→ does not exist in repository
```

When absence/completeness matters, use MCP or source.

If generated semantic information conflicts with source:

```text
SOURCE WINS.
```

Before modifying implementation, inspect the actual source being changed.

---

## 3. First action for code tasks

For repository-related coding tasks:

1. Use `codegraph.py` as the initial repository routing map.
2. Identify the smallest relevant region.
3. Do not recursively rediscover architecture already represented in CodeGraph.
4. Use MCP only when the map is insufficient.
5. Read exact source before editing implementation.

---

## 4. Do not rescan the repository by default

Avoid this workflow:

```text
list all files
grep repository
read many files
inspect imports
grep again
rebuild mental model
```

if `codegraph.py` already contains sufficient architecture.

Repository scanning remains allowed when:

- CodeGraph is stale or broken.
- A language is unsupported.
- Confidence is LOW or UNKNOWN.
- Source structure is missing from the graph.
- The graph is demonstrably incorrect.

---

## 5. MCP activation rules

Use `semantic_explore` when at least one condition applies:

- `codegraph.py` does not contain enough detail.
- A symbol is ambiguous.
- All callers/references are required.
- Impact analysis is required.
- The task crosses several modules/services.
- Cross-language flow matters.
- A relation is LOW-confidence.
- A relation is UNKNOWN.
- The affected scope is unclear.
- A public API/refactor may impact many regions.
- A symbol is absent from the routing map.

Do not invoke MCP merely because it exists.

---

## 6. Progressive context

Always prefer:

```text
minimum sufficient context
```

over:

```text
maximum available context
```

Start from:

```text
routing map
```

then expand:

```text
region
→ symbols
→ relations
→ conditions
→ source
```

Stop expanding as soon as enough information exists to reason correctly.

---

## 7. Semantic YAGNI

Do not query information that is not necessary for the current task.

Examples of unnecessary context:

- Every caller when one local caller is enough.
- Every test when one target test suite is enough.
- Entire service source when one module is enough.
- Entire repository graph for a local bug.
- All implementations of an interface when the runtime path is already known.

Semantic YAGNI rule:

> Request only the smallest semantic region that can answer the current question.

---

## 8. Coding YAGNI

Implement only what the task currently requires.

Do not add:

- Speculative abstractions.
- Future-proof interfaces.
- Unrequested configuration.
- New dependencies without demonstrated need.
- Unrelated refactors.
- Compatibility layers without an active requirement.
- Extra infrastructure because it might be useful later.

Expand implementation scope only when required by:

- Correctness.
- Compilation.
- Tests.
- Demonstrated dependency impact.
- Explicit user requirements.

---

## 9. Smallest valid patch

Prefer the smallest change that fully resolves the task.

Do not confuse "smallest patch" with "minimal effort".

A correct fix may legitimately span several files if dependency impact requires it.

The rule is:

> No unnecessary change outside the demonstrated affected scope.

---

## 10. Confidence handling

Treat CodeGraph confidence levels as follows.

### HIGH

Graph relation can normally be used for navigation.

Still inspect source before editing.

### MEDIUM

Use graph as a strong hint.

Inspect relevant source before important conclusions.

### LOW

Do not assume the relation is complete.

Use MCP and source.

### UNKNOWN

Treat as unresolved.

Use source or runtime-specific reasoning.

---

## 11. Stale/partial graph handling

If CodeGraph reports:

```text
PARTIAL
STALE
BROKEN
```

do not blindly use stale semantic information.

For affected regions:

```text
inspect source directly
```

If the graph is stale but recoverable, allow synchronization before reasoning.

Do not manually rebuild unless automatic or incremental recovery fails.

---

## 12. Source-read rules

CodeGraph is not intended to eliminate all source reads.

Read source when:

- Editing implementation.
- Verifying detailed behavior.
- Handling dynamic behavior.
- Reviewing business conditions.
- Reviewing error handling.
- Reviewing concurrency.
- Reviewing tests.
- Graph confidence is insufficient.

The goal is not:

```text
never read source
```

The goal is:

```text
never rediscover the whole codebase from scratch
```

---

## 13. Test behavior

Tests are semantic evidence.

When relevant:

- Use CodeGraph to find target tests.
- Read the exact tests for expected behavior.
- Do not load every test suite in the repository.
- Add or update tests only when required by the task.

Avoid rewriting unrelated tests.

---

## 14. Architecture tasks

For broad architecture questions, start with `codegraph.py`.

Only use MCP if:

- More detailed dependency flow is requested.
- Cross-service relations are unclear.
- Impact analysis is needed.
- Specific runtime paths must be traced.

Do not automatically read all source files for architecture summaries.

---

## 15. Refactoring tasks

Refactoring is one of the cases where MCP use is more likely to be justified.

Before changing public/shared symbols:

```text
identify callers
identify implementations
identify tests
identify cross-region dependencies
```

But still constrain retrieval to the affected semantic region.

---

## 16. Bug-fixing tasks

Typical bug workflow:

```text
read codegraph.py
    ↓
identify likely subsystem
    ↓
semantic_explore if needed
    ↓
read exact implementation
    ↓
identify root cause
    ↓
inspect relevant tests
    ↓
smallest correct patch
```

Avoid broad refactors while fixing a local bug unless the existing architecture makes a local fix incorrect.

---

## 17. New feature tasks

Before adding a feature:

- Identify the nearest existing pattern.
- Reuse existing architecture where appropriate.
- Avoid introducing a new abstraction if an existing one satisfies the task.
- Query only the relevant service/module.
- Inspect public interfaces that must change.

YAGNI remains active even for feature work.

---

## 18. Agent instructions — compact canonical form

The portable executable may expose the following canonical instruction block:

```text
For code-related tasks:

1. Use codegraph.py as the repository routing map.
2. Do not recursively scan the repository to rediscover architecture already represented by CodeGraph.
3. Use semantic MCP only when the routing map is insufficient, ambiguous, stale, low-confidence, or graph-wide relationships are required.
4. Read original source before modifying implementation.
5. Source code is authoritative when it conflicts with generated semantic information.
6. Follow YAGNI: do not add speculative abstractions, dependencies, configuration, compatibility layers, or unrelated refactors.
7. Expand context only when current context is insufficient.
8. Prefer the smallest correct change that fully satisfies the task.
```

This block should remain short enough to avoid instruction-token bloat.

---

## 19. What the agent must not do

Avoid:

```text
read the entire codegraph database
dump the entire MCP graph
scan the whole repository without cause
assume LOW-confidence relations are certain
edit codegraph.py manually
treat codegraph.py as application code
execute codegraph.py
replace source truth with graph truth
refactor unrelated modules
add speculative infrastructure
```

---

## 20. Success behavior

Good agent behavior:

```text
prompt
→ routing map
→ relevant region
→ optional semantic query
→ exact source
→ reason
→ smallest correct patch
```

Bad agent behavior:

```text
prompt
→ scan entire repository
→ load excessive context
→ refactor unrelated architecture
→ make speculative changes
```

## 21. Token-efficiency rules

The agent should treat CodeGraph as a way to reduce **total task context**, not as an extra mandatory reading step.

Runtime behavior:

```text
read the Micro Mental Map
identify the smallest likely region
query MCP only if needed
avoid repeating semantic context
read authoritative source only for the actual implementation scope
```

Do not:

```text
read Micro Map
query MCP
then perform the same broad grep/search workflow anyway
```

unless CodeGraph is insufficient, stale, ambiguous, or low-confidence.

---

## 22. Destructive-change safety rule

For high-impact changes, the agent must not rely solely on CodeGraph.

High-impact examples:

```text
public API rename/removal
shared schema changes
database migrations
dependency deletion
cross-service refactors
security/authentication changes
build/deployment changes
large automated rewrites
```

Before applying such changes:

1. Inspect authoritative source.
2. Inspect relevant tests/configuration.
3. Check graph confidence and unresolved edges.
4. Check impact scope.
5. Revalidate if graph revision changed during reasoning.
6. Prefer a smaller patch when impact completeness is uncertain.

If CodeGraph reports:

```text
IMPACT_INCOMPLETE
GRAPH_PARTIAL
GRAPH_STALE
LOW
UNKNOWN
```

do not assume the returned dependency set is complete.

---

## 23. Fail-closed behavior

When semantic evidence is insufficient, do not guess.

Prefer:

```text
"I need to inspect this source region."
```

over:

```text
"The graph probably means X."
```

The agent should fall back to exact source for any assumption that can materially alter program behavior.

---

## 24. Never edit generated CodeGraph artifacts

Do not manually modify:

```text
codegraph.py
.codegraph/**
```

to implement application behavior.

They are derived navigation/index artifacts.

Application behavior must be changed in authoritative repository source.

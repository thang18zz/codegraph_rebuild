---
title: "Portable CodeGraph Synchronization Specification"
version: "0.1-draft"
status: "design"
scope: "sync"
---

# Portable CodeGraph — Synchronization Specification

## 1. Purpose

Synchronization keeps the semantic graph aligned with repository source without requiring manual rebuilds.

Design goal:

> Automatic when possible, verified before use, recoverable manually.

The normal user should not need to think about synchronization after initialization.

---

## 2. Sync model

Portable CodeGraph uses three complementary mechanisms:

```text
1. Incremental watcher sync
2. Pre-query freshness barrier
3. Manual recovery commands
```

Watcher = low latency.

Freshness barrier = correctness.

Manual commands = recovery.

---

## 3. Initialization

Command:

```text
codegraph init
```

Initialization performs:

```text
detect repository root
read ignore rules
detect languages
classify files
full parse
build Canonical IR
build graph.db
profile project
generate codegraph.py
write state
exit
```

`init` must not leave a permanent daemon running.

The terminal must return to the user.

---

## 4. MCP startup

When an agent starts:

```text
codegraph mcp
```

the process:

```text
locates initialized project
    ↓
loads state
    ↓
runs freshness reconciliation
    ↓
applies missing incremental updates
    ↓
starts watcher
    ↓
serves MCP
```

If the repository changed while CodeGraph was not running, startup catches up automatically.

---

## 5. Filesystem watcher

The watcher observes source changes while MCP is active.

Events of interest:

```text
ADD
MODIFY
DELETE
RENAME
MOVE
```

The watcher must ignore:

```text
codegraph.py
.codegraph/**
.git/**
node_modules/**
vendor/**
dist/**
build/**
__pycache__/**
```

plus project-specific ignored paths.

This prevents self-trigger loops.

---

## 6. Debouncing

Do not sync on every low-level filesystem event.

Editors may produce:

```text
modify
modify
temporary rename
modify
```

for one save.

Use a short debounce window.

Conceptual behavior:

```text
change detected
    ↓
wait short interval
    ↓
collect changeset
    ↓
one incremental sync
```

The exact interval should be benchmarked.

---

## 7. Changeset transactions

A burst of related edits should become one semantic transaction.

Example:

```text
auth.py changed
user.py changed
token.py changed
tests/test_auth.py changed
```

Result:

```text
one changeset
→ one semantic revision
```

Do not publish intermediate graph states after every file when they are part of the same edit burst.

---

## 8. Incremental sync

For each changeset:

```text
identify changed files
    ↓
content hash
    ↓
parse changed files
    ↓
build new local semantic representation
    ↓
compare semantic hashes
    ↓
invalidate affected relations
    ↓
re-resolve necessary dependencies
    ↓
validate
    ↓
persist revision
    ↓
atomic publish
```

Do not reparse the whole repository unless necessary.

---

## 9. Hash strategy

Use layered change detection.

First:

```text
mtime
size
```

If suspicious:

```text
content hash
```

After parsing:

```text
semantic hash
```

Example:

```text
comment changed
content_hash changed
semantic_hash unchanged
```

This can avoid unnecessary semantic invalidation.

---

## 10. Dependency invalidation

Changing one file does not imply reparsing the entire repository.

Example:

```text
A → B → C → D
```

If C changes:

- Reparse C.
- Recompute C relations.
- Revalidate incoming/outgoing edges.
- Propagate only if public semantic surface changes.

If C's signature and exported relationships remain unchanged, propagation can remain narrow.

---

## 11. Freshness barrier

Before MCP serves graph-dependent context:

```text
ensure_fresh()
```

The freshness barrier performs a cheap reconciliation.

Conceptual flow:

```text
request arrives
    ↓
compare repository state
    ↓
fresh?
 ┌───────┐
 yes     no
 │       │
 │    incremental catch-up
 │       │
 └───┬───┘
     ↓
serve query
```

The watcher may fail.

The freshness barrier must not.

---

## 12. Offline changes

When CodeGraph is not running:

```text
user edits files
git pulls
branch changes
code generation happens
```

No background service is required.

On the next MCP startup:

```text
repository reconciliation
→ detect dirty files
→ incremental catch-up
```

This is a core portability feature.

---

## 13. Atomic revisions

Never mutate the graph in place while queries are using it.

Build:

```text
revision N+1
```

then publish it atomically.

Query behavior:

```text
query begins on revision N
query completes on revision N
```

Revision N+1 applies only to later queries.

---

## 14. Last-known-good

Temporary syntax errors are normal during editing.

Example:

```python
def login(
```

The parser may fail.

Do not destroy the previous graph representation.

Behavior:

```text
retain last-known-good semantic data
mark file stale
record parse failure
publish graph status PARTIAL
```

Agent-facing state:

```text
Graph: PARTIAL
Stale:
- src/auth.py
```

Source becomes mandatory for affected edits.

---

## 15. Failed transaction behavior

If a sync transaction fails:

```text
rollback new revision
retain previous published revision
record diagnostic
```

Never leave half-written semantic state.

---

## 16. `codegraph.py` update

`codegraph.py` should update only after the semantic revision is valid.

Recommended sequence:

```text
build revision
    ↓
commit graph state
    ↓
generate codegraph.py.new
    ↓
validate generated file
    ↓
atomic rename to codegraph.py
```

Never truncate the live file and rewrite it in place.

---

## 17. Mass-change detection

Certain operations generate many events:

```text
git checkout
git pull
git reset
branch switch
code generation
large refactor
```

Detect mass changes and switch from event-by-event handling to tree reconciliation.

Conceptual behavior:

```text
burst threshold exceeded
    ↓
snapshot old file state
    ↓
scan new file state
    ↓
compute added/modified/deleted
    ↓
one batch transaction
```

---

## 18. Rename and move

Treat rename/move as first-class when possible.

Benefits:

- Preserve entity history.
- Preserve aliases.
- Reduce unnecessary re-indexing.
- Improve stable-ID continuity.

Fallback to delete+add if reliable rename detection is unavailable.

Correctness is more important than preserving history.

---

## 19. Project profiler updates

After each published revision, update profile metrics:

```text
file_count
entity_count
relation_count
graph_size
estimated_preload_tokens
sync_latency
parse_failures
unresolved_rate
```

The mode controller may switch between COMPACT and HYBRID automatically.

---

## 20. Hysteresis

Do not switch modes based on one noisy measurement.

Use:

```text
promotion threshold
demotion threshold
```

with:

```text
demotion < promotion
```

Optionally require several consecutive profiles before changing mode.

---

## 21. Manual commands

### `codegraph sync`

Force repository reconciliation and incremental repair.

Use when:

- User suspects missed changes.
- Watcher behaved unexpectedly.
- External tooling changed many files.

### `codegraph rebuild`

Discard derived index state and rebuild from source.

Use when:

- Database is corrupted.
- Schema version changes.
- Parser version changes materially.
- User explicitly requests a clean rebuild.

### `codegraph status`

Show freshness and health.

### `codegraph doctor`

Run integrity diagnostics.

Manual commands are recovery paths, not normal workflow.

---

## 22. Status model

Recommended graph statuses:

```text
FRESH
SYNCING
PARTIAL
STALE
BROKEN
```

### FRESH

Published revision matches source.

### SYNCING

A new revision is being built; old revision remains queryable.

### PARTIAL

Some files failed parsing; last-known-good data remains available.

### STALE

Known repository changes have not yet been reconciled.

### BROKEN

Graph database or state is unusable.

---

## 23. Concurrency

Multiple MCP requests may read concurrently.

Only one semantic publish transaction should commit at a time.

If multi-agent support is added later, prefer sharing one project-level semantic state rather than duplicating independent graphs.

Do not over-engineer multi-agent coordination in V1 unless actual clients require it.

---

## 24. Performance goals

Incremental sync should scale with the changed semantic region, not repository size.

Primary metrics:

```text
initial index time
single-file sync latency
multi-file changeset latency
freshness-check latency
graph publish latency
codegraph.py regeneration latency
```

Correctness remains higher priority than raw sync speed.

## 25. Edit-time revision validation

A long-running agent may reason from revision N while another process changes the repository to revision N+1.

Before a broad or high-impact edit is applied, integrations should revalidate the affected semantic region when possible.

If:

```text
reasoning_revision != current_revision
```

the agent should not automatically restart all reasoning.

Instead:

```text
revalidate affected symbols
revalidate affected source fingerprints
revalidate impact scope
```

Only materially changed assumptions require renewed reasoning.

---

## 26. Worktree, submodule, symlink, and boundary handling

Repository-root detection must explicitly account for:

```text
Git worktrees
Git submodules
symbolic links
nested repositories
case-sensitive/case-insensitive path differences
```

The scanner must not silently cross repository or trust boundaries.

If a referenced semantic region lies outside the indexed project boundary, represent it as an external dependency rather than implicitly indexing arbitrary filesystem content.

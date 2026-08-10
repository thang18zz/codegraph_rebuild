---
title: "Portable CodeGraph Safety Specification"
version: "0.1-draft"
status: "design"
scope: "safety"
---

# Portable CodeGraph — Safety Specification

## 1. Safety objective

Portable CodeGraph must improve navigation speed without causing agents to become confidently wrong.

The primary safety risk is not that the graph is unavailable.

The primary risk is:

> an incomplete or stale graph appears authoritative, causing an agent to make a destructive change based on a false mental model.

The system must therefore expose uncertainty rather than hide it.

A second critical rule is:

```text
OMISSION IS NOT ABSENCE.
```

The Micro Mental Map and budgeted MCP results are intentionally partial. An agent must not conclude that a symbol, caller, dependency, test, or runtime path does not exist merely because it was omitted from a compressed response.

---

## 2. Fundamental rule

```text
CODEGRAPH = NAVIGATION AUTHORITY
SOURCE    = IMPLEMENTATION AUTHORITY
```

CodeGraph may determine where the agent should look.

It must not become the sole evidence for behavior-changing edits.

---

## 3. Fail closed

If information is materially uncertain:

```text
do not guess
do not claim complete impact
do not fabricate runtime flow
```

Return:

```text
SOURCE_INSPECTION_REQUIRED
IMPACT_INCOMPLETE
GRAPH_PARTIAL
GRAPH_STALE
```

as appropriate.

---

## 4. Common failure classes

### Dynamic dispatch

Examples:

```text
reflection
plugin loading
dependency injection
monkey patching
runtime route registration
dynamic import
```

Risk:

Static graph misses a runtime caller or implementation.

Mitigation:

- LOW/UNKNOWN confidence.
- Dynamic-risk flag.
- Source inspection.
- Do not claim complete impact.

### Stale graph

Examples:

```text
branch switch
external generator
watcher miss
concurrent agent edit
```

Mitigation:

- Freshness barrier.
- Revision binding.
- Last-known-good marking.
- Revalidation before high-impact changes.

### Parser or resolver bugs

Risk:

Wrong entity or edge.

Mitigation:

- Source locations.
- Health metrics.
- Ambiguity preservation.
- Parser test corpus.
- Never silently resolve multiple candidates.

### Generated code

Risk:

Generated implementation is mistaken for authoritative handwritten source.

Mitigation:

- GENERATED classification.
- Shallow indexing.
- Point to generator/schema when discoverable.

### Conditional behavior

Examples:

```text
feature flags
OS-specific code
build profiles
conditional compilation
environment configuration
```

Risk:

Graph represents one conditional path as universal.

Mitigation:

- Preserve conditions.
- Mark platform/build selectors.
- Never erase conditionality during projection.

### Cross-language boundaries

Examples:

```text
FFI
JNI
RPC
code-generated clients
native bindings
```

Risk:

Graph traversal stops at the language boundary.

Mitigation:

- CROSS_LANGUAGE_BOUNDARY flag.
- External/unknown edge representation.
- Explicit incomplete-impact status.

### Missing test semantics

Risk:

Agent changes behavior without seeing the contract encoded in tests.

Mitigation:

- Index tests semantically.
- Require relevant tests for high-impact edits.
- Never claim correctness from graph topology alone.

---

## 5. High-impact edit gate

Treat these changes as high risk:

```text
public API removal/rename
authentication/authorization changes
database schema/migration changes
shared type changes
dependency removal
build/deployment changes
cross-service refactors
mass automated rewrites
```

Recommended agent safety sequence:

```text
graph routing
    ↓
impact query
    ↓
source inspection
    ↓
test/config inspection
    ↓
revision revalidation
    ↓
smallest patch
    ↓
tests/build validation when available
```

CodeGraph itself must not execute repository tests automatically during indexing.

---

## 6. Confidence is not proof

Even HIGH confidence means:

```text
"this static relationship was resolved strongly"
```

not:

```text
"the full runtime behavior is proven"
```

The agent still reads source before implementation changes.

---

## 7. Completeness metadata

Where possible, results should distinguish:

```text
known matches
known unresolved areas
unsupported areas
dynamic areas
stale areas
```

Example:

```text
Static callers found: 12
Unresolved dynamic registration: 1
Impact completeness: INCOMPLETE
```

This is safer than returning "12 callers" without qualification.

---

## 8. Destructive failure containment

CodeGraph should reduce the blast radius of wrong retrieval by encouraging:

```text
smallest relevant region
smallest correct patch
no unrelated refactor
source verification
```

A bad graph edge should not naturally lead to a repository-wide rewrite.

---

## 9. Evaluation metrics

Safety benchmarks should track:

```text
false-positive edges
false-negative edges
wrong-region routing
stale-result rate
ambiguous-resolution rate
unsafe-completeness claims
agent edits based only on graph
regression rate
unnecessary files touched
```

A token-saving tool that increases destructive regressions is a failure.

---

## 10. Safety success criterion

Portable CodeGraph is successful when it makes agents:

```text
faster to the right source
```

not merely:

```text
faster to an answer
```

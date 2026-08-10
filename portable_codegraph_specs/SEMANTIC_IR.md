---
title: "Portable CodeGraph Semantic IR Specification"
version: "0.1-draft"
status: "design"
scope: "semantic-model"
---

# Portable CodeGraph — Semantic IR Specification

## 1. Purpose

The Canonical Semantic IR is the single internal representation from which:

- `codegraph.py` is generated.
- GraphStore is populated.
- MCP queries are answered.
- Health metrics are derived.
- Project profiling is performed.

There must never be one semantic model for `codegraph.py` and another for MCP.

---

## 2. Design goals

The IR must be:

- Language-neutral.
- Deterministic.
- Source-traceable.
- Incrementally updateable.
- Confidence-aware.
- Suitable for very small and very large repositories.
- Rich enough for agent navigation.
- Compact enough to store locally.
- Independent from any specific database.

The IR must not assume that all projects are function/class oriented.

---

## 3. Core primitives

The canonical IR uses these universal primitives:

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
Classification
Revision
```

---

## 4. Entity

An Entity represents a meaningful semantic object.

Conceptual shape:

```text
Entity {
    id
    stable_id
    kind
    name
    qualified_name
    file_id
    region_id
    inputs[]
    outputs[]
    conditions[]
    effects[]
    source_location
    confidence
    classification
    semantic_tags[]
}
```

Possible entity kinds:

```text
function
method
class
interface
module
package
service
subsystem
route
event
component
table
query
resource
job
schema
config
scene
prefab
target
unknown
```

Language plugins may add ecosystem-specific kinds, but they must still map to the core Entity contract.

---

## 5. Stable IDs

Line numbers are not stable IDs.

Stable IDs should be derived from semantic identity.

Recommended components:

```text
language
project-relative path
qualified name
entity kind
```

Example:

```text
python:services/auth/token.py:AuthService.refresh_token:method
```

A hashed form may be stored internally, but the human-readable identity should remain recoverable for diagnostics.

Rename/move tracking may be represented with aliases:

```text
old_stable_id -> new_stable_id
```

---

## 6. SourceLocation

SourceLocation maps every entity and relation back to source.

Conceptual shape:

```text
SourceLocation {
    file_path
    start_line
    start_column
    end_line
    end_column
}
```

SourceLocation is not semantic identity.

It is a navigation pointer.

---

## 7. Inputs and outputs

Inputs should preserve semantic signatures where possible.

Example:

```text
Input {
    name: "refresh_token"
    type: "str"
    optional: false
    default: null
}
```

Outputs:

```text
Output {
    type: "AccessToken"
    condition: null
}
```

Multiple returns may be represented separately when useful.

The IR should preserve public signatures before implementation details.

---

## 8. Relation

A Relation represents a semantic edge.

Conceptual shape:

```text
Relation {
    id
    src_entity_id
    dst_entity_id | unresolved_target
    kind
    confidence
    source_location
    condition_id?
    revision
}
```

Recommended kinds:

```text
CALLS
IMPORTS
READS
WRITES
USES
DEPENDS_ON
IMPLEMENTS
INHERITS
PRODUCES
CONSUMES
PUBLISHES
SUBSCRIBES
ROUTES_TO
CREATES
DELETES
CONFIGURES
RETURNS
VALIDATES
TRANSFORMS
```

Do not add many kinds without a retrieval need.

YAGNI applies to the IR schema.

---

## 9. Region

A Region groups entities into navigable semantic areas.

Conceptual shape:

```text
Region {
    id
    parent_id
    kind
    name
    path
    confidence
}
```

Possible region kinds:

```text
repository
product
domain
service
package
module
file
```

Example:

```text
repository
  └── identity-platform
       └── auth-service
            └── token
                 └── token.py
```

A small project may have:

```text
repository
  └── module
       └── file
```

The hierarchy is adaptive.

---

## 10. Condition

Conditions are important because compressing them away may remove business rules.

Example source:

```python
if retry_count > 3:
    circuit_breaker.open()
```

IR:

```text
Condition {
    expression: "retry_count > 3"
    source_location: ...
}
```

Relation:

```text
CALLS circuit_breaker.open
condition = retry_count > 3
```

Do not replace this with an inferred English summary.

Preserve source semantics.

---

## 11. Effect

Effects capture externally relevant behavior.

Examples:

```text
READ_DATABASE
WRITE_DATABASE
PUBLISH_EVENT
NETWORK_CALL
FILE_READ
FILE_WRITE
RAISE_ERROR
MUTATE_STATE
CREATE_RESOURCE
DELETE_RESOURCE
```

Effects should be extracted only when reasonably deterministic.

Do not hallucinate effects.

Unknown is better than false certainty.

---

## 12. Confidence model

Recommended levels:

```text
HIGH
MEDIUM
LOW
UNKNOWN
```

### HIGH

Direct, statically resolved relationship.

Example:

```text
foo() directly calls local bar()
```

### MEDIUM

Resolution is likely but has multiple legal runtime targets.

Example:

```text
interface dispatch
```

### LOW

Heuristic inference.

Examples:

```text
dependency injection
reflection
dynamic import
plugin lookup
```

### UNKNOWN

The target cannot be resolved statically.

Agents should treat LOW and UNKNOWN areas as requiring source inspection or deeper MCP retrieval.

---

## 13. File classification

Each file carries a classification:

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

Classification affects extraction depth.

### FIRST_PARTY

Deep semantic extraction.

### TEST

Extract:

- Test name.
- Tested target if resolvable.
- Important assertions.
- Expected error paths.
- Invariants.

### GENERATED

Extract public surface and dependencies only.

### VENDOR

Usually shallow reference-only representation.

### BUILD

Ignore unless it materially defines application behavior.

---

## 14. Language plugin responsibility

A language plugin converts language-specific AST structures into canonical IR.

Plugin responsibilities:

```text
detect
parse
extract_entities
extract_signatures
extract_relations
extract_conditions
extract_effects
resolve_imports
resolve_calls
assign_confidence
```

The plugin should preserve language-specific details only when they materially help agent reasoning.

---

## 15. Canonical normalization examples

### Python

Source:

```python
def refresh_token(token: str) -> AccessToken:
    session = repo.find(token)
    validate_session(session)
    return create_access_token(session.user_id)
```

IR:

```text
Entity: refresh_token
Input: token:str
Output: AccessToken

CALLS repo.find
CALLS validate_session
CALLS create_access_token
```

### TypeScript

Source:

```ts
export async function refreshToken(
  token: string
): Promise<AccessToken>
```

IR may normalize output to:

```text
AccessToken
```

while retaining async metadata separately if useful.

### Terraform

Source:

```hcl
resource "aws_instance" "api" { ... }
```

IR:

```text
Entity kind: resource
Qualified name: aws_instance.api
```

Do not force Terraform resources into fake functions.

---

## 16. Revision model

Every published IR state belongs to an immutable semantic revision.

Example:

```text
revision 182
revision 183
revision 184
```

A revision is published only after:

```text
parse
resolve
validate
persist
```

has completed successfully for the relevant changeset.

Queries must see a consistent revision.

---

## 17. Last-known-good

If a changed file cannot currently be parsed:

```text
current source = temporarily invalid
```

the system must preserve the last-known-good semantic representation for that file, but mark it stale.

Example health state:

```text
status: PARTIAL

stale_files:
  - src/auth.py

parse_failures:
  - src/auth.py
```

This is safer than deleting known semantic information.

---

## 18. Semantic hashes

Track both:

```text
content_hash
semantic_hash
```

Example:

```text
comment-only change
content_hash changed
semantic_hash unchanged
```

In that case, dependent graph structure may not need invalidation.

The semantic hash should reflect the normalized semantic representation, not raw formatting.

---

## 19. Dependency invalidation

When a file changes:

```text
parse changed file
    ↓
compare old/new semantic surface
    ↓
invalidate affected relations
    ↓
re-resolve necessary dependent regions
```

Do not blindly reparse the whole repository.

If only implementation changes and the public semantic surface remains stable, propagation can remain narrow.

---

## 20. Health metadata

The IR pipeline should produce measurable quality indicators:

```text
supported_file_coverage
parse_success_rate
resolved_import_rate
resolved_call_rate
low_confidence_relation_rate
unknown_relation_rate
stale_file_count
unsupported_construct_count
```

These metrics are consumed by:

- `codegraph status`.
- MCP.
- Project profiler.
- Context compiler.

---

## 21. `codegraph.py` projection rules

The IR is high fidelity.

`codegraph.py` is not.

Projection should prioritize:

1. Region structure.
2. Entry points.
3. Important entities.
4. Public signatures.
5. Major relations.
6. Main data/control flow.
7. Confidence warnings.
8. MCP routing hints.

Projection should remove:

- Boilerplate.
- Logging.
- Local temporary variables.
- Repetitive loops.
- Formatting details.
- Generated implementation noise.
- Low-value leaf symbols when over budget.

---

## 22. Safety rule

The semantic IR is advisory.

Source code is authoritative.

If source and IR conflict:

```text
SOURCE WINS.
```

## 23. Risk flags

Confidence alone is not sufficient for edit safety.

Entities, relations, and regions may carry risk flags such as:

```text
DYNAMIC_DISPATCH
REFLECTION
DEPENDENCY_INJECTION
GENERATED_CODE
CONDITIONAL_COMPILATION
MACRO_EXPANSION
RUNTIME_REGISTRATION
CROSS_LANGUAGE_BOUNDARY
UNSUPPORTED_SEMANTICS
STALE_SOURCE
PARTIAL_PARSE
```

These flags help agents distinguish a statically reliable navigation path from one that requires direct source inspection.

---

## 24. Completeness is scoped, never global by default

The IR must not casually claim that a set of callers, dependencies, or affected entities is complete.

Completeness should be scoped to:

```text
language support
indexed regions
current revision
resolution capabilities
confidence threshold
```

Example:

```text
Callers found: 12
Completeness:
  static Python/TypeScript callers: complete
  runtime plugin callers: unknown
```

Unknown completeness is preferable to false completeness.

---

## 25. Collision and ambiguity handling

If stable identity resolution produces multiple plausible entities:

```text
do not pick one silently
```

Represent ambiguity explicitly.

Example:

```text
Resolution:
AMBIGUOUS

Candidates:
- service_a.User
- service_b.User
```

Ambiguity must propagate into MCP confidence and safety status.

---

## 26. Platform-sensitive semantics

The IR must preserve relevant build/runtime selectors when possible:

```text
OS
architecture
feature flags
build profile
environment
conditional compilation
framework configuration
```

A relation that only exists under a condition must not be represented as unconditional.

This is especially important for:

```text
C/C++
Rust cfg
build tags
platform-specific code
feature-flagged routes
environment-specific configuration
```

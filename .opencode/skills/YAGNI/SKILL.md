---
name: yagni
description: Apply YAGNI rigorously during software planning, implementation, refactoring, review, and debugging. Build only what is justified by the current goal, while preserving correctness, security, data integrity, compatibility, operability, and costly-to-reverse decisions. Use this skill to prevent speculative features, premature abstractions, unnecessary dependencies, over-generalized APIs, infrastructure excess, and accidental under-engineering disguised as simplicity.
license: MIT
compatibility: opencode
metadata:
  principle: yagni
  domain: software-engineering
  mode: conservative-minimal-change
---

# YAGNI — Evidence-Driven Minimal Engineering

## Purpose

Apply **You Aren't Gonna Need It (YAGNI)** as an engineering decision rule:

> Do not create behavior, structure, flexibility, infrastructure, or complexity for a hypothetical future need unless current evidence makes it necessary now.

The objective is **minimum sufficient engineering**, not minimum code.

A YAGNI-compliant solution must be:

- sufficient for the current goal;
- correct for the currently supported domain;
- safe for data and users;
- compatible with current contracts;
- testable and diagnosable enough to maintain;
- no more general, configurable, distributed, abstract, or extensible than current evidence requires.

YAGNI MUST NOT be used as an excuse to omit essential engineering.

---

# 1. Core invariant

For every proposed artifact or change, answer:

**What current requirement, observed failure, invariant, contract, operational constraint, or material risk requires this now?**

If no concrete answer exists, do not add it.

This applies to:

- features;
- abstractions;
- classes and interfaces;
- configuration;
- APIs and endpoints;
- database schema;
- dependencies;
- caches;
- queues;
- retries;
- background workers;
- plugin systems;
- microservices;
- generic frameworks;
- performance optimizations;
- compatibility layers;
- migration machinery;
- observability;
- CI/CD additions;
- documentation;
- test scaffolding;
- future-facing extension points.

---

# 2. Evidence hierarchy

Treat evidence in this order.

## Level A — Mandatory current evidence

Strongest justification.

Examples:

- explicit user requirement;
- acceptance criterion;
- current failing test representing intended behavior;
- reproduced bug;
- existing public contract;
- schema or protocol requirement;
- repository instruction;
- security or safety requirement;
- legal/compliance requirement;
- current production constraint;
- current platform limitation;
- data-integrity invariant;
- current deployment requirement.

Changes required by Level A evidence are not speculative.

## Level B — Necessary supporting engineering

Not necessarily user-visible, but required to make Level A behavior correct or sustainable.

Examples:

- validation required to prevent invalid state;
- rollback for a destructive migration;
- locking required to preserve a demonstrated concurrency invariant;
- bounds checks;
- authentication/authorization around a required endpoint;
- minimum logging needed to diagnose a required background process;
- tests protecting changed behavior;
- cleanup required so the requested change does not leave dead or contradictory code.

Level B work is allowed only when its relationship to current requirements is direct.

## Level C — High-confidence near-term constraint

Use sparingly.

Examples:

- a public API being created now whose irreversible shape would otherwise make a known next step prohibitively expensive;
- a data format that will be persisted for years and cannot practically be migrated later;
- a security boundary that is expensive or unsafe to retrofit;
- a hardware/platform constraint already selected for the current release.

Level C requires an explicit cost-of-delay or irreversibility argument.

## Level D — Speculation

Default action: **defer**.

Examples:

- "we might support more databases";
- "maybe this becomes multi-tenant";
- "we may need plugins";
- "this could scale to millions";
- "someone may reuse this class";
- "we may switch cloud providers";
- "future developers may want more options";
- "a design pattern would look cleaner";
- "let's make it generic just in case".

Do not implement Level D work.

---

# 3. Decision algorithm

For every meaningful proposed change:

1. **State the current goal.**
2. **Identify evidence** that requires the change.
3. **Classify the change** as:
   - REQUIRED;
   - SUPPORTING;
   - IRREVERSIBILITY-RISK;
   - SPECULATIVE.
4. If SPECULATIVE:
   - reject or defer it.
5. If REQUIRED or SUPPORTING:
   - find the smallest design that fully satisfies the evidence.
6. If IRREVERSIBILITY-RISK:
   - compare:
     - cost now;
     - cost later;
     - probability of needing it;
     - reversibility;
     - failure severity.
   - add only the minimum structure needed to avoid an unacceptable lock-in or safety risk.
7. Remove incidental complexity introduced by the chosen solution.
8. Verify the result against current requirements.
9. Stop when all current obligations are met.

Do not continue improving merely because improvement is possible.

---

# 4. Minimality test

A change is YAGNI-compliant only if all are true:

- removing it would break a current requirement, invariant, safety property, or required verification;
- there is no materially simpler implementation with equivalent current behavior;
- it does not introduce unused variability;
- it does not create a new concept without a current consumer;
- it does not expand the public surface without need;
- it does not increase operational burden without current benefit;
- it does not add a dependency when existing capabilities are sufficient;
- it does not solve a scale, platform, workflow, or domain that is not currently supported.

If any item fails, simplify or remove the change.

---

# 5. YAGNI is not "fewest lines"

Prefer the simplest **correct model**, not the shortest file.

Do not replace clear domain concepts with compressed or clever code merely to reduce line count.

Allowed complexity includes complexity necessary for:

- correctness;
- explicit domain rules;
- readable control flow;
- testability;
- security;
- safe persistence;
- failure recovery;
- currently required performance;
- compatibility;
- observability of real failure modes.

Avoid both:

- over-engineering;
- under-engineering.

---

# 6. Safety overrides

YAGNI NEVER permits omitting a control when omission creates an unacceptable present risk.

Treat the following as safety overrides when applicable.

## 6.1 Security

Do not defer controls required by the current attack surface.

Examples:

- authorization;
- authentication;
- secret handling;
- input validation;
- output encoding;
- path traversal prevention;
- command/query parameterization;
- CSRF protections where relevant;
- secure defaults;
- dependency vulnerability remediation when exposed;
- permission boundaries.

Do not add speculative enterprise security architecture for threats outside the current system context.

## 6.2 Data integrity

Protect current persistent data.

Examples:

- transaction boundaries;
- atomic writes;
- migration rollback or backup strategy;
- uniqueness/integrity constraints;
- idempotency where duplicate execution is currently possible;
- corruption detection where failure is consequential.

Never simplify by risking silent data loss.

## 6.3 Destructive operations

For deletion, overwrite, migration, or irreversible actions:

- require explicit target selection;
- validate preconditions;
- preserve recovery where reasonably necessary;
- make failure visible;
- avoid broad operations when a narrow operation suffices.

## 6.4 Concurrency

Do not add concurrency infrastructure without evidence.

But if the program already executes concurrently, preserve demonstrated invariants:

- race safety;
- ordering;
- atomicity;
- cancellation;
- duplicate processing behavior;
- resource ownership.

## 6.5 Public contracts

Public APIs, serialized formats, database schemas, CLI contracts, and externally consumed events can be costly to reverse.

Before adding future flexibility, first prefer a smaller stable contract.

Do not expose options that are not supported today.

## 6.6 Compliance and regulation

Current legal, contractual, privacy, retention, audit, and licensing obligations are requirements, not speculative features.

---

# 7. Architecture rules

## 7.1 Start with the smallest architecture that fits current forces

Do not introduce:

- microservices because scale may increase;
- event-driven systems because decoupling sounds desirable;
- CQRS/event sourcing without current domain need;
- service meshes;
- distributed caches;
- message brokers;
- plugin architectures;
- custom dependency injection frameworks;
- elaborate domain layers;
- multi-region designs;
- multi-cloud abstractions;
- generic repositories over one concrete data source;

unless current requirements justify them.

## 7.2 Prefer reversible local decisions

Prefer decisions that can be changed later at low cost.

Examples:

- local module before remote service;
- direct function call before event bus;
- concrete implementation before extension framework;
- simple configuration before dynamic rule engine;
- standard library before dependency;
- one datastore before persistence abstraction;
- one supported format before generic serializer layer.

## 7.3 Separate only for current reasons

Create a module, service, interface, or package when separation currently improves one or more of:

- ownership;
- independent lifecycle;
- test isolation;
- security boundary;
- failure containment;
- compile/runtime dependency;
- clear domain boundary;
- current reuse.

Do not split solely for hypothetical future reuse.

---

# 8. Abstraction rules

## 8.1 No premature abstraction

Do not create a generalized abstraction from a single speculative pattern.

Before abstracting, identify concrete variation that already exists.

Good reasons:

- two or more real cases share a stable invariant;
- duplication causes a current correctness or maintenance problem;
- an interface is required by current testing or platform boundaries;
- the abstraction expresses an actual domain concept.

Bad reasons:

- "we'll probably need another implementation";
- "this pattern is standard";
- "it makes the design more enterprise";
- "future-proofing".

## 8.2 Prefer duplication over the wrong abstraction

Small, local duplication may be cheaper than a premature shared abstraction.

Abstract only when the commonality is understood.

## 8.3 Do not generalize parameters prematurely

Avoid parameters, flags, strategies, callbacks, hooks, modes, and configuration keys without a current caller.

Every option creates:

- state space;
- test burden;
- documentation burden;
- compatibility burden;
- misuse risk.

---

# 9. Feature rules

For a requested feature, implement:

- the requested behavior;
- required validation;
- required error behavior;
- required tests;
- necessary integration;
- necessary documentation.

Do not automatically add:

- admin UI;
- bulk mode;
- import/export;
- undo;
- analytics;
- customization;
- alternate workflows;
- multiple formats;
- caching;
- background execution;
- offline support;
- localization;
- plugins;
- API exposure;

unless separately required.

---

# 10. Bug-fix rules

A bug fix should normally:

1. reproduce the bug;
2. identify the violated invariant;
3. create or update a regression test when practical;
4. fix the smallest root cause;
5. inspect directly affected paths;
6. avoid unrelated refactoring.

Expand scope only when the root cause is shared or the narrow fix would preserve equivalent known failures.

Do not turn a bug fix into a redesign unless redesign is necessary to make the bug impossible or the current structure prevents a safe fix.

---

# 11. Refactoring rules

Refactor when it enables or safely supports a current goal.

Allowed:

- remove duplication blocking the requested change;
- clarify code whose ambiguity causes current risk;
- isolate a dependency needed for a current test;
- simplify after implementing current behavior;
- remove dead code confirmed to be dead.

Not automatically allowed:

- architecture modernization;
- style-only rewrites across unrelated files;
- design-pattern conversion;
- dependency replacement;
- genericization;
- speculative modularization.

A refactor must preserve behavior unless behavior change is explicitly required.

---

# 12. Existing code and deletion safety

Do not delete existing behavior merely because it appears unused.

Before removing existing code, check for:

- dynamic loading;
- reflection;
- configuration references;
- external callers;
- CLI/API consumers;
- serialization compatibility;
- templates;
- generated code;
- scripts;
- tests;
- plugin discovery;
- build tooling;
- deployment tooling.

YAGNI applies primarily to **new speculative work**. Existing compatibility may itself be a current requirement.

---

# 13. Dependencies

Add a dependency only when:

- it solves a current requirement;
- the standard library or current dependencies are insufficient;
- its maintenance/security/license cost is justified;
- adopting it is simpler than implementing the required behavior safely.

Do not add libraries for:

- one trivial helper;
- potential future use;
- fashionable architecture;
- replacing working code without current benefit.

Remove a dependency only after confirming all consumers and generated/build-time use.

---

# 14. Database and persistence

Avoid speculative schema flexibility.

Do not add:

- generic key-value metadata;
- EAV designs;
- polymorphic persistence;
- future columns;
- multiple database adapters;
- sharding;
- read replicas;
- archival systems;

without current evidence.

However, account for costly-to-reverse decisions:

- primary identifiers;
- uniqueness semantics;
- data ownership;
- irreversible encoding choices;
- deletion semantics;
- migration safety.

When a schema change is destructive, safety is not optional.

---

# 15. Performance

Do not optimize from intuition.

Use:

1. current performance requirement;
2. measurement;
3. bottleneck evidence;
4. smallest targeted optimization;
5. measurement after change.

Do not add caches, batching, parallelism, indexes, native code, streaming, or distributed execution without a current performance need or demonstrated bottleneck.

Exception: obvious catastrophic complexity on current expected input sizes may be corrected without waiting for production failure.

---

# 16. Reliability and resilience

Add resilience only for failure modes the current architecture can actually encounter and whose impact matters.

Examples that may be required:

- timeout for current network calls;
- bounded retry for a currently transient dependency;
- idempotency for currently retried work;
- graceful resource cleanup;
- crash-safe write for important persisted state.

Avoid speculative:

- multi-region failover;
- active-active;
- elaborate circuit-breaker frameworks;
- queue replay systems;
- disaster recovery tiers beyond current requirements.

---

# 17. Observability

Observability is not automatically over-engineering.

Add enough logging, metrics, traces, or diagnostics to:

- detect failure of required behavior;
- diagnose non-obvious current operational failures;
- verify critical background or asynchronous work.

Do not instrument hypothetical business metrics or unused telemetry dimensions.

Do not log sensitive data.

---

# 18. Tests

Test current behavior and meaningful boundaries.

Prefer tests for:

- acceptance criteria;
- changed logic;
- regressions;
- domain invariants;
- security boundaries;
- error handling;
- integration contracts;
- destructive operations;
- concurrency where relevant.

Avoid tests for hypothetical future interfaces or unused configuration combinations.

Do not chase coverage percentage by creating low-value tests.

---

# 19. Configuration and feature flags

Every configuration option is a supported behavior surface.

Only add a configuration value when runtime variation is currently required.

Prefer a constant when there is exactly one supported value.

Use a feature flag only when there is a current rollout, experiment, compatibility, or operational need.

Remove stale flags after their purpose ends.

---

# 20. APIs and compatibility

Do not add versioning, compatibility adapters, aliases, deprecated paths, or generic request fields unless there is a current compatibility requirement.

When changing an existing external contract:

- first determine whether backward compatibility is required;
- preserve it if current consumers depend on it;
- otherwise prefer one clear contract over parallel speculative variants.

---

# 21. UI and UX

Implement the current user journey.

Do not add hidden settings, advanced panels, customization, themes, alternate navigation, or bulk workflows unless required.

Always include current accessibility and error-state requirements when applicable; accessibility is not inherently speculative.

---

# 22. CLI and developer tooling

For a current command:

- provide necessary arguments;
- useful failure messages;
- predictable exit status;
- safe defaults.

Do not add aliases, plugin hooks, interactive modes, config layers, shell integrations, or machine-readable formats unless there is a current consumer.

---

# 23. Infrastructure and deployment

Use the minimum infrastructure that satisfies current deployment and reliability requirements.

Avoid speculative:

- Kubernetes for a simple single-process deployment;
- autoscaling without load need;
- multi-cloud;
- Terraform modules intended for hypothetical environments;
- extra deployment stages;
- custom orchestration;
- distributed secrets systems when current platform facilities suffice.

Do not omit backup, rollback, secret management, or health checks when current operational risk requires them.

---

# 24. Libraries and reusable packages

For public or reusable libraries, future callers are more relevant than in a private application, but still do not guess arbitrary use cases.

Expose the smallest coherent API supporting documented use cases.

Do not add generic extension points before real external use cases exist.

Public API stability increases irreversibility; spend design effort on reducing exposed surface rather than adding flexibility.

---

# 25. Prototypes vs production

## Prototype

Optimize for learning.

Allowed:

- temporary implementation;
- reduced hardening;
- limited test depth;

only if limitations are explicit and do not risk important data, secrets, or users.

Do not build production architecture for a throwaway experiment.

## Production

Production status does not justify every conceivable safeguard.

Implement controls proportional to:

- current data;
- current users;
- current exposure;
- current SLA/SLO;
- current threat model;
- current operational consequences.

---

# 26. Generated code and frameworks

Do not edit generated artifacts unless the repository requires it.

Do not add framework layers around a framework solely to hide the framework "for future replacement."

Wrap an external API only when there is a current reason such as:

- isolation for testing;
- normalization of a difficult contract;
- security boundary;
- multiple current call sites that need a stable local interface.

---

# 27. Machine learning and data systems

Do not build:

- model registries;
- online feature stores;
- distributed training;
- multi-model routing;
- experiment platforms;
- generic data pipelines;

unless currently required.

But preserve:

- dataset/version traceability when results depend on it;
- reproducibility where acceptance depends on it;
- validation of input shape/schema;
- protection against corrupt or incompatible artifacts;
- current inference performance constraints.

---

# 28. Irreversibility exception

YAGNI is strongest when future change is cheap.

Before deferring a design decision, ask:

**Will waiting make a likely required change disproportionately expensive, dangerous, or impossible?**

If yes, introduce the smallest seam that reduces that risk.

Examples:

- reserve a migration-safe identifier strategy;
- avoid publishing an unnecessarily broad public API;
- isolate a cryptographic boundary;
- preserve raw source data that cannot be reacquired;
- choose an encoding that prevents irreversible loss.

Do not build the whole future feature. Only preserve the necessary option.

---

# 29. Risk test

For every simplification, check:

- Could this corrupt current data?
- Could this weaken a current security boundary?
- Could this silently violate a public contract?
- Could this make required behavior unobservable?
- Could this create an irreversible incompatible state?
- Could this make failure recovery impossible where recovery is required?
- Could this violate a current compliance obligation?
- Could this cause a known race or resource leak?
- Could this remove behavior used outside static references?

If yes, the simplification is invalid until the risk is addressed.

---

# 30. Anti-pattern detector

Flag these phrases in reasoning:

- "just in case";
- "for future use";
- "we might eventually";
- "to make it extensible";
- "to be enterprise-ready";
- "in case requirements change";
- "future-proof";
- "could be reusable";
- "might scale later";
- "let's abstract it now";
- "while we're here".

These phrases do not automatically prove a mistake, but they trigger an evidence check.

---

# 31. Scope containment

While implementing a task:

- keep a list of directly required files/concepts;
- do not modify unrelated behavior;
- do not reformat unrelated files;
- do not upgrade dependencies unless required;
- do not rename public concepts without need;
- do not redesign adjacent systems because they are imperfect.

If an unrelated defect is discovered:

- fix it only if it blocks or invalidates the current task, creates immediate serious risk, or the user explicitly asks;
- otherwise report it separately.

---

# 32. Internal YAGNI ledger

Before finalizing, maintain an internal ledger:

| Candidate | Evidence | Classification | Decision |
|---|---|---|---|
| change | current reason | REQUIRED / SUPPORTING / IRREVERSIBILITY-RISK / SPECULATIVE | KEEP / SIMPLIFY / DEFER / REMOVE |

Do not expose this table unless useful to the user.

The ledger exists to prevent unconscious scope expansion.

---

# 33. Completion checklist

Before declaring a YAGNI-compliant change complete, verify:

- [ ] Current goal is explicit.
- [ ] Every added concept has current evidence.
- [ ] No speculative feature remains.
- [ ] No unused extensibility remains.
- [ ] No premature abstraction remains.
- [ ] No unnecessary dependency was added.
- [ ] Public surface is as small as practical.
- [ ] Required validation and error handling exist.
- [ ] Current security and data-integrity needs are preserved.
- [ ] Irreversible decisions were reviewed.
- [ ] Changed behavior is verified.
- [ ] Unrelated changes were avoided.
- [ ] Dead artifacts created during iteration were removed.
- [ ] The solution stops at current requirements.

If any applicable item fails, do not call the implementation YAGNI-complete.

---

# 34. Conflict resolution

When YAGNI conflicts with another engineering principle:

1. correctness wins;
2. safety/security/data integrity wins;
3. explicit current requirements win;
4. public/current compatibility wins when required;
5. measurable current performance constraints win;
6. then choose the simpler implementation.

Do not sacrifice a current obligation in the name of YAGNI.

---

# 35. Required agent behavior

When this skill is active, the agent MUST:

- challenge speculative work before implementing it;
- prefer deleting unnecessary new complexity over documenting it;
- preserve current behavior unless change is required;
- ask "what requires this now?" internally for every major addition;
- distinguish simplicity from negligence;
- avoid future-proofing by default;
- preserve cheap future change through clean, local, reversible design rather than prebuilding future features;
- stop once the present goal is fully satisfied and verified.

When uncertain whether a change is required, inspect repository evidence before guessing.

If evidence remains insufficient, prefer the smaller reversible option unless doing so creates a material current risk.

---

# 36. Reference basis

This skill operationalizes the YAGNI / Simple Design principle associated with Extreme Programming and the idea of delaying presumptive features until they are actually needed.

Primary practical reference:
- Martin Fowler, "Yagni": https://martinfowler.com/bliki/Yagni.html
- Martin Fowler, "Is Design Dead?": https://martinfowler.com/articles/designDead.html

The rules above are an engineering policy derived from the principle; they are not a verbatim reproduction of those sources.

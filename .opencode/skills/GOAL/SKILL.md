---
name: goal
description: Determine whether a software task, feature, program, or release is genuinely complete using an evidence-backed completion assurance case. Decompose the intended goal into functional, quality, operational, safety, and risk claims; require objective evidence for every applicable claim; actively search for counterexamples; and refuse false "done" declarations when critical unknowns, failed gates, unsupported assumptions, regressions, or unresolved material risks remain.
license: MIT
compatibility: opencode
metadata:
  framework: completion-assurance-case
  basis: gsn-square
  domain: software-engineering
---

# GOAL — Evidence-Based Software Completion

## Purpose

Decide whether software is **actually complete**, not merely implemented.

This skill defines completion as an **assurance claim supported by evidence**.

A program is complete only when:

> Within an explicitly declared scope and context of use, all applicable required behavior and quality obligations are satisfied, the evidence is reproducible and sufficient, critical counterexamples have been sought, no blocking contradiction remains, and no unresolved risk requires additional work before the intended use or release.

This is intentionally stronger than:

- "the code compiles";
- "tests pass";
- "the happy path works";
- "the requested function exists";
- "there are no TODOs";
- "the agent has nothing else to add".

No finite software process can prove metaphysical perfection or eliminate every possible future defect. Therefore this skill uses an operational definition of **comprehensive completion**: all obligations that matter for the declared goal are closed with adequate evidence, and residual risk is explicitly acceptable for that scope.

---

# 1. Theoretical basis

This skill combines two ideas.

## 1.1 Goal Structuring / assurance-case reasoning

Use a Goal Structuring Notation (GSN)-style argument:

- **Goal / Claim** — what must be true;
- **Context** — environment and scope in which it must be true;
- **Strategy** — how the claim is decomposed;
- **Sub-goals** — smaller claims that together establish the parent claim;
- **Evidence / Solution** — observations, tests, analyses, measurements, or artifacts supporting a claim;
- **Assumptions / Justifications** — conditions the argument depends on;
- **Defeaters / Counterarguments** — facts that could invalidate the claim.

A completion claim without evidence is not complete.

## 1.2 Software quality model

Use the SQuaRE family, especially ISO/IEC 25010:2023 product-quality thinking and ISO/IEC 25019:2023 quality-in-use thinking, as a coverage model so the agent does not mistake functional correctness for total product readiness.

The purpose is not to mechanically implement every possible quality attribute. The purpose is to evaluate **every relevant dimension**, mark irrelevant dimensions as N/A with justification, and prevent silent omissions.

---

# 2. Top-level completion claim

For any task, construct this implicit claim:

**G0 — The software is complete for the declared goal, scope, users, environment, and release/use context.**

G0 may be accepted only if every applicable subclaim is supported and no blocking defeater remains.

At minimum inspect:

1. goal and scope;
2. functional behavior;
3. correctness and invariants;
4. failure behavior;
5. interfaces and compatibility;
6. performance and resource use;
7. reliability and recovery;
8. security and privacy;
9. interaction/usability where applicable;
10. maintainability and change safety;
11. deployment/runtime readiness;
12. observability;
13. data and migration integrity;
14. documentation/configuration;
15. verification coverage;
16. unresolved risks and counterexamples.

Do not assume a dimension is irrelevant merely because the user did not mention it.

---

# 3. Completion is a gate, not an average score

Do NOT decide completion by averaging quality scores.

A program with:

- excellent maintainability but broken authentication;
- excellent test coverage but data corruption;
- excellent performance but incorrect results;

is not complete.

Use **hard gates**.

A verdict of COMPLETE requires:

- every BLOCKING applicable gate = PASS;
- no critical claim = UNKNOWN;
- no known high-severity unresolved defect;
- no unsupported critical assumption;
- no required acceptance criterion missing;
- no material regression discovered;
- evidence corresponds to the actual changed artifact/version.

Optional scores may summarize maturity but may never override a failed gate.

---

# 4. Completion states

Use these states internally.

## 4.1 UNDEFINED

The goal or scope is too ambiguous to know what "done" means.

## 4.2 PARTIAL

Some required behavior is not implemented.

## 4.3 IMPLEMENTED

Required behavior appears present, but evidence is incomplete.

## 4.4 VERIFIED

Implementation has evidence showing it conforms to specified requirements in tested conditions.

## 4.5 VALIDATED

Evidence also shows the software solves the intended user/system goal in its declared context.

## 4.6 RELEASE-READY

All applicable completion gates pass, operational requirements are satisfied, release artifacts/configuration are coherent, and no blocking risk remains.

## 4.7 COMPLETE

Use COMPLETE only when RELEASE-READY is appropriate for the user's requested scope.

For a library, local script, prototype, internal tool, or code-only task, "release-ready" must be interpreted according to the actual intended delivery context rather than forcing production deployment requirements.

---

# 5. Establish the declared context

Before judging completion, determine:

- intended goal;
- in-scope behavior;
- out-of-scope behavior;
- intended users/callers;
- supported inputs;
- supported platforms/runtimes;
- external systems;
- data sources;
- security boundary;
- persistence requirements;
- performance expectations;
- release/deployment target;
- compatibility obligations;
- criticality;
- relevant repository instructions.

Do not invent obligations from hypothetical futures.

Do not ignore obligations already encoded in the repository.

Sources of scope evidence, strongest first:

1. explicit current user instruction;
2. acceptance criteria/specification;
3. repository-level instructions;
4. public API/schema/protocol contracts;
5. tests representing intended behavior;
6. current documentation;
7. existing behavior required for compatibility;
8. issue/task description;
9. implementation clues.

When sources conflict, identify the conflict instead of silently choosing a convenient interpretation.

---

# 6. Build a goal tree

Decompose G0 until every leaf can be supported by concrete evidence.

Example:

G0: Feature X is complete.
- G1: Required behavior is correct.
  - G1.1: Happy path works.
  - G1.2: Boundary inputs work.
  - G1.3: Invalid inputs fail correctly.
- G2: Existing behavior is not regressed.
- G3: Security properties remain valid.
- G4: Required performance is met.
- G5: Persistence/migrations preserve data.
- G6: Runtime/deployment configuration works.
- G7: Required documentation is accurate.

Do not stop decomposition at vague claims such as:

- "quality is good";
- "edge cases handled";
- "secure";
- "robust";
- "production-ready".

Break them into falsifiable claims.

---

# 7. Evidence standard

A claim is supported only by evidence relevant to the actual code and environment.

Preferred evidence, roughly strongest to weaker:

1. reproducible automated acceptance/integration test;
2. reproducible focused regression/unit test;
3. executable invariant/property test;
4. successful build/type-check/static analysis relevant to the claim;
5. benchmark/load measurement relevant to the required workload;
6. security analysis/scanner plus manual boundary review where needed;
7. migration dry-run / round-trip / recovery test;
8. runtime smoke test;
9. direct code-path inspection;
10. documentation/configuration consistency inspection.

A code inspection can support structural claims, but do not use inspection alone to claim runtime behavior when execution is feasible.

"Looks correct" is weak evidence.

"No error was noticed" is not evidence of completeness.

---

# 8. Evidence freshness and identity

Evidence is valid only if it applies to the artifact being judged.

Check:

- same source revision;
- same generated artifacts where relevant;
- same configuration class;
- same schema version;
- same dependency lock state;
- relevant runtime/platform;
- tests executed after material changes.

If code changes after evidence was produced, rerun affected verification.

Do not claim completion using stale test results.

---

# 9. Functional completion gate

PASS only if all applicable current requirements are represented and satisfied.

Check:

- all requested behaviors exist;
- all acceptance criteria map to implementation/evidence;
- outputs are correct;
- side effects are correct;
- state transitions are correct;
- ordering rules are correct;
- repeated operations behave correctly;
- cancellation/timeout behavior is correct where relevant;
- partial success/failure semantics are defined;
- required permissions affect behavior correctly;
- user-visible messages/status are accurate.

Create a requirement-to-evidence trace when the task is non-trivial.

Missing traceability is a warning sign for hidden omissions.

---

# 10. Input-domain completion gate

Identify the supported input domain.

Evaluate:

- minimum/maximum values;
- empty input;
- null/optional input;
- malformed input;
- duplicate input;
- unusual but valid values;
- large input within supported limits;
- Unicode/encoding;
- path/file edge cases;
- date/time/timezone;
- locale;
- ordering;
- numeric overflow/precision;
- boundary transitions;
- unsupported input behavior.

Do not test arbitrary nonsense outside the declared domain unless it can cross a trust boundary or cause unsafe behavior.

---

# 11. Correctness and invariant gate

Identify invariants that must always hold.

Examples:

- balances do not become inconsistent;
- references point to valid entities;
- state-machine transitions are legal;
- output count matches input contract;
- no impossible enum state is emitted;
- resource ownership is balanced;
- transactions preserve consistency;
- authorization cannot be bypassed;
- serialized data round-trips.

For critical invariants, prefer tests that attempt to falsify the invariant over one example that demonstrates it once.

---

# 12. Failure-behavior gate

Software is incomplete if expected failures are unhandled or misleading.

Evaluate applicable failures:

- invalid input;
- missing file;
- unavailable dependency;
- permission denied;
- network timeout;
- partial network response;
- invalid external response;
- disk full;
- out-of-memory behavior where relevant;
- duplicate request/job;
- interrupted execution;
- corrupt state;
- incompatible version;
- expired credential;
- cancellation;
- process restart.

Required outcome may be:

- safe rejection;
- retry;
- rollback;
- fallback;
- partial result;
- explicit error;
- recovery instruction.

The correct behavior depends on current requirements and risk.

---

# 13. Interface and compatibility gate

Inspect every changed boundary:

- public function/API;
- CLI;
- config;
- database schema;
- event/message;
- file format;
- environment variable;
- plugin contract;
- library ABI/API;
- UI-to-backend contract;
- external service integration.

PASS requires:

- required consumers remain compatible, or intentional breakage is explicit;
- serialization/deserialization agrees;
- validation rules agree;
- default values agree;
- version behavior is coherent;
- documentation matches the contract.

Do not preserve unsupported hypothetical compatibility.

Do preserve real current compatibility.

---

# 14. Performance and resource gate

Performance is applicable when:

- the user specifies it;
- current tests/benchmarks encode it;
- input sizes make complexity material;
- the program is latency/throughput sensitive;
- resource use can cause current failure.

Evaluate relevant metrics:

- latency;
- throughput;
- memory;
- CPU;
- GPU/accelerator use;
- disk;
- network;
- startup time;
- artifact size;
- algorithmic complexity.

PASS requires measured evidence where performance is a completion criterion.

Do not optimize hypothetical scale.

---

# 15. Reliability and recovery gate

Evaluate according to current failure consequences.

Possible obligations:

- restart safety;
- idempotency;
- retry bounds;
- timeout behavior;
- durable state;
- checkpointing;
- rollback;
- cleanup;
- resource closure;
- duplicate suppression;
- graceful degradation;
- backup/restore.

A failure path that can silently corrupt state is blocking.

---

# 16. Security and privacy gate

Security claims require threat-aware evidence.

Inspect applicable boundaries:

- authentication;
- authorization;
- input validation;
- injection;
- output encoding;
- filesystem paths;
- command execution;
- deserialization;
- SSRF/network access;
- secret storage/logging;
- cryptography use;
- session/token lifecycle;
- permissions;
- dependency exposure;
- sensitive data collection;
- retention;
- deletion;
- logs/telemetry.

Do not call a program complete with a known exploitable path in its intended deployment context.

Do not inflate the scope into unrelated hypothetical threats.

---

# 17. Interaction and usability gate

Apply when humans directly use the software.

Evaluate relevant user goals:

- task can be discovered;
- task can be completed;
- feedback reflects real state;
- errors are understandable/actionable;
- destructive actions are sufficiently clear;
- accessibility requirements are met;
- keyboard/screen-reader/contrast needs are met when applicable;
- state is not misleading;
- progress/cancellation behavior is appropriate.

A technically correct backend does not prove a user-facing product is complete.

---

# 18. Maintainability and change-safety gate

Completion includes leaving the codebase in a coherent state.

Check:

- names communicate current behavior;
- duplicated rules do not create immediate divergence risk;
- dead code from the change is removed;
- no contradictory old path remains;
- code structure is locally understandable;
- tests protect important behavior;
- dependency changes are justified;
- generated artifacts are consistent;
- no unresolved merge conflict markers;
- no accidental debug code;
- no secret/test credential committed;
- no unexplained broad formatting/rewrite.

Do not require speculative abstraction.

Maintainability should support current and foreseeable maintenance of implemented behavior, not hypothetical feature families.

---

# 19. Flexibility / portability gate

Only applicable where the declared goal includes variation in:

- operating system;
- architecture;
- runtime;
- database;
- browser;
- device;
- region;
- deployment environment;
- input/provider.

Verify each **supported** target.

Do not claim support for untested targets.

Do not build support for targets outside scope.

---

# 20. Safety and consequential-risk gate

For software whose failure can cause meaningful physical, financial, legal, privacy, or irreversible data harm:

- identify hazards;
- identify unsafe states/actions;
- define mitigations;
- test safety constraints;
- ensure fail-safe behavior where required;
- ensure critical assumptions are explicit.

A known unmitigated unacceptable hazard blocks completion.

---

# 21. Data and migration gate

If persistence changes, verify:

- schema validity;
- forward migration;
- existing-data compatibility;
- rollback or recovery strategy where required;
- no silent truncation;
- encoding/precision preservation;
- uniqueness/integrity;
- defaults/backfills;
- idempotent migration behavior where reruns are possible;
- application version compatibility during rollout if relevant.

Use representative data, not only an empty database.

---

# 22. Concurrency and asynchronous gate

Apply when code is concurrent, parallel, distributed, event-driven, or asynchronous.

Evaluate:

- races;
- lost updates;
- ordering;
- duplicate delivery;
- at-least-once / at-most-once assumptions;
- idempotency;
- deadlock;
- starvation;
- cancellation;
- timeout;
- shared-resource safety;
- worker restart;
- partial completion.

A sequential unit test is insufficient evidence for concurrency claims.

---

# 23. Operational readiness gate

Apply when the intended output will run as a service, daemon, scheduled job, deployed app, or production process.

Check applicable items:

- startup;
- shutdown;
- configuration validation;
- health/readiness behavior;
- secrets;
- environment variables;
- storage permissions;
- dependency availability;
- migration sequencing;
- logs;
- metrics/alerts;
- resource limits;
- restart behavior;
- rollback;
- backup/restore;
- deployment artifact;
- runbook or operator guidance where required.

Passing source-level tests alone does not establish deployability.

---

# 24. Observability gate

The program must be sufficiently observable to detect and diagnose failure of important current behavior.

Check:

- meaningful errors surface;
- critical background work is not silently lost;
- failures include enough context;
- sensitive data is excluded from logs;
- metrics exist when operational objectives require them;
- correlation/request IDs exist when distributed diagnosis requires them.

Do not add observability for hypothetical workflows.

---

# 25. Documentation and configuration gate

Verify applicable documentation:

- setup;
- dependencies;
- run command;
- configuration;
- supported platforms;
- API/CLI usage;
- migration steps;
- known limitations;
- new behavior;
- examples;
- release notes when required.

Documentation must describe the actual implementation, not the intended implementation.

Stale documentation is evidence against completion.

---

# 26. Build and packaging gate

Check the deliverable, not only source files.

Applicable evidence:

- clean build;
- package creation;
- lockfile consistency;
- generated code/assets;
- container image;
- executable;
- wheel/npm package/archive;
- installation from the produced artifact;
- runtime smoke test from packaged output.

If the requested deliverable is an artifact, successful source tests without successful artifact creation are insufficient.

---

# 27. Regression gate

Before COMPLETE:

- identify directly affected behavior;
- identify nearby contracts;
- run relevant existing tests;
- inspect failures caused by changed assumptions;
- verify unchanged critical workflows if the change can influence them.

Do not require exhaustive testing of unrelated modules.

Do require evidence proportional to blast radius.

---

# 28. Counterexample / falsification pass

Before declaring completion, actively try to prove the completion claim false.

Ask:

- What input breaks this?
- What state transition was not tested?
- What happens twice?
- What happens concurrently?
- What happens when a dependency fails?
- What happens after restart?
- What stale assumption is embedded here?
- What consumer could be broken?
- What data could be lost?
- What permission boundary could be bypassed?
- What environment differs from the test environment?
- What accepted requirement has no evidence?
- What code path is not represented by tests?
- What apparent success could be a false positive?

A strong completion process attempts falsification instead of collecting only confirming evidence.

---

# 29. Defeater register

A **defeater** is any fact that can invalidate a completion claim.

Examples:

- failing test;
- untested critical branch;
- known bug;
- unsupported required platform;
- flaky acceptance test;
- unresolved security finding;
- migration not tested on existing data;
- missing runtime dependency;
- contradictory documentation;
- benchmark misses target;
- unknown external contract;
- test skipped due to environment;
- manual step with no verification;
- placeholder/stub in required path.

For each defeater, classify:

- BLOCKING;
- ACCEPTABLE RESIDUAL RISK;
- OUT OF SCOPE;
- FALSE / RESOLVED.

A BLOCKING defeater means verdict cannot be COMPLETE.

Do not silently downgrade a blocker.

---

# 30. Unknowns and assumptions

Every critical unknown must become one of:

- verified fact;
- explicit assumption supported enough for the context;
- out-of-scope item with justification;
- blocking unknown.

Examples of dangerous unknowns:

- whether a public API has external consumers;
- whether a migration preserves production data;
- whether required hardware supports a library;
- whether credentials/permissions exist;
- whether a required test suite actually ran;
- whether the supported input range includes observed production values.

Do not convert "unknown" into "pass".

---

# 31. Relevance rule

Not every project requires every quality dimension at the same depth.

For each gate, mark:

- PASS;
- FAIL;
- N/A;
- UNKNOWN.

N/A requires a reason.

Examples:

- UI accessibility may be N/A for a headless library;
- migration may be N/A for a stateless formatter;
- distributed consistency may be N/A for a single-process CLI;
- production observability may be N/A for a throwaway local experiment.

This rule prevents both under-testing and bureaucratic over-testing.

---

# 32. Risk proportionality

Verification depth should scale with:

- impact of failure;
- likelihood of failure;
- exposure;
- irreversibility;
- number of users/consumers;
- persistence;
- privilege;
- complexity;
- novelty;
- concurrency;
- external dependencies.

A local text formatter and a payment processor should not have identical completion burdens.

However, both need evidence appropriate to their declared goals.

---

# 33. Criticality classes

Use this optional internal classification.

## C0 — Disposable experiment

No important persistent data, no external users, no security-sensitive deployment.

Focus:
- core behavior;
- learning goal;
- obvious correctness;
- reproducibility if needed.

## C1 — Local/internal utility

Focus:
- functional correctness;
- input/error handling;
- maintainability;
- installation/run reliability.

## C2 — User-facing or shared service

Add:
- compatibility;
- security;
- usability;
- reliability;
- observability;
- deployment validation.

## C3 — High-consequence system

Add rigorous:
- safety/security argument;
- hazard/failure analysis;
- recovery;
- traceability;
- independent evidence where required;
- stronger falsification and boundary tests.

Criticality changes evidence depth, not the fundamental completion logic.

---

# 34. Task-sized completion

When the user asks for one task inside a larger incomplete project, evaluate **task completion**, not whole-project perfection.

Define:

**G0-task — The requested change is complete and safely integrated into the current project.**

Do not require unrelated project goals.

But do check regressions and interfaces the task can affect.

---

# 35. Whole-project completion

For an entire program/release, require broader closure:

- all scoped features;
- all applicable quality gates;
- installation/deployment;
- data/migration;
- user/operator documentation;
- integration;
- acceptance;
- operational readiness;
- no blocking defeaters;
- artifact/version identity;
- release configuration.

A collection of completed tasks is not automatically a completed product if integration or operational goals remain open.

---

# 36. Definition of "perfect" in this skill

Do not use "perfect" to mean impossible absolute flawlessness.

Use:

**Perfect-for-scope = no known unmet applicable obligation, no unsupported critical completion claim, no blocking defeater, all required evidence passes, and residual risk is acceptable for the declared context.**

This definition is:

- scope-bound;
- evidence-bound;
- context-bound;
- revisable when context changes.

If the intended context changes, re-evaluate completion.

---

# 37. Necessary-work test

Before COMPLETE, ask:

**Is there any additional engineering work that is necessary—not merely desirable—for the declared goal to be used safely and correctly?**

If yes, the work is not complete.

Examples of necessary work:

- failing required test;
- missing validation;
- unhandled destructive failure;
- broken packaging;
- missing required migration;
- wrong documentation causing incorrect setup;
- unmet performance target;
- unresolved security hole;
- missing acceptance criterion.

Examples of merely desirable work:

- speculative abstraction;
- extra optional feature;
- aesthetic refactor;
- hypothetical scale optimization;
- support for an unrequested platform.

Do not block completion on merely desirable work.

---

# 38. Proof obligations

A non-trivial COMPLETE verdict must satisfy these proof obligations.

## PO-1 Goal coverage

Every explicit requirement has at least one supporting evidence item.

## PO-2 Behavior coverage

All important current behavior classes have evidence:
- success;
- boundary;
- expected failure.

## PO-3 Invariant coverage

Critical invariants are demonstrated or analyzed.

## PO-4 Integration coverage

Changed boundaries are verified together with their consumers/providers.

## PO-5 Risk closure

No BLOCKING defeater remains.

## PO-6 Regression coverage

Likely affected existing behavior remains correct.

## PO-7 Delivery coverage

The actual requested deliverable builds/runs/installs/opens as intended.

## PO-8 Context coverage

Evidence represents the declared runtime/use context sufficiently for the task's criticality.

If any applicable proof obligation fails, do not return COMPLETE.

---

# 39. Completion matrix

Use an internal matrix for non-trivial tasks:

| Gate | Status | Evidence | Defeaters | Notes |
|---|---|---|---|---|
| Scope | PASS/FAIL/N/A/UNKNOWN | artifact/test/spec | issue | reason |
| Functional | ... | ... | ... | ... |
| Correctness | ... | ... | ... | ... |
| Failure behavior | ... | ... | ... | ... |
| Compatibility | ... | ... | ... | ... |
| Performance | ... | ... | ... | ... |
| Reliability | ... | ... | ... | ... |
| Security | ... | ... | ... | ... |
| Usability | ... | ... | ... | ... |
| Maintainability | ... | ... | ... | ... |
| Data/migration | ... | ... | ... | ... |
| Operations | ... | ... | ... | ... |
| Documentation | ... | ... | ... | ... |
| Packaging | ... | ... | ... | ... |
| Regression | ... | ... | ... | ... |

Do not expose the full matrix unless useful, but use it to avoid omitted dimensions.

---

# 40. Stop conditions

Stop implementation when:

- all required claims pass;
- all blocking defeaters are resolved;
- no necessary work remains;
- further changes are only optional improvements.

Do not continue polishing indefinitely.

Completion is not maximum possible quality; it is closure of all applicable obligations.

---

# 41. Forbidden completion shortcuts

Never conclude COMPLETE solely because:

- compilation succeeds;
- lint succeeds;
- one test passes;
- existing tests pass;
- coverage is high;
- no TODO exists;
- code looks clean;
- the implementation matches a design pattern;
- the user did not mention edge cases;
- no exception occurred in one run;
- an AI review says it looks correct;
- changes are small;
- a previous version worked.

Each is evidence for only a subset of claims.

---

# 42. Handling unavailable verification

If an important test cannot run because of missing:

- credential;
- device;
- network;
- platform;
- dataset;
- external service;
- build tool;

then:

1. perform all feasible static/local verification;
2. state exactly what remains unverified;
3. assess whether the missing evidence is blocking;
4. do not label the corresponding gate PASS without evidence.

For low-risk tasks it may be acceptable to finish with an explicit verification limitation.

For critical behavior, UNKNOWN remains blocking.

---

# 43. Existing test suites are not automatically complete

Treat tests as evidence, not truth.

Inspect whether tests cover the current goal.

Tests may be:

- stale;
- incomplete;
- asserting old behavior;
- over-mocked;
- skipped;
- flaky;
- unable to detect the relevant failure.

When a requested behavior is absent from tests, add focused evidence where practical.

---

# 44. Agent self-review

Before final verdict, the agent MUST perform a second-pass review from an adversarial perspective:

1. Assume the implementation is incomplete.
2. Find the strongest reason that assumption could be true.
3. Inspect or test that reason.
4. Repeat for the highest-consequence remaining uncertainty.
5. Stop when no unresolved blocking defeater is found.

This reduces confirmation bias.

---

# 45. Recommended verdict format

For user-facing completion reports, prefer concise structure:

**Verdict:** COMPLETE / NOT COMPLETE / COMPLETE WITH LIMITATIONS

**Scope:** what was evaluated.

**Evidence:** strongest verification performed.

**Remaining limitations:** only real limitations or residual risks.

**Blocking items:** if NOT COMPLETE, list exact blockers.

Do not claim certainty beyond the evidence.

---

# 46. Interaction with YAGNI

GOAL and YAGNI are complementary.

YAGNI asks:

> Is this additional work actually required now?

GOAL asks:

> Has every required thing been implemented and proven sufficiently?

Use both:

- GOAL prevents premature stopping;
- YAGNI prevents endless unnecessary work.

The target is **complete without excess**.

---

# 47. Required agent behavior

When this skill is active, the agent MUST:

- define the completion claim before evaluating it;
- distinguish implementation from verification and validation;
- inspect all relevant quality dimensions;
- use PASS / FAIL / N/A / UNKNOWN rather than intuition;
- require evidence for critical claims;
- attempt to falsify the completion claim;
- track blockers and unknowns;
- avoid score averaging that hides a failed critical gate;
- re-run affected evidence after material code changes;
- evaluate the actual artifact/context requested;
- refuse to call a task complete while necessary work remains;
- stop when only optional improvements remain.

If the user asks whether a project is "100% done", this skill should produce an evidence-backed verdict, not a confidence-style guess.

---

# 48. Reference basis

This skill is an engineering synthesis, not a verbatim standard.

Its reasoning structure is inspired by:
- Goal Structuring Notation Community Standard, Version 3:
  https://scsc.uk/gsn-standard
- ISO/IEC 25010:2023 — SQuaRE product quality model:
  https://www.iso.org/standard/78176.html
- ISO/IEC 25019:2023 — SQuaRE quality-in-use model:
  https://www.iso.org/standard/78177.html

These sources support:
- structured claims backed by evidence;
- systematic coverage of software/product quality;
- using quality models to validate requirement comprehensiveness and define acceptance criteria.

The completion gates, proof obligations, defeater handling, and "perfect-for-scope" definition above are a practical agent-oriented synthesis for software engineering.

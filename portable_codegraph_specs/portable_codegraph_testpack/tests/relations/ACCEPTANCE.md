---
title: "relations Acceptance Criteria"
version: "0.2"
---

# relations — Acceptance & Autonomous Execution

## REL-001 — Direct call resolution

**Điều kiện nghiệm thu**

1. CALLS edge exists.
2. Target is correct `b`.
3. Confidence is HIGH.
4. No inverse/spurious duplicate edge.

**Agent tự thực hiện**

1. Fixture: Create `a.py` where `a()` directly calls `b()` in same file.
2. Fixture: Oracle contains exactly one relevant CALLS edge a->b.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## REL-002 — Cross-module import and call

**Điều kiện nghiệm thu**

1. Both edges resolve to correct target.
2. No edge points to similarly named local symbol.
3. Cross-file source locations are correct.

**Agent tự thực hiện**

1. Fixture: Create module `pkg/a.py` importing and calling `pkg/b.py::foo`.
2. Fixture: Oracle contains IMPORTS and CALLS edges.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## REL-003 — Aliased import resolution

**Điều kiện nghiệm thu**

1. CALLS resolves to `foo.run`.
2. Alias import relation is preserved.
3. No HIGH-confidence relation to unrelated local `bar`.

**Agent tự thực hiện**

1. Fixture: Create module `foo.py` with `run`; caller uses `import foo as bar; bar.run()`.
2. Fixture: Also create unrelated local identifier named `bar` to stress ambiguity.
3. Fixture: Oracle target is `foo.run`.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## REL-004 — Circular dependency

**Điều kiện nghiệm thu**

1. Both cycle edges exist.
2. Traversal terminates.
3. MCP response stays within budget.
4. No recursion crash or unbounded duplicate result.

**Agent tự thực hiện**

1. Fixture: Create A importing B and B importing A with one call in each direction.
2. Fixture: Oracle records cycle.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## REL-005 — Interface dispatch

**Điều kiện nghiệm thu**

1. Tool does not select one implementation as HIGH without evidence.
2. Candidates/ambiguity are surfaced.
3. Safety state requires source/config inspection when impact completeness matters.

**Agent tự thực hiện**

1. Fixture: Create interface/protocol with two valid implementations selected externally.
2. Fixture: Caller invokes through interface type.
3. Fixture: Oracle marks runtime target set ambiguous.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## REL-006 — Conditional call preservation

**Điều kiện nghiệm thu**

1. Conditional edge retains condition.
2. Projection/MCP does not render conditional call as unconditional.
3. Impact output exposes feature-dependent path.

**Agent tự thực hiện**

1. Fixture: Create feature-gated call `if feature_enabled: new_flow()` plus unconditional old flow.
2. Fixture: Oracle records condition string/source span.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

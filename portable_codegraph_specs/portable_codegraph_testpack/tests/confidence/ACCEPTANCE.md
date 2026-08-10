---
title: "confidence Acceptance Criteria"
version: "0.2"
---

# confidence — Acceptance & Autonomous Execution

## CONF-001 — High-confidence calibration

**Điều kiện nghiệm thu**

1. HIGH-confidence false-positive rate <= target.
2. All sampled HIGH edges match generator truth.
3. No hidden ambiguity.

**Agent tự thực hiện**

1. Fixture: Generate deterministic repository with at least 100 direct static calls whose ground truth is known from generator manifest.
2. Fixture: No dynamic constructs.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## CONF-002 — Low-confidence concentration

**Điều kiện nghiệm thu**

1. Most direct static edges are HIGH.
2. Dynamic/ambiguous edges are predominantly MEDIUM/LOW/UNKNOWN.
3. dynamic_high_confidence_rate meets target.

**Agent tự thực hiện**

1. Fixture: Generate mixed set: static direct calls, interface dispatch, DI, dynamic import, reflection.
2. Fixture: Generator writes truth labels before CodeGraph run.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## CONF-003 — Omission is not absence

**Điều kiện nghiệm thu**

1. Agent does not conclude helper absent from micro-map omission.
2. Agent queries MCP/source when completeness matters.
3. Header/instructions explicitly state omission is not absence.

**Agent tự thực hiện**

1. Fixture: Create repository where micro-map budget intentionally omits a valid low-priority helper.
2. Fixture: Ask existence question through autonomous agent benchmark.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## CONF-004 — Scoped completeness

**Điều kiện nghiệm thu**

1. MCP returns known static callers.
2. Dynamic area is disclosed.
3. Overall impact is IMPACT_INCOMPLETE.
4. No unqualified 'all callers' claim.

**Agent tự thực hiện**

1. Fixture: Create 3 static callers plus one plugin/runtime caller to same API.
2. Fixture: Oracle marks static caller set complete only within static scope.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## CONF-005 — Ambiguous candidate propagation

**Điều kiện nghiệm thu**

1. Ambiguity propagates through IR and MCP.
2. No candidate silently wins.
3. Safety state is not NAVIGATION_SAFE for complete-impact question.

**Agent tự thực hiện**

1. Fixture: Create two candidates equally compatible with unresolved call.
2. Fixture: Oracle declares AMBIGUOUS.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

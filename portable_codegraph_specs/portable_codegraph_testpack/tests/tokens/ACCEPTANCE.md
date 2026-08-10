---
title: "tokens Acceptance Criteria"
version: "0.2"
---

# tokens — Acceptance & Autonomous Execution

## TOK-001 — Tiny local fix net tokens

**Điều kiện nghiệm thu**

1. Both runs must be correct before token comparison counts.
2. Variant total input token cost <= 1.25x baseline target.
3. Any token saving claim excludes failed runs.

**Agent tự thực hiện**

1. Fixture: Create tiny one-file bug task with deterministic patch and test.
2. Fixture: Prepare agent baseline and variant prompts identically except CodeGraph integration.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## TOK-002 — Cross-module bug token saving

**Điều kiện nghiệm thu**

1. Variant correctness >= baseline.
2. Median net token saving >= target.
3. Variant does not modify more unnecessary files than baseline.

**Agent tự thực hiện**

1. Fixture: Create bug whose root cause requires traversing at least 5 modules; deterministic test verifies patch.
2. Fixture: Run multiple baseline/variant agent trials from clean state.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## TOK-003 — Architecture task token saving

**Điều kiện nghiệm thu**

1. Variant answer accuracy >= baseline.
2. Discovery token reduction meets target.
3. No missing critical service relation due to compression.

**Agent tự thực hiện**

1. Fixture: Create multi-service repository and architecture question with manually/generated truth map.
2. Fixture: Run baseline/variant agent answers scored against truth.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## TOK-004 — Duplicate source suppression

**Điều kiện nghiệm thu**

1. MCP does not return full function source by default before agent reads it.
2. Duplicate source-token estimate stays under threshold.
3. Source is read once at authoritative edit step.

**Agent tự thực hiện**

1. Fixture: Task requires editing one long function.
2. Fixture: Instrument MCP and file reads to hash returned source spans.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## TOK-005 — Instruction overhead

**Điều kiện nghiệm thu**

1. Instruction tokens <= target.
2. Full design docs are not injected.
3. Only minimal behavioral contract/tool schema is present.

**Agent tự thực hiện**

1. Fixture: Capture actual injected CodeGraph runtime instructions/tool schema text.
2. Fixture: Tokenize with agent/model tokenizer when available; otherwise use declared tokenizer fixture.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## TOK-006 — Subagent scoped context

**Điều kiện nghiệm thu**

1. Scoped subagents receive region-specific map when feature supported.
2. Correctness preserved.
3. Preload reduction meets target relative to giving each full map.

**Agent tự thực hiện**

1. Fixture: Create parent task naturally splittable into auth and frontend subagents.
2. Fixture: Integration must support scoped subagent context; otherwise SKIP with capability reason.
3. Fixture: Record preload tokens per subagent.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

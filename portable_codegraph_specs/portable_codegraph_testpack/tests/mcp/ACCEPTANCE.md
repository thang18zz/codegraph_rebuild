---
title: "mcp Acceptance Criteria"
version: "0.2"
---

# mcp — Acceptance & Autonomous Execution

## MCP-001 — Relevant region retrieval

**Điều kiện nghiệm thu**

1. Auth/token region ranks first.
2. Required flow entities are returned.
3. Irrelevant refresh symbols do not dominate top results.
4. Response remains under budget.

**Agent tự thực hiện**

1. Fixture: Create auth controller -> token service -> session repository -> validator flow plus unrelated `refresh` functions elsewhere.
2. Fixture: Oracle defines expected auth region and relevant entities.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MCP-002 — Precision under ambiguous keyword

**Điều kiện nghiệm thu**

1. Correct symbols dominate top-5.
2. precision@5 meets target.
3. Focus/graph proximity affects ranking correctly.

**Agent tự thực hiện**

1. Fixture: Create at least 5 modules each containing `refresh`, only one connected to known auth symbol.
2. Fixture: Query with focus/known symbol.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MCP-003 — Progressive response

**Điều kiện nghiệm thu**

1. Default response contains semantic facts and source locations.
2. Full source body token count is zero or only tiny unavoidable snippet.
3. Agent can identify exact file/line to read next.

**Agent tự thực hiện**

1. Fixture: Use multi-file flow where source bodies are much larger than signatures.
2. Fixture: Query for flow without explicit source request.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MCP-004 — Context delta response

**Điều kiện nghiệm thu**

1. Second response mostly contains delta.
2. Duplicate semantic context ratio <= target.
3. Correctness does not depend on context_id if omitted.

**Agent tự thực hiện**

1. Fixture: Perform first exploration returning context_id, then second focused query in same chain.
2. Fixture: Record normalized semantic units from both responses.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MCP-005 — Broad query protection

**Điều kiện nghiệm thu**

1. Response does not exceed budget materially.
2. Returns routing summary/top regions, not full graph.
3. No crash/time explosion.

**Agent tự thực hiện**

1. Fixture: Use large fixture; issue `show entire repository` with small explicit budget.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MCP-006 — Stale result warning

**Điều kiện nghiệm thu**

1. Response declares PARTIAL/STALE.
2. Last-known-good revision is identified.
3. SOURCE_INSPECTION_REQUIRED appears.
4. No stale result is presented as current truth.

**Agent tự thực hiện**

1. Fixture: Initialize valid auth file, then make it syntactically invalid and query related flow.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MCP-007 — Impact incomplete response

**Điều kiện nghiệm thu**

1. Known consumers returned.
2. Dynamic unresolved region returned.
3. Status IMPACT_INCOMPLETE.
4. No exact-complete claim.

**Agent tự thực hiện**

1. Fixture: Create public API with static consumer and plugin/dynamic consumer.
2. Fixture: Query impact.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

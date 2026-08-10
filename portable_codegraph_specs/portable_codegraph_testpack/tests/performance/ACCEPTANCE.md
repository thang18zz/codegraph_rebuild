---
title: "performance Acceptance Criteria"
version: "0.2"
---

# performance — Acceptance & Autonomous Execution

## PERF-001 — Cold index small repo

**Điều kiện nghiệm thu**

1. Record p50/p95 init time, peak RAM, graph DB size.
2. No crash.
3. All semantic correctness smoke checks pass before performance result accepted.

**Agent tự thực hiện**

1. Fixture: Generate deterministic ~100-file repo from fixture generator.
2. Fixture: Run cold init at least 5 times in clean temp copies.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## PERF-002 — Cold index large repo

**Điều kiện nghiệm thu**

1. Performance metrics recorded.
2. Semantic counts remain correct.
3. Growth does not exhibit unexplained pathological behavior relative to scaling baseline.
4. Configured budget honored if set.

**Agent tự thực hiện**

1. Fixture: Generate deterministic ~10k-file repo with known symbol/edge counts.
2. Fixture: Cold index repeated runs.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## PERF-003 — Single-file incremental latency

**Điều kiện nghiệm thu**

1. Median incremental cost is substantially lower than full index target.
2. Correct revision produced.
3. No stale result.

**Agent tự thực hiện**

1. Fixture: Use large fixture; record full init cost.
2. Fixture: Edit one leaf file; measure incremental update at least 20 times.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## PERF-004 — MCP query latency

**Điều kiện nghiệm thu**

1. Every query returns correct routing before latency is scored.
2. p95 meets configured budget.
3. No response exceeds token budget.

**Agent tự thực hiện**

1. Fixture: Prepare fixed query corpus across regions.
2. Fixture: Warm graph, run each query multiple times.
3. Fixture: Capture p50/p95/p99.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## PERF-005 — Memory under huge metadata graph

**Điều kiện nghiệm thu**

1. Peak RAM is within configured local-machine budget.
2. No OOM/crash.
3. Correctness sample passes.

**Agent tự thực hiện**

1. Fixture: Generate huge synthetic semantic/source fixture sized to stress graph.
2. Fixture: Measure process peak RSS while indexing/querying.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## PERF-006 — SQLite growth and checkpoint

**Điều kiện nghiệm thu**

1. No unbounded WAL growth after maintenance.
2. Database integrity check passes.
3. Published graph remains queryable.

**Agent tự thực hiện**

1. Fixture: Perform many incremental revisions with WAL enabled.
2. Fixture: Measure graph.db/WAL before, during and after maintenance/checkpoint.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

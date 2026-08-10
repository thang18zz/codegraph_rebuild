---
title: "sync Acceptance Criteria"
version: "0.2"
---

# sync — Acceptance & Autonomous Execution

## SYNC-001 — Single file edit

**Điều kiện nghiệm thu**

1. Revision becomes N+1 or valid later revision.
2. Changed semantic facts visible.
3. Unchanged unrelated regions retain identity.
4. No full rebuild required unless implementation chooses but metrics record it.

**Agent tự thực hiện**

1. Fixture: Initialize simple repo and capture revision N.
2. Fixture: Modify one function signature/body, then trigger sync/query.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## SYNC-002 — Rapid save burst

**Điều kiện nghiệm thu**

1. Only coherent final semantic state is published.
2. No half-state is queryable.
3. Event storm does not create one published revision per low-level event unless semantically necessary.

**Agent tự thực hiện**

1. Fixture: Script rapid sequence of atomic saves/renames for same files within debounce interval.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## SYNC-003 — File rename/move

**Điều kiện nghiệm thu**

1. Old active path disappears.
2. New path is queryable.
3. No stale duplicate active entity.
4. Stable history preserved when supported.

**Agent tự thực hiện**

1. Fixture: Initialize file, move/rename it, then run sync.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## SYNC-004 — Branch switch

**Điều kiện nghiệm thu**

1. Freshness barrier sees B before serving graph result.
2. No A-only semantic fact is presented as current.
3. Graph revision/source fingerprint correspond to B.

**Agent tự thực hiện**

1. Fixture: Create Git repo with branch A/B having different architecture.
2. Fixture: Initialize on A, switch to B while MCP inactive or watcher unable to process individual events.
3. Fixture: Query immediately after startup.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## SYNC-005 — Watcher missed event

**Điều kiện nghiệm thu**

1. Freshness reconciliation detects change.
2. Result matches modified source.
3. stale_result_rate is zero.

**Agent tự thực hiện**

1. Fixture: Initialize graph, intentionally suppress watcher delivery, modify source, then issue MCP query.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## SYNC-006 — Concurrent revision change

**Điều kiện nghiệm thu**

1. First response is internally consistent with N.
2. Next response sees N+1.
3. No mixed edges/entities from N and N+1.

**Agent tự thực hiện**

1. Fixture: Start long query on revision N.
2. Fixture: During query mutate source and publish N+1.
3. Fixture: Capture revision metadata from response.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## SYNC-007 — Mass generated files

**Điều kiện nghiệm thu**

1. Mass-change path batches work.
2. No runaway revision storm.
3. Generated classification remains shallow.
4. Resource budget respected.

**Agent tự thực hiện**

1. Fixture: Generate thousands of GENERATED-classified files in one burst.
2. Fixture: Record CPU/time/revision count.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

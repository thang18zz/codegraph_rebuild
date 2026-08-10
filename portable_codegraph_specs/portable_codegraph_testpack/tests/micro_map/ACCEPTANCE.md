---
title: "micro_map Acceptance Criteria"
version: "0.2"
---

# micro_map — Acceptance & Autonomous Execution

## MAP-001 — Small repository routing quality

**Điều kiện nghiệm thu**

1. All critical entry points appear.
2. Main flow is directionally correct.
3. Map stays within configured token target.
4. Noise ratio stays below threshold.

**Agent tự thực hiện**

1. Fixture: Generate ~20-file app with web entry point, service, repository, tests and clear main flow.
2. Fixture: Truth manifest ranks required routing entities.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MAP-002 — Medium repository abstraction

**Điều kiện nghiệm thu**

1. Map abstracts at module/service level.
2. Hard cap is respected.
3. Key services route correctly.
4. Leaf helper omission is not represented as nonexistence.

**Agent tự thực hiện**

1. Fixture: Generate ~2k-file repository with 10 services and many low-value leaf helpers.
2. Fixture: Truth manifest names services and key entry points.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MAP-003 — Huge repository hard budget

**Điều kiện nghiệm thu**

1. Map never exceeds cap.
2. Generation completes without linear context growth.
3. Top-level domains remain represented.
4. Full graph remains queryable independently.

**Agent tự thực hiện**

1. Fixture: Generate synthetic metadata/source tree representing >=100k files, mostly low-value leaves/generated files.
2. Fixture: Set explicit hard token cap in config.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MAP-004 — Critical entry point retention

**Điều kiện nghiệm thu**

1. Critical entry recall meets target.
2. At least one routing path from each entry point to owner region is present.
3. Compression does not discard all non-HTTP entry types.

**Agent tự thực hiện**

1. Fixture: Create repository with HTTP route, CLI command, event consumer and scheduled job.
2. Fixture: Oracle marks all as critical entry points.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MAP-005 — Generated/vendor noise suppression

**Điều kiện nghiệm thu**

1. Map content is dominated by first-party architecture.
2. Generated/vendor details stay shallow.
3. Irrelevant content ratio meets target.

**Agent tự thực hiện**

1. Fixture: Generate repo with 90% generated/vendor files and 10% first-party business modules.
2. Fixture: Oracle ranks first-party modules as routing-critical.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## MAP-006 — Micro-map misleading absence guard

**Điều kiện nghiệm thu**

1. Agent uses MCP/source.
2. Final answer matches repository truth.
3. No omission-as-absence inference.

**Agent tự thực hiện**

1. Fixture: Create helper omitted from map due to budget but available in graph.
2. Fixture: Ask agent 'does helper X exist?' without naming file.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

---
title: "robustness Acceptance Criteria"
version: "0.2"
---

# robustness — Acceptance & Autonomous Execution

## ROB-001 — Symlink loop

**Điều kiện nghiệm thu**

1. Scanner terminates.
2. Valid source still indexes.
3. Loop is skipped/reported.
4. No unbounded CPU/memory recursion.

**Agent tự thực hiện**

1. Fixture: Create temp directory with symlink cycle where OS permits.
2. Fixture: Ensure fixture root contains one valid source file outside loop.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## ROB-002 — Nested Git repository

**Điều kiện nghiệm thu**

1. Scanner does not silently cross configured project boundary.
2. External region is explicit or separately handled.
3. No symbol collision caused by accidental nested scan.

**Agent tự thực hiện**

1. Fixture: Create parent Git repo containing nested Git repo or submodule fixture.
2. Fixture: Place similarly named symbols on both sides of boundary.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## ROB-003 — Very large minified file

**Điều kiện nghiệm thu**

1. Tool classifies/shallow-indexes/skips according to policy.
2. Resource usage remains bounded.
3. Handwritten source still routes correctly.

**Agent tự thực hiện**

1. Fixture: Generate multi-MB minified JS file under generated/vendor-like path plus normal handwritten JS.
2. Fixture: Do not execute file.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## ROB-004 — Corrupted graph.db

**Điều kiện nghiệm thu**

1. Corruption detected.
2. MCP does not serve silently incorrect graph.
3. Source untouched.
4. Rebuild recovery path is reported/works.

**Agent tự thực hiện**

1. Fixture: Initialize graph, then deliberately corrupt a copy of `.codegraph/graph.db` bytes in temp fixture.
2. Fixture: Run `doctor` and MCP.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## ROB-005 — Disk full during publish

**Điều kiện nghiệm thu**

1. Failed N+1 publish rolls back.
2. Revision N remains usable.
3. Source bytes unchanged.
4. No truncated live `codegraph.py` or DB state.

**Agent tự thực hiện**

1. Fixture: Run in disposable filesystem with quota/fault injection to fail during graph publish.
2. Fixture: Keep prior valid revision N.
3. Fixture: Trigger sync.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## ROB-006 — Path case collision

**Điều kiện nghiệm thu**

1. No silent merge where distinct paths are legal.
2. Unsupported platform case is SKIP, not false PASS.
3. Diagnostics explain collision risk.

**Agent tự thực hiện**

1. Fixture: On suitable platform create files/symbols differing only by case; on incompatible platform use virtual fixture and mark platform limitation.
2. Fixture: Oracle keeps them distinct where filesystem permits.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

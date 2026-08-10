---
title: "entities Acceptance Criteria"
version: "0.2"
---

# entities — Acceptance & Autonomous Execution

## ENTITY-001 — Function and method extraction

**Điều kiện nghiệm thu**

1. Entity precision and recall satisfy threshold.
2. Each semantic declaration appears once.
3. Nested/scoped names are distinguishable.
4. No comment/string produces an entity.

**Agent tự thực hiện**

1. Fixture: Create file with top-level functions, nested function, class methods, staticmethod/classmethod, and duplicate short names in different scopes.
2. Fixture: Oracle lists exact entity set and qualified names.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## ENTITY-002 — Qualified name disambiguation

**Điều kiện nghiệm thu**

1. No stable-ID collision.
2. No silent resolution from one service to the other.
3. MCP ambiguous short-name query returns both candidates or requires focus.
4. ambiguous_silent_resolution_rate is zero.

**Agent tự thực hiện**

1. Fixture: Create `service_a/user.py` and `service_b/user.py`, each defining `User` and `create()`.
2. Fixture: Oracle explicitly marks four distinct qualified symbols.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## ENTITY-003 — Stable ID under line movement

**Điều kiện nghiệm thu**

1. Stable ID unchanged.
2. SourceLocation line changes correctly.
3. No duplicate old entity remains active.
4. Revision increments exactly through valid publication.

**Agent tự thực hiện**

1. Fixture: Create target symbol, init and capture stable ID.
2. Fixture: Insert comments/blank lines above declaration without renaming/moving it.
3. Fixture: Sync and recapture entity.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## ENTITY-004 — Rename and move tracking

**Điều kiện nghiệm thu**

1. No wrong merge with unrelated entity.
2. Old active path is removed.
3. New entity is queryable.
4. If rename tracking exists, alias is correct; otherwise safe delete+add is accepted.

**Agent tự thực hiện**

1. Fixture: Create entity in `old/module.py`, initialize.
2. Fixture: Move to `new/module.py` and rename symbol once.
3. Fixture: Sync; capture alias/history behavior.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## ENTITY-005 — Generated vs first-party classification

**Điều kiện nghiệm thu**

1. Handwritten files classify FIRST_PARTY.
2. Generated client classifies GENERATED.
3. Generated entity depth is shallower than first-party according to policy.
4. Generated symbols do not dominate micro-map budget.

**Agent tự thực hiện**

1. Fixture: Create small handwritten service plus large generated client marked by generated-file conventions/header/path.
2. Fixture: Create expected classification manifest independently.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

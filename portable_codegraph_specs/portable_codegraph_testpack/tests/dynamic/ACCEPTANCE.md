---
title: "dynamic Acceptance Criteria"
version: "0.2"
---

# dynamic — Acceptance & Autonomous Execution

## DYN-001 — Python monkey patch

**Điều kiện nghiệm thu**

1. Static direct definitions may be indexed, but patched runtime target is not falsely HIGH-complete.
2. Risk flag DYNAMIC_DISPATCH or equivalent appears.
3. Impact completeness is not claimed.

**Agent tự thực hiện**

1. Fixture: Create Python module defining `target`, then another module reassigning/monkey-patching it at runtime.
2. Fixture: Oracle marks runtime dispatch unresolved.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## DYN-002 — Dependency injection implementation

**Điều kiện nghiệm thu**

1. No arbitrary provider gets HIGH certainty.
2. Dependency injection risk is surfaced.
3. High-impact query returns SOURCE_INSPECTION_REQUIRED/IMPACT_INCOMPLETE.

**Agent tự thực hiện**

1. Fixture: Create interface with ProviderA/ProviderB and config-driven dependency injection selection.
2. Fixture: Do not make provider choice statically constant.
3. Fixture: Oracle marks candidates and config dependency.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## DYN-003 — Dynamic import

**Điều kiện nghiệm thu**

1. Relation is LOW/UNKNOWN.
2. Computed import is not invented as exact target.
3. Unresolved target is retained in diagnostics.

**Agent tự thực hiện**

1. Fixture: Create dynamic import from computed string/user config.
2. Fixture: Oracle target is intentionally unresolved.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## DYN-004 — Plugin registry

**Điều kiện nghiệm thu**

1. Static plugin can resolve.
2. Runtime registry is flagged.
3. Caller/impact query never claims only static plugin exists.

**Agent tự thực hiện**

1. Fixture: Create plugin registry populated from string keys/config plus one statically visible plugin.
2. Fixture: Oracle marks static plugin known and runtime plugin set incomplete.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## DYN-005 — Reflection

**Điều kiện nghiệm thu**

1. REFLECTION risk flag appears.
2. No fake exact target with HIGH confidence.
3. Completeness stays incomplete.

**Agent tự thực hiện**

1. Fixture: Create reflection-based class/method lookup by string.
2. Fixture: Oracle marks reflection path unresolved.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## DYN-006 — Feature flag runtime path

**Điều kiện nghiệm thu**

1. Both known paths remain distinguishable.
2. Condition not erased.
3. No universal-flow claim unless flag value is statically known.

**Agent tự thực hiện**

1. Fixture: Create old/new implementation selected by runtime feature flag.
2. Fixture: Oracle records two conditional alternatives.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

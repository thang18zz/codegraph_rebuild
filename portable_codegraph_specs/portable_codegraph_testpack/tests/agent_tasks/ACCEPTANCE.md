---
title: "agent_tasks Acceptance Criteria"
version: "0.2"
---

# agent_tasks — Acceptance & Autonomous Execution

## AGENT-001 — Local bug fix

**Điều kiện nghiệm thu**

1. Variant patch passes target test.
2. No unrelated tests regress.
3. Variant success rate >= baseline over repeated runs.
4. No unnecessary file modifications.

**Agent tự thực hiện**

1. Fixture: Create one-module bug plus deterministic unit test that initially fails and passes only for intended behavior.
2. Fixture: Provide task prompt, baseline branch and variant branch from identical commit.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## AGENT-002 — Cross-module bug fix

**Điều kiện nghiệm thu**

1. Variant finds root-cause region.
2. All tests pass.
3. Success >= baseline.
4. Discovery/search calls are reduced or not materially worse.

**Agent tự thực hiện**

1. Fixture: Create bug with symptom in API layer and root cause in repository/service layer.
2. Fixture: Tests encode expected cross-module behavior.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## AGENT-003 — Add API endpoint

**Điều kiện nghiệm thu**

1. New endpoint passes tests.
2. Agent reuses existing architecture where appropriate.
3. No speculative framework/dependency introduced.
4. Unnecessary files modified == 0.

**Agent tự thực hiện**

1. Fixture: Create existing endpoint pattern and ask agent to add analogous endpoint.
2. Fixture: Tests and route manifest define expected behavior.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## AGENT-004 — Public method rename

**Điều kiện nghiệm thu**

1. Agent does not blindly mass-rename from incomplete graph.
2. Impact/source/tests inspected.
3. All supported callers updated correctly.
4. Dynamic uncertainty is acknowledged/handled.
5. Regression rate == 0.

**Agent tự thực hiện**

1. Fixture: Create public method with static callers and one dynamic/config consumer.
2. Fixture: Task asks rename.
3. Fixture: Tests cover static paths and config fixture identifies dynamic path.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## AGENT-005 — Schema usage update

**Điều kiện nghiệm thu**

1. Known consumers updated.
2. Conditional/unresolved consumer is not silently ignored.
3. Tests pass.
4. Variant correctness >= baseline.

**Agent tự thực hiện**

1. Fixture: Create shared schema field used by service, serializer and tests plus one conditional consumer.
2. Fixture: Task asks schema change.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## AGENT-006 — Locate behavior owner

**Điều kiện nghiệm thu**

1. Final answer identifies authoritative file/symbol.
2. Variant search calls < baseline target.
3. No wrapper is mistaken for owner.

**Agent tự thực hiện**

1. Fixture: Create behavior with one authoritative owner and several callers/wrappers.
2. Fixture: Prompt asks where behavior is actually implemented.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

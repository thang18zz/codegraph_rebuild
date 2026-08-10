---
title: "portability Acceptance Criteria"
version: "0.2"
---

# portability — Acceptance & Autonomous Execution

## PORT-001 — Windows x64 zero-runtime

**Điều kiện nghiệm thu**

1. Direct-path `init`, `status`, and `mcp` startup work.
2. No missing runtime dependency.
3. No PATH/global installation required.

**Agent tự thực hiện**

1. Fixture: Provision clean Windows x64 VM/sandbox without Python, Node, Java and without CodeGraph installation.
2. Fixture: Copy only portable binary plus fixture.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## PORT-002 — Linux x64 zero-runtime

**Điều kiện nghiệm thu**

1. Core workflow works.
2. No project-language runtime required.
3. No network dependency during test.

**Agent tự thực hiện**

1. Fixture: Provision clean Linux x64 container/VM with only system essentials allowed by packaging contract.
2. Fixture: Copy portable binary.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## PORT-003 — macOS Apple Silicon zero-runtime

**Điều kiện nghiệm thu**

1. Binary launches natively.
2. init/status/MCP work offline.
3. No external language runtime is required.

**Agent tự thực hiện**

1. Fixture: Provision macOS Apple Silicon runner/VM, copy native binary and fixture.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## PORT-004 — Offline operation

**Điều kiện nghiệm thu**

1. All core operations work.
2. No hidden network request is required for correctness.
3. Network failure does not degrade into unsafe partial result without warning.

**Agent tự thực hiện**

1. Fixture: Block outbound network at OS/container layer.
2. Fixture: Use already acquired binary and local fixture.
3. Fixture: Run init, sync and MCP queries.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

## PORT-005 — Executable moved to new path

**Điều kiện nghiệm thu**

1. Core CLI remains location-independent.
2. No registry/PATH/global install assumption.
3. Only client integration absolute path needs update where applicable.

**Agent tự thực hiện**

1. Fixture: Run binary from path A, then move/copy to unrelated path/drive B.
2. Fixture: Run same project workflow by direct absolute path.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

---
title: "Autonomous Test Execution Protocol"
version: "0.2"
status: "normative"
---

# Autonomous Test Execution Protocol

Tài liệu này là contract để AI agent có thể tự chạy toàn bộ test suite mà không cần con người chuẩn bị fixture, oracle hay đánh giá thủ công.

## 1. Nguyên tắc bắt buộc

Agent phải:

1. Chạy mọi mutation trong temp directory/disposable worktree.
2. Không dùng repository thật của người dùng cho robustness/destructive testcase.
3. Tạo fixture từ `autonomous_execution.fixture_recipe`.
4. Tạo ground truth **trước** khi chạy CodeGraph.
5. Ground truth không được lấy từ output của CodeGraph.
6. Hash source tree trước và sau test.
7. Capture đầy đủ command/output/revision/metrics.
8. Đánh giá tất cả acceptance criteria.
9. PASS chỉ khi **mọi điều kiện bắt buộc** đạt.
10. Nếu không có platform/capability bắt buộc thì SKIP với lý do rõ; không được giả PASS.

## 2. Workspace chuẩn

Mỗi testcase dùng:

```text
.test-runs/
└── <run-id>/
    └── <test-id>/
        ├── fixture/
        │   ├── source...
        │   └── expected/
        │       ├── entities.json
        │       ├── relations.json
        │       ├── regions.json
        │       ├── retrieval.json
        │       └── safety.json
        ├── artifacts/
        │   ├── stdout.log
        │   ├── stderr.log
        │   ├── status.json
        │   ├── mcp.jsonl
        │   ├── codegraph.py
        │   ├── metrics.json
        │   └── source_hashes.json
        └── result.yaml
```

## 3. Oracle creation

Oracle phải được sinh từ chính fixture recipe hoặc fixture generator declaration.

Ví dụ generator tạo:

```text
A calls B
B calls C
```

thì generator đồng thời ghi:

```json
{
  "relations": [
    ["A", "CALLS", "B"],
    ["B", "CALLS", "C"]
  ]
}
```

Oracle được freeze trước khi CodeGraph chạy.

CodeGraph output tuyệt đối không được dùng để bổ sung expected result.

## 4. Source integrity

Trước test:

```text
source_hash_before
```

Sau test:

```text
source_hash_after
```

Đối với testcase không chủ động mutate source:

```text
before == after
```

Đối với testcase có mutation:

- chỉ những mutation được testcase mô tả mới được phép khác;
- indexing/MCP không được gây thay đổi bổ sung.

## 5. CLI invocation

Runner phải nhận đường dẫn binary qua cấu hình:

```text
CODEGRAPH_BIN=/absolute/path/codegraph[.exe]
```

Không yêu cầu PATH hoặc global install.

Ví dụ:

```text
"$CODEGRAPH_BIN" init
"$CODEGRAPH_BIN" status
"$CODEGRAPH_BIN" sync
"$CODEGRAPH_BIN" doctor
"$CODEGRAPH_BIN" mcp
```

## 6. MCP

MCP được spawn bằng stdio.

Runner phải capture:

- request.
- response.
- context_id.
- graph revision.
- graph status.
- safety state.
- token/byte estimate.
- latency.

## 7. Test result

`result.yaml`:

```yaml
test_id: SAFE-001
status: PASS
duration_ms: 1234

criteria:
  - name: impact_incomplete
    pass: true
    evidence: artifacts/mcp.jsonl

metrics:
  unsafe_complete_claim_rate: 0

hard_failures: []

artifacts:
  - artifacts/status.json
  - artifacts/mcp.jsonl
```

## 8. PASS/FAIL/SKIP

### PASS

Tất cả:

```text
acceptance.criteria
metric targets
source integrity
hard-fail rules
```

đều đạt.

### FAIL

Chỉ cần một mandatory acceptance criterion không đạt.

Các lỗi S0 phải được highlight riêng.

### SKIP

Chỉ dùng khi:

- OS/architecture không khả dụng.
- Integration capability thực sự không tồn tại.
- Test yêu cầu filesystem feature mà runner platform không hỗ trợ.

SKIP phải ghi lý do.

Không dùng SKIP cho parser crash, wrong output hay thiếu implementation.

## 9. Agent benchmark isolation

Baseline và CodeGraph variant:

```text
same source commit
same task prompt
same model
same model settings
same tool permissions
fresh context
```

Chạy trên hai fixture copy độc lập.

Không cho variant nhìn baseline answer và ngược lại.

## 10. Agent benchmark scoring

Correctness được xác định bằng deterministic oracle khi có thể:

```text
unit tests
integration tests
expected files
expected API surface
AST/semantic diff constraints
```

Nếu task là câu hỏi kiến trúc, dùng truth manifest với required facts.

Không dùng subjective human rating làm điều kiện nghiệm thu cốt lõi.

## 11. Token measurement

Đo:

```text
micro-map tokens
runtime instruction tokens
MCP request/response tokens
source-read tokens
duplicate source/context tokens
total task input/output tokens
```

Nếu tokenizer của model có sẵn, dùng tokenizer thật.

Nếu không, ghi rõ tokenizer thay thế và dùng cùng một tokenizer cho baseline/variant.

## 12. High-impact safety

Đối với S0/high-impact tests:

Agent phải kiểm tra trước khi edit:

```text
graph status
revision
confidence
unresolved relations
impact completeness
source
tests/config
```

Nếu tool báo:

```text
STALE
PARTIAL
LOW
UNKNOWN
IMPACT_INCOMPLETE
```

thì agent không được coi graph là complete edit scope.

## 13. Test ordering

Khuyến nghị:

```text
L0 unit
→ L1 integration
→ L2 repository scenarios
→ L4 safety/robustness
→ L3 agent benchmarks
→ performance/portability
```

Không chạy agent benchmark nếu core semantic correctness đang fail nghiêm trọng.

## 14. Suite acceptance

Không chỉ tính "% testcase pass".

Release candidate phải:

- 100% S0 mandatory tests PASS hoặc approved SKIP chỉ vì platform unavailable.
- Không có source-corruption issue.
- Không có unsafe completeness claim đã biết.
- Không có silent ambiguity resolution S0.
- Agent correctness không thấp hơn baseline trên acceptance benchmark.
- Token saving chỉ được quảng bá trên nhóm task có correctness đạt.

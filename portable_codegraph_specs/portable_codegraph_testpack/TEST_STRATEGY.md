---
title: "Portable CodeGraph Test Strategy"
version: "0.1"
---

# Test Strategy

## 1. Test layers

### L0 — Unit
Kiểm tra parser, classifier, stable ID, relation extraction, confidence, hash, token estimator.

### L1 — Integration
Kiểm tra full pipeline:
`source -> parse -> IR -> SQLite -> codegraph.py -> MCP`.

### L2 — Repository Scenario
Kiểm tra trên repository fixture đa file, đa module, đa ngôn ngữ.

### L3 — Agent Benchmark
Cùng một agent, cùng task:
- Baseline: không CodeGraph.
- Variant: có CodeGraph.

### L4 — Safety / Adversarial
Cố tình tạo stale graph, thiếu caller, ambiguous symbol, dynamic dispatch, generated code, branch switch, corrupted DB.

## 2. Golden truth

Mỗi fixture phải có ground truth độc lập:
- entities_expected.json
- relations_expected.json
- regions_expected.json
- expected_retrieval.json
- expected_safety.json

Không dùng chính output của CodeGraph để tạo expected result.

## 3. Pass priority

Thứ tự ưu tiên:

1. Không làm sai source.
2. Semantic correctness.
3. Safe uncertainty.
4. Agent task success.
5. Token efficiency.
6. Latency/resource efficiency.

## 4. Severity

- `S0`: có thể dẫn đến destructive edit / false complete impact.
- `S1`: semantic sai quan trọng, agent dễ chọn sai vùng.
- `S2`: retrieval/token/performance degradation.
- `S3`: cosmetic/diagnostic issue.

## 5. Benchmark methodology

Mỗi end-to-end task nên chạy nhiều lần vì agent có variance.

Khuyến nghị:
- 5–10 runs/task/model khi có điều kiện.
- Cùng model/configuration.
- Cùng repository revision.
- Cùng prompt.
- Reset conversation/context giữa baseline và variant.
- Ghi tool calls, source reads, tokens và final patch.

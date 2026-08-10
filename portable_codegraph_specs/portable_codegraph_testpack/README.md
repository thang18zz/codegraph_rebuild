---
title: "Portable CodeGraph Test Pack"
version: "0.1"
status: "draft"
---

# Portable CodeGraph Test Pack

Bộ test này dùng để đánh giá Portable CodeGraph từ mức parser/unit test đến end-to-end agent benchmark.

## Mục tiêu đánh giá

1. Semantic Accuracy
2. Retrieval Accuracy
3. Agent Correctness
4. Net Token Saving
5. Safety / False Confidence
6. Sync & Freshness Reliability
7. Performance
8. Portability

## Cấu trúc

```text
tests/
├── parsing/
├── entities/
├── relations/
├── dynamic/
├── confidence/
├── micro_map/
├── mcp/
├── tokens/
├── agent_tasks/
├── sync/
├── safety/
├── performance/
├── portability/
└── robustness/
```

Mỗi testcase là YAML và có:
- ID
- mục tiêu
- fixture
- steps
- expected
- metrics
- severity
- tags

## Quy tắc quan trọng

- Correctness > token saving.
- Omission is not absence.
- Source is authoritative.
- LOW/UNKNOWN confidence phải làm agent thận trọng hơn, không tự tin hơn.
- Test token phải đo **total task token**, không chỉ kích thước `codegraph.py`.
- High-impact change phải test `IMPACT_INCOMPLETE`, `SOURCE_INSPECTION_REQUIRED`, stale/partial graph và revision changes.

## Autonomous acceptance

Bản v0.2 bổ sung:

- `AUTONOMOUS_EXECUTION.md`: protocol để agent tự chạy test.
- `ACCEPTANCE_CRITERIA.md`: đầy đủ điều kiện nghiệm thu của từng testcase.
- `AUTONOMOUS_TEST_CATALOG.json`: catalog machine-readable.
- `tests/<category>/ACCEPTANCE.md`: checklist theo category.
- Mỗi YAML testcase có `acceptance` và `autonomous_execution`.

Mọi testcase được thiết kế với `human_help_required: false`.

---
title: "Ground Truth Specification"
version: "0.1"
---

# Ground Truth

Mỗi fixture nên có:

```text
fixture/
├── source...
└── expected/
    ├── entities.json
    ├── relations.json
    ├── regions.json
    ├── retrieval.json
    └── safety.json
```

## `entities.json`

Danh sách semantic entities thật sự tồn tại.

## `relations.json`

Danh sách relation ground truth và condition/confidence expectation.

## `retrieval.json`

Với từng query:
- expected top region
- required entities
- acceptable optional entities
- forbidden irrelevant entities

## `safety.json`

Các trạng thái mong đợi:
- `NAVIGATION_SAFE`
- `SOURCE_INSPECTION_REQUIRED`
- `IMPACT_INCOMPLETE`
- `GRAPH_STALE`
- `GRAPH_PARTIAL`

Ground truth phải được viết tay hoặc sinh từ fixture generator độc lập, không copy từ CodeGraph output.

---
title: "Portable CodeGraph Quality Metrics"
version: "0.1"
---

# Metrics

## Semantic accuracy

```text
entity_precision
entity_recall
relation_precision
relation_recall
relation_f1
resolved_relation_rate
wrong_high_confidence_rate
```

Đặc biệt:

```text
wrong_high_confidence_rate
```

phải được xem là metric safety quan trọng.

## Retrieval

```text
precision_at_k
recall_at_k
wrong_region_rate
relevant_token_ratio
MCP_response_tokens
context_expansion_depth
```

## Token economy

```text
T_without =
baseline discovery tokens
+ baseline source tokens
+ baseline repeated context

T_with =
micro_map tokens
+ MCP tokens
+ agent instruction tokens
+ source tokens
+ duplicated context
```

```text
net_token_saving = T_without - T_with
net_token_saving_pct = net_token_saving / T_without
```

## Agent effectiveness

```text
task_success_rate
tests_pass_rate
time_to_first_correct_edit
files_read_before_edit
files_modified
unnecessary_files_modified
search_calls
MCP_calls
```

## Safety

```text
unsafe_complete_claim_rate
catastrophic_false_confidence_rate
stale_result_rate
ambiguous_silent_resolution_rate
high_impact_edit_without_source_rate
omission_as_absence_rate
```

Target lý tưởng cho nhóm catastrophic:
`≈ 0`.

## Sync

```text
missed_change_rate
freshness_check_latency
single_file_sync_latency
mass_change_sync_latency
partial_state_exposure_rate
revision_consistency_rate
```

## Performance

```text
initial_index_p50/p95
incremental_sync_p50/p95
MCP_query_p50/p95/p99
peak_RAM
idle_RAM
CPU_time
graph_db_size
binary_size
```

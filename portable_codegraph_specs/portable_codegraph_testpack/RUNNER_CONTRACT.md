---
title: "Portable CodeGraph Test Runner Contract"
version: "0.1"
---

# Runner Contract

Một test runner sau này có thể đọc YAML theo contract này.

## Input

```text
tests/**/<TEST-ID>.yaml
```

## Required runner capabilities

```text
reset_fixture()
run_codegraph_init()
run_codegraph_status()
run_codegraph_mcp()
mutate_fixture()
capture_sqlite_snapshot()
capture_codegraph_py()
capture_process_metrics()
compare_ground_truth()
run_agent_baseline()
run_agent_variant()
```

## Standard result

```yaml
test_id: REL-001
status: PASS|FAIL|SKIP|ERROR
duration_ms: 0
metrics: {}
artifacts: []
failures: []
```

## Safety

Runner không được thực hiện testcase destructive trên repository thật của người dùng.

Mọi mutation testcase phải chạy trong:
- temp directory,
- disposable worktree,
- container/sandbox phù hợp,
hoặc fixture copy.

Không chạy destructive robustness test trên source repo của CodeGraph.

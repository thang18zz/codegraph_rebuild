---
title: "Portable CodeGraph Reading & Implementation Order"
version: "0.1"
status: "normative"
scope: "project-execution"
---

# Portable CodeGraph — Reading & Implementation Order

Tài liệu này quy định **thứ tự đọc các tài liệu `.md` và thứ tự triển khai dự án**.

Mục tiêu là để một AI coding agent hoặc developer mới có thể tiếp nhận repository mà không phải tự đoán:

- nên đọc file nào trước;
- file nào là nguồn yêu cầu cấp cao;
- file nào định nghĩa contract kỹ thuật;
- khi có xung đột thì ưu tiên tài liệu nào;
- nên triển khai module nào trước;
- khi nào bắt đầu chạy test.

---

# 1. Nguyên tắc sử dụng tài liệu

Không đọc tất cả tài liệu rồi bắt đầu code một cách tùy ý.

Thứ tự chuẩn:

```text
WHY
↓
SYSTEM
↓
DATA MODEL
↓
QUERY
↓
SYNC
↓
SAFETY
↓
AGENT BEHAVIOR
↓
TEST
↓
IMPLEMENT
```

Tương ứng:

```text
PROJECT_DESCRIPTION.md
        ↓
ARCHITECTURE.md
        ↓
SEMANTIC_IR.md
        ↓
MCP_SPEC.md
        ↓
SYNC_SPEC.md
        ↓
SAFETY_SPEC.md
        ↓
AGENT_BEHAVIOR.md
        ↓
Test Pack
        ↓
Implementation
```

---

# 2. Thứ tự đọc bắt buộc

## Step 1 — `PROJECT_DESCRIPTION.md`

Đọc đầu tiên.

Mục tiêu:

- hiểu Portable CodeGraph là gì;
- hiểu vấn đề sản phẩm đang giải quyết;
- hiểu portable-only;
- hiểu local/offline/zero API cost;
- hiểu triết lý token;
- hiểu vai trò của `codegraph.py`;
- hiểu MCP chỉ là truy vấn sâu;
- hiểu source code vẫn là authority cuối cùng.

Sau khi đọc file này, agent phải hiểu được câu:

> Portable CodeGraph là một portable local semantic compiler và context router cho AI coding agents.

Không bắt đầu implement nếu chưa hiểu mục tiêu này.

---

# 3. Step 2 — `ARCHITECTURE.md`

Đọc sau `PROJECT_DESCRIPTION.md`.

File này định nghĩa **toàn bộ hệ thống được chia thành những thành phần nào**.

Cần hiểu:

```text
Portable executable
Semantic Engine
Canonical IR
GraphStore
SQLite
Context Compiler
Project Profiler
Health Engine
MCP
Sync Engine
```

Đặc biệt phải nắm:

```text
SOURCE
  ↓
Semantic Engine
  ↓
Canonical IR
  ├── codegraph.py
  └── GraphStore / MCP
```

Không được xây hai indexing pipeline riêng.

Sau file này, agent phải biết:

- module boundaries;
- dependency direction;
- V1 scope;
- phần nào không được xây trong V1;
- portable packaging constraints;
- token economy constraints.

---

# 4. Step 3 — `SEMANTIC_IR.md`

Đây là tài liệu cần đọc **trước khi viết parser, database schema hoặc MCP**.

Canonical Semantic IR là contract trung tâm của hệ thống.

Cần hiểu đầy đủ:

```text
Entity
Relation
Region
Input
Output
Condition
Effect
SourceLocation
Confidence
Classification
Revision
Risk flags
Completeness
```

Agent phải đặc biệt hiểu:

```text
Entity != function only
```

IR phải hỗ trợ nhiều ecosystem.

Cũng phải hiểu:

```text
stable_id != line number
```

và:

```text
HIGH confidence != proven runtime truth
```

Không triển khai database schema trước khi IR contract ổn định.

---

# 5. Step 4 — `MCP_SPEC.md`

Đọc sau khi đã hiểu Semantic IR.

MCP chỉ là **consumer của Canonical IR / GraphStore**.

Không thiết kế MCP trước IR.

Cần nắm:

```text
semantic_explore
stdio
progressive context
hard response budget
context_id
delta response
no source dump by default
confidence-aware output
impact completeness
```

Nguyên tắc quan trọng:

> MCP phải trả minimum sufficient context.

Và:

```text
not returned
!=
does not exist
```

Không được để budget/compression biến thành false absence.

---

# 6. Step 5 — `SYNC_SPEC.md`

Đọc sau MCP vì MCP phụ thuộc vào graph freshness.

Cần hiểu:

```text
init
incremental sync
watcher
freshness barrier
content hash
semantic hash
atomic revision
last-known-good
mass-change detection
revision validation
```

Nguyên tắc quan trọng:

```text
Watcher = latency optimization
Freshness barrier = correctness mechanism
```

Không được dựa hoàn toàn vào filesystem watcher.

---

# 7. Step 6 — `SAFETY_SPEC.md`

Đây là tài liệu bắt buộc trước khi hoàn thiện resolver hoặc impact analysis.

Cần hiểu:

```text
CODEGRAPH = NAVIGATION AUTHORITY
SOURCE = IMPLEMENTATION AUTHORITY
```

Và:

```text
OMISSION IS NOT ABSENCE
```

Các trạng thái phải được hiểu:

```text
SOURCE_INSPECTION_REQUIRED
IMPACT_INCOMPLETE
GRAPH_PARTIAL
GRAPH_STALE
```

Agent phải nắm các risk classes:

```text
dynamic dispatch
reflection
dependency injection
plugins
generated code
conditional behavior
cross-language boundary
stale graph
ambiguous symbol
parser/resolver bug
```

Mục tiêu không phải làm graph trông chắc chắn.

Mục tiêu là graph **biết khi nào nó không chắc chắn**.

---

# 8. Step 7 — `AGENT_BEHAVIOR.md`

Chỉ đọc sau khi đã hiểu kiến trúc và safety.

File này không định nghĩa Semantic Engine.

Nó định nghĩa **cách coding agent sử dụng CodeGraph**.

Agent runtime phải hiểu:

```text
read micro-map first
↓
identify smallest region
↓
MCP only if needed
↓
read authoritative source
↓
smallest correct patch
```

Cần tuân:

```text
Semantic YAGNI
Coding YAGNI
Source authority
Confidence handling
Destructive-change safety
```

Không inject toàn bộ tài liệu này vào runtime prompt.

Runtime instructions phải dùng compact canonical form được định nghĩa trong file.

---

# 9. Sau 7 tài liệu core mới đọc Test Pack

Test Pack nằm ngoài core spec nhưng là contract nghiệm thu.

Thứ tự:

```text
portable_codegraph_testpack/
```

## 9.1 `README.md`

Đọc trước để hiểu cấu trúc test suite.

---

## 9.2 `TEST_STRATEGY.md`

Hiểu các lớp test:

```text
L0 Unit
L1 Integration
L2 Repository Scenario
L3 Agent Benchmark
L4 Safety / Adversarial
```

---

## 9.3 `METRICS.md`

Đọc trước khi implement benchmark instrumentation.

Phải hiểu các KPI:

```text
Semantic Accuracy
Retrieval Accuracy
Agent Correctness
Net Token Saving
Safety
Sync Reliability
Performance
Portability
```

Quan trọng:

```text
Correctness > Token Saving
```

---

## 9.4 `GROUND_TRUTH_SPEC.md`

Đọc trước khi viết fixture generator hoặc test runner.

Quy tắc:

```text
CodeGraph output
MUST NOT
be used as CodeGraph ground truth
```

Oracle phải được tạo độc lập.

---

## 9.5 `AUTONOMOUS_EXECUTION.md`

Đọc trước khi cho AI agent tự chạy test.

File này quy định:

```text
fixture creation
oracle creation
source hashing
test isolation
artifact capture
PASS/FAIL/SKIP
agent benchmark isolation
```

---

## 9.6 `ACCEPTANCE_CRITERIA.md`

Đây là danh sách nghiệm thu đầy đủ của 85 testcase.

Không cần đọc thuộc toàn bộ trước khi coding V1.

Nhưng phải đọc:

- testcase liên quan đến module đang implement;
- toàn bộ S0 trước release candidate.

---

## 9.7 `AUTONOMOUS_TEST_CATALOG.json`

Không dành cho developer đọc thủ công.

Dành cho:

```text
test runner
AI testing agent
automation
```

---

# 10. Thứ tự triển khai V1

Sau khi đọc tài liệu, implement theo dependency order.

## Phase 1 — Portable core skeleton

Implement:

```text
CLI
project root detection
project-local .codegraph/
config/state
portable executable structure
```

Commands tối thiểu có thể stub:

```text
init
status
mcp
sync
rebuild
doctor
```

Chưa cần đầy đủ behavior.

---

# 11. Phase 2 — Parser & Language Plugin Foundation

Implement:

```text
file detection
file classification
Tree-sitter integration
LanguagePlugin interface
Python plugin first
```

Sau khi Python ổn:

```text
JavaScript
TypeScript
Java
Go
```

Không thêm quá nhiều languages trước khi IR và tests ổn định.

---

# 12. Phase 3 — Canonical Semantic IR

Implement:

```text
Entity
Relation
Region
SourceLocation
Input
Output
Condition
Effect
Confidence
Risk flags
Classification
Revision
```

Ưu tiên deterministic data model.

Không implement LLM summary.

Không implement embeddings.

---

# 13. Phase 4 — Resolver

Implement:

```text
imports
qualified symbols
direct calls
inheritance
interfaces
conditions
basic effects
```

Sau đó mới:

```text
ambiguity
dynamic-risk classification
LOW/UNKNOWN confidence
```

Không cố giải quyết toàn bộ runtime magic trong V1.

---

# 14. Phase 5 — GraphStore

Implement abstraction trước:

```text
GraphStore
```

Sau đó:

```text
SQLiteGraphStore
```

Schema tối thiểu:

```text
files
entities
relations
regions
aliases
revisions
health
```

Thêm FTS5 sau khi basic persistence hoạt động đúng.

Không shard.

---

# 15. Phase 6 — Health & Safety Metadata

Implement:

```text
parse coverage
resolved relation rate
LOW/UNKNOWN counts
stale files
partial parse
ambiguity
risk flags
impact completeness
```

Safety metadata phải tồn tại **trước khi MCP được coi là production-ready**.

---

# 16. Phase 7 — Context Compiler

Sinh:

```text
codegraph.py
```

Bắt đầu với micro-map.

Không tạo full semantic dump.

Target ban đầu để benchmark:

```text
~600–1500 tokens
```

Nhưng token cap phải configurable.

Compression ưu tiên:

```text
architecture
entry points
main flows
routing regions
confidence warnings
```

Không ưu tiên leaf implementation.

---

# 17. Phase 8 — MCP

Implement:

```text
codegraph mcp
semantic_explore
stdio
```

Thứ tự retrieval:

```text
region
↓
entity
↓
relation
↓
condition/effect
↓
source location
```

Không trả full source mặc định.

Sau đó implement:

```text
context_id
delta responses
hard response budget
safety states
```

---

# 18. Phase 9 — Sync

Implement:

```text
initial full scan
incremental sync
hashing
semantic hash
watcher
freshness barrier
atomic revisions
last-known-good
mass change
```

Không xem watcher là correctness mechanism.

---

# 19. Phase 10 — Project Profiler

Implement:

```text
files
entities
relations
languages
graph size
estimated map tokens
query latency
sync latency
coverage
unresolved rate
```

V1 mode:

```text
COMPACT
HYBRID
```

Không implement QUERY_FIRST/MASSIVE optimization nếu benchmark chưa yêu cầu.

---

# 20. Phase 11 — Agent Integration

Implement tối thiểu:

```text
codegraph instructions
codegraph integrate <client>
```

Adapter chỉ làm:

```text
MCP registration
runtime instruction installation
codegraph.py discovery
```

Không đưa agent-specific logic vào Semantic Engine.

---

# 21. Phase 12 — Test Runner

Sau khi core pipeline hoạt động:

```text
source
→ IR
→ GraphStore
→ micro-map
→ MCP
→ sync
```

mới implement automated runner.

Runner đọc:

```text
AUTONOMOUS_TEST_CATALOG.json
```

và sinh:

```text
result.yaml
TEST_REPORT.md
TEST_REPORT.json
```

---

# 22. Test order trong quá trình phát triển

Không chạy 85 testcase ngẫu nhiên.

Thứ tự:

```text
parsing
↓
entities
↓
relations
↓
dynamic/confidence
↓
micro_map
↓
MCP
↓
sync
↓
safety
↓
robustness
↓
tokens
↓
agent_tasks
↓
performance
↓
portability
```

---

# 23. Release gate

Không release chỉ vì phần lớn testcase PASS.

Release candidate cần:

```text
All mandatory S0 tests PASS
```

Ngoại lệ duy nhất:

```text
platform unavailable
```

và phải là SKIP có lý do rõ ràng.

Ngoài ra:

```text
source corruption = 0
unsafe completeness claim = 0
silent ambiguity resolution = 0
known stale result served as fresh = 0
```

Agent benchmark phải đạt:

```text
correctness_with_CodeGraph
>=
baseline_correctness
```

Chỉ sau đó mới xét token saving.

---

# 24. Khi có xung đột giữa các tài liệu

Ưu tiên theo thứ tự:

```text
1. SAFETY_SPEC.md
2. SEMANTIC_IR.md
3. ARCHITECTURE.md
4. MCP_SPEC.md / SYNC_SPEC.md
5. AGENT_BEHAVIOR.md
6. PROJECT_DESCRIPTION.md
7. Test documentation
```

Nhưng test acceptance có thể phát hiện spec conflict.

Nếu acceptance test hợp lý nhưng contradict core spec:

```text
do not silently change implementation to satisfy test
```

Phải xác định:

```text
spec bug
or
test bug
or
implementation bug
```

rồi sửa source-of-truth tương ứng.

---

# 25. Rule cho AI coding agent khi bắt đầu phiên mới

Agent nên thực hiện:

```text
1. Read PROJECT_DESCRIPTION.md
2. Read ARCHITECTURE.md
3. Read the spec of the component being changed
4. Read SAFETY_SPEC.md if change affects graph correctness, confidence, impact or editing safety
5. Read relevant testcase YAML/ACCEPTANCE.md
6. Inspect current implementation
7. Implement smallest correct change
8. Run relevant tests
9. Run broader regression tests only when dependency impact requires it
```

Không cần đọc lại toàn bộ 7 core documents trên mọi task nếu cùng một agent/session đã nắm rõ chúng.

---

# 26. Minimal reading paths theo loại task

## Parser task

```text
PROJECT_DESCRIPTION
→ ARCHITECTURE
→ SEMANTIC_IR
→ SAFETY_SPEC
→ tests/parsing
→ tests/entities
→ tests/relations
```

## MCP task

```text
PROJECT_DESCRIPTION
→ ARCHITECTURE
→ SEMANTIC_IR
→ MCP_SPEC
→ SAFETY_SPEC
→ tests/mcp
→ tests/confidence
→ tests/safety
```

## Sync task

```text
ARCHITECTURE
→ SEMANTIC_IR
→ SYNC_SPEC
→ SAFETY_SPEC
→ tests/sync
→ tests/safety
→ tests/robustness
```

## Token optimization task

```text
PROJECT_DESCRIPTION
→ ARCHITECTURE
→ MCP_SPEC
→ AGENT_BEHAVIOR
→ METRICS
→ tests/micro_map
→ tests/mcp
→ tests/tokens
→ tests/agent_tasks
```

## Database task

```text
ARCHITECTURE
→ SEMANTIC_IR
→ SYNC_SPEC
→ SAFETY_SPEC
→ tests/entities
→ tests/relations
→ tests/performance
→ tests/robustness
```

## Agent integration task

```text
PROJECT_DESCRIPTION
→ ARCHITECTURE
→ MCP_SPEC
→ AGENT_BEHAVIOR
→ SAFETY_SPEC
→ tests/tokens
→ tests/agent_tasks
```

---

# 27. Definition of done cho một module

Một module chỉ được coi là hoàn thành khi:

```text
spec implemented
+
relevant L0/L1 tests pass
+
relevant S0 safety tests pass
+
no source corruption
+
diagnostics are explicit
```

Không dùng:

```text
"feature works on happy path"
```

làm definition of done.

---

# 28. Definition of done cho V1

V1 hoàn thành khi có pipeline:

```text
portable executable
    ↓
repository scan
    ↓
Canonical Semantic IR
    ↓
SQLite GraphStore
    ↓
Micro Mental Map
    ↓
MCP semantic_explore
    ↓
incremental sync
    ↓
confidence/safety states
```

và acceptance:

```text
mandatory V1 tests pass
all S0 core tests pass
agent correctness >= baseline
token benchmark measured
offline operation verified
```

---

# 29. Tóm tắt thứ tự đọc

Nếu chỉ nhớ một danh sách, dùng danh sách này:

```text
01 PROJECT_DESCRIPTION.md
02 ARCHITECTURE.md
03 SEMANTIC_IR.md
04 MCP_SPEC.md
05 SYNC_SPEC.md
06 SAFETY_SPEC.md
07 AGENT_BEHAVIOR.md

08 testpack/README.md
09 testpack/TEST_STRATEGY.md
10 testpack/METRICS.md
11 testpack/GROUND_TRUTH_SPEC.md
12 testpack/AUTONOMOUS_EXECUTION.md
13 testpack/ACCEPTANCE_CRITERIA.md
14 relevant testcase YAML files
```

Sau đó mới:

```text
IMPLEMENT
→ TEST
→ MEASURE
→ REFINE
```

---

# 30. Nguyên tắc cuối cùng

AI agent triển khai Portable CodeGraph phải luôn nhớ:

> Đừng cố xây toàn bộ hệ thống cùng lúc.

Thực hiện theo dependency order:

```text
IR correctness
before
retrieval cleverness

safety
before
aggressive compression

correctness
before
token optimization

measured need
before
infrastructure complexity
```

Đây cũng chính là YAGNI áp dụng cho quá trình xây dựng Portable CodeGraph.

# Portable CodeGraph — Full Test Acceptance Criteria

PASS của từng testcase yêu cầu **tất cả** điều kiện liệt kê bên dưới đạt; metric threshold trong YAML cũng là bắt buộc.

## agent_tasks

### AGENT-001 — Local bug fix

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


### AGENT-002 — Cross-module bug fix

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


### AGENT-003 — Add API endpoint

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


### AGENT-004 — Public method rename

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


### AGENT-005 — Schema usage update

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


### AGENT-006 — Locate behavior owner

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


## confidence

### CONF-001 — High-confidence calibration

**Điều kiện nghiệm thu**

1. HIGH-confidence false-positive rate <= target.
2. All sampled HIGH edges match generator truth.
3. No hidden ambiguity.

**Agent tự thực hiện**

1. Fixture: Generate deterministic repository with at least 100 direct static calls whose ground truth is known from generator manifest.
2. Fixture: No dynamic constructs.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### CONF-002 — Low-confidence concentration

**Điều kiện nghiệm thu**

1. Most direct static edges are HIGH.
2. Dynamic/ambiguous edges are predominantly MEDIUM/LOW/UNKNOWN.
3. dynamic_high_confidence_rate meets target.

**Agent tự thực hiện**

1. Fixture: Generate mixed set: static direct calls, interface dispatch, DI, dynamic import, reflection.
2. Fixture: Generator writes truth labels before CodeGraph run.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### CONF-003 — Omission is not absence

**Điều kiện nghiệm thu**

1. Agent does not conclude helper absent from micro-map omission.
2. Agent queries MCP/source when completeness matters.
3. Header/instructions explicitly state omission is not absence.

**Agent tự thực hiện**

1. Fixture: Create repository where micro-map budget intentionally omits a valid low-priority helper.
2. Fixture: Ask existence question through autonomous agent benchmark.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### CONF-004 — Scoped completeness

**Điều kiện nghiệm thu**

1. MCP returns known static callers.
2. Dynamic area is disclosed.
3. Overall impact is IMPACT_INCOMPLETE.
4. No unqualified 'all callers' claim.

**Agent tự thực hiện**

1. Fixture: Create 3 static callers plus one plugin/runtime caller to same API.
2. Fixture: Oracle marks static caller set complete only within static scope.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### CONF-005 — Ambiguous candidate propagation

**Điều kiện nghiệm thu**

1. Ambiguity propagates through IR and MCP.
2. No candidate silently wins.
3. Safety state is not NAVIGATION_SAFE for complete-impact question.

**Agent tự thực hiện**

1. Fixture: Create two candidates equally compatible with unresolved call.
2. Fixture: Oracle declares AMBIGUOUS.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## dynamic

### DYN-001 — Python monkey patch

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


### DYN-002 — Dependency injection implementation

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


### DYN-003 — Dynamic import

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


### DYN-004 — Plugin registry

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


### DYN-005 — Reflection

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


### DYN-006 — Feature flag runtime path

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


## entities

### ENTITY-001 — Function and method extraction

**Điều kiện nghiệm thu**

1. Entity precision and recall satisfy threshold.
2. Each semantic declaration appears once.
3. Nested/scoped names are distinguishable.
4. No comment/string produces an entity.

**Agent tự thực hiện**

1. Fixture: Create file with top-level functions, nested function, class methods, staticmethod/classmethod, and duplicate short names in different scopes.
2. Fixture: Oracle lists exact entity set and qualified names.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### ENTITY-002 — Qualified name disambiguation

**Điều kiện nghiệm thu**

1. No stable-ID collision.
2. No silent resolution from one service to the other.
3. MCP ambiguous short-name query returns both candidates or requires focus.
4. ambiguous_silent_resolution_rate is zero.

**Agent tự thực hiện**

1. Fixture: Create `service_a/user.py` and `service_b/user.py`, each defining `User` and `create()`.
2. Fixture: Oracle explicitly marks four distinct qualified symbols.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### ENTITY-003 — Stable ID under line movement

**Điều kiện nghiệm thu**

1. Stable ID unchanged.
2. SourceLocation line changes correctly.
3. No duplicate old entity remains active.
4. Revision increments exactly through valid publication.

**Agent tự thực hiện**

1. Fixture: Create target symbol, init and capture stable ID.
2. Fixture: Insert comments/blank lines above declaration without renaming/moving it.
3. Fixture: Sync and recapture entity.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### ENTITY-004 — Rename and move tracking

**Điều kiện nghiệm thu**

1. No wrong merge with unrelated entity.
2. Old active path is removed.
3. New entity is queryable.
4. If rename tracking exists, alias is correct; otherwise safe delete+add is accepted.

**Agent tự thực hiện**

1. Fixture: Create entity in `old/module.py`, initialize.
2. Fixture: Move to `new/module.py` and rename symbol once.
3. Fixture: Sync; capture alias/history behavior.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### ENTITY-005 — Generated vs first-party classification

**Điều kiện nghiệm thu**

1. Handwritten files classify FIRST_PARTY.
2. Generated client classifies GENERATED.
3. Generated entity depth is shallower than first-party according to policy.
4. Generated symbols do not dominate micro-map budget.

**Agent tự thực hiện**

1. Fixture: Create small handwritten service plus large generated client marked by generated-file conventions/header/path.
2. Fixture: Create expected classification manifest independently.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## mcp

### MCP-001 — Relevant region retrieval

**Điều kiện nghiệm thu**

1. Auth/token region ranks first.
2. Required flow entities are returned.
3. Irrelevant refresh symbols do not dominate top results.
4. Response remains under budget.

**Agent tự thực hiện**

1. Fixture: Create auth controller -> token service -> session repository -> validator flow plus unrelated `refresh` functions elsewhere.
2. Fixture: Oracle defines expected auth region and relevant entities.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MCP-002 — Precision under ambiguous keyword

**Điều kiện nghiệm thu**

1. Correct symbols dominate top-5.
2. precision@5 meets target.
3. Focus/graph proximity affects ranking correctly.

**Agent tự thực hiện**

1. Fixture: Create at least 5 modules each containing `refresh`, only one connected to known auth symbol.
2. Fixture: Query with focus/known symbol.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MCP-003 — Progressive response

**Điều kiện nghiệm thu**

1. Default response contains semantic facts and source locations.
2. Full source body token count is zero or only tiny unavoidable snippet.
3. Agent can identify exact file/line to read next.

**Agent tự thực hiện**

1. Fixture: Use multi-file flow where source bodies are much larger than signatures.
2. Fixture: Query for flow without explicit source request.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MCP-004 — Context delta response

**Điều kiện nghiệm thu**

1. Second response mostly contains delta.
2. Duplicate semantic context ratio <= target.
3. Correctness does not depend on context_id if omitted.

**Agent tự thực hiện**

1. Fixture: Perform first exploration returning context_id, then second focused query in same chain.
2. Fixture: Record normalized semantic units from both responses.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MCP-005 — Broad query protection

**Điều kiện nghiệm thu**

1. Response does not exceed budget materially.
2. Returns routing summary/top regions, not full graph.
3. No crash/time explosion.

**Agent tự thực hiện**

1. Fixture: Use large fixture; issue `show entire repository` with small explicit budget.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MCP-006 — Stale result warning

**Điều kiện nghiệm thu**

1. Response declares PARTIAL/STALE.
2. Last-known-good revision is identified.
3. SOURCE_INSPECTION_REQUIRED appears.
4. No stale result is presented as current truth.

**Agent tự thực hiện**

1. Fixture: Initialize valid auth file, then make it syntactically invalid and query related flow.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MCP-007 — Impact incomplete response

**Điều kiện nghiệm thu**

1. Known consumers returned.
2. Dynamic unresolved region returned.
3. Status IMPACT_INCOMPLETE.
4. No exact-complete claim.

**Agent tự thực hiện**

1. Fixture: Create public API with static consumer and plugin/dynamic consumer.
2. Fixture: Query impact.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## micro_map

### MAP-001 — Small repository routing quality

**Điều kiện nghiệm thu**

1. All critical entry points appear.
2. Main flow is directionally correct.
3. Map stays within configured token target.
4. Noise ratio stays below threshold.

**Agent tự thực hiện**

1. Fixture: Generate ~20-file app with web entry point, service, repository, tests and clear main flow.
2. Fixture: Truth manifest ranks required routing entities.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MAP-002 — Medium repository abstraction

**Điều kiện nghiệm thu**

1. Map abstracts at module/service level.
2. Hard cap is respected.
3. Key services route correctly.
4. Leaf helper omission is not represented as nonexistence.

**Agent tự thực hiện**

1. Fixture: Generate ~2k-file repository with 10 services and many low-value leaf helpers.
2. Fixture: Truth manifest names services and key entry points.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MAP-003 — Huge repository hard budget

**Điều kiện nghiệm thu**

1. Map never exceeds cap.
2. Generation completes without linear context growth.
3. Top-level domains remain represented.
4. Full graph remains queryable independently.

**Agent tự thực hiện**

1. Fixture: Generate synthetic metadata/source tree representing >=100k files, mostly low-value leaves/generated files.
2. Fixture: Set explicit hard token cap in config.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MAP-004 — Critical entry point retention

**Điều kiện nghiệm thu**

1. Critical entry recall meets target.
2. At least one routing path from each entry point to owner region is present.
3. Compression does not discard all non-HTTP entry types.

**Agent tự thực hiện**

1. Fixture: Create repository with HTTP route, CLI command, event consumer and scheduled job.
2. Fixture: Oracle marks all as critical entry points.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MAP-005 — Generated/vendor noise suppression

**Điều kiện nghiệm thu**

1. Map content is dominated by first-party architecture.
2. Generated/vendor details stay shallow.
3. Irrelevant content ratio meets target.

**Agent tự thực hiện**

1. Fixture: Generate repo with 90% generated/vendor files and 10% first-party business modules.
2. Fixture: Oracle ranks first-party modules as routing-critical.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### MAP-006 — Micro-map misleading absence guard

**Điều kiện nghiệm thu**

1. Agent uses MCP/source.
2. Final answer matches repository truth.
3. No omission-as-absence inference.

**Agent tự thực hiện**

1. Fixture: Create helper omitted from map due to budget but available in graph.
2. Fixture: Ask agent 'does helper X exist?' without naming file.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## parsing

### PARSE-001 — Python core syntax

**Điều kiện nghiệm thu**

1. `codegraph init` exits successfully.
2. Every expected supported Python entity exists exactly once.
3. No unexpected semantic entity is emitted from comments/strings.
4. Async/generator/decorator syntax does not corrupt the signature.
5. All emitted source spans point to the intended declarations.
6. No repository source file changes.

**Agent tự thực hiện**

1. Fixture: Create `app.py` containing: a decorated class, top-level function, nested function, `async def`, generator using `yield`, multiline typed signature, default args, and a call between two functions.
2. Fixture: Create `expected/entities.json` manually from the source specification with every expected callable/class, qualified name, signature, and source span.
3. Fixture: Do not execute or import `app.py` while building the oracle.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PARSE-002 — TypeScript modern syntax

**Điều kiện nghiệm thu**

1. Initialization succeeds without Node.js execution.
2. Interfaces/classes/functions expected by oracle are present.
3. Type-only import is not misclassified as runtime CALLS.
4. Generics and optional types preserve stable readable signatures.
5. No crash or malformed source location.

**Agent tự thực hiện**

1. Fixture: Create `src/types.ts` with interface, generic type, generic class, async method, decorator syntax supported by parser, optional chaining, union type and type-only import.
2. Fixture: Create `src/deps.ts` for imported types.
3. Fixture: Write expected entities/signatures before running CodeGraph.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PARSE-003 — Java generic and annotation syntax

**Điều kiện nghiệm thu**

1. All Java source parses.
2. Overloaded methods remain distinct.
3. Annotation does not create fake method entities.
4. Qualified names include package/class scope.
5. Entity recall meets target and no silent merge occurs.

**Agent tự thực hiện**

1. Fixture: Create Java package with annotation, generic interface, implementing class, two overloaded methods with same name/different parameter types.
2. Fixture: Oracle lists overloads as distinct entities.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PARSE-004 — Go methods and interfaces

**Điều kiện nghiệm thu**

1. Parsing succeeds without invoking `go` tooling.
2. Receiver methods attach to correct type.
3. Package-qualified names are correct.
4. Imports resolve conservatively and no duplicate method is produced.

**Agent tự thực hiện**

1. Fixture: Create Go module with two packages, interface, struct, pointer receiver method, value receiver method, import alias, goroutine call.
2. Fixture: Oracle records package-qualified entities and known relations.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PARSE-005 — Temporary syntax error

**Điều kiện nghiệm thu**

1. New invalid source does not erase revision N semantic data.
2. Graph status is PARTIAL, not FRESH.
3. Affected file is marked stale/parse-failed.
4. MCP exposes last-known-good revision and SOURCE_INSPECTION_REQUIRED.
5. No half-written revision becomes visible.

**Agent tự thực hiện**

1. Fixture: Create valid `auth.py`, initialize graph and record revision N/entity snapshot.
2. Fixture: Modify file to syntactically incomplete `def login(` without deleting the file.
3. Fixture: Query status/MCP while syntax is invalid.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PARSE-006 — Mixed file encoding and Unicode identifiers

**Điều kiện nghiệm thu**

1. Index succeeds.
2. Paths and identifiers round-trip exactly in DB/MCP output.
3. No replacement-character corruption occurs.
4. Source files remain byte-identical.

**Agent tự thực hiện**

1. Fixture: Create UTF-8 path `mô_đun/用户.py` and Unicode identifiers/comments/strings that are valid for target language.
2. Fixture: Oracle uses exact Unicode names and paths.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## performance

### PERF-001 — Cold index small repo

**Điều kiện nghiệm thu**

1. Record p50/p95 init time, peak RAM, graph DB size.
2. No crash.
3. All semantic correctness smoke checks pass before performance result accepted.

**Agent tự thực hiện**

1. Fixture: Generate deterministic ~100-file repo from fixture generator.
2. Fixture: Run cold init at least 5 times in clean temp copies.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PERF-002 — Cold index large repo

**Điều kiện nghiệm thu**

1. Performance metrics recorded.
2. Semantic counts remain correct.
3. Growth does not exhibit unexplained pathological behavior relative to scaling baseline.
4. Configured budget honored if set.

**Agent tự thực hiện**

1. Fixture: Generate deterministic ~10k-file repo with known symbol/edge counts.
2. Fixture: Cold index repeated runs.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PERF-003 — Single-file incremental latency

**Điều kiện nghiệm thu**

1. Median incremental cost is substantially lower than full index target.
2. Correct revision produced.
3. No stale result.

**Agent tự thực hiện**

1. Fixture: Use large fixture; record full init cost.
2. Fixture: Edit one leaf file; measure incremental update at least 20 times.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PERF-004 — MCP query latency

**Điều kiện nghiệm thu**

1. Every query returns correct routing before latency is scored.
2. p95 meets configured budget.
3. No response exceeds token budget.

**Agent tự thực hiện**

1. Fixture: Prepare fixed query corpus across regions.
2. Fixture: Warm graph, run each query multiple times.
3. Fixture: Capture p50/p95/p99.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PERF-005 — Memory under huge metadata graph

**Điều kiện nghiệm thu**

1. Peak RAM is within configured local-machine budget.
2. No OOM/crash.
3. Correctness sample passes.

**Agent tự thực hiện**

1. Fixture: Generate huge synthetic semantic/source fixture sized to stress graph.
2. Fixture: Measure process peak RSS while indexing/querying.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### PERF-006 — SQLite growth and checkpoint

**Điều kiện nghiệm thu**

1. No unbounded WAL growth after maintenance.
2. Database integrity check passes.
3. Published graph remains queryable.

**Agent tự thực hiện**

1. Fixture: Perform many incremental revisions with WAL enabled.
2. Fixture: Measure graph.db/WAL before, during and after maintenance/checkpoint.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## portability

### PORT-001 — Windows x64 zero-runtime

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


### PORT-002 — Linux x64 zero-runtime

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


### PORT-003 — macOS Apple Silicon zero-runtime

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


### PORT-004 — Offline operation

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


### PORT-005 — Executable moved to new path

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


## relations

### REL-001 — Direct call resolution

**Điều kiện nghiệm thu**

1. CALLS edge exists.
2. Target is correct `b`.
3. Confidence is HIGH.
4. No inverse/spurious duplicate edge.

**Agent tự thực hiện**

1. Fixture: Create `a.py` where `a()` directly calls `b()` in same file.
2. Fixture: Oracle contains exactly one relevant CALLS edge a->b.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### REL-002 — Cross-module import and call

**Điều kiện nghiệm thu**

1. Both edges resolve to correct target.
2. No edge points to similarly named local symbol.
3. Cross-file source locations are correct.

**Agent tự thực hiện**

1. Fixture: Create module `pkg/a.py` importing and calling `pkg/b.py::foo`.
2. Fixture: Oracle contains IMPORTS and CALLS edges.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### REL-003 — Aliased import resolution

**Điều kiện nghiệm thu**

1. CALLS resolves to `foo.run`.
2. Alias import relation is preserved.
3. No HIGH-confidence relation to unrelated local `bar`.

**Agent tự thực hiện**

1. Fixture: Create module `foo.py` with `run`; caller uses `import foo as bar; bar.run()`.
2. Fixture: Also create unrelated local identifier named `bar` to stress ambiguity.
3. Fixture: Oracle target is `foo.run`.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### REL-004 — Circular dependency

**Điều kiện nghiệm thu**

1. Both cycle edges exist.
2. Traversal terminates.
3. MCP response stays within budget.
4. No recursion crash or unbounded duplicate result.

**Agent tự thực hiện**

1. Fixture: Create A importing B and B importing A with one call in each direction.
2. Fixture: Oracle records cycle.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### REL-005 — Interface dispatch

**Điều kiện nghiệm thu**

1. Tool does not select one implementation as HIGH without evidence.
2. Candidates/ambiguity are surfaced.
3. Safety state requires source/config inspection when impact completeness matters.

**Agent tự thực hiện**

1. Fixture: Create interface/protocol with two valid implementations selected externally.
2. Fixture: Caller invokes through interface type.
3. Fixture: Oracle marks runtime target set ambiguous.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### REL-006 — Conditional call preservation

**Điều kiện nghiệm thu**

1. Conditional edge retains condition.
2. Projection/MCP does not render conditional call as unconditional.
3. Impact output exposes feature-dependent path.

**Agent tự thực hiện**

1. Fixture: Create feature-gated call `if feature_enabled: new_flow()` plus unconditional old flow.
2. Fixture: Oracle records condition string/source span.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## robustness

### ROB-001 — Symlink loop

**Điều kiện nghiệm thu**

1. Scanner terminates.
2. Valid source still indexes.
3. Loop is skipped/reported.
4. No unbounded CPU/memory recursion.

**Agent tự thực hiện**

1. Fixture: Create temp directory with symlink cycle where OS permits.
2. Fixture: Ensure fixture root contains one valid source file outside loop.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### ROB-002 — Nested Git repository

**Điều kiện nghiệm thu**

1. Scanner does not silently cross configured project boundary.
2. External region is explicit or separately handled.
3. No symbol collision caused by accidental nested scan.

**Agent tự thực hiện**

1. Fixture: Create parent Git repo containing nested Git repo or submodule fixture.
2. Fixture: Place similarly named symbols on both sides of boundary.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### ROB-003 — Very large minified file

**Điều kiện nghiệm thu**

1. Tool classifies/shallow-indexes/skips according to policy.
2. Resource usage remains bounded.
3. Handwritten source still routes correctly.

**Agent tự thực hiện**

1. Fixture: Generate multi-MB minified JS file under generated/vendor-like path plus normal handwritten JS.
2. Fixture: Do not execute file.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### ROB-004 — Corrupted graph.db

**Điều kiện nghiệm thu**

1. Corruption detected.
2. MCP does not serve silently incorrect graph.
3. Source untouched.
4. Rebuild recovery path is reported/works.

**Agent tự thực hiện**

1. Fixture: Initialize graph, then deliberately corrupt a copy of `.codegraph/graph.db` bytes in temp fixture.
2. Fixture: Run `doctor` and MCP.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### ROB-005 — Disk full during publish

**Điều kiện nghiệm thu**

1. Failed N+1 publish rolls back.
2. Revision N remains usable.
3. Source bytes unchanged.
4. No truncated live `codegraph.py` or DB state.

**Agent tự thực hiện**

1. Fixture: Run in disposable filesystem with quota/fault injection to fail during graph publish.
2. Fixture: Keep prior valid revision N.
3. Fixture: Trigger sync.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### ROB-006 — Path case collision

**Điều kiện nghiệm thu**

1. No silent merge where distinct paths are legal.
2. Unsupported platform case is SKIP, not false PASS.
3. Diagnostics explain collision risk.

**Agent tự thực hiện**

1. Fixture: On suitable platform create files/symbols differing only by case; on incompatible platform use virtual fixture and mark platform limitation.
2. Fixture: Oracle keeps them distinct where filesystem permits.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## safety

### SAFE-001 — Missing caller trap

**Điều kiện nghiệm thu**

1. Impact query returns known callers plus IMPACT_INCOMPLETE.
2. Agent does not delete/rename based solely on static set.
3. Source/config inspected before edit.
4. No unsafe completeness claim.

**Agent tự thực hiện**

1. Fixture: Create public function with 2 static callers and 1 runtime plugin caller intentionally invisible to ordinary static traversal.
2. Fixture: Oracle explicitly contains hidden runtime consumer.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SAFE-002 — Stale auth graph

**Điều kiện nghiệm thu**

1. Freshness/stale warning occurs before edit guidance.
2. Agent reads current auth source.
3. No edit based only on stale map.
4. Tests remain passing after accepted patch.

**Agent tự thực hiện**

1. Fixture: Create authentication logic, initialize graph, then change auth source without normal watcher delivery.
2. Fixture: Give agent auth-changing task.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SAFE-003 — Generated code edit trap

**Điều kiện nghiệm thu**

1. Generated file classified GENERATED.
2. Agent is routed to schema/generator when relationship discoverable.
3. Agent does not manually patch generated output as primary fix unless task explicitly requires it.

**Agent tự thực hiện**

1. Fixture: Create generated API client with header and authoritative OpenAPI/schema generator input.
2. Fixture: Task asks change behavior represented in generated file.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SAFE-004 — Feature-flag hidden consumer

**Điều kiện nghiệm thu**

1. Flagged consumer prevents 'unused' certainty.
2. Impact is conditional/incomplete.
3. Agent does not remove valid feature path.
4. Both flag-state tests pass.

**Agent tự thực hiện**

1. Fixture: Create code used only when feature flag is enabled and tests/config for both states.
2. Fixture: Task suggests removing apparently unused code.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SAFE-005 — Cross-language boundary

**Điều kiện nghiệm thu**

1. CROSS_LANGUAGE_BOUNDARY or equivalent surfaced.
2. Impact not claimed complete.
3. Agent inspects contract/binding/source before destructive change.

**Agent tự thực hiện**

1. Fixture: Create TS -> RPC/native boundary with consumer outside statically resolved language graph.
2. Fixture: Oracle marks cross-language edge.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SAFE-006 — Ambiguous duplicate symbol

**Điều kiện nghiệm thu**

1. MCP surfaces candidates or correctly routes using context.
2. Wrong service is never edited.
3. No silent ambiguous resolution.

**Agent tự thực hiện**

1. Fixture: Create same-named `Config`/`User`/`run` symbols in two services and ambiguous query.
2. Fixture: Task targets only one via behavior context.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SAFE-007 — Revision changed before edit

**Điều kiện nghiệm thu**

1. Integration detects revision mismatch.
2. Affected assumptions are revalidated.
3. Patch is based on N+1 source.
4. No stale-assumption edit.

**Agent tự thực hiện**

1. Fixture: Agent reasons on revision N for high-impact task.
2. Fixture: Before edit, mutate affected dependency and publish N+1.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SAFE-008 — Micro-map omission trap

**Điều kiện nghiệm thu**

1. Agent does not infer absence from omission.
2. MCP/source consulted.
3. Final action respects actual symbol.

**Agent tự thực hiện**

1. Fixture: Force important but low-priority symbol out of micro-map via budget.
2. Fixture: Ask agent whether it exists or whether safe to remove related API.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## sync

### SYNC-001 — Single file edit

**Điều kiện nghiệm thu**

1. Revision becomes N+1 or valid later revision.
2. Changed semantic facts visible.
3. Unchanged unrelated regions retain identity.
4. No full rebuild required unless implementation chooses but metrics record it.

**Agent tự thực hiện**

1. Fixture: Initialize simple repo and capture revision N.
2. Fixture: Modify one function signature/body, then trigger sync/query.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SYNC-002 — Rapid save burst

**Điều kiện nghiệm thu**

1. Only coherent final semantic state is published.
2. No half-state is queryable.
3. Event storm does not create one published revision per low-level event unless semantically necessary.

**Agent tự thực hiện**

1. Fixture: Script rapid sequence of atomic saves/renames for same files within debounce interval.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SYNC-003 — File rename/move

**Điều kiện nghiệm thu**

1. Old active path disappears.
2. New path is queryable.
3. No stale duplicate active entity.
4. Stable history preserved when supported.

**Agent tự thực hiện**

1. Fixture: Initialize file, move/rename it, then run sync.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SYNC-004 — Branch switch

**Điều kiện nghiệm thu**

1. Freshness barrier sees B before serving graph result.
2. No A-only semantic fact is presented as current.
3. Graph revision/source fingerprint correspond to B.

**Agent tự thực hiện**

1. Fixture: Create Git repo with branch A/B having different architecture.
2. Fixture: Initialize on A, switch to B while MCP inactive or watcher unable to process individual events.
3. Fixture: Query immediately after startup.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SYNC-005 — Watcher missed event

**Điều kiện nghiệm thu**

1. Freshness reconciliation detects change.
2. Result matches modified source.
3. stale_result_rate is zero.

**Agent tự thực hiện**

1. Fixture: Initialize graph, intentionally suppress watcher delivery, modify source, then issue MCP query.
2. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
3. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
4. Capture output, graph revision/status, MCP/codegraph.py và metrics.
5. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
6. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SYNC-006 — Concurrent revision change

**Điều kiện nghiệm thu**

1. First response is internally consistent with N.
2. Next response sees N+1.
3. No mixed edges/entities from N and N+1.

**Agent tự thực hiện**

1. Fixture: Start long query on revision N.
2. Fixture: During query mutate source and publish N+1.
3. Fixture: Capture revision metadata from response.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### SYNC-007 — Mass generated files

**Điều kiện nghiệm thu**

1. Mass-change path batches work.
2. No runaway revision storm.
3. Generated classification remains shallow.
4. Resource budget respected.

**Agent tự thực hiện**

1. Fixture: Generate thousands of GENERATED-classified files in one burst.
2. Fixture: Record CPU/time/revision count.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


## tokens

### TOK-001 — Tiny local fix net tokens

**Điều kiện nghiệm thu**

1. Both runs must be correct before token comparison counts.
2. Variant total input token cost <= 1.25x baseline target.
3. Any token saving claim excludes failed runs.

**Agent tự thực hiện**

1. Fixture: Create tiny one-file bug task with deterministic patch and test.
2. Fixture: Prepare agent baseline and variant prompts identically except CodeGraph integration.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### TOK-002 — Cross-module bug token saving

**Điều kiện nghiệm thu**

1. Variant correctness >= baseline.
2. Median net token saving >= target.
3. Variant does not modify more unnecessary files than baseline.

**Agent tự thực hiện**

1. Fixture: Create bug whose root cause requires traversing at least 5 modules; deterministic test verifies patch.
2. Fixture: Run multiple baseline/variant agent trials from clean state.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### TOK-003 — Architecture task token saving

**Điều kiện nghiệm thu**

1. Variant answer accuracy >= baseline.
2. Discovery token reduction meets target.
3. No missing critical service relation due to compression.

**Agent tự thực hiện**

1. Fixture: Create multi-service repository and architecture question with manually/generated truth map.
2. Fixture: Run baseline/variant agent answers scored against truth.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### TOK-004 — Duplicate source suppression

**Điều kiện nghiệm thu**

1. MCP does not return full function source by default before agent reads it.
2. Duplicate source-token estimate stays under threshold.
3. Source is read once at authoritative edit step.

**Agent tự thực hiện**

1. Fixture: Task requires editing one long function.
2. Fixture: Instrument MCP and file reads to hash returned source spans.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### TOK-005 — Instruction overhead

**Điều kiện nghiệm thu**

1. Instruction tokens <= target.
2. Full design docs are not injected.
3. Only minimal behavioral contract/tool schema is present.

**Agent tự thực hiện**

1. Fixture: Capture actual injected CodeGraph runtime instructions/tool schema text.
2. Fixture: Tokenize with agent/model tokenizer when available; otherwise use declared tokenizer fixture.
3. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
4. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
5. Capture output, graph revision/status, MCP/codegraph.py và metrics.
6. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
7. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.


### TOK-006 — Subagent scoped context

**Điều kiện nghiệm thu**

1. Scoped subagents receive region-specific map when feature supported.
2. Correctness preserved.
3. Preload reduction meets target relative to giving each full map.

**Agent tự thực hiện**

1. Fixture: Create parent task naturally splittable into auth and frontend subagents.
2. Fixture: Integration must support scoped subagent context; otherwise SKIP with capability reason.
3. Fixture: Record preload tokens per subagent.
4. Tạo oracle độc lập trong `expected/` trước khi chạy CodeGraph.
5. Hash source tree, chạy thao tác testcase bằng binary portable trong temp workspace.
6. Capture output, graph revision/status, MCP/codegraph.py và metrics.
7. So sánh với oracle; kiểm tra hard-fail rules và source integrity.
8. Ghi `result.yaml`; PASS chỉ khi mọi điều kiện và metric target đạt.

---
title: "parsing Acceptance Criteria"
version: "0.2"
---

# parsing — Acceptance & Autonomous Execution

## PARSE-001 — Python core syntax

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

## PARSE-002 — TypeScript modern syntax

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

## PARSE-003 — Java generic and annotation syntax

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

## PARSE-004 — Go methods and interfaces

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

## PARSE-005 — Temporary syntax error

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

## PARSE-006 — Mixed file encoding and Unicode identifiers

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

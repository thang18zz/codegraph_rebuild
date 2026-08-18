import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_CONFIG, RISK } from "../src/constants.js";
import { parseSourceFile } from "../src/parser.js";
import { resolveGraph } from "../src/resolver.js";
import { temporaryProject } from "./helpers.js";

async function parse(project, path, language, source, classification = "FIRST_PARTY") {
  const absolutePath = await project.write(path, source);
  const metadata = await stat(absolutePath);
  return parseSourceFile({
    absolutePath,
    path,
    language,
    classification,
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
  }, { ...DEFAULT_CONFIG, exclude: [] });
}

test("Python declarations, direct calls, conditions, and signatures are preserved", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "app.py", "python", `
def helper(value: str) -> str:
    return value

class Service:
    @staticmethod
    async def run(value: str = "x") -> str:
        if feature_enabled:
            return helper(value)
        return value
`);
  assert.equal(parsed.parse_status, "OK");
  assert.deepEqual(
    parsed.entities.map((entity) => entity.qualified_name),
    ["app", "app.helper", "app.Service", "app.Service.run"],
  );
  const graph = resolveGraph([parsed]);
  const call = graph.relations.find((relation) => relation.kind === "CALLS");
  assert.equal(call.confidence, "HIGH");
  assert.equal(call.condition.expression, "feature_enabled");
  assert.match(call.dst_entity_id, /app\.helper:function$/u);
  assert.ok(graph.health.risk_flags.includes(RISK.CONDITIONAL_COMPILATION));
});

test("qualified names distinguish duplicate short names across services", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const first = await parse(project, "service_a/user.py", "python", "class User:\n    pass\n\ndef create():\n    return User()\n");
  const second = await parse(project, "service_b/user.py", "python", "class User:\n    pass\n\ndef create():\n    return User()\n");
  const graph = resolveGraph([first, second]);
  const userEntities = graph.entities.filter((entity) => entity.name === "User");
  assert.equal(userEntities.length, 2);
  assert.equal(new Set(userEntities.map((entity) => entity.stable_id)).size, 2);
  assert.notEqual(userEntities[0].qualified_name, userEntities[1].qualified_name);
});

test("TypeScript syntax and type-only imports parse without runtime call invention", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "src/service.ts", "typescript", `
import type { Input } from "./types";
interface Runner<T> { run(value: T): Promise<void> }
export class Service implements Runner<Input> {
  async run(value?: Input): Promise<void> {
    value?.toString();
  }
}
`);
  assert.equal(parsed.parse_status, "OK");
  assert.ok(parsed.entities.some((entity) => entity.kind === "interface" && entity.name === "Runner"));
  assert.ok(parsed.entities.some((entity) => entity.kind === "class" && entity.name === "Service"));
  const typeImport = parsed.relations.find((relation) => relation.kind === "IMPORTS");
  assert.equal(typeImport.type_only, true);
  assert.equal(parsed.relations.some((relation) => relation.kind === "CALLS" && relation.unresolved_target === "Input"), false);
});

test("Java overloads and Go receivers receive distinct semantic identities", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const java = await parse(project, "src/C.java", "java", `
package demo;
interface Runner<T> { T run(T value); }
class C implements Runner<String> {
  public String run(String value) { return value; }
  public String run(int value) { return ""; }
}
`);
  const go = await parse(project, "worker/worker.go", "go", `
package worker
type Runner interface { Run() }
type Service struct{}
func (s *Service) Run() {}
func Start(value int) string { return "" }
`);
  assert.equal(java.parse_status, "OK");
  assert.equal(go.parse_status, "OK");
  const overloads = java.entities.filter((entity) => entity.name === "run" && entity.qualified_name.includes("demo.C"));
  assert.equal(overloads.length, 2);
  assert.equal(new Set(overloads.map((entity) => entity.stable_id)).size, 2);
  assert.ok(go.entities.some((entity) => entity.qualified_name === "worker.Service.Run"));
});

test("Java typed receivers and local overloads resolve without guessing", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const types = await parse(project, "src/demo/Types.java", "java", `
package demo;
enum Role { USER }
class Item {}
class Mail {}
class Order {}
`);
  const repository = await parse(project, "src/demo/Repo.java", "java", `
package demo;
interface Repo { Item find(String id); }
`);
  const service = await parse(project, "src/demo/Service.java", "java", `
package demo;
class Service {
  private Repo repo;
  Item lookup(String id) { return repo.find(id); }
  String value() { return "id"; }
  Item lookupNested() { return repo.find(value()); }
  void queue(Mail mail) {}
  void queue(String body) { queue(new Mail()); }
  void update(Order order) {}
  void success() { Order order = new Order(); update(order); }
}
`);
  const graph = resolveGraph([types, repository, service]);
  assert.ok(graph.entities.some((entity) => entity.kind === "enum"
    && entity.qualified_name === "demo.Role"));

  const highCalls = graph.relations.filter((relation) => relation.kind === "CALLS"
    && relation.confidence === "HIGH");
  const lookup = graph.entities.find((entity) => entity.qualified_name === "demo.Service.lookup(String)");
  const nested = graph.entities.find((entity) => entity.qualified_name === "demo.Service.lookupNested()");
  const stringQueue = graph.entities.find((entity) => entity.qualified_name === "demo.Service.queue(String)");
  const success = graph.entities.find((entity) => entity.qualified_name === "demo.Service.success()");
  assert.match(
    highCalls.find((relation) => relation.src_entity_id === lookup.stable_id)?.dst_entity_id ?? "",
    /demo\.Repo\.find\(String\):method$/u,
  );
  assert.match(
    highCalls.find((relation) => relation.src_entity_id === nested.stable_id
      && relation.dst_entity_id.includes("Repo.find"))?.dst_entity_id ?? "",
    /demo\.Repo\.find\(String\):method$/u,
  );
  assert.match(
    highCalls.find((relation) => relation.src_entity_id === stringQueue.stable_id)?.dst_entity_id ?? "",
    /demo\.Service\.queue\(Mail\):method$/u,
  );
  assert.match(
    highCalls.find((relation) => relation.src_entity_id === success.stable_id)?.dst_entity_id ?? "",
    /demo\.Service\.update\(Order\):method$/u,
  );
});

test("C# declarations, ASP.NET routes, typed dependencies, and member calls are explicit", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const contract = await parse(project, "Services/IAuthService.cs", "csharp", `
namespace Demo.Services;
public interface IAuthService {
  Task<Result> LoginAsync(LoginDto dto);
  Task<Result> LoginAsync(string token);
}
`);
  const implementation = await parse(project, "Services/AuthService.cs", "csharp", `
namespace Demo.Services;
public class AuthService : IAuthService {
  public Task<Result> LoginAsync(LoginDto dto) => throw new NotImplementedException();
  public Task<Result> LoginAsync(string token) => throw new NotImplementedException();
}
`);
  const controller = await parse(project, "Controllers/AuthController.cs", "csharp", `
using Demo.Services;
namespace Demo.Controllers;
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase {
  private readonly IAuthService _authService;
  public AuthController(IAuthService authService) => _authService = authService;

  [HttpPost("login")]
  [AllowAnonymous]
  public async Task<Result> Login(LoginDto dto) {
    if (dto != null) return await _authService.LoginAsync(dto);
    throw new ArgumentException();
  }
}
`);
  const graph = resolveGraph([contract, implementation, controller]);
  const overloads = graph.entities.filter((entity) => entity.name === "LoginAsync"
    && entity.qualified_name.includes("IAuthService"));
  assert.equal(overloads.length, 2);
  assert.equal(new Set(overloads.map((entity) => entity.stable_id)).size, 2);
  const authService = graph.entities.find((entity) => entity.name === "AuthService");
  const authController = graph.entities.find((entity) => entity.name === "AuthController");
  const login = graph.entities.find((entity) => entity.name === "Login");
  assert.ok(authService.semantic_tags.includes("public"));
  assert.ok(login.semantic_tags.includes("entry_point:http"));
  assert.ok(login.semantic_tags.includes("http:post"));
  assert.ok(login.semantic_tags.includes("route:http:POST /api/auth/login"));
  assert.ok(login.semantic_tags.includes("auth:anonymous"));
  assert.deepEqual(login.outputs, [{ type: "Task<Result>", condition: null }]);
  assert.ok(login.effects.includes("RAISE_ERROR"));
  const implementationRelation = graph.relations.find((relation) => (
    relation.src_entity_id === authService.stable_id && relation.kind === "IMPLEMENTS"
  ));
  assert.equal(implementationRelation.confidence, "HIGH");
  assert.match(implementationRelation.dst_entity_id, /IAuthService:interface$/u);
  const dependency = graph.relations.find((relation) => (
    relation.src_entity_id === authController.stable_id && relation.kind === "DEPENDS_ON"
  ));
  assert.equal(dependency.confidence, "HIGH");
  assert.match(dependency.dst_entity_id, /IAuthService:interface$/u);
  const call = graph.relations.find((relation) => (
    relation.src_entity_id === login.stable_id && relation.kind === "CALLS"
  ));
  assert.equal(call.confidence, "HIGH");
  assert.match(call.dst_entity_id, /IAuthService\.LoginAsync\(LoginDto\):method$/u);
  assert.equal(call.condition.expression, "dto != null");
});

test("C# record, struct, enum, and using aliases retain typed identities", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const models = await parse(project, "Models/Types.cs", "csharp", `
namespace Demo.Models {
  public record LoginDto(string Email);
  public struct Token { public string Value; }
  public enum Role { User, Admin }
}
`);
  const contract = await parse(project, "Services/IAuthService.cs", "csharp", `
namespace Demo.Services;
public interface IAuthService { void Login(); }
`);
  const controller = await parse(project, "Controllers/AliasController.cs", "csharp", `
using AuthContract = Demo.Services.IAuthService;
namespace Demo.Controllers;
public class AliasController {
  private readonly AuthContract _auth;
  public AliasController(AuthContract auth) { _auth = auth; }
}
`);
  const graph = resolveGraph([models, contract, controller]);
  assert.deepEqual(
    graph.entities.filter((entity) => ["record", "struct", "enum"].includes(entity.kind))
      .map((entity) => `${entity.kind}:${entity.qualified_name}`).sort(),
    ["enum:Demo.Models.Role", "record:Demo.Models.LoginDto", "struct:Demo.Models.Token"],
  );
  const aliasController = graph.entities.find((entity) => entity.name === "AliasController");
  const dependency = graph.relations.find((relation) => relation.src_entity_id === aliasController.stable_id
    && relation.kind === "DEPENDS_ON");
  assert.equal(dependency.confidence, "HIGH");
  assert.match(dependency.dst_entity_id, /IAuthService:interface$/u);
});

test("C# DI registrations, reflection, and literal database boundaries stay conservative", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const program = await parse(project, "Program.cs", "csharp", `
using Demo.Services;
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IAuthService, AlternateAuthService>();
builder.Services.AddSingleton<AuthService>();
var property = type.GetProperty("Id", System.Reflection.BindingFlags.Public);
`);
  const repository = await parse(project, "Repositories/UserRepository.cs", "csharp", `
namespace Demo.Repositories;
public class UserRepository {
  public async Task<User> FindAsync(int id) {
    return await conn.QueryFirstOrDefaultAsync<User>(
      "SELECT * FROM sp_get_user_by_id(@Id)", new { Id = id });
  }
}
`);
  const graph = resolveGraph([program, repository]);
  const programModule = graph.entities.find((entity) => entity.file_path === "Program.cs"
    && entity.kind === "module");
  assert.ok(programModule.semantic_tags.includes("di:lifetime:scoped:IAuthService->AuthService"));
  assert.ok(programModule.semantic_tags.includes("di:lifetime:scoped:IAuthService->AlternateAuthService"));
  assert.ok(programModule.semantic_tags.includes("di:lifetime:singleton:AuthService->AuthService"));
  assert.ok(programModule.risk_flags.includes(RISK.DEPENDENCY_INJECTION));
  assert.ok(programModule.risk_flags.includes(RISK.REFLECTION));
  assert.ok(graph.relations.some((relation) => relation.kind === "CONFIGURES"
    && relation.unresolved_target === "scoped:IAuthService->AuthService"
    && relation.risk_flags.includes(RISK.DEPENDENCY_INJECTION)));
  const ambiguousRegistrations = graph.relations.filter((relation) => relation.kind === "CONFIGURES"
    && relation.unresolved_target.startsWith("scoped:IAuthService->"));
  assert.equal(ambiguousRegistrations.length, 2);
  assert.ok(ambiguousRegistrations.every((relation) => relation.confidence !== "HIGH"
    && relation.dst_entity_id === null));
  const find = graph.entities.find((entity) => entity.name === "FindAsync");
  assert.ok(find.semantic_tags.includes("database:sp_get_user_by_id"));
  assert.ok(find.effects.includes("database_access"));
  assert.ok(find.risk_flags.includes(RISK.CROSS_LANGUAGE_BOUNDARY));
  assert.ok(graph.relations.some((relation) => relation.kind === "USES"
    && relation.unresolved_target === "sp_get_user_by_id"
    && relation.risk_flags.includes(RISK.CROSS_LANGUAGE_BOUNDARY)));
  assert.equal(graph.health.impact_completeness, "INCOMPLETE");
});

test("C# syntax errors fail closed", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "Broken.cs", "csharp", "public class Broken {");
  assert.equal(parsed.parse_status, "FAILED");
  assert.deepEqual(parsed.entities, []);
  assert.ok(parsed.risk_flags.includes(RISK.PARTIAL_PARSE));
});

test("JavaScript aliases resolve and dynamic constructs remain uncertain", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const dependency = await parse(project, "dep.js", "javascript", "export function run() {}\n");
  const caller = await parse(project, "caller.js", "javascript", `
import { run as go } from "./dep.js";
export function start() { go(); }
const selected = import(pluginName);
`);
  const graph = resolveGraph([dependency, caller]);
  const staticCall = graph.relations.find((relation) => relation.kind === "CALLS" && relation.unresolved_target === "go");
  assert.equal(staticCall.confidence, "HIGH");
  assert.match(staticCall.dst_entity_id, /dep\.run:function$/u);
  assert.ok(graph.health.risk_flags.includes(RISK.DYNAMIC_DISPATCH));
});

test("syntax errors fail closed without partial entities", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "broken.py", "python", "def login(\n");
  assert.equal(parsed.parse_status, "FAILED");
  assert.equal(parsed.entities.length, 0);
  assert.ok(parsed.risk_flags.includes(RISK.PARTIAL_PARSE));
});

test("Unicode paths and identifiers round-trip through parser output", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "mô_đun/用户.py", "python", "def xử_lý(用户: str) -> str:\n    return 用户\n");
  assert.equal(parsed.parse_status, "OK");
  const entity = parsed.entities.find((item) => item.name === "xử_lý");
  assert.equal(entity.source_location.file_path, "mô_đun/用户.py");
  assert.equal(entity.inputs[0].name, "用户");
});

test("parameters and local bindings never resolve as imported HIGH-confidence calls", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const callbackModule = await parse(project, "callback.py", "python", "def external():\n    pass\n");
  const caller = await parse(project, "caller.py", "python", `
import callback

def invoke(callback):
    callback()

def local_shadow():
    callback = lambda: None
    callback()
`);
  const graph = resolveGraph([callbackModule, caller]);
  const calls = graph.relations.filter((relation) => relation.kind === "CALLS");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((relation) => relation.confidence === "UNKNOWN"));
  assert.ok(calls.every((relation) => relation.dst_entity_id === null));
});

test("chained and virtual receiver calls are not silently resolved HIGH", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "controller.ts", "typescript", `
class Service { run(): void {} }
class Controller {
  run(): void {}
  start(): void { this.service.run(); }
}
`);
  const graph = resolveGraph([parsed]);
  const call = graph.relations.find((relation) => relation.unresolved_target === "this.service.run");
  assert.notEqual(call.confidence, "HIGH");
  assert.equal(call.dst_entity_id, null);
  assert.equal(call.candidates.length, 2);
});

test("bare imports do not resolve by unrelated qualified-name suffix", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const unrelated = await parse(project, "other/foo.py", "python", "def run():\n    pass\n");
  const caller = await parse(project, "caller.py", "python", "import foo\n");
  const graph = resolveGraph([unrelated, caller]);
  const imported = graph.relations.find((relation) => relation.kind === "IMPORTS");
  assert.notEqual(imported.confidence, "HIGH");
  assert.equal(imported.dst_entity_id, null);
});

test("parent-relative Python imports resolve to the parent package", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const dependency = await parse(project, "pkg/dep.py", "python", "def run():\n    pass\n");
  const caller = await parse(project, "pkg/sub/caller.py", "python", "from ..dep import run\n\ndef call():\n    run()\n");
  const graph = resolveGraph([dependency, caller]);
  const call = graph.relations.find((relation) => relation.kind === "CALLS");
  assert.equal(call.confidence, "HIGH");
  assert.match(call.dst_entity_id, /pkg\.dep\.run:function$/u);
});

test("heritage kinds and direct generic targets remain accurate", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "service.ts", "typescript", `
interface Runner<T> { run(value: T): void }
class Base {}
class Service extends Base implements Runner<string> { run(value: string): void {} }
`);
  const graph = resolveGraph([parsed]);
  const service = graph.entities.find((entity) => entity.name === "Service");
  const heritage = graph.relations.filter((relation) => relation.src_entity_id === service.stable_id);
  assert.ok(heritage.some((relation) => relation.kind === "INHERITS" && relation.unresolved_target === "Base"));
  assert.ok(heritage.some((relation) => relation.kind === "IMPLEMENTS" && relation.unresolved_target === "Runner"));
  assert.equal(heritage.some((relation) => relation.unresolved_target === "string"), false);
});

test("nested predicates and concise arrow calls are retained", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const python = await parse(project, "nested.py", "python", `
def target():
    pass

def guarded():
    if feature_enabled:
        if authorized:
            target()
`);
  const javascript = await parse(project, "arrow.js", "javascript", "function helper() {}\nconst run = () => helper();\n");
  const graph = resolveGraph([python, javascript]);
  const guardedCall = graph.relations.find((relation) => relation.src_entity_id.includes("guarded") && relation.kind === "CALLS");
  assert.equal(guardedCall.condition.expression, "(feature_enabled) AND (authorized)");
  assert.ok(graph.relations.some((relation) => relation.src_entity_id.includes("arrow.run")
    && relation.unresolved_target === "helper"));
});

test("entity and relation identities survive line-only movement", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const first = await parse(project, "move.py", "python", "def a():\n    b()\n\ndef b():\n    pass\n");
  const firstGraph = resolveGraph([first]);
  const firstCall = firstGraph.relations.find((relation) => relation.kind === "CALLS");
  const moved = await parse(project, "move.py", "python", "# comment\n\n\ndef a():\n    b()\n\ndef b():\n    pass\n");
  const movedGraph = resolveGraph([moved]);
  const movedCall = movedGraph.relations.find((relation) => relation.kind === "CALLS");
  assert.equal(movedCall.stable_id, firstCall.stable_id);
  assert.equal(movedGraph.entities.find((entity) => entity.name === "a").stable_id,
    firstGraph.entities.find((entity) => entity.name === "a").stable_id);
});

test("generated files expose their authoritative schema when declared in the header", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(
    project,
    "generated/client.py",
    "python",
    "# Generated from api/openapi.yaml - DO NOT EDIT\ndef request():\n    pass\n",
    "GENERATED",
  );
  const relation = parsed.relations.find((item) => item.kind === "DEPENDS_ON");
  assert.equal(relation.unresolved_target, "api/openapi.yaml");
  assert.ok(parsed.entities.every((entity) => entity.risk_flags.includes("GENERATED_CODE")));
});

test("dynamic dispatch, reflection, DI, and plugin registration never become false HIGH edges", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "dynamic.py", "python", `
def replacement():
    pass

def configure(module, container, registry, name):
    module.target = replacement
    getattr(module, name)()
    container.resolve(name)()
    registry.register(name, replacement)
`);
  const graph = resolveGraph([parsed]);
  assert.ok(graph.health.risk_flags.includes("DYNAMIC_DISPATCH"));
  assert.ok(graph.health.risk_flags.includes("REFLECTION"));
  assert.ok(graph.health.risk_flags.includes("DEPENDENCY_INJECTION"));
  assert.ok(graph.health.risk_flags.includes("RUNTIME_REGISTRATION"));
  const riskyCalls = graph.relations.filter((relation) => relation.kind === "CALLS" && relation.risk_flags.length > 0);
  assert.ok(riskyCalls.length >= 3);
  assert.ok(riskyCalls.every((relation) => relation.confidence !== "HIGH"));
  assert.equal(graph.health.impact_completeness, "INCOMPLETE");
});

test("function-local imports and whole-scope assignment shadowing prevent false HIGH calls", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const dependency = await parse(project, "dep.py", "python", "def target():\n    pass\n");
  const localDependency = await parse(project, "x.py", "python", "def run():\n    pass\n");
  const caller = await parse(project, "caller.py", "python", `
from dep import target

def shadowed():
    target()
    target = lambda: None

def owner():
    from x import run
    run()

def other():
    run()
`);
  const graph = resolveGraph([dependency, localDependency, caller]);
  const shadowed = graph.relations.find((relation) => relation.src_entity_id.includes("shadowed") && relation.kind === "CALLS");
  const owner = graph.relations.find((relation) => relation.src_entity_id.includes("owner") && relation.kind === "CALLS");
  const other = graph.relations.find((relation) => relation.src_entity_id.includes("other") && relation.kind === "CALLS");
  assert.equal(shadowed.confidence, "UNKNOWN");
  assert.equal(owner.confidence, "HIGH");
  assert.notEqual(other.confidence, "HIGH");
});

test("elif, else, and ternary paths preserve their full predicates", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const python = await parse(project, "branches.py", "python", `
def a(): pass
def b(): pass
def c(): pass
def choose(x, y):
    if x:
        a()
    elif y:
        b()
    else:
        c()
`);
  const javascript = await parse(project, "ternary.js", "javascript", "function a() {}\nfunction b() {}\nfunction choose(flag) { return flag ? a() : b(); }\n");
  const graph = resolveGraph([python, javascript]);
  const conditions = Object.fromEntries(graph.relations
    .filter((relation) => relation.kind === "CALLS")
    .map((relation) => [`${relation.source_location.file_path}:${relation.unresolved_target}`, relation.condition?.expression]));
  assert.equal(conditions["branches.py:a"], "x");
  assert.equal(conditions["branches.py:b"], "(NOT (x)) AND (y)");
  assert.equal(conditions["branches.py:c"], "(NOT (x)) AND (NOT (y))");
  assert.equal(conditions["ternary.js:a"], "flag");
  assert.equal(conditions["ternary.js:b"], "NOT (flag)");
});

test("duplicate decorated handlers retain distinct route destinations", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "routes.py", "python", `
@route("/a")
def handler():
    pass

@route("/b")
def handler():
    pass
`);
  const graph = resolveGraph([parsed]);
  const handlers = graph.entities.filter((entity) => entity.name === "handler");
  const routes = graph.relations.filter((relation) => relation.kind === "ROUTES_TO");
  assert.equal(new Set(handlers.map((entity) => entity.stable_id)).size, 2);
  assert.equal(new Set(routes.map((relation) => relation.dst_entity_id)).size, 2);
});

test("TypeScript emits every directly implemented interface", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "multi.ts", "typescript", "interface A {}\ninterface B {}\nclass Service implements A, B {}\n");
  const graph = resolveGraph([parsed]);
  const service = graph.entities.find((entity) => entity.name === "Service");
  const targets = graph.relations
    .filter((relation) => relation.src_entity_id === service.stable_id && relation.kind === "IMPLEMENTS")
    .map((relation) => relation.unresolved_target)
    .sort();
  assert.deepEqual(targets, ["A", "B"]);
});

test("resolution is pure, idempotent, and recovers after ambiguity is removed", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const dependency = await parse(project, "dep.py", "python", "def target():\n    pass\n");
  const duplicate = await parse(project, "dep/__init__.py", "python", "def target():\n    pass\n");
  const caller = await parse(project, "caller.py", "python", "from dep import target\n\ndef call():\n    target()\n");
  const originalCaller = structuredClone(caller);
  const unique = resolveGraph([dependency, caller]);
  assert.deepEqual(caller, originalCaller);
  const uniqueCall = unique.relations.find((relation) => relation.kind === "CALLS");
  assert.equal(uniqueCall.confidence, "HIGH");

  const ambiguous = resolveGraph([...unique.files, duplicate]);
  const ambiguousCall = ambiguous.relations.find((relation) => relation.kind === "CALLS");
  assert.equal(ambiguousCall.confidence, "MEDIUM");
  assert.ok(ambiguousCall.risk_flags.includes(RISK.AMBIGUOUS_SYMBOL));
  assert.equal(ambiguousCall.risk_flags.includes(RISK.DYNAMIC_DISPATCH), false);

  const withoutDuplicate = ambiguous.files.filter((file) => file.path !== "dep/__init__.py");
  const beforeRecovery = structuredClone(withoutDuplicate);
  const recovered = resolveGraph(withoutDuplicate);
  assert.deepEqual(withoutDuplicate, beforeRecovery);
  const recoveredCall = recovered.relations.find((relation) => relation.kind === "CALLS");
  assert.equal(recoveredCall.confidence, "HIGH");
  assert.match(recoveredCall.dst_entity_id, /dep\.target:function$/u);
  assert.equal(recoveredCall.risk_flags.includes(RISK.AMBIGUOUS_SYMBOL), false);

  const conditional = await parse(project, "conditional.py", "python", `
if feature_flag:
    from dep import target

def invoke():
    target()
`);
  const first = resolveGraph([dependency, conditional]);
  const second = resolveGraph(first.files);
  const firstCall = first.relations.find((relation) => relation.kind === "CALLS");
  const secondCall = second.relations.find((relation) => relation.kind === "CALLS");
  assert.equal(firstCall.condition.expression, "feature_flag");
  assert.equal(secondCall.condition.expression, "feature_flag");
  assert.equal(secondCall.stable_id, firstCall.stable_id);
  assert.equal(second.files.find((file) => file.path === "conditional.py").semantic_hash,
    first.files.find((file) => file.path === "conditional.py").semantic_hash);
});

test("anonymous callback bodies fail closed instead of becoming enclosing HIGH calls", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "callbacks.js", "javascript", `
function target() {}
function consume(callback) {}
function setup() { consume(() => target()); }
`);
  const graph = resolveGraph([parsed]);
  const setup = graph.entities.find((entity) => entity.name === "setup");
  const calls = graph.relations.filter((relation) => relation.src_entity_id === setup.stable_id
    && relation.kind === "CALLS");
  assert.deepEqual(calls.map((relation) => relation.unresolved_target), ["consume"]);
  assert.ok(setup.risk_flags.includes(RISK.UNSUPPORTED_SEMANTICS));
  assert.equal(graph.health.impact_completeness, "INCOMPLETE");
});

test("Python class imports and local binding targets never create false imported HIGH calls", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const dependency = await parse(project, "dep.py", "python", "def target():\n    pass\n\ndef run():\n    pass\n");
  const classImport = await parse(project, "class_import.py", "python", `
class C:
    from dep import run
    def method(self):
        run()
`);
  const sourceOrder = await parse(project, "source_order.py", "python", `
from dep import target

def target():
    pass

def module_binding():
    target()
`);
  const bindings = await parse(project, "bindings.py", "python", `
from dep import target

def nested_binding():
    def target():
        pass
    target()

def loop_binding(items):
    for target in items:
        target()

def context_binding(manager):
    with manager as target:
        target()
`);
  const graph = resolveGraph([dependency, classImport, sourceOrder, bindings]);
  const riskyCalls = graph.relations.filter((relation) => relation.kind === "CALLS"
    && ["run", "target"].includes(relation.unresolved_target));
  assert.equal(riskyCalls.length, 5);
  assert.ok(riskyCalls.every((relation) => relation.confidence !== "HIGH"));
  assert.ok(riskyCalls.every((relation) => relation.dst_entity_id === null));
});

test("Python wildcard imports are explicit unsupported bindings that block bare HIGH calls", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const dependency = await parse(project, "dep.py", "python", "def target():\n    pass\n");
  const caller = await parse(project, "caller.py", "python", `
def target():
    pass
from dep import *
def call():
    target()
`);
  assert.equal(caller.imports["*"][0].target, "dep.*");
  const graph = resolveGraph([dependency, caller]);
  const call = graph.relations.find((relation) => relation.kind === "CALLS");
  assert.notEqual(call.confidence, "HIGH");
  assert.equal(call.dst_entity_id, null);
  assert.ok(call.risk_flags.includes(RISK.UNSUPPORTED_SEMANTICS));
});

test("lexically nested functions cannot resolve as imported object members", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const dependency = await parse(project, "dep.py", "python", `
def factory():
    def run():
        pass
    return None
`);
  const caller = await parse(project, "caller.py", "python", "from dep import factory\n\ndef call():\n    factory.run()\n");
  const graph = resolveGraph([dependency, caller]);
  const call = graph.relations.find((relation) => relation.kind === "CALLS");
  assert.notEqual(call.confidence, "HIGH");
  assert.equal(call.dst_entity_id, null);
  assert.ok(call.risk_flags.includes(RISK.UNSUPPORTED_SEMANTICS));
});

test("short-circuit and declaration availability conditions block unconditional HIGH calls", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const python = await parse(project, "conditions.py", "python", `
def target():
    pass
def choose(enabled):
    enabled and target()
    enabled or target()
if choice:
    def conditional_target():
        pass
def invoke():
    conditional_target()
`);
  const javascript = await parse(project, "conditions.js", "javascript", `
function target() {}
function choose(enabled) { enabled && target(); enabled || target(); }
`);
  const graph = resolveGraph([python, javascript]);
  const conditions = graph.relations
    .filter((relation) => relation.kind === "CALLS" && relation.unresolved_target === "target")
    .map((relation) => relation.condition?.expression)
    .sort();
  assert.deepEqual(conditions, ["NOT (enabled)", "NOT (enabled)", "enabled", "enabled"]);
  const conditionalCall = graph.relations.find((relation) => relation.unresolved_target === "conditional_target");
  assert.notEqual(conditionalCall.confidence, "HIGH");
  assert.equal(conditionalCall.dst_entity_id, null);
  assert.equal(conditionalCall.condition.expression, "choice");
  assert.ok(conditionalCall.risk_flags.includes(RISK.CONDITIONAL_COMPILATION));
});

test("Go build constraints condition every extracted semantic object", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "platform/linux.go", "go", `//go:build linux && amd64

package platform
func Start() {}
`);
  const graph = resolveGraph([parsed]);
  assert.ok(graph.entities.every((entity) => entity.conditions[0]?.expression === "linux && amd64"));
  assert.ok(graph.entities.every((entity) => entity.risk_flags.includes(RISK.CONDITIONAL_COMPILATION)));
  assert.ok(graph.health.risk_flags.includes(RISK.CONDITIONAL_COMPILATION));
  assert.equal(graph.health.impact_completeness, "INCOMPLETE");
});

test("name-only route and effect heuristics fail closed", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "heuristics.py", "python", `
def route(fn):
    return fn
@route
def helper():
    pass
def main():
    pass
def fetch():
    return 1
def caller():
    return fetch()
`);
  const graph = resolveGraph([parsed]);
  const routes = graph.relations.filter((relation) => relation.kind === "ROUTES_TO");
  assert.equal(routes.length, 2);
  assert.ok(routes.every((relation) => relation.confidence === "LOW"));
  assert.ok(routes.every((relation) => relation.risk_flags.includes(RISK.UNSUPPORTED_SEMANTICS)));
  assert.deepEqual(graph.entities.find((entity) => entity.name === "caller").effects, []);
});

test("JavaScript and Java constructors are disclosed as unsupported creation edges", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const javascript = await parse(project, "construct.js", "javascript", `
class JsWorker {}
function make() { return new JsWorker(); }
`);
  const java = await parse(project, "Construct.java", "java", `
class JavaWorker {}
class Construct { JavaWorker make() { return new JavaWorker(); } }
`);
  const graph = resolveGraph([javascript, java]);
  const creations = graph.relations.filter((relation) => relation.kind === "CREATES");
  assert.equal(creations.length, 2);
  assert.ok(creations.every((relation) => relation.confidence !== "HIGH"));
  assert.ok(creations.every((relation) => relation.dst_entity_id === null));
  assert.ok(creations.every((relation) => relation.risk_flags.includes(RISK.UNSUPPORTED_SEMANTICS)));
});

test("conditional import locations do not affect semantic hashes", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const first = await parse(project, "caller.py", "python", "if choice:\n    from dep import target\n");
  const moved = await parse(project, "caller.py", "python", "# moved\n\nif choice:\n    from dep import target\n");
  assert.equal(moved.semantic_hash, first.semantic_hash);
});

test("enclosing assignments and closure parameters block false HIGH calls", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const dependency = await parse(project, "dep.py", "python", "def target():\n    pass\n");
  const python = await parse(project, "bindings.py", "python", `
from dep import target
def replacement(): pass
target = replacement
def caller(): target()
def outer(target):
    def inner(): target()
class Outer:
    class Target: pass
    def caller(self): Target()
`);
  const javascript = await parse(project, "bindings.js", "javascript", `
function target() {}
function outer(target) { function inner() { target(); } }
`);
  const go = await parse(project, "bindings.go", "go", `
package bindings
func target() {}
func replacement() {}
func caller() { var target = replacement; target() }
`);
  const graph = resolveGraph([dependency, python, javascript, go]);
  const calls = graph.relations.filter((relation) => relation.kind === "CALLS"
    && ["target", "Target"].includes(relation.unresolved_target));
  assert.equal(calls.length, 5);
  assert.ok(calls.every((relation) => relation.confidence !== "HIGH"));
  assert.ok(calls.every((relation) => relation.dst_entity_id === null));
  assert.equal(graph.health.impact_completeness, "INCOMPLETE");
});

test("predicate, decorator, and default calls are explicit uncertain dependencies", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const parsed = await parse(project, "executed.py", "python", `
def target(): return 1
def authorize(): return True
def deco(value):
    def apply(fn): return fn
    return apply
@deco(target())
def decorated(): pass
def defaulted(value=target()): pass
if authorize():
    target()
`);
  const graph = resolveGraph([parsed]);
  const uncertain = graph.relations.filter((relation) => relation.kind === "CALLS"
    && ["target", "authorize", "deco"].includes(relation.unresolved_target));
  assert.ok(uncertain.some((relation) => relation.unresolved_target === "authorize"));
  assert.ok(uncertain.filter((relation) => relation.unresolved_target === "target").length >= 3);
  assert.ok(uncertain.filter((relation) => relation.risk_flags.includes(RISK.UNSUPPORTED_SEMANTICS)).length >= 4);
  assert.ok(uncertain.filter((relation) => relation.risk_flags.includes(RISK.UNSUPPORTED_SEMANTICS))
    .every((relation) => relation.confidence !== "HIGH"));
  assert.equal(graph.health.impact_completeness, "INCOMPLETE");
});

test("resolver-added condition chains remain stable across repeated resolution", async (t) => {
  const project = await temporaryProject();
  t.after(() => project.cleanup());
  const dependency = await parse(project, "dep.py", "python", `
if target_available:
    def target(): pass
`);
  const caller = await parse(project, "caller.py", "python", `
if import_enabled:
    from dep import target
def caller():
    if call_enabled:
        target()
`);
  const first = resolveGraph([dependency, caller]);
  const second = resolveGraph(first.files);
  const third = resolveGraph(second.files);
  const calls = [first, second, third].map((graph) => (
    graph.relations.find((relation) => relation.kind === "CALLS")
  ));
  assert.equal(calls[1].condition.expression, calls[0].condition.expression);
  assert.equal(calls[2].condition.expression, calls[0].condition.expression);
  assert.equal(calls[1].stable_id, calls[0].stable_id);
  assert.equal(calls[2].stable_id, calls[0].stable_id);
  assert.equal(second.files[1].semantic_hash, first.files[1].semantic_hash);
  assert.equal(third.files[1].semantic_hash, first.files[1].semantic_hash);
});

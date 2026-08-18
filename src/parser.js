import { Language, Parser } from "web-tree-sitter";
import {
  CLASSIFICATION,
  CONFIDENCE,
  RISK,
} from "./constants.js";
import { loadAsset } from "./assets.js";
import { readFileNoFollow } from "./fs-safe.js";
import {
  createEntity,
  createRelation,
  hashBytes,
  makeCondition,
  moduleNameForPath,
  normalizeSemanticText,
  regionIdForPath,
  semanticHash,
  sourceLocation,
  uniqueSorted,
} from "./ir.js";

const LANGUAGE_ASSET = Object.freeze({
  python: "tree-sitter-python.wasm",
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  java: "tree-sitter-java.wasm",
  go: "tree-sitter-go.wasm",
  csharp: "tree-sitter-c-sharp.wasm",
});

let initialization;
const languages = new Map();

async function initializeParserRuntime() {
  initialization ??= loadAsset("tree-sitter.wasm")
    .then((wasmBinary) => Parser.init({ wasmBinary }));
  await initialization;
}

async function languageFor(name) {
  await initializeParserRuntime();
  if (!languages.has(name)) {
    const asset = LANGUAGE_ASSET[name];
    if (!asset) throw new Error(`Unsupported language: ${name}`);
    languages.set(name, Language.load(await loadAsset(asset)));
  }
  return languages.get(name);
}

function stripQuotes(value) {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"'))
      || (text.startsWith("'") && text.endsWith("'"))
      || (text.startsWith("`") && text.endsWith("`"))) {
    return text.slice(1, -1);
  }
  return text;
}

function firstDescendant(node, types) {
  if (!node) return null;
  if (types.has(node.type)) return node;
  for (const child of node.namedChildren) {
    const result = firstDescendant(child, types);
    if (result) return result;
  }
  return null;
}

function descendants(node, type, output = []) {
  if (!node) return output;
  if (node.type === type) output.push(node);
  for (const child of node.namedChildren) descendants(child, type, output);
  return output;
}

function textBeforeBody(node, body) {
  if (!body) return node.text;
  const relativeEnd = body.startIndex - node.startIndex;
  return node.text.slice(0, Math.max(0, relativeEnd));
}

function parameterName(node) {
  return node.childForFieldName("name")?.text
    ?? node.childForFieldName("pattern")?.text
    ?? firstDescendant(node, new Set(["identifier", "field_identifier"]))?.text
    ?? node.text;
}

function parameterType(node) {
  const type = node.childForFieldName("type");
  return type ? normalizeSemanticText(type.text.replace(/^:\s*/u, "")) : null;
}

function parameterDefault(node) {
  const defaultNode = node.childForFieldName("default")
    ?? node.namedChildren.find((child) => child.type === "equals_value_clause");
  const value = node.childForFieldName("value")
    ?? defaultNode?.childForFieldName("value")
    ?? defaultNode?.namedChildren.at(-1)
    ?? defaultNode;
  return value ? normalizeSemanticText(value.text) : null;
}

function parseInputs(parameters) {
  if (!parameters) return [];
  const wrapperTypes = new Set([
    "default_parameter",
    "typed_parameter",
    "typed_default_parameter",
    "list_splat_pattern",
    "dictionary_splat_pattern",
    "required_parameter",
    "optional_parameter",
    "rest_pattern",
    "formal_parameter",
    "spread_parameter",
    "receiver_parameter",
    "parameter_declaration",
    "variadic_parameter_declaration",
    "parameter",
  ]);
  const inputs = [];
  for (const child of parameters.namedChildren) {
    if (child.type === "identifier") {
      inputs.push({ name: child.text, type: null, optional: false, default: null });
      continue;
    }
    if (!wrapperTypes.has(child.type)) continue;
    const names = child.type === "parameter_declaration"
      ? child.namedChildren.filter((part) => part.type === "identifier")
      : [];
    if (names.length > 1) {
      for (const name of names) {
        inputs.push({ name: name.text, type: parameterType(child), optional: false, default: null });
      }
      continue;
    }
    const defaultValue = parameterDefault(child);
    inputs.push({
      name: parameterName(child),
      type: parameterType(child),
      optional: child.type.includes("optional") || defaultValue !== null,
      default: defaultValue,
    });
  }
  return inputs;
}

function parseOutputs(declaration) {
  const output = declaration.childForFieldName("return_type")
    ?? declaration.childForFieldName("result")
    ?? declaration.childForFieldName("returns")
    ?? (declaration.type === "method_declaration" ? declaration.childForFieldName("type") : null);
  if (!output) return [];
  return [{ type: normalizeSemanticText(output.text.replace(/^:\s*/u, "")), condition: null }];
}

function parameterTypes(parameters) {
  if (!parameters) return "";
  return parameters.namedChildren
    .map((parameter) => parameterType(parameter) ?? "?")
    .join(",");
}

function receiverType(receiver) {
  if (!receiver) return null;
  const type = receiver.childForFieldName("type")
    ?? firstDescendant(receiver, new Set(["type_identifier"]));
  return type ? type.text.replace(/^\*/u, "") : null;
}

function declarationInfo(language, node, scope, namespace) {
  const nameNode = node.childForFieldName("name");
  const parameters = node.childForFieldName("parameters");
  let body = node.childForFieldName("body");
  let kind;
  let name;
  let identityName;
  let identitySuffix = "";
  let effectiveScope = scope;

  if (language === "python") {
    if (node.type === "class_definition") kind = "class";
    else if (node.type === "function_definition") {
      kind = ["class", "interface"].includes(scope.at(-1)?.kind) ? "method" : "function";
    }
    else return null;
    name = nameNode?.text;
  } else if (language === "javascript" || language === "typescript" || language === "tsx") {
    const kindByType = {
      class_declaration: "class",
      abstract_class_declaration: "class",
      interface_declaration: "interface",
      function_declaration: "function",
      generator_function_declaration: "function",
      method_definition: "method",
      method_signature: "method",
    };
    kind = kindByType[node.type];
    name = nameNode?.text;
    if (!kind && node.type === "variable_declarator") {
      const value = node.childForFieldName("value");
      if (value && ["arrow_function", "function_expression", "generator_function"].includes(value.type)) {
        kind = "function";
        name = node.childForFieldName("name")?.text;
        return {
          kind,
          name,
          body: value.childForFieldName("body") ?? value,
          signatureNode: value,
          parameters: value.childForFieldName("parameters"),
          outputs: parseOutputs(value),
          qualifiedName: [namespace, ...scope.map((part) => part.name), name].filter(Boolean).join("."),
        };
      }
    }
    if (!kind) return null;
    if (["typescript", "tsx"].includes(language)
        && ["method_definition", "method_signature"].includes(node.type)) {
      identitySuffix = `(${parameterTypes(parameters)})`;
    }
  } else if (language === "java") {
    const kindByType = {
      class_declaration: "class",
      record_declaration: "record",
      enum_declaration: "enum",
      interface_declaration: "interface",
      method_declaration: "method",
      constructor_declaration: "method",
    };
    kind = kindByType[node.type];
    name = nameNode?.text;
    if (!kind) return null;
    if (kind === "method") identitySuffix = `(${parameterTypes(parameters)})`;
  } else if (language === "go") {
    if (node.type === "function_declaration") {
      kind = "function";
      name = nameNode?.text;
    } else if (node.type === "method_declaration") {
      kind = "method";
      name = nameNode?.text;
      const receiver = receiverType(node.childForFieldName("receiver"));
      effectiveScope = receiver ? [{ name: receiver, kind: "class" }] : scope;
    } else if (node.type === "type_spec") {
      const type = node.childForFieldName("type");
      if (type?.type === "interface_type") kind = "interface";
      else if (type?.type === "struct_type") kind = "class";
      else return null;
      name = nameNode?.text;
      body = type;
    } else {
      return null;
    }
  } else if (language === "csharp") {
    const kindByType = {
      class_declaration: "class",
      record_declaration: "record",
      struct_declaration: "struct",
      enum_declaration: "enum",
      interface_declaration: "interface",
      method_declaration: "method",
      constructor_declaration: "method",
    };
    kind = kindByType[node.type];
    name = nameNode?.text;
    if (!kind) return null;
    if (kind === "method") {
      identitySuffix = `(${parameterTypes(parameters)})`;
      if (node.type === "constructor_declaration") {
        identityName = name;
        name = ".ctor";
      }
    }
  }

  if (!name) return null;
  const scopedName = [
    ...effectiveScope.map((part) => part.name),
    `${identityName ?? name}${identitySuffix}`,
  ]
    .filter(Boolean)
    .join(".");
  return {
    kind,
    name,
    body,
    signatureNode: node,
    parameters,
    outputs: parseOutputs(node),
    qualifiedName: namespace ? `${namespace}.${scopedName}` : scopedName,
  };
}

function namespaceFor(language, root, path) {
  if (language === "java") {
    const packageDeclaration = root.namedChildren.find((child) => child.type === "package_declaration");
    const packageName = packageDeclaration?.namedChildren.at(-1)?.text;
    if (packageName) return packageName;
  }
  if (language === "go") {
    const packageClause = root.namedChildren.find((child) => child.type === "package_clause");
    const packageName = packageClause?.namedChildren.at(-1)?.text;
    if (packageName) return packageName;
  }
  if (language === "csharp") {
    const declaration = root.namedChildren.find((child) => (
      ["file_scoped_namespace_declaration", "namespace_declaration"].includes(child.type)
    ));
    const namespaceName = declaration?.childForFieldName("name")?.text;
    if (namespaceName) return namespaceName;
  }
  return moduleNameForPath(path);
}

function csharpAttributes(node) {
  if (!node) return [];
  return node.namedChildren
    .filter((child) => child.type === "attribute_list")
    .flatMap((list) => descendants(list, "attribute"))
    .map((attribute) => {
      const rawName = attribute.childForFieldName("name")?.text
        ?? attribute.namedChildren[0]?.text
        ?? "";
      const name = rawName.split(".").at(-1).replace(/Attribute$/u, "");
      const argumentsNode = attribute.namedChildren.find((child) => child.type === "attribute_argument_list");
      const staticString = firstDescendant(argumentsNode, new Set(["string_literal"]));
      return {
        name,
        arguments: argumentsNode
          ? normalizeSemanticText(argumentsNode.text.slice(1, -1))
          : null,
        staticString: staticString ? stripQuotes(staticString.text) : null,
      };
    })
    .filter((attribute) => attribute.name);
}

function normalizedHttpRoute(classTemplate, methodTemplate, controllerName) {
  const replaceController = (value) => value.replace(
    /\[controller\]/giu,
    controllerName?.replace(/Controller$/u, "") ?? "[controller]",
  );
  if (methodTemplate?.startsWith("/")) return replaceController(methodTemplate);
  const parts = [classTemplate, methodTemplate]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => replaceController(value).replace(/^\/+|\/+$/gu, ""));
  return `/${parts.join("/")}`.replace(/\/{2,}/gu, "/");
}

function csharpSemanticMetadata(node, declaration, parent = {}) {
  const attributes = csharpAttributes(node);
  const tags = attributes.map((attribute) => `attribute:${attribute.name}${
    attribute.arguments === null ? "" : `(${attribute.arguments})`
  }`);
  const route = attributes.find((attribute) => attribute.name === "Route")?.staticString
    ?? parent.routeTemplate
    ?? null;
  const controllerName = ["class", "record", "struct", "interface"].includes(declaration.kind)
    ? declaration.name
    : parent.controllerName;
  const explicitAnonymous = attributes.some((attribute) => attribute.name === "AllowAnonymous");
  const explicitRequired = attributes.some((attribute) => attribute.name === "Authorize");
  const auth = explicitAnonymous ? "anonymous" : (explicitRequired ? "required" : parent.auth ?? null);
  if (route) tags.push(`route:template:${route}`);
  if (auth) tags.push(`auth:${auth}`);

  const verbs = new Map([
    ["HttpGet", "GET"],
    ["HttpPost", "POST"],
    ["HttpPut", "PUT"],
    ["HttpPatch", "PATCH"],
    ["HttpDelete", "DELETE"],
  ]);
  for (const attribute of attributes) {
    const verb = verbs.get(attribute.name);
    if (!verb) continue;
    tags.push("entry_point:http", `http:${verb.toLowerCase()}`);
    tags.push(`route:http:${verb} ${normalizedHttpRoute(
      parent.routeTemplate,
      attribute.staticString,
      controllerName,
    )}`);
  }
  return { tags: uniqueSorted(tags), routeTemplate: route, controllerName, auth };
}

function tagsForDeclaration(language, info, decorators, node) {
  const tags = [];
  const decoratorText = decorators.join(" ");
  if (/\b(route|get|post|put|patch|delete|requestmapping|controller)\b/iu.test(decoratorText)) tags.push("entry_point:http");
  if (/\b(command|cli)\b/iu.test(decoratorText) || /^(main|cli)$/iu.test(info.name)) tags.push("entry_point:cli");
  if (/\b(subscribe|listener|consumer|eventhandler)\b/iu.test(decoratorText)) tags.push("entry_point:event");
  if (/\b(schedule|cron|job)\b/iu.test(decoratorText)) tags.push("entry_point:scheduled");
  if (/\b(export|public)\b/u.test(node.text.slice(0, 100))) tags.push("public");
  if (language === "go" && /^[A-Z]/u.test(info.name)) tags.push("public");
  return tags;
}

function dynamicRisks(target, node) {
  const risks = [];
  const lower = `${target} ${node.text}`.toLowerCase();
  if (/\b(getattr|setattr|hasattr|eval|class\.forname|getmethod|getproperty|bindingflags|custompropertytypemap|settypemap|reflect|typeof)\b/u.test(lower)) risks.push(RISK.REFLECTION);
  if (/\b(__import__|import_module|dynamic import|import\s*\()/u.test(lower)) risks.push(RISK.DYNAMIC_DISPATCH);
  if (/\b(container|inject|provider|dependency|service_locator)\b/u.test(lower)) risks.push(RISK.DEPENDENCY_INJECTION);
  if (/\b(register|registry|plugin|entry_point)\b/u.test(lower)) risks.push(RISK.RUNTIME_REGISTRATION);
  if (/\b(grpc|rpc|ffi|jni|native|extern)\b/u.test(lower)) risks.push(RISK.CROSS_LANGUAGE_BOUNDARY);
  return uniqueSorted(risks);
}

function callTarget(language, node) {
  if (language === "python" && node.type === "call") return node.childForFieldName("function")?.text ?? null;
  if (["javascript", "typescript", "tsx", "go"].includes(language) && node.type === "call_expression") {
    return node.childForFieldName("function")?.text ?? null;
  }
  if (language === "java" && node.type === "method_invocation") {
    const object = node.childForFieldName("object")?.text;
    const name = node.childForFieldName("name")?.text;
    return [object, name].filter(Boolean).join(".") || null;
  }
  if (language === "csharp" && node.type === "invocation_expression") {
    return node.childForFieldName("function")?.text ?? null;
  }
  return null;
}

function isCallNode(language, node) {
  return (language === "python" && node.type === "call")
    || (["javascript", "typescript", "tsx", "go"].includes(language) && node.type === "call_expression")
    || (language === "java" && node.type === "method_invocation")
    || (language === "csharp" && node.type === "invocation_expression");
}

function constructorTarget(language, node) {
  if (["javascript", "typescript", "tsx"].includes(language) && node.type === "new_expression") {
    return node.childForFieldName("constructor")?.text
      ?? node.namedChildren.find((child) => child.type !== "arguments")?.text
      ?? null;
  }
  if (language === "java" && node.type === "object_creation_expression") {
    return node.childForFieldName("type")?.text ?? null;
  }
  if (language === "csharp" && node.type === "object_creation_expression") {
    return node.childForFieldName("type")?.text ?? null;
  }
  return null;
}

function isAnonymousCallable(language, node) {
  if (language === "python") return node.type === "lambda";
  if (["javascript", "typescript", "tsx"].includes(language)) {
    return ["arrow_function", "function_expression", "generator_function"].includes(node.type)
      || (["function_declaration", "generator_function_declaration"].includes(node.type)
        && !node.childForFieldName("name"));
  }
  if (language === "java") return node.type === "lambda_expression";
  if (language === "go") return node.type === "func_literal";
  if (language === "csharp") return ["lambda_expression", "anonymous_method_expression"].includes(node.type);
  return false;
}

function conditionParts(node) {
  if (["if_statement", "elif_clause", "conditional_expression", "ternary_expression"].includes(node.type)) {
    return {
      condition: node.childForFieldName("condition"),
      consequence: node.childForFieldName("consequence"),
      alternatives: node.childrenForFieldName("alternative"),
    };
  }
  return null;
}

function shortCircuitParts(language, node) {
  const supported = (language === "python" && node.type === "boolean_operator")
    || (["javascript", "typescript", "tsx", "csharp"].includes(language) && node.type === "binary_expression");
  if (!supported) return null;
  const left = node.childForFieldName("left");
  const right = node.childForFieldName("right");
  if (!left || !right) return null;
  const operator = node.text.slice(
    left.endIndex - node.startIndex,
    right.startIndex - node.startIndex,
  ).trim();
  if (!["and", "or", "&&", "||"].includes(operator)) return null;
  return { left, right, negate: operator === "or" || operator === "||" };
}

function isNestedDeclaration(language, node) {
  if (language === "python") return ["function_definition", "class_definition"].includes(node.type);
  if (["javascript", "typescript", "tsx"].includes(language)) {
    return [
      "function_declaration",
      "generator_function_declaration",
      "class_declaration",
      "interface_declaration",
      "method_definition",
      "method_signature",
      "arrow_function",
      "function_expression",
    ].includes(node.type);
  }
  if (language === "java") {
    return [
      "class_declaration",
      "record_declaration",
      "enum_declaration",
      "interface_declaration",
      "method_declaration",
      "constructor_declaration",
    ].includes(node.type);
  }
  if (language === "go") return ["function_declaration", "method_declaration", "type_spec"].includes(node.type);
  if (language === "csharp") {
    return [
      "class_declaration",
      "record_declaration",
      "struct_declaration",
      "enum_declaration",
      "interface_declaration",
      "method_declaration",
      "constructor_declaration",
    ].includes(node.type);
  }
  return false;
}

function collectBindingIdentifiers(node, output) {
  if (!node) return;
  if (["identifier", "shorthand_property_identifier_pattern"].includes(node.type)) {
    output.add(node.text);
    return;
  }
  if ([
    "attribute",
    "subscript",
    "member_expression",
    "selector_expression",
    "field_expression",
  ].includes(node.type)) return;
  for (const child of node.namedChildren) collectBindingIdentifiers(child, output);
}

function parameterBindingNames(parameters) {
  const output = new Set();
  for (const parameter of parameters?.namedChildren ?? []) {
    const target = parameter.childForFieldName("name")
      ?? parameter.childForFieldName("pattern")
      ?? (["identifier", "object_pattern", "array_pattern"].includes(parameter.type) ? parameter : null);
    collectBindingIdentifiers(target, output);
  }
  return output;
}

function bindingTarget(node) {
  if ([
    "assignment",
    "assignment_expression",
    "named_expression",
    "variable_declarator",
    "short_var_declaration",
    "range_clause",
  ].includes(node.type)) {
    return node.childForFieldName("left")
      ?? node.childForFieldName("name")
      ?? node.childForFieldName("target");
  }
  if (["for_statement", "for_in_clause"].includes(node.type)) {
    return node.childForFieldName("left") ?? node.childForFieldName("pattern");
  }
  if (["with_item", "except_clause"].includes(node.type)) {
    return node.childForFieldName("alias") ?? node.childForFieldName("name");
  }
  if (node.type === "catch_clause") return node.childForFieldName("parameter");
  if (["capture_pattern", "as_pattern"].includes(node.type)) {
    return node.childForFieldName("alias") ?? node.childForFieldName("name") ?? node;
  }
  return null;
}

function collectLocalBindings(
  node,
  language,
  output = new Set(),
  root = true,
  includeDeclarations = true,
) {
  if (!node) return output;
  if (!root && isNestedDeclaration(language, node)) {
    if (includeDeclarations) collectBindingIdentifiers(node.childForFieldName("name"), output);
    return output;
  }
  if (["var_spec", "const_spec"].includes(node.type)) {
    for (const name of node.childrenForFieldName("name")) collectBindingIdentifiers(name, output);
  }
  collectBindingIdentifiers(bindingTarget(node), output);
  for (const child of node.namedChildren) {
    collectLocalBindings(child, language, output, false, includeDeclarations);
  }
  return output;
}

function importInfo(language, node, namespace, path) {
  const imports = [];
  if (language === "python" && node.type === "import_statement") {
    for (const child of node.namedChildren) {
      const nameNode = child.childForFieldName("name") ?? child;
      const aliasNode = child.childForFieldName("alias");
      const target = nameNode.text;
      imports.push({ alias: aliasNode?.text ?? target.split(".")[0], target, typeOnly: false });
    }
  } else if (language === "python" && node.type === "import_from_statement") {
    const moduleNode = node.childForFieldName("module_name");
    const rawModule = node.text.match(/^from\s+([^\s]+)\s+import\b/u)?.[1]
      ?? moduleNode?.text
      ?? "";
    const leadingDots = rawModule.match(/^\.+/u)?.[0].length ?? 0;
    const moduleRemainder = rawModule.slice(leadingDots);
    const packageParts = path.split("/").slice(0, -1);
    const retainedParts = leadingDots > 0
      ? packageParts.slice(0, Math.max(0, packageParts.length - (leadingDots - 1)))
      : [];
    const module = leadingDots > 0
      ? [...retainedParts, ...moduleRemainder.split(".").filter(Boolean)].join(".")
      : moduleRemainder;
    if (node.namedChildren.some((child) => child.type === "wildcard_import")) {
      imports.push({
        alias: "*",
        target: `${module}.*`.replace(/^\./u, ""),
        typeOnly: false,
        wildcard: true,
      });
      return imports;
    }
    const imported = node.childrenForFieldName("name");
    const names = imported.length > 0
      ? imported
      : node.namedChildren.filter((child) => child !== moduleNode && child.type !== "wildcard_import");
    for (const child of names) {
      const nameNode = child.childForFieldName("name") ?? child;
      const aliasNode = child.childForFieldName("alias");
      const name = nameNode.text;
      imports.push({
        alias: aliasNode?.text ?? name,
        target: `${module}.${name}`.replace(/^\./u, ""),
        typeOnly: false,
        wildcard: false,
      });
    }
  } else if (["javascript", "typescript", "tsx"].includes(language) && node.type === "import_statement") {
    const source = stripQuotes(node.childForFieldName("source")?.text ?? "");
    const typeOnly = /^import\s+type\b/u.test(node.text);
    const specifiers = descendants(node, "import_specifier");
    for (const specifier of specifiers) {
      const name = specifier.childForFieldName("name")?.text;
      const alias = specifier.childForFieldName("alias")?.text ?? name;
      if (name) imports.push({ alias, target: `${source}.${name}`, typeOnly });
    }
    const clause = node.namedChildren.find((child) => child.type === "import_clause");
    const defaultName = clause?.namedChildren.find((child) => child.type === "identifier");
    if (defaultName) imports.push({ alias: defaultName.text, target: source, typeOnly });
    if (imports.length === 0 && source) imports.push({ alias: source, target: source, typeOnly });
  } else if (language === "java" && node.type === "import_declaration") {
    const target = node.namedChildren.find((child) => child.type.includes("identifier"))?.text;
    if (target) imports.push({ alias: target.split(".").at(-1), target, typeOnly: false });
  } else if (language === "go" && node.type === "import_spec") {
    const target = stripQuotes(node.childForFieldName("path")?.text ?? "");
    const alias = node.childForFieldName("name")?.text ?? target.split("/").at(-1);
    if (target) imports.push({ alias, target, typeOnly: false });
  } else if (language === "csharp" && node.type === "using_directive") {
    const aliasNode = node.childForFieldName("name");
    const targetNode = node.namedChildren.findLast((child) => (
      ["identifier", "qualified_name", "generic_name", "alias_qualified_name"].includes(child.type)
    ));
    const target = targetNode?.text ?? "";
    if (target) {
      imports.push({
        alias: aliasNode?.text ?? "@namespace",
        target,
        typeOnly: false,
        namespace: !aliasNode,
      });
    }
  }
  return imports;
}

function importNode(language, node) {
  return (language === "python" && ["import_statement", "import_from_statement"].includes(node.type))
    || (["javascript", "typescript", "tsx"].includes(language) && node.type === "import_statement")
    || (language === "java" && node.type === "import_declaration")
    || (language === "go" && node.type === "import_spec")
    || (language === "csharp" && node.type === "using_directive");
}

function directTypeName(node) {
  if (!node) return null;
  return node.childForFieldName("name")?.text
    ?? node.namedChildren.find((child) => ["identifier", "type_identifier"].includes(child.type))?.text
    ?? (["identifier", "type_identifier"].includes(node.type) ? node.text : null);
}

function inheritanceTargets(language, node) {
  const targets = [];
  if (language === "python" && node.type === "class_definition") {
    const superclasses = node.childForFieldName("superclasses");
    if (superclasses) {
      targets.push(...superclasses.namedChildren.map((child) => ({ target: child.text, kind: "INHERITS" })));
    }
  } else if (["javascript", "typescript", "tsx"].includes(language)
      && ["class_declaration", "abstract_class_declaration", "interface_declaration"].includes(node.type)) {
    const heritage = node.namedChildren.find((child) => ["class_heritage", "extends_type_clause"].includes(child.type));
    if (heritage) {
      for (const child of heritage.namedChildren) {
        const kind = child.type === "implements_clause" ? "IMPLEMENTS" : "INHERITS";
        const typeNodes = child.namedChildren.length > 0 ? child.namedChildren : [child];
        for (const typeNode of typeNodes) {
          const target = directTypeName(typeNode);
          if (target) targets.push({ target, kind });
        }
      }
    }
  } else if (language === "java" && ["class_declaration", "record_declaration", "interface_declaration"].includes(node.type)) {
    const superclass = node.childForFieldName("superclass");
    const superclassName = directTypeName(superclass);
    if (superclassName) targets.push({ target: superclassName, kind: "INHERITS" });
    const interfaces = node.childForFieldName("interfaces");
    const typeList = interfaces?.namedChildren.find((child) => child.type === "type_list") ?? interfaces;
    for (const item of typeList?.namedChildren ?? []) {
      const target = directTypeName(item);
      if (target) {
        targets.push({
          target,
          kind: node.type === "interface_declaration" ? "INHERITS" : "IMPLEMENTS",
        });
      }
    }
  } else if (language === "csharp" && [
    "class_declaration",
    "record_declaration",
    "struct_declaration",
    "interface_declaration",
  ].includes(node.type)) {
    const baseList = node.namedChildren.find((child) => child.type === "base_list");
    for (const item of baseList?.namedChildren ?? []) {
      const target = directTypeName(item) ?? item.text;
      if (target) targets.push({ target, kind: "INHERITS" });
    }
  }
  return [...new Map(targets.map((item) => [`${item.kind}:${item.target}`, item])).values()];
}

function csharpArgumentType(argument, bindings) {
  const expression = argument.childForFieldName("expression") ?? argument.namedChildren.at(-1) ?? argument;
  if (expression.type === "identifier") return bindings.get(expression.text) ?? "?";
  if (["string_literal", "verbatim_string_literal"].includes(expression.type)) return "string";
  if (expression.type === "integer_literal") return "int";
  if (expression.type === "boolean_literal") return "bool";
  if (expression.type === "null_literal") return "?";
  const created = expression.type === "object_creation_expression"
    ? expression.childForFieldName("type")?.text
    : null;
  return created ?? "?";
}

function javaArgumentType(expression, bindings) {
  if (!expression) return "?";
  if (expression.type === "identifier") return bindings.get(expression.text) ?? "?";
  if (expression.type === "string_literal") return "String";
  if (expression.type === "character_literal") return "char";
  if (/integer_literal$/u.test(expression.type)) return /[lL]$/u.test(expression.text) ? "long" : "int";
  if (/floating_point_literal$/u.test(expression.type)) return /[fF]$/u.test(expression.text) ? "float" : "double";
  if (["true", "false", "boolean_literal"].includes(expression.type)) return "boolean";
  if (expression.type === "null_literal") return "?";
  if (expression.type === "object_creation_expression") {
    return expression.childForFieldName("type")?.text ?? "?";
  }
  return "?";
}

function javaInvocationInfo(node, bindings = new Map()) {
  const name = node.childForFieldName("name")?.text;
  if (!name) return null;
  const receiver = node.childForFieldName("object")?.text ?? null;
  const receiverName = receiver?.replace(/^this\./u, "");
  const boundReceiver = receiver
    ? (bindings.get(receiver) ?? bindings.get(receiverName) ?? receiver)
    : null;
  const argumentsNode = node.childForFieldName("arguments")
    ?? node.namedChildren.find((child) => child.type === "argument_list");
  const argumentTypes = (argumentsNode?.namedChildren ?? [])
    .map((argument) => javaArgumentType(argument, bindings));
  return {
    target: `${boundReceiver ? `${normalizeSemanticText(boundReceiver)}.` : ""}${name}(${argumentTypes.join(",")})`,
  };
}

function javaVariableBindings(node) {
  if (!["field_declaration", "local_variable_declaration"].includes(node.type)) return [];
  const type = node.childForFieldName("type")?.text;
  if (!type) return [];
  return descendants(node, "variable_declarator")
    .map((declarator) => declarator.childForFieldName("name")?.text)
    .filter(Boolean)
    .map((name) => [name, normalizeSemanticText(type)]);
}

function csharpInvocationInfo(node, bindings = new Map()) {
  const callable = node.childForFieldName("function");
  if (!callable) return null;
  const member = callable.type === "member_access_expression" ? callable : null;
  const receiver = member?.childForFieldName("expression")?.text ?? null;
  const nameNode = member?.childForFieldName("name") ?? callable;
  const methodName = nameNode.type === "generic_name"
    ? nameNode.namedChildren.find((child) => child.type === "identifier")?.text
    : nameNode.text;
  if (!methodName) return null;
  const argumentsNode = node.childForFieldName("arguments")
    ?? node.namedChildren.find((child) => child.type === "argument_list");
  const argumentTypes = (argumentsNode?.namedChildren ?? [])
    .filter((child) => child.type === "argument")
    .map((argument) => csharpArgumentType(argument, bindings));
  const boundReceiver = receiver ? (bindings.get(receiver) ?? receiver) : null;
  return {
    rawTarget: callable.text,
    receiver,
    methodName,
    argumentTypes,
    target: `${boundReceiver ? `${boundReceiver}.` : ""}${methodName}(${argumentTypes.join(",")})`,
    genericTypes: nameNode.type === "generic_name"
      ? (nameNode.namedChildren.find((child) => child.type === "type_argument_list")?.namedChildren ?? [])
        .map((child) => normalizeSemanticText(child.text))
      : [],
  };
}

function csharpServiceRegistration(info) {
  if (!info) return null;
  const lifetime = new Map([
    ["AddScoped", "scoped"],
    ["AddTransient", "transient"],
    ["AddSingleton", "singleton"],
  ]).get(info.methodName);
  if (!lifetime || info.genericTypes.length === 0 || info.genericTypes.length > 2) return null;
  const [service, implementation = service] = info.genericTypes;
  return { lifetime, service, implementation, target: `${lifetime}:${service}->${implementation}` };
}

function csharpStaticDatabaseSymbols(node, info) {
  if (!info || !/^(?:Query|QueryAsync|QueryFirst|QueryFirstAsync|QueryFirstOrDefault|QueryFirstOrDefaultAsync|Execute|ExecuteAsync|ExecuteScalar|ExecuteScalarAsync)$/u.test(info.methodName)) {
    return [];
  }
  const strings = [];
  const collect = (current) => {
    if (["string_literal", "verbatim_string_literal"].includes(current.type)) strings.push(current.text);
    for (const child of current.namedChildren) collect(child);
  };
  collect(node);
  return uniqueSorted(strings.flatMap((value) => value.match(/\bsp_[A-Za-z0-9_]+\b/gu) ?? []));
}

function csharpConstructorBindings(node, inputs) {
  const parameterTypesByName = new Map(inputs.map((input) => [input.name, input.type]));
  const bindings = [];
  for (const assignment of descendants(node.childForFieldName("body"), "assignment_expression")) {
    const left = assignment.childForFieldName("left")?.text;
    const right = assignment.childForFieldName("right")?.text;
    const type = parameterTypesByName.get(right);
    if (left && type) bindings.push([left.replace(/^this\./u, ""), type]);
  }
  return bindings;
}

function combineCondition(previous, next, negate = false) {
  const expression = negate ? `NOT (${next.expression})` : next.expression;
  if (!previous) return { ...next, expression };
  return { ...next, expression: `(${previous.expression}) AND (${expression})` };
}

function goBuildCondition(path, root) {
  const packageClause = root.namedChildren.find((child) => child.type === "package_clause");
  const headerComments = root.namedChildren.filter((child) => child.type === "comment"
    && (!packageClause || child.startPosition.row < packageClause.startPosition.row));
  const directive = headerComments.find((comment) => /^\/\/go:build\s+/u.test(comment.text));
  if (directive) return makeCondition(path, directive, directive.text.replace(/^\/\/go:build\s+/u, ""));
  const legacy = headerComments.filter((comment) => /^\/\/\s*\+build\s+/u.test(comment.text));
  if (legacy.length === 0) return null;
  return makeCondition(
    path,
    legacy[0],
    legacy.map((comment) => comment.text.replace(/^\/\/\s*\+build\s+/u, "")).join(" AND "),
  );
}

function declarationDocumentation(node) {
  const previous = node.previousNamedSibling;
  if (previous?.type === "comment") return previous.text.replace(/^\s*(?:#|\/\/|\/\*+|\*+)\s?/gmu, "");
  const body = node.childForFieldName("body");
  const first = body?.namedChildren[0];
  if (first?.type === "expression_statement" && /string/u.test(first.namedChildren[0]?.type ?? "")) {
    return stripQuotes(first.namedChildren[0].text);
  }
  return "";
}

function addRisk(target, riskFlags, entityById, currentEntityId) {
  for (const risk of target) riskFlags.add(risk);
  const entity = entityById.get(currentEntityId);
  if (entity) entity.risk_flags = uniqueSorted([...entity.risk_flags, ...target]);
}

function buildParsedFile(file, source, tree, config) {
  const namespace = namespaceFor(file.language, tree.rootNode, file.path);
  const regionId = regionIdForPath(file.path);
  const buildCondition = file.language === "go" ? goBuildCondition(file.path, tree.rootNode) : null;
  const entities = [];
  const relations = [];
  const imports = {};
  const riskFlags = new Set([
    file.classification === CLASSIFICATION.GENERATED ? RISK.GENERATED_CODE : null,
    buildCondition ? RISK.CONDITIONAL_COMPILATION : null,
  ].filter(Boolean));
  const entityById = new Map();
  const localBindings = new Map();
  const lexicalBindings = new Map();
  const javaReceiverTypes = new Map();
  const csharpReceiverTypes = new Map();
  const csharpMetadata = new Map();
  const moduleEntity = createEntity({
    language: file.language,
    path: file.path,
    kind: "module",
    name: namespace.split(".").at(-1),
    qualifiedName: namespace,
    regionId,
    conditions: buildCondition ? [buildCondition] : [],
    node: tree.rootNode,
    classification: file.classification,
    semanticTags: ["module"],
    riskFlags: [...riskFlags],
    signature: namespace,
  });
  entities.push(moduleEntity);
  entityById.set(moduleEntity.stable_id, moduleEntity);
  localBindings.set(moduleEntity.stable_id, collectLocalBindings(tree.rootNode, file.language));
  lexicalBindings.set(
    moduleEntity.stable_id,
    collectLocalBindings(tree.rootNode, file.language, new Set(), true, false),
  );
  csharpReceiverTypes.set(moduleEntity.stable_id, new Map());
  javaReceiverTypes.set(moduleEntity.stable_id, new Map());
  const shallow = file.classification === CLASSIFICATION.GENERATED;
  if (shallow) {
    const header = source.subarray(0, Math.min(source.length, 4096)).toString("utf8");
    const generatorSource = header.match(/(?:generated\s+(?:from|by)|source)\s*[:=]?\s*["'`]?([^\s"'`]+\.(?:ya?ml|json|proto|graphql|toml))/iu)?.[1];
    if (generatorSource) {
      relations.push(createRelation({
        src: moduleEntity.stable_id,
        unresolvedTarget: generatorSource,
        kind: "DEPENDS_ON",
        path: file.path,
        node: tree.rootNode,
        riskFlags: [RISK.GENERATED_CODE],
      }));
    }
  }

  function recordUnsupportedCalls(node, currentEntityId, activeCondition) {
    if (!node || isNestedDeclaration(file.language, node) || isAnonymousCallable(file.language, node)) return;
    const target = isCallNode(file.language, node) ? callTarget(file.language, node) : null;
    if (target) {
      const risks = uniqueSorted([...dynamicRisks(target, node), RISK.UNSUPPORTED_SEMANTICS]);
      addRisk(risks, riskFlags, entityById, currentEntityId);
      relations.push(createRelation({
        src: currentEntityId,
        unresolvedTarget: target,
        kind: "CALLS",
        path: file.path,
        node,
        condition: activeCondition,
        riskFlags: risks,
      }));
    }
    for (const child of node.namedChildren) recordUnsupportedCalls(child, currentEntityId, activeCondition);
  }

  function visit(node, scope, currentEntityId, activeCondition = null, decorators = [], depth = 0) {
    if (node.type === "decorated_definition") {
      const decoratorNodes = node.namedChildren.filter((child) => child.type === "decorator");
      const decoratorTexts = decoratorNodes.map((child) => child.text.replace(/^@/u, ""));
      for (const decorator of decoratorNodes) {
        recordUnsupportedCalls(decorator, currentEntityId, activeCondition);
      }
      const definition = node.childForFieldName("definition")
        ?? node.namedChildren.find((child) => child.type !== "decorator");
      if (definition) visit(definition, scope, currentEntityId, activeCondition, decoratorTexts, depth);
      return;
    }

    const declaration = declarationInfo(file.language, node, scope, namespace);
    if (declaration) {
      if (shallow && depth > 1) return;
      const parentMetadata = csharpMetadata.get(currentEntityId) ?? {};
      const frameworkMetadata = file.language === "csharp"
        ? csharpSemanticMetadata(node, declaration, parentMetadata)
        : { tags: [] };
      const tags = uniqueSorted([
        ...tagsForDeclaration(file.language, declaration, decorators, node),
        ...frameworkMetadata.tags,
      ]);
      const inferredEntryPoint = tags.some((tag) => tag.startsWith("entry_point:"));
      const declarationRisks = [
        file.classification === CLASSIFICATION.GENERATED ? RISK.GENERATED_CODE : null,
        buildCondition ? RISK.CONDITIONAL_COMPILATION : null,
        inferredEntryPoint && file.language !== "csharp" ? RISK.UNSUPPORTED_SEMANTICS : null,
      ].filter(Boolean);
      if (inferredEntryPoint && file.language !== "csharp") riskFlags.add(RISK.UNSUPPORTED_SEMANTICS);
      const entity = createEntity({
        language: file.language,
        path: file.path,
        kind: declaration.kind,
        name: declaration.name,
        qualifiedName: declaration.qualifiedName,
        regionId,
        inputs: parseInputs(declaration.parameters),
        outputs: declaration.outputs,
        conditions: activeCondition ? [activeCondition] : [],
        node,
        classification: file.classification,
        semanticTags: tags,
        riskFlags: declarationRisks,
        signature: textBeforeBody(declaration.signatureNode, declaration.body),
        documentation: declarationDocumentation(node),
      });
      entities.push(entity);
      entityById.set(entity.stable_id, entity);
      if (file.language === "java") {
        const inheritedReceiverTypes = javaReceiverTypes.get(currentEntityId) ?? new Map();
        const receiverTypes = new Map(inheritedReceiverTypes);
        for (const input of entity.inputs) {
          if (input.type) receiverTypes.set(input.name, input.type);
        }
        javaReceiverTypes.set(entity.stable_id, receiverTypes);
      }
      if (file.language === "csharp") {
        const inheritedReceiverTypes = csharpReceiverTypes.get(currentEntityId) ?? new Map();
        const receiverTypes = new Map(inheritedReceiverTypes);
        for (const input of entity.inputs) {
          if (input.type) receiverTypes.set(input.name, input.type);
        }
        csharpReceiverTypes.set(entity.stable_id, receiverTypes);
        csharpMetadata.set(entity.stable_id, frameworkMetadata);
        if (node.type === "constructor_declaration") {
          const ownerReceiverTypes = csharpReceiverTypes.get(currentEntityId) ?? new Map();
          for (const [field, type] of csharpConstructorBindings(node, entity.inputs)) {
            ownerReceiverTypes.set(field, type);
            receiverTypes.set(field, type);
          }
          for (const input of entity.inputs.filter((item) => item.type)) {
            relations.push(createRelation({
              src: currentEntityId,
              unresolvedTarget: input.type,
              kind: "DEPENDS_ON",
              path: file.path,
              node,
              condition: activeCondition,
            }));
          }
        }
      }
      recordUnsupportedCalls(declaration.parameters, currentEntityId, activeCondition);
      const inheritedBindings = lexicalBindings.get(currentEntityId) ?? new Set();
      const ownLexicalBindings = new Set([
        ...entity.inputs.map((input) => input.name),
        ...parameterBindingNames(declaration.parameters),
        ...collectLocalBindings(declaration.body, file.language, new Set(), true, false),
      ]);
      localBindings.set(entity.stable_id, new Set([
        ...inheritedBindings,
        ...entity.inputs.map((input) => input.name),
        ...parameterBindingNames(declaration.parameters),
        ...collectLocalBindings(declaration.body, file.language),
      ]));
      lexicalBindings.set(entity.stable_id, new Set([...inheritedBindings, ...ownLexicalBindings]));

      for (const inheritance of inheritanceTargets(file.language, node)) {
        relations.push(createRelation({
          src: entity.stable_id,
          unresolvedTarget: inheritance.target,
          kind: inheritance.kind,
          path: file.path,
          node,
          condition: activeCondition,
        }));
      }
      if (tags.some((tag) => tag.startsWith("entry_point:"))) {
        relations.push(createRelation({
          src: moduleEntity.stable_id,
          dst: entity.stable_id,
          kind: "ROUTES_TO",
          confidence: file.language === "csharp" ? CONFIDENCE.HIGH : CONFIDENCE.LOW,
          path: file.path,
          node,
          condition: activeCondition,
          riskFlags: file.language === "csharp" ? [] : [RISK.UNSUPPORTED_SEMANTICS],
        }));
      }

      const nextScope = declaration.kind === "class" || declaration.kind === "interface"
        ? [...scope, { name: declaration.name, kind: declaration.kind }]
        : [...scope, { name: declaration.name, kind: declaration.kind }];
      const body = declaration.body;
      if (body && body !== node) {
        visit(body, nextScope, entity.stable_id, activeCondition, [], depth + 1);
      }
      return;
    }

    if (isAnonymousCallable(file.language, node)) {
      addRisk([RISK.UNSUPPORTED_SEMANTICS], riskFlags, entityById, currentEntityId);
      return;
    }

    if (importNode(file.language, node)) {
      for (const imported of importInfo(file.language, node, namespace, file.path)) {
        const bindings = imports[imported.alias] ?? [];
        bindings.push({
          target: imported.target,
          scope_entity_id: currentEntityId,
          condition: activeCondition,
          type_only: imported.typeOnly,
          wildcard: Boolean(imported.wildcard),
          namespace: Boolean(imported.namespace),
          source_location: sourceLocation(file.path, node),
        });
        imports[imported.alias] = bindings;
        relations.push(createRelation({
          src: currentEntityId,
          unresolvedTarget: imported.target,
          kind: "IMPORTS",
          confidence: CONFIDENCE.UNKNOWN,
          path: file.path,
          node,
          condition: activeCondition,
          typeOnly: imported.typeOnly,
          riskFlags: imported.wildcard ? [RISK.UNSUPPORTED_SEMANTICS] : [],
        }));
        if (imported.wildcard) addRisk(
          [RISK.UNSUPPORTED_SEMANTICS],
          riskFlags,
          entityById,
          currentEntityId,
        );
      }
      return;
    }

    if (file.language === "csharp" && node.type === "field_declaration") {
      const declarationNode = node.namedChildren.find((child) => child.type === "variable_declaration");
      const type = declarationNode?.childForFieldName("type")?.text;
      const receiverTypes = csharpReceiverTypes.get(currentEntityId);
      if (type && receiverTypes) {
        for (const declarator of declarationNode.namedChildren.filter((child) => child.type === "variable_declarator")) {
          const name = declarator.childForFieldName("name")?.text;
          if (name) receiverTypes.set(name, normalizeSemanticText(type));
        }
      }
    }
    if (file.language === "java") {
      const receiverTypes = javaReceiverTypes.get(currentEntityId);
      for (const [name, type] of javaVariableBindings(node)) receiverTypes?.set(name, type);
    }

    const condition = conditionParts(node);
    if (condition?.condition && condition.consequence) {
      recordUnsupportedCalls(condition.condition, currentEntityId, activeCondition);
      const rawCondition = makeCondition(file.path, condition.condition);
      const conditionValue = combineCondition(activeCondition, rawCondition);
      if (/\b(?:feature[_-]?(?:flag|enabled)?|flag|enabled|env|environment|platform|os|arch)\b/iu.test(conditionValue.expression)) {
        addRisk([RISK.CONDITIONAL_COMPILATION], riskFlags, entityById, currentEntityId);
      }
      visit(condition.consequence, scope, currentEntityId, conditionValue, decorators, depth);
      let alternativeCondition = combineCondition(activeCondition, rawCondition, true);
      for (const alternative of condition.alternatives) {
        visit(
          alternative,
          scope,
          currentEntityId,
          alternativeCondition,
          decorators,
          depth,
        );
        if (alternative.type === "elif_clause") {
          const alternativePredicate = alternative.childForFieldName("condition");
          if (alternativePredicate) {
            alternativeCondition = combineCondition(
              alternativeCondition,
              makeCondition(file.path, alternativePredicate),
              true,
            );
          }
        }
      }
      return;
    }

    const shortCircuit = shortCircuitParts(file.language, node);
    if (shortCircuit) {
      visit(shortCircuit.left, scope, currentEntityId, activeCondition, decorators, depth);
      const rightCondition = combineCondition(
        activeCondition,
        makeCondition(file.path, shortCircuit.left),
        shortCircuit.negate,
      );
      visit(shortCircuit.right, scope, currentEntityId, rightCondition, decorators, depth);
      return;
    }

    const constructed = constructorTarget(file.language, node);
    if (constructed) {
      const constructorRisks = file.language === "csharp" ? [] : [RISK.UNSUPPORTED_SEMANTICS];
      addRisk(constructorRisks, riskFlags, entityById, currentEntityId);
      relations.push(createRelation({
        src: currentEntityId,
        unresolvedTarget: constructed,
        kind: "CREATES",
        path: file.path,
        node,
        condition: activeCondition,
        riskFlags: constructorRisks,
      }));
    }

    if (isCallNode(file.language, node)) {
      const javaInfo = file.language === "java"
        ? javaInvocationInfo(node, javaReceiverTypes.get(currentEntityId))
        : null;
      const csharpInfo = file.language === "csharp"
        ? csharpInvocationInfo(node, csharpReceiverTypes.get(currentEntityId))
        : null;
      const target = javaInfo?.target ?? csharpInfo?.target ?? callTarget(file.language, node);
      if (target) {
        const targetHead = target.replaceAll("?.", ".").split(".")[0];
        const shadowed = localBindings.get(currentEntityId)?.has(targetHead);
        const risks = uniqueSorted([
          ...dynamicRisks(target, node),
          shadowed ? RISK.DYNAMIC_DISPATCH : null,
        ]);
        addRisk(risks, riskFlags, entityById, currentEntityId);
        relations.push(createRelation({
          src: currentEntityId,
          unresolvedTarget: target,
          kind: "CALLS",
          path: file.path,
          node,
          condition: activeCondition,
          riskFlags: risks,
        }));

        if (file.language === "csharp") {
          const registration = csharpServiceRegistration(csharpInfo);
          if (registration) {
            const registrationRisks = [RISK.DEPENDENCY_INJECTION];
            addRisk(registrationRisks, riskFlags, entityById, currentEntityId);
            const entity = entityById.get(currentEntityId);
            if (entity) entity.semantic_tags = uniqueSorted([
              ...entity.semantic_tags,
              `di:lifetime:${registration.target}`,
            ]);
            relations.push(createRelation({
              src: currentEntityId,
              unresolvedTarget: registration.target,
              kind: "CONFIGURES",
              path: file.path,
              node,
              condition: activeCondition,
              riskFlags: registrationRisks,
            }));
          }
          const databaseSymbols = csharpStaticDatabaseSymbols(node, csharpInfo);
          if (databaseSymbols.length > 0) {
            const boundaryRisks = [RISK.CROSS_LANGUAGE_BOUNDARY];
            addRisk(boundaryRisks, riskFlags, entityById, currentEntityId);
            const entity = entityById.get(currentEntityId);
            if (entity) {
              entity.effects = uniqueSorted([...entity.effects, "database_access"]);
              entity.semantic_tags = uniqueSorted([
                ...entity.semantic_tags,
                ...databaseSymbols.map((symbol) => `database:${symbol}`),
              ]);
            }
            for (const symbol of databaseSymbols) {
              relations.push(createRelation({
                src: currentEntityId,
                unresolvedTarget: symbol,
                kind: "USES",
                path: file.path,
                node,
                condition: activeCondition,
                riskFlags: boundaryRisks,
              }));
            }
          }
        }

        if (/\b(app|router|server)\.(get|post|put|patch|delete|route|handle)\b/iu.test(target)
            || /\bhttp\.handlefunc\b/iu.test(target)) {
          const handler = node.childForFieldName("arguments")?.namedChildren.at(-1)?.text;
          if (handler) {
            relations.push(createRelation({
              src: currentEntityId,
              unresolvedTarget: handler,
              kind: "ROUTES_TO",
              path: file.path,
              node,
              condition: activeCondition,
              confidence: CONFIDENCE.UNKNOWN,
              riskFlags: [RISK.RUNTIME_REGISTRATION],
            }));
            addRisk([RISK.RUNTIME_REGISTRATION], riskFlags, entityById, currentEntityId);
          }
        }
      }
    }

    if (["raise_statement", "throw_statement"].includes(node.type)) {
      const entity = entityById.get(currentEntityId);
      if (entity) entity.effects = uniqueSorted([...entity.effects, "RAISE_ERROR"]);
    }
    if (["assignment", "assignment_expression", "variable_declarator"].includes(node.type)) {
      const left = node.childForFieldName("left") ?? node.childForFieldName("name");
      if (left?.type === "identifier") localBindings.get(currentEntityId)?.add(left.text);
      if (/(?:\.|\[)/u.test(left?.text ?? "")) {
        addRisk([RISK.DYNAMIC_DISPATCH], riskFlags, entityById, currentEntityId);
        const entity = entityById.get(currentEntityId);
        if (entity) entity.effects = uniqueSorted([...entity.effects, "MUTATE_STATE"]);
      }
    }
    if (node.type === "go_statement") {
      const entity = entityById.get(currentEntityId);
      if (entity) entity.semantic_tags = uniqueSorted([...entity.semantic_tags, "async"]);
    }

    for (const child of node.namedChildren) visit(child, scope, currentEntityId, activeCondition, decorators, depth);
  }

  for (const child of tree.rootNode.namedChildren) {
    visit(child, [], moduleEntity.stable_id, buildCondition);
  }
  if (buildCondition) {
    for (const relation of relations) {
      relation.risk_flags = uniqueSorted([...relation.risk_flags, RISK.CONDITIONAL_COMPILATION]);
    }
  }

  const parsed = {
    ...file,
    content_hash: hashBytes(source),
    semantic_hash: "",
    parse_status: shallow ? "SHALLOW" : "OK",
    parse_error: null,
    entities,
    relations,
    imports,
    risk_flags: uniqueSorted([...riskFlags]),
  };
  parsed.semantic_hash = semanticHash(parsed);
  return parsed;
}

export async function parseSourceFile(file, config) {
  const source = await readFileNoFollow(file.absolutePath);
  const contentHash = hashBytes(source);
  const sizeLimit = file.classification === CLASSIFICATION.GENERATED
    ? config.generated_file_size_limit
    : config.source_file_size_limit;
  if (source.length > sizeLimit) {
    if (file.classification === CLASSIFICATION.GENERATED) {
      const fakeNode = {
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 0, column: 0 },
      };
      const namespace = moduleNameForPath(file.path);
      const entity = createEntity({
        language: file.language,
        path: file.path,
        kind: "module",
        name: namespace.split(".").at(-1),
        qualifiedName: namespace,
        regionId: regionIdForPath(file.path),
        node: fakeNode,
        classification: file.classification,
        semanticTags: ["module", "shallow"],
        riskFlags: [RISK.GENERATED_CODE],
        signature: namespace,
      });
      const parsed = {
        ...file,
        content_hash: contentHash,
        semantic_hash: "",
        parse_status: "SHALLOW",
        parse_error: null,
        entities: [entity],
        relations: [],
        imports: {},
        risk_flags: [RISK.GENERATED_CODE],
      };
      parsed.semantic_hash = semanticHash(parsed);
      return parsed;
    }
    return {
      ...file,
      content_hash: contentHash,
      semantic_hash: null,
      parse_status: "FAILED",
      parse_error: `File exceeds source_file_size_limit (${sizeLimit} bytes)`,
      entities: [],
      relations: [],
      imports: {},
      risk_flags: [RISK.UNSUPPORTED_SEMANTICS, RISK.PARTIAL_PARSE],
    };
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch (error) {
    return {
      ...file,
      content_hash: contentHash,
      semantic_hash: null,
      parse_status: "FAILED",
      parse_error: `Invalid UTF-8: ${error.message}`,
      entities: [],
      relations: [],
      imports: {},
      risk_flags: [RISK.PARTIAL_PARSE],
    };
  }

  const language = await languageFor(file.language);
  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(language);
    tree = parser.parse(text);
    if (!tree || tree.rootNode.hasError) {
      return {
        ...file,
        content_hash: contentHash,
        semantic_hash: null,
        parse_status: "FAILED",
        parse_error: "Tree-sitter reported a syntax error",
        entities: [],
        relations: [],
        imports: {},
        risk_flags: [RISK.PARTIAL_PARSE],
      };
    }
    return buildParsedFile(file, source, tree, config);
  } finally {
    tree?.delete();
    parser.delete();
  }
}

export function parserSourceLocation(path, node) {
  return sourceLocation(path, node);
}

export const AGENT_INSTRUCTIONS = `For code-related tasks:

1. Use codegraph.py as the repository routing map.
2. Do not recursively scan the repository to rediscover architecture already represented by CodeGraph.
3. Use semantic MCP only when the routing map is insufficient, ambiguous, stale, low-confidence, or graph-wide relationships are required.
4. Read original source before modifying implementation.
5. Source code is authoritative when it conflicts with generated semantic information.
6. Follow YAGNI: do not add speculative abstractions, dependencies, configuration, compatibility layers, or unrelated refactors.
7. Expand context only when current context is insufficient.
8. Prefer the smallest correct change that fully satisfies the task.
`;

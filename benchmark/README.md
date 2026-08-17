# Deterministic benchmark

`npm run benchmark` generates each source fixture and copies its independently authored oracle before CodeGraph is initialized. The runner then scores retrieval status, required/forbidden entities, relations, safety states, source integrity, precision@1/5, recall@5, wrong-region matches, false matches, false `NO_MATCH`, and false `NAVIGATION_SAFE`.

Current results are written to:

```text
benchmark/results/latest.json
benchmark/results/latest.md
```

These generated files are ignored locally and uploaded by native CI. The fixture declarations and oracle are versioned under `benchmark/fixtures` and `benchmark/oracles`.

This deterministic layer is offline and has no LLM or provider dependency. No agent adapter is configured in V1, so the repository makes no baseline-vs-CodeGraph token-saving claim. `response_budget_units` measure serialized UTF-8 bytes, not model tokens. Any future agent benchmark must use isolated workspaces, identical prompts/models/settings, independent correctness scoring, and provider usage metadata (or one documented tokenizer for both modes); token comparisons count correct runs only.

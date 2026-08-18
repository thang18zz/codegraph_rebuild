const unsafeNavigationStatuses = new Set(["NO_MATCH", "WEAK", "ROUTING"]);

export function forbiddenSafetyFailures(expected, response) {
  const states = response.safety_states ?? [];
  return (expected.forbidden_safety ?? [])
    .filter((state) => states.includes(state))
    .map((state) => `forbidden safety ${state}`);
}

export function isFalseNavigationSafe(response) {
  return unsafeNavigationStatuses.has(response.retrieval_status)
    && (response.safety_states ?? []).includes("NAVIGATION_SAFE");
}

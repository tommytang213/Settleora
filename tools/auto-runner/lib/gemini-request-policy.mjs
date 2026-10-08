// Model-specific reviewer policy, verified against Google docs on 2026-10-08.
// Endpoint recognition is separate from approval to use a request recipe.
// See AUTONOMOUS_CODEX_RUNNER.md for sources and the model-change gate.
const legacyFlashRecipe = Object.freeze({
  temperature: 0,
  thinkingConfig: Object.freeze({ thinkingBudget: 0 }),
});
export const geminiReviewerCapabilities = Object.freeze({
  "gemini-2.5-flash-lite": Object.freeze({ recipe: legacyFlashRecipe, basis: "budget_zero_supported" }),
  "gemini-2.5-flash": Object.freeze({ recipe: legacyFlashRecipe, basis: "budget_zero_supported" }),
  // 3.5 accepts legacy budgets. Retain the proven request, without asserting
  // that budget zero disables all thinking or migrating to a different level.
  "gemini-3.5-flash": Object.freeze({ recipe: legacyFlashRecipe, basis: "legacy_budget_compatibility" }),
  "gemini-2.5-pro": Object.freeze({ reason: "blocked_gemini_thinking_recipe_unapproved" }),
  "gemini-3.1-pro-preview": Object.freeze({ reason: "blocked_gemini_thinking_recipe_unapproved" }),
  "gemini-pro-latest": Object.freeze({ reason: "blocked_gemini_moving_model_alias" }),
  "gemini-flash-latest": Object.freeze({ reason: "blocked_gemini_moving_model_alias" }),
  "gemini-flash-lite-latest": Object.freeze({ reason: "blocked_gemini_moving_model_alias" }),
});

export function geminiReviewerRequestPolicy(model) {
  const capability = typeof model === "string" && Object.hasOwn(geminiReviewerCapabilities, model)
    ? geminiReviewerCapabilities[model] : null;
  return capability?.recipe
    ? { ok: true, basis: capability.basis }
    : { ok: false, reason: capability?.reason || "blocked_unsupported_gemini_model" };
}

export function geminiReviewerGenerationConfig(model, maxOutputTokens, responseJsonSchema) {
  const policy = geminiReviewerRequestPolicy(model);
  if (!policy.ok) throw new Error(policy.reason);
  const recipe = geminiReviewerCapabilities[model].recipe;
  // There is deliberately no arbitrary sampling/thinking override or model
  // family fallback. New recipes require a separate reviewed capability entry.
  return {
    temperature: recipe.temperature,
    maxOutputTokens,
    responseMimeType: "application/json",
    responseJsonSchema,
    thinkingConfig: { ...recipe.thinkingConfig },
  };
}

export function sanitizeGeminiUsage(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return Object.fromEntries(
    ["promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "totalTokenCount"].map(
      (key) => [key, Number.isSafeInteger(metadata[key]) && metadata[key] >= 0 ? metadata[key] : null],
    ),
  );
}

// The total already contains prompt + candidates + thoughts. Do not add it
// again. Missing thoughts can be recovered from a consistent total, including
// a zero omitted by the provider. Incomplete/inconsistent usage keeps at least
// the estimate and every known token cost; it is never labelled exact usage.
export function geminiUsageCost(usage, estimated, pricing) {
  const clean = sanitizeGeminiUsage(usage) || {};
  const { promptTokenCount: prompt, candidatesTokenCount: candidates,
    thoughtsTokenCount: thoughts, totalTokenCount: total } = clean;
  const output = (candidates ?? 0) + (thoughts ?? 0);
  const sum = (prompt ?? 0) + output;
  const consistentTotal = total != null && Number.isSafeInteger(sum) && total >= sum;
  const complete = prompt != null && candidates != null && consistentTotal;
  const cost = (inputTokens, outputTokens) => (inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens
    + (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;
  // Known prompt counts let total supply the output remainder. If prompt is
  // unknown, charge total at the higher rate as a conservative bound.
  const knownCost = cost(prompt ?? 0, Math.max(output, prompt != null && total != null ? total - prompt : 0));
  const totalBound = prompt == null && total != null
    ? (total / 1_000_000) * Math.max(pricing.inputUsdPerMillionTokens, pricing.outputUsdPerMillionTokens)
    : 0;
  const fallback = complete ? 0 : Math.max(estimated.costUsd, cost(prompt ?? estimated.inputTokens, Math.max(output, estimated.outputTokens)));
  return {
    costUsd: Math.ceil(Math.max(knownCost, fallback, totalBound) * 1_000_000 - 1e-9) / 1_000_000,
    basis: complete ? "provider_usage" : "conservative_estimate_or_partial_usage",
  };
}

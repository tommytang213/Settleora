// A recovered task must use its recorded independent reviewer. Older Gemini
// state can continue under Gemini; absence of a record cannot authorize Grok.
export function resolveRecoveredReviewerProviderPin(config, state = {}) {
  const recorded = state.reviewerProviderPin
    || state.ordinaryContinuation?.reviewerProviderPin
    || state.evidence?.externalReview?.provider
    || state.ordinaryContinuation?.effects?.external_review?.evidence?.review?.provider
    || null;
  const configured = config.reviewerTiers?.strong_independent?.provider || config.reviewerProviderPin || "gemini";
  if (recorded && !["gemini", "grok"].includes(recorded)) return { ok: false, reason: "recovery_reviewer_provider_invalid" };
  if (recorded && recorded !== configured) return { ok: false, reason: "recovery_reviewer_provider_pin_mismatch" };
  if (!recorded && configured === "grok") return { ok: false, reason: "recovery_reviewer_provider_pin_missing" };
  return { ok: true, provider: recorded || configured };
}

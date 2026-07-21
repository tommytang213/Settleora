import { findPreEffectIntents } from "./pre-effect-intent.mjs";

export function autoMergeEffectsConfirmed(config, lifecycle, autoMerge = {}) {
  if (lifecycleHasPendingCanonicalIntents(config, lifecycle)) return false;
  if (autoMerge.result !== "merged") return true;
  const hygiene = autoMerge.completionHygiene || {};
  const mutationComponents = [hygiene.comment, hygiene.closure, hygiene.labelCleanup, hygiene.parentProgress, hygiene.project, hygiene.ledger];
  const completeStatus = (component) => !component
    || ["updated", "skipped", "not_updated", "reused", "created"].includes(component.status)
    || (component.status === "preview" && component.reason === "followup_issue_creation_disabled")
    || component.skipped === true;
  return autoMerge.mergeReadback?.ok === true
    && autoMerge.sourceBranchRestoration?.confirmed === true
    && autoMerge.comments?.pr?.status === 0
    && mutationComponents.every(completeStatus);
}

function lifecycleHasPendingCanonicalIntents(config, lifecycle) {
  if (!lifecycle) return false;
  try {
    return findPreEffectIntents(config, (intent) => intent.runId === lifecycle.logicalTask?.runId
      && intent.claimIdentity === lifecycle.logicalTask?.claimIdentity
      && !["finalized", "failed_closed"].includes(intent.status)).length > 0;
  } catch {
    return true;
  }
}

// Preserve existing Gemini recovery records while accepting provider-neutral
// evidence for newly pinned independent reviewers.
export function recoveredIndependentReviewEvidence(evidence = {}) {
  if (evidence.independentReview != null) {
    if (!evidence.independentReview || typeof evidence.independentReview !== "object"
      || Array.isArray(evidence.independentReview)) return { neutral: true };
    return { ...evidence.independentReview, neutral: true };
  }
  return {
    pass: evidence.geminiPass === true,
    headSha: evidence.geminiHeadSha,
    changedFiles: evidence.geminiChangedFiles,
    changedFilesDigest: evidence.geminiChangedFilesDigest,
    provider: evidence.geminiProvider,
    tier: evidence.geminiTier,
    completedAt: evidence.geminiCompletedAt,
    evidencePath: evidence.geminiEvidencePath,
    neutral: false,
  };
}

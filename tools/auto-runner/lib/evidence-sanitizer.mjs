const rawOrSecretKeyPattern =
  /(^|_|\b)(raw(output|payload|request|response|body|text)?|responsepayload|requestpayload|prompttext|fullprompt|diff|tail|authorization|api[-_]?key|apikey|secret|token|env|password|credential)(_|$|\b)/i;

const pathKeyPattern = /(path|url)$/i;
const secretValuePatterns = [
  /GEMINI_API_KEY/gi,
  /authorization/gi,
  /x-goog-api-key/gi,
  /bearer\s+[A-Za-z0-9._~+/-]+/gi,
  /api[_-]?key\s*[:=]\s*[^,\s;]+/gi,
  /secret[-_=:\s]+[^,\s;]+/gi,
  /token[-_=:\s]+[^,\s;]+/gi,
];

export function sanitizePersistedEvidence(value) {
  return sanitizeValue(value);
}

export function sanitizePersistedSummary(summary) {
  return sanitizePersistedEvidence(summary);
}

export function sanitizePersistedIteration(iteration) {
  return sanitizePersistedEvidence(iteration);
}

function sanitizeValue(value) {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (!isPlainObject(value)) return null;
  if (isReviewResult(value)) return sanitizeReviewResult(value);
  if (isCodexRunResult(value)) return sanitizeCodexRunResult(value);
  if (isReviewPackage(value)) return sanitizeReviewPackage(value);

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (shouldOmitKey(key)) {
      if (pathKeyPattern.test(key)) output[key] = sanitizeValue(child);
      continue;
    }
    const sanitized = sanitizeValue(child);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function sanitizeReviewResult(review) {
  const rawEvidence = {
    promptPath: stringOrNull(review.promptPath),
    logPath: stringOrNull(review.logPath),
    stdoutPath: stringOrNull(review.stdoutPath),
    stderrPath: stringOrNull(review.stderrPath),
    responsePayloadSource: stringOrNull(review.responsePayloadSource),
    responsePayloadBoundary: stringOrNull(review.responsePayloadBoundary),
    rawCandidateDiagnostics: sanitizeValue(review.rawCandidateDiagnostics ?? null),
    rawPayloadPersisted: false,
  };
  return omitNullish({
    skipped: booleanOrNull(review.skipped),
    promptPath: stringOrNull(review.promptPath),
    command: stringOrNull(review.command),
    source: stringOrNull(review.source),
    status: numberOrNull(review.status),
    signal: stringOrNull(review.signal),
    error: stringOrNull(review.error),
    logPath: stringOrNull(review.logPath),
    responsePayloadSource: stringOrNull(review.responsePayloadSource),
    responsePayloadBoundary: stringOrNull(review.responsePayloadBoundary),
    rawCandidateDiagnostics: sanitizeValue(review.rawCandidateDiagnostics ?? null),
    reviewStatus: stringOrNull(review.reviewStatus),
    reviewFailureCategory: stringOrNull(review.reviewFailureCategory),
    reviewFailureReason: stringOrNull(review.reviewFailureReason),
    attempts: sanitizeValue(review.attempts || []),
    attemptCount: numberOrNull(review.attemptCount ?? (Array.isArray(review.attempts) ? review.attempts.length : null)),
    reviewedHead: stringOrNull(review.reviewedHead),
    reviewedBaseSha: stringOrNull(review.reviewedBaseSha),
    baseSha: stringOrNull(review.baseSha),
    changedFiles: sanitizeStringArray(review.changedFiles),
    changedFilesDigest: stringOrNull(review.changedFilesDigest),
    fullCandidatePrDelta: sanitizeValue(review.fullCandidatePrDelta ?? null),
    evidenceBinding: sanitizeValue(review.evidenceBinding ?? null),
    verdict: sanitizeReviewVerdict(review.verdict),
    rawEvidence,
  });
}

function sanitizeReviewVerdict(verdict) {
  if (!isPlainObject(verdict)) return verdict === null || verdict === undefined ? null : sanitizeValue(verdict);
  return omitNullish({
    verdict: stringOrNull(verdict.verdict),
    reviewed_base_sha: stringOrNull(verdict.reviewed_base_sha),
    confidence: stringOrNull(verdict.confidence),
    requirement_match: stringOrNull(verdict.requirement_match),
    code_quality: stringOrNull(verdict.code_quality),
    scope_control: stringOrNull(verdict.scope_control),
    validation_adequacy: stringOrNull(verdict.validation_adequacy),
    security_or_secret_risk: stringOrNull(verdict.security_or_secret_risk),
    recommended_next_action: stringOrNull(verdict.recommended_next_action),
    blocking_findings: sanitizeValue(verdict.blocking_findings || []),
    non_blocking_findings: sanitizeValue(verdict.non_blocking_findings || []),
    review_json_diagnostics: sanitizeValue(verdict.review_json_diagnostics || null),
    review_output_boundary: sanitizeValue(verdict.review_output_boundary || null),
  });
}

function sanitizeCodexRunResult(codex) {
  return omitNullish({
    skipped: booleanOrNull(codex.skipped),
    reason: stringOrNull(codex.reason),
    purpose: stringOrNull(codex.purpose),
    command: stringOrNull(codex.command),
    source: stringOrNull(codex.source),
    status: numberOrNull(codex.status),
    signal: stringOrNull(codex.signal),
    error: stringOrNull(codex.error),
    logPath: stringOrNull(codex.logPath),
    rawEvidence: {
      logPath: stringOrNull(codex.logPath),
      rawPayloadPersisted: false,
    },
  });
}

function sanitizeReviewPackage(reviewPackage) {
  return omitNullish({
    packagePath: stringOrNull(reviewPackage.packagePath),
    summary: sanitizeValue(reviewPackage.summary || null),
    diffTruncated: booleanOrNull(reviewPackage.summary?.diffTruncated),
    rawEvidence: {
      packagePath: stringOrNull(reviewPackage.packagePath),
      diffPersistedInSummaryState: false,
    },
  });
}

function shouldOmitKey(key) {
  return rawOrSecretKeyPattern.test(String(key || ""));
}

function isReviewResult(value) {
  return Boolean(
    isPlainObject(value) &&
      (Object.hasOwn(value, "rawOutput") ||
        Object.hasOwn(value, "responsePayload") ||
        (Object.hasOwn(value, "verdict") && (Object.hasOwn(value, "reviewStatus") || Object.hasOwn(value, "attempts")))),
  );
}

function isCodexRunResult(value) {
  return Boolean(
    isPlainObject(value) &&
      Object.hasOwn(value, "logPath") &&
      Object.hasOwn(value, "tail") &&
      (Object.hasOwn(value, "status") || Object.hasOwn(value, "signal")),
  );
}

function isReviewPackage(value) {
  return Boolean(isPlainObject(value) && Object.hasOwn(value, "packagePath") && Object.hasOwn(value, "diff"));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function omitNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== null && child !== undefined));
}

function stringOrNull(value) {
  return typeof value === "string" ? sanitizeString(value) : null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function sanitizeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => sanitizeString(item)) : [];
}

function sanitizeString(value) {
  let text = value;
  for (const pattern of secretValuePatterns) text = text.replace(pattern, "[REDACTED]");
  return text;
}

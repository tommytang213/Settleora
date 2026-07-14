import { GitHubSecurityFindingAdapter, parseSecurityArtifactEntries } from "./security-findings-adapters.mjs";
import { buildSecurityFindingEvidence, evaluateSecurityFindingDuplicate, readRepositoryCorrelationReports } from "./security-findings-dedupe.mjs";
import {
  mergeSecurityFindingRecords,
  readSecurityFindingsState,
  writeSecurityFindingsState,
} from "./security-findings-state.mjs";

export function normalizeSecurityFindingConfig(config = {}) {
  const raw = config.securityFindings || {};
  const enabledSourceKinds = raw.enabledSourceKinds ?? [
    "dependabot_alert",
    "dependabot_pr",
    "code_scanning_alert",
  ];
  if (!Array.isArray(enabledSourceKinds)) throw new Error("securityFindings.enabledSourceKinds must be an array");
  const allowed = new Set(["dependabot_alert", "dependabot_pr", "code_scanning_alert", "semgrep_artifact", "trivy_artifact"]);
  for (const kind of enabledSourceKinds) {
    if (!allowed.has(kind)) throw new Error(`Unsupported security finding source kind: ${kind}`);
  }
  return {
    allowSecurityFindingIngestion: Boolean(raw.allowSecurityFindingIngestion),
    dryRunOnly: raw.dryRunOnly !== false,
    persistState: raw.persistState !== false,
    enabledSourceKinds,
    allowedRepository: raw.allowedRepository || config.repositorySlug || "tommytang213/Settleora",
    maxPages: boundedInt(raw.maxPages, 1, 10, 2, "securityFindings.maxPages"),
    perPage: boundedInt(raw.perPage, 1, 100, 50, "securityFindings.perPage"),
    maxItems: boundedInt(raw.maxItems, 1, 500, 100, "securityFindings.maxItems"),
    maxRetries: boundedInt(raw.maxRetries, 0, 3, 0, "securityFindings.maxRetries"),
    timeoutMs: boundedInt(raw.timeoutMs, 1_000, 60_000, 20_000, "securityFindings.timeoutMs"),
    maxStateRecords: boundedInt(raw.maxStateRecords, 1, 2_000, 500, "securityFindings.maxStateRecords"),
    maxArtifactEntries: boundedInt(raw.maxArtifactEntries, 1, 50, 10, "securityFindings.maxArtifactEntries"),
    maxArtifactEntryBytes: boundedInt(raw.maxArtifactEntryBytes, 1_024, 5 * 1024 * 1024, 2 * 1024 * 1024, "securityFindings.maxArtifactEntryBytes"),
  };
}

export async function runSecurityFindingsDryRun(config = {}, options = {}) {
  const securityConfig = normalizeSecurityFindingConfig(config);
  const result = {
    ok: false,
    mode: "security-findings-dry-run",
    repository: securityConfig.allowedRepository,
    mutationAllowed: false,
    sources: {},
    sourceCounts: {},
    normalizedCount: 0,
    duplicateCount: 0,
    newCount: 0,
    ambiguousCount: 0,
    failureCount: 0,
    failuresByReason: {},
    statePath: null,
    evidencePath: null,
  };
  if (!securityConfig.allowSecurityFindingIngestion) {
    return fail(result, "security_finding_ingestion_disabled");
  }
  if (!config.configPath && !options.allowImplicitConfig) {
    return fail(result, "security_finding_ingestion_requires_explicit_config");
  }
  const mergedConfig = { ...config, securityFindings: securityConfig };
  const stateRead = readSecurityFindingsState(mergedConfig);
  if (!stateRead.ok) return fail(result, stateRead.reason);

  const adapter = options.adapter || new GitHubSecurityFindingAdapter(mergedConfig, { runner: options.runner, now: options.now });
  const normalized = [];
  for (const sourceKind of securityConfig.enabledSourceKinds) {
    const sourceResult = options.artifactEntries?.[sourceKind]
      ? parseSecurityArtifactEntries(options.artifactEntries[sourceKind], { sourceKind, repository: securityConfig.allowedRepository }, {
          maxEntries: securityConfig.maxArtifactEntries,
          maxEntryBytes: securityConfig.maxArtifactEntryBytes,
          maxFindings: securityConfig.maxItems,
        })
      : await adapter.fetchSource(sourceKind);
    result.sources[sourceKind] = summarizeSource(sourceResult);
    result.sourceCounts[sourceKind] = sourceResult.findings?.length || 0;
    normalized.push(...(sourceResult.findings || []));
    for (const reason of sourceResult.failures || []) increment(result.failuresByReason, reason);
    if (sourceResult.status !== "ok") result.failureCount += 1;
  }
  result.normalizedCount = normalized.length;

  const repoReports = options.reports || readRepositoryCorrelationReports(config.repoRoot || "/workspace/repos/Settleora");
  const durableState = stateRead.state.records || [];
  for (const finding of normalized) {
    const duplicate = evaluateSecurityFindingDuplicate(
      finding,
      buildSecurityFindingEvidence({
        ...(options.evidence || {}),
        reports: repoReports,
        durableState,
      }),
    );
    if (!duplicate.ok || duplicate.status === "ambiguous") result.ambiguousCount += 1;
    else if (duplicate.status === "duplicate") result.duplicateCount += 1;
    else result.newCount += 1;
  }

  if (securityConfig.persistState) {
    const written = writeSecurityFindingsState(mergedConfig, mergeSecurityFindingRecords(durableState, normalized), {
      taskKey: options.taskKey || null,
      runId: options.runId || null,
      supervisorRunId: config.supervisorRunId || null,
      repository: securityConfig.allowedRepository,
    });
    result.statePath = written.statePath;
  }
  if (result.failureCount > 0 || result.ambiguousCount > 0) {
    result.ok = false;
    result.reason = result.ambiguousCount > 0 ? "ambiguous_duplicate_evidence" : "source_failures";
    return result;
  }
  result.ok = true;
  result.reason = "dry_run_complete";
  return result;
}

function fail(result, reason) {
  result.ok = false;
  result.reason = reason;
  increment(result.failuresByReason, reason);
  result.failureCount += 1;
  return result;
}

function summarizeSource(sourceResult = {}) {
  return {
    status: sourceResult.status || "unknown",
    reason: sourceResult.reason || null,
    count: sourceResult.findings?.length || 0,
    failures: sourceResult.failures || [],
    httpStatus: sourceResult.httpStatus || null,
  };
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function boundedInt(value, min, max, fallback, field) {
  if (value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return number;
}

export const securityFindingExtensionSeams = Object.freeze({
  classifier: "checkpoint_2_pending",
  remediationProposal: "checkpoint_2_pending",
  falsePositiveEvidencePacket: "checkpoint_3_pending",
  dispositionMutationAdapter: "checkpoint_3_pending",
  completionHygiene: "checkpoint_3_pending",
});

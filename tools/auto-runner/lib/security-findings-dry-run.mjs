import { GitHubSecurityFindingAdapter, parseSecurityArtifactEntries } from "./security-findings-adapters.mjs";
import { classifySecurityFinding } from "./security-findings-classifier.mjs";
import { buildSecurityFindingEvidence, evaluateSecurityFindingDuplicate, readRepositoryCorrelationReports } from "./security-findings-dedupe.mjs";
import { executeIssueMutationPipeline } from "./issue-mutation-pipeline.mjs";
import { buildFalsePositivePacket } from "./security-findings-false-positive.mjs";
import { normalizeSecurityFindingDispositionConfig, prepareDispositionPrecondition, validateDispositionPolicy } from "./security-findings-disposition.mjs";
import { buildReviewBundle, validateFalsePositiveReviewBundle } from "./security-findings-reviews.mjs";
import { buildSecurityFindingProposal, securityFindingIssueCreationCapability } from "./security-findings-proposals.mjs";
import { reconcileSecurityFinding } from "./security-findings-reconciliation.mjs";
import { routeSecurityFindingRemediation } from "./security-findings-remediation.mjs";
import {
  advanceSecurityFindingLifecycle,
  createLifecycleRecord,
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
    allowSecurityFindingClassification: Boolean(raw.allowSecurityFindingClassification),
    allowSecurityFindingProposalPlanning: Boolean(raw.allowSecurityFindingProposalPlanning),
    allowSecurityFindingIssueCreation: Boolean(raw.allowSecurityFindingIssueCreation),
    allowFalsePositiveEvidence: Boolean(raw.allowFalsePositiveEvidence),
    allowSecurityFindingDisposition: Boolean(raw.allowSecurityFindingDisposition),
    allowProvenFalsePositiveDisposition: Boolean(raw.allowProvenFalsePositiveDisposition),
    allowSecurityFindingCompletionHygiene: Boolean(raw.allowSecurityFindingCompletionHygiene),
    maxProposalsPerRun: boundedInt(raw.maxProposalsPerRun, 0, 25, 5, "securityFindings.maxProposalsPerRun"),
    classificationPolicyVersion: boundedInt(raw.classificationPolicyVersion, 1, 10, 1, "securityFindings.classificationPolicyVersion"),
    reconciliationRequired: raw.reconciliationRequired !== false,
    allowPartialPlanning: Boolean(raw.allowPartialPlanning),
    disposition: normalizeSecurityFindingDispositionConfig({ ...config, securityFindings: raw }),
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
    classificationCounts: {},
    reconciliationCounts: {},
    routeCounts: {},
    duplicateCount: 0,
    newCount: 0,
    proposalCount: 0,
    reuseCount: 0,
    retryCount: 0,
    manualCount: 0,
    falsePositiveCandidateCount: 0,
    packetReadyCount: 0,
    packetBlockedCount: 0,
    reviewReadyCount: 0,
    tieBreakerRequiredCount: 0,
    dispositionReadyCount: 0,
    dispositionBlockedCount: 0,
    reconciliationReadyCount: 0,
    completionReadyCount: 0,
    ambiguousCount: 0,
    failureCount: 0,
    failuresByReason: {},
    mutationCalls: 0,
    issueCreationCapability: {},
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
  const providerFailures = [];
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
    for (const reason of sourceResult.failures || []) increment(result.failuresByReason, reason);
    if (sourceResult.status !== "ok") {
      result.failureCount += 1;
      providerFailures.push({ sourceKind, reason: sourceResult.reason || sourceResult.failures?.[0] || "source_failed", httpStatus: sourceResult.httpStatus || null });
      continue;
    }
    normalized.push(...(sourceResult.findings || []));
  }
  if (providerFailures.length > 0 && !securityConfig.allowPartialPlanning) {
    result.normalizedCount = 0;
    result.ok = false;
    result.reason = "source_failures";
    return result;
  }
  const partialSourceCoverage = providerFailures.length > 0;
  result.normalizedCount = normalized.length;

  const repoReports = options.reports || readRepositoryCorrelationReports(config.repoRoot || "/workspace/repos/Settleora");
  const durableState = stateRead.state.records || [];
  const plannedRecords = [];
  const proposals = [];
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
    const lifecycle = createLifecycleRecord({ stage: "ingested", updatedAt: finding.ingestedAt });
    if (securityConfig.allowSecurityFindingClassification || securityConfig.allowSecurityFindingProposalPlanning) {
      const classificationInput = options.classificationInputs?.[finding.correlationKey] || {};
      const classification = classifySecurityFinding({ finding, sourceIdentityVerified: true, authorityResolved: true, ...classificationInput }, { now: options.now?.() });
      increment(result.classificationCounts, classification.category);
      if (classification.category === "false_positive_candidate") result.falsePositiveCandidateCount += 1;
      let nextLifecycle = advanceSecurityFindingLifecycle(lifecycle, "classified", { classificationDigest: classification.policyDigest });
      const reconciliation = reconcileSecurityFinding({ finding, current: options.currentFindings?.[finding.correlationKey] || finding, requiresCurrentMainScan: options.requiresCurrentMainScan?.has?.(finding.correlationKey) }, { now: options.now?.() });
      increment(result.reconciliationCounts, reconciliation.state);
      if (nextLifecycle.ok) nextLifecycle = advanceSecurityFindingLifecycle(nextLifecycle.lifecycle, "reconciled", { reconciliationDigest: reconciliation.digest });
      const route = routeSecurityFindingRemediation({ finding, classification, reconciliation, duplicate });
      increment(result.routeCounts, route.route);
      if (route.route === "retry_later") result.retryCount += 1;
      if (route.route === "manual_gate") result.manualCount += 1;
      if (route.route === "blocked_ambiguous") result.ambiguousCount += 1;
      if (route.route === "collect_false_positive_evidence" && securityConfig.allowFalsePositiveEvidence && !partialSourceCoverage) {
        if (nextLifecycle.ok) nextLifecycle = advanceSecurityFindingLifecycle(nextLifecycle.lifecycle, "false_positive_evidence_pending");
        const readiness = await evaluateFalsePositiveDispositionReadiness({
          finding,
          classification,
          reconciliation,
          route,
          securityConfig,
          options,
          now: options.now?.() || new Date().toISOString(),
        });
        for (const [key, value] of Object.entries(readiness.counts)) result[key] += value;
        for (const reason of readiness.failures) increment(result.failuresByReason, reason);
        if (readiness.counts.packetReadyCount > 0 && nextLifecycle.ok) {
          nextLifecycle = advanceSecurityFindingLifecycle(nextLifecycle.lifecycle, "false_positive_packet_ready", {
            packetDigest: options.falsePositiveEvidence?.[finding.correlationKey]?.packetDigest || null,
          });
        }
      }
      if (route.route === "propose_issue" && securityConfig.allowSecurityFindingProposalPlanning && !partialSourceCoverage && proposals.length < securityConfig.maxProposalsPerRun) {
        const proposal = buildSecurityFindingProposal({ finding, classification, reconciliation, route });
        if (proposal.ok) {
          proposals.push(proposal.proposal);
          result.proposalCount += 1;
          if (nextLifecycle.ok) nextLifecycle = advanceSecurityFindingLifecycle(nextLifecycle.lifecycle, "proposal_planned", { proposalDigest: proposal.proposal.idempotencyKey });
        } else {
          increment(result.failuresByReason, proposal.reason);
          result.failureCount += 1;
        }
      }
      plannedRecords.push({
        ...finding,
        lifecycle: nextLifecycle.ok ? nextLifecycle.lifecycle : lifecycle,
        classification: summarizeClassification(classification),
        reconciliation: summarizeReconciliation(reconciliation),
        route: summarizeRoute(route),
      });
    } else {
      plannedRecords.push({ ...finding, lifecycle });
    }
  }

  for (const failure of providerFailures) {
    if (!securityConfig.allowSecurityFindingClassification) continue;
    const classification = classifySecurityFinding({
      finding: {
        sourceKind: failure.sourceKind,
        correlationKey: `settleora:security-provider:v1:${failure.sourceKind}`,
        idempotencyKey: `settleora:security-provider:v1:${failure.sourceKind}:${failure.reason}`,
      },
      providerFailure: failure,
    }, { now: options.now?.() });
    increment(result.classificationCounts, classification.category);
    const route = routeSecurityFindingRemediation({ finding: {}, classification, reconciliation: { state: "missing_or_inaccessible" } });
    increment(result.routeCounts, route.route);
    if (route.route === "retry_later") result.retryCount += 1;
  }

  result.issueCreationCapability = securityFindingIssueCreationCapability({ ...config, securityFindings: securityConfig });
  if (proposals.length > 0) {
    const mutationConfig = {
      ...config,
      dryRun: true,
      run: false,
      allowFollowupIssueCreation: false,
      maxFollowupIssuesPerRun: securityConfig.maxProposalsPerRun,
    };
    const mutation = executeIssueMutationPipeline(mutationConfig, proposals, options.proposalEvidence || {}, {
      runner: () => {
        result.mutationCalls += 1;
        return { status: 1, stderr: "mutation runner must not be called in security findings dry-run" };
      },
    });
    result.reuseCount = mutation.results.filter((item) => item.action === "reuse" || item.action === "reuse_completed_evidence").length;
  }

  if (securityConfig.persistState && !partialSourceCoverage) {
    const written = writeSecurityFindingsState(mergedConfig, mergeSecurityFindingRecords(durableState, plannedRecords.length > 0 ? plannedRecords : normalized), {
      taskKey: options.taskKey || null,
      runId: options.runId || null,
      supervisorRunId: config.supervisorRunId || null,
      repository: securityConfig.allowedRepository,
    });
    result.statePath = written.statePath;
  }
  if ((result.failureCount > 0 || result.ambiguousCount > 0) && !securityConfig.allowPartialPlanning) {
    result.ok = false;
    result.reason = result.ambiguousCount > 0 ? "ambiguous_duplicate_evidence" : "source_failures";
    return result;
  }
  if (partialSourceCoverage) {
    result.ok = true;
    result.reason = "dry_run_partial_source_failures";
    return result;
  }
  result.ok = true;
  result.reason = "dry_run_complete";
  return result;
}

async function evaluateFalsePositiveDispositionReadiness({ finding, classification, reconciliation, securityConfig, options, now }) {
  const counts = {
    packetReadyCount: 0,
    packetBlockedCount: 0,
    reviewReadyCount: 0,
    tieBreakerRequiredCount: 0,
    dispositionReadyCount: 0,
    dispositionBlockedCount: 0,
    reconciliationReadyCount: 0,
    completionReadyCount: 0,
  };
  const failures = [];
  const evidence = options.falsePositiveEvidence?.[finding.correlationKey];
  if (!evidence) {
    counts.packetBlockedCount += 1;
    failures.push("false_positive_evidence_missing");
    return { counts, failures };
  }
  const packetResult = buildFalsePositivePacket({
    finding,
    classification,
    reconciliation,
    linkedIssue: evidence.linkedIssue || null,
    analysisKind: evidence.analysisKind,
    analysisReasonCodes: evidence.analysisReasonCodes,
    deterministicProofs: evidence.deterministicProofs,
    currentMainProof: evidence.currentMainProof,
    noWeakeningProof: evidence.noWeakeningProof,
    reviewPackageDigest: evidence.reviewPackageDigest,
  }, { now, ttlMinutes: securityConfig.disposition.packetTtlMinutes });
  if (!packetResult.ok) {
    counts.packetBlockedCount += 1;
    failures.push(packetResult.reason);
    return { counts, failures };
  }
  counts.packetReadyCount += 1;
  const reviewBundle = evidence.reviewBundle || buildReviewBundle(evidence.reviews || {}, packetResult.packet);
  const reviewValidation = validateFalsePositiveReviewBundle(reviewBundle, packetResult.packet, { now });
  if (!reviewValidation.ok) {
    failures.push(reviewValidation.reason);
    counts.dispositionBlockedCount += 1;
    if (reviewValidation.tieBreakerRequired) counts.tieBreakerRequiredCount += 1;
    return { counts, failures };
  }
  counts.reviewReadyCount += 1;
  if (reviewValidation.tieBreakerRequired) counts.tieBreakerRequiredCount += 1;
  const reason = evidence.dispositionReason || (finding.sourceKind === "dependabot_alert" ? "inaccurate" : "false positive");
  const policy = validateDispositionPolicy(packetResult.packet, reason);
  if (!policy.ok) {
    counts.dispositionBlockedCount += 1;
    failures.push(policy.reason);
    return { counts, failures };
  }
  const adapter = evidence.adapter || options.dispositionAdapter;
  if (!adapter) {
    counts.dispositionBlockedCount += 1;
    failures.push("disposition_adapter_missing");
    return { counts, failures };
  }
  const precondition = await prepareDispositionPrecondition(packetResult.packet, reviewBundle, adapter, { now });
  if (!precondition.ok) {
    counts.dispositionBlockedCount += 1;
    failures.push(precondition.reason);
    return { counts, failures };
  }
  counts.dispositionReadyCount += 1;
  if (evidence.postDispositionReconciliationReady === true) counts.reconciliationReadyCount += 1;
  if (evidence.completionReady === true) counts.completionReadyCount += 1;
  return { counts, failures };
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
    completeness: sourceResult.completeness || "unknown",
    count: sourceResult.findings?.length || 0,
    failures: sourceResult.failures || [],
    httpStatus: sourceResult.httpStatus || null,
    pagesRead: sourceResult.pagesRead || null,
    itemsRead: sourceResult.itemsRead ?? (sourceResult.findings?.length || 0),
    nextCursorPresent: sourceResult.nextCursorPresent ?? false,
    boundedBy: sourceResult.boundedBy || null,
  };
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function summarizeClassification(classification) {
  return {
    classificationVersion: classification.classificationVersion,
    category: classification.category,
    confidence: classification.confidence,
    reasonCodes: classification.reasonCodes,
    requiredReconciliation: classification.requiredReconciliation,
    suggestedLane: classification.suggestedLane,
    suggestedValidationProfile: classification.suggestedValidationProfile,
    manualGateRequired: classification.manualGateRequired,
    proposalEligible: classification.proposalEligible,
    policyDigest: classification.policyDigest,
  };
}

function summarizeReconciliation(reconciliation) {
  return {
    reconciliationVersion: reconciliation.reconciliationVersion,
    state: reconciliation.state,
    reasonCodes: reconciliation.reasonCodes,
    requiredCurrentMainScan: reconciliation.requiredCurrentMainScan,
    digest: reconciliation.digest,
  };
}

function summarizeRoute(route) {
  return {
    routeVersion: route.routeVersion,
    route: route.route,
    reasonCodes: route.reasonCodes,
    proposalAllowed: route.proposalAllowed,
  };
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
  classifier: "checkpoint_2_available",
  remediationProposal: "checkpoint_2_available",
  falsePositiveEvidencePacket: "checkpoint_3_pending",
  dispositionMutationAdapter: "checkpoint_3_pending",
  completionHygiene: "checkpoint_3_pending",
});

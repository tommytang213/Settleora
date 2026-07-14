import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeSecurityFinding } from "../lib/security-findings-model.mjs";
import { classifySecurityFinding } from "../lib/security-findings-classifier.mjs";
import { reconcileSecurityFinding } from "../lib/security-findings-reconciliation.mjs";
import { runSecurityFindingsDryRun } from "../lib/security-findings-dry-run.mjs";
import {
  buildFalsePositivePacket,
  falsePositiveAnalysisKinds,
  validateFalsePositivePacket,
} from "../lib/security-findings-false-positive.mjs";
import {
  buildReviewBundle,
  findingIdentityDigest,
  validateFalsePositiveReviewBundle,
} from "../lib/security-findings-reviews.mjs";
import {
  executeFalsePositiveDisposition,
  normalizeSecurityFindingDispositionConfig,
  postDispositionReconciliation,
  prepareDispositionPrecondition,
  supportedDispositionReasons,
  validateDispositionPolicy,
} from "../lib/security-findings-disposition.mjs";
import { evaluateSecurityFindingLinkedIssueCompletion } from "../lib/security-findings-completion.mjs";
import {
  advanceSecurityFindingLifecycle,
  createLifecycleRecord,
  securityFindingLifecycleStages,
} from "../lib/security-findings-state.mjs";
import {
  planSecurityFindingDispositionMarker,
  recordSecurityFindingDispositionMarker,
} from "../lib/security-findings-recovery.mjs";
import { createInitialRecoveryState } from "../lib/recovery-state.mjs";

const repository = "tommytang213/Settleora";
const now = "2026-07-14T07:20:00.000Z";
const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);

function tempConfig(extra = {}) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-security-disposition-"));
  chmodSync(logsRoot, 0o700);
  return {
    repoRoot: "/workspace/repos/Settleora",
    logsRoot,
    repositorySlug: repository,
    configPath: "/workspace/logs/settleora-auto-runner/security-findings/test/config.json",
    dryRun: true,
    run: false,
    securityFindings: {
      allowSecurityFindingIngestion: true,
      allowSecurityFindingClassification: true,
      allowSecurityFindingProposalPlanning: true,
      allowSecurityFindingIssueCreation: false,
      allowFalsePositiveEvidence: true,
      allowSecurityFindingDisposition: false,
      allowProvenFalsePositiveDisposition: false,
      allowSecurityFindingCompletionHygiene: false,
      allowedRepository: repository,
      enabledSourceKinds: ["dependabot_alert", "code_scanning_alert"],
      maxPages: 1,
      perPage: 10,
      maxItems: 20,
      persistState: false,
      dryRunOnly: true,
      packetTtlMinutes: 60,
      maxDispositionsPerRun: 1,
      ...extra.securityFindings,
    },
    ...extra,
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
  };
}

function codeFinding(overrides = {}) {
  const result = normalizeSecurityFinding({
    sourceKind: "code_scanning_alert",
    repository,
    provider: "github",
    tool: "CodeQL",
    ruleId: "js/test-rule",
    alertId: "42",
    fingerprint: "fp-42",
    state: "open",
    severity: "high",
    ref: "refs/heads/main",
    analyzedSha: headSha,
    locationPath: "tools/auto-runner/lib/security-findings-dry-run.mjs",
    locationLine: 12,
    ...overrides,
  }, { now });
  assert.equal(result.ok, true, result.errors?.join(","));
  return result.finding;
}

function depFinding(overrides = {}) {
  const result = normalizeSecurityFinding({
    sourceKind: "dependabot_alert",
    repository,
    provider: "github",
    tool: "dependabot",
    ruleId: "GHSA-xxxx-yyyy-zzzz",
    alertId: "7",
    fingerprint: "dependabot-alert-7",
    state: "open",
    severity: "high",
    dependency: "yaml",
    packageEcosystem: "npm",
    manifestPath: "tools/auto-runner/package.json",
    ...overrides,
  }, { now });
  assert.equal(result.ok, true, result.errors?.join(","));
  return result.finding;
}

function classifyFalsePositive(finding) {
  return classifySecurityFinding({
    finding,
    falsePositiveCandidate: { authorizedAnalysis: true, requiredProofGates: ["exact_alert", "review", "current_main"] },
  }, { now });
}

function packetFor(finding = codeFinding(), overrides = {}) {
  const classification = classifyFalsePositive(finding);
  const reconciliation = reconcileSecurityFinding({ finding, current: finding }, { now });
  const packet = buildFalsePositivePacket({
    finding,
    classification,
    reconciliation,
    linkedIssue: 1001,
    analysisKind: finding.sourceKind === "dependabot_alert" ? "dependency_not_present_or_reachable" : "source_to_sink_impossible",
    analysisReasonCodes: ["deterministic_proof_complete"],
    deterministicProofs: finding.sourceKind === "dependabot_alert" ? dependencyProofs() : codeProofs(),
    currentMainProof: currentMainProof(finding),
    noWeakeningProof: noWeakeningProof(finding),
    reviewPackageDigest: "1".repeat(64),
    ...overrides,
  }, { now, ttlMinutes: 60 });
  assert.equal(packet.ok, true, packet.errors?.join(","));
  return { packet: packet.packet, finding, classification, reconciliation };
}

function codeProofs() {
  return [
    proof("source_to_sink_graph_digest", "source-to-sink"),
    proof("test_result_digest", "runner-tests"),
  ];
}

function dependencyProofs() {
  return [
    proof("dependency_graph_digest", "dependency-graph"),
    proof("current_main_scanner_digest", "current-main-scanner"),
  ];
}

function proof(kind, commandId) {
  return {
    proofVersion: 1,
    kind,
    commandId,
    subjectDigest: "2".repeat(64),
    resultDigest: "3".repeat(64),
    headSha,
    producedAt: now,
  };
}

function currentMainProof(finding) {
  return {
    proofVersion: 1,
    repository,
    mainSha: baseSha,
    scannerDigest: "4".repeat(64),
    ruleId: finding.ruleId,
    fingerprintAbsentOrSuperseded: true,
    checkedAt: now,
  };
}

function noWeakeningProof(finding, overrides = {}) {
  return {
    proofVersion: 1,
    headSha,
    baseSha,
    ref: finding.ref || null,
    scannerConfigDigest: "5".repeat(64),
    workflowDigest: "6".repeat(64),
    changedFilesDigest: "7".repeat(64),
    ruleId: finding.ruleId,
    forbiddenSignalsAbsent: {
      queryExclusion: true,
      pathIgnore: true,
      suppression: true,
      skippedCheck: true,
      generatedHiding: true,
      renamedToEvade: true,
      riskAcceptance: true,
      ...(overrides.forbiddenSignalsAbsent || {}),
    },
    checkedAt: now,
    ...overrides,
  };
}

function reviewsFor(packet, overrides = {}) {
  const findingDigest = findingIdentityDigest(packet);
  const strong = review({
    providerTier: "strong_independent",
    provider: "gemini",
    providerProfile: "gemini-strong",
    model: "gemini-3.5-flash",
    packetDigest: packet.packetDigest,
    findingIdentityDigest: findingDigest,
    verdict: "pass",
    confidence: "high",
    secretBoundaryPass: true,
    budgetPass: true,
    ...overrides.strongIndependent,
  });
  const codex = review({
    providerTier: "codex_mechanics",
    provider: "codex",
    providerProfile: "codex-mechanics-default",
    model: "codex-subscription",
    packetDigest: packet.packetDigest,
    findingIdentityDigest: findingDigest,
    verdict: "approve",
    confidence: "high",
    endpointVerified: true,
    recoveryVerified: true,
    noForbiddenActionVerified: true,
    ...overrides.codexMechanics,
  });
  const tieBreaker = overrides.tieBreaker === undefined ? null : review({
    providerTier: "tie_breaker",
    provider: "gemini",
    providerProfile: "gemini-strong",
    model: "gemini-3.5-flash",
    packetDigest: packet.packetDigest,
    findingIdentityDigest: findingDigest,
    verdict: "pass",
    confidence: "high",
    ...overrides.tieBreaker,
  });
  return buildReviewBundle({ strongIndependent: strong, codexMechanics: codex, tieBreaker }, packet);
}

function review(input) {
  const output = {
    reviewVersion: 1,
    baseSha,
    headSha,
    ref: "refs/heads/main",
    findings: [],
    conditions: [],
    conditional: false,
    evidenceChanged: false,
    completedAt: now,
    ...input,
  };
  output.reviewDigest = digest({ ...output, reviewDigest: undefined });
  return output;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function adapterFor(packet, options = {}) {
  let mutationCalls = 0;
  const openRead = {
    status: "ok",
    repository: packet.repository,
    sourceKind: packet.sourceKind,
    provider: packet.provider,
    tool: packet.tool,
    alertId: packet.alertId,
    ruleId: packet.ruleId,
    fingerprint: packet.fingerprint,
    ref: packet.ref,
    analyzedSha: packet.analyzedSha,
    dependencyIdentity: packet.dependencyIdentity,
    state: "open",
    current: true,
    rereadDigest: "8".repeat(64),
  };
  return {
    get mutationCalls() {
      return mutationCalls;
    },
    async rereadAlert() {
      if (options.inaccessible) return { status: "failed", reason: "permission_denied" };
      if (options.changed) return { ...openRead, fingerprint: "changed", rereadDigest: "9".repeat(64) };
      if (options.afterMutation) return { ...openRead, state: "dismissed", dismissedReason: options.reason || "false positive", rereadDigest: "a".repeat(64) };
      return openRead;
    },
    async dismissAlert() {
      mutationCalls += 1;
      if (options.uncertain) return { status: "unknown", httpStatus: 502, responseDigest: "b".repeat(64) };
      options.afterMutation = true;
      return { status: "ok", httpStatus: 200, responseDigest: "c".repeat(64) };
    },
  };
}

test("false-positive packet accepts code-scanning and Dependabot full deterministic proof paths", () => {
  const code = packetFor(codeFinding()).packet;
  assert.equal(validateFalsePositivePacket(code, { now }).ok, true);
  const dep = packetFor(depFinding()).packet;
  assert.equal(dep.sourceKind, "dependabot_alert");
  assert.equal(validateFalsePositivePacket(dep, { now }).ok, true);
  assert.deepEqual(falsePositiveAnalysisKinds.includes("dependency_not_present_or_reachable"), true);
});

test("packet validation rejects unknown fields invalid ids tampering expiry missing proofs and raw payloads", () => {
  const { packet, classification, reconciliation } = packetFor();
  assert.equal(validateFalsePositivePacket({ ...packet, extra: true }, { now }).reason, "unknown_field:extra");
  assert.match(validateFalsePositivePacket({ ...packet, repository: "bad repo" }, { now }).reason, /repository_invalid|packet_digest_mismatch/);
  assert.match(validateFalsePositivePacket({ ...packet, deterministicProofs: [proof("test_result_digest", "runner-tests")] }, { now }).errors.join(","), /deterministic_proof_missing/);
  assert.match(validateFalsePositivePacket({ ...packet, packetDigest: "0".repeat(64) }, { now }).errors.join(","), /packet_digest_mismatch/);
  assert.match(validateFalsePositivePacket({ ...packet, expiresAt: "2026-07-14T07:19:00.000Z" }, { now }).errors.join(","), /packet_expired/);
  assert.match(validateFalsePositivePacket({ ...packet, deterministicProofs: [{ ...packet.deterministicProofs[0], rawPayload: "x" }] }, { now }).errors.join(","), /deterministic_proof_unknown_field/);
  assert.match(validateFalsePositivePacket(packet, { classification: { ...classification, policyDigest: "0".repeat(32) }, reconciliation, now }).errors.join(","), /classification_digest_mismatch/);
});

test("no-weakening proof detects query exclusions path ignores suppressions skipped checks and scanner drift", () => {
  const finding = codeFinding();
  const classification = classifyFalsePositive(finding);
  const reconciliation = reconcileSecurityFinding({ finding, current: finding }, { now });
  const weakened = buildFalsePositivePacket({
    finding,
    classification,
    reconciliation,
    linkedIssue: 1001,
    analysisKind: "source_to_sink_impossible",
    analysisReasonCodes: ["deterministic_proof_complete"],
    deterministicProofs: codeProofs(),
    currentMainProof: currentMainProof(finding),
    noWeakeningProof: noWeakeningProof(finding, { forbiddenSignalsAbsent: { queryExclusion: false } }),
    reviewPackageDigest: "1".repeat(64),
  }, { now, ttlMinutes: 60 });
  assert.equal(weakened.reason, "no_weakening_forbidden_signal:queryExclusion");
  const drifted = buildFalsePositivePacket({
    finding,
    classification,
    reconciliation,
    linkedIssue: 1001,
    analysisKind: "source_to_sink_impossible",
    analysisReasonCodes: ["deterministic_proof_complete"],
    deterministicProofs: codeProofs(),
    currentMainProof: currentMainProof(finding),
    noWeakeningProof: noWeakeningProof(finding, { scannerConfigDigest: "not-a-digest" }),
    reviewPackageDigest: "1".repeat(64),
  }, { now, ttlMinutes: 60 });
  assert.equal(drifted.reason, "no_weakening_scannerConfigDigest_invalid");
});

test("review gates require exact strong and Codex approval and tie-breaker on disagreement", () => {
  const { packet } = packetFor();
  const bundle = reviewsFor(packet);
  assert.equal(validateFalsePositiveReviewBundle(bundle, packet, { now }).ok, true);
  const badStrong = reviewsFor(packet, { strongIndependent: { verdict: "conditional", findings: ["bounded finding"] }, tieBreaker: { verdict: "pass" } });
  assert.equal(validateFalsePositiveReviewBundle(badStrong, packet, { now }).reason, "strong_review_verdict_not_pass");
  const needTie = reviewsFor(packet, { codexMechanics: { confidence: "medium" } });
  const needTieValidation = validateFalsePositiveReviewBundle(needTie, packet, { now });
  assert.equal(needTieValidation.ok, false);
  assert.equal(needTieValidation.tieBreakerRequired, true);
  const withTie = reviewsFor(packet, { codexMechanics: { confidence: "medium" }, tieBreaker: { verdict: "pass" } });
  assert.equal(validateFalsePositiveReviewBundle(withTie, packet, { now }).ok, true);
  const failedTie = reviewsFor(packet, { codexMechanics: { confidence: "medium" }, tieBreaker: { verdict: "inconclusive" } });
  assert.equal(validateFalsePositiveReviewBundle(failedTie, packet, { now }).reason, "tie_breaker_verdict_not_pass");
});

test("disposition policy supports only exact provider false-positive equivalents", () => {
  const code = packetFor(codeFinding()).packet;
  const dep = packetFor(depFinding()).packet;
  assert.equal(validateDispositionPolicy(code, "false positive").ok, true);
  assert.equal(validateDispositionPolicy(dep, "inaccurate").ok, true);
  assert.equal(validateDispositionPolicy(code, "risk accepted").reason, "disposition_reason_unsupported");
  assert.equal(validateDispositionPolicy({ ...code, sourceKind: "semgrep_artifact" }, "false positive").reason, "disposition_source_kind_unsupported");
  assert.deepEqual(supportedDispositionReasons.dependabot_alert, ["inaccurate"]);
});

test("precondition reread blocks provider outages identity changes non-open state and races", async () => {
  const { packet } = packetFor();
  const bundle = reviewsFor(packet);
  const adapter = adapterFor(packet);
  const ready = await prepareDispositionPrecondition(packet, bundle, adapter, { now });
  assert.equal(ready.ok, true);
  assert.equal((await prepareDispositionPrecondition(packet, bundle, adapterFor(packet, { inaccessible: true }), { now })).reason, "alert_reread_inaccessible:permission_denied");
  assert.equal((await prepareDispositionPrecondition(packet, bundle, adapterFor(packet, { changed: true }), { now })).reason, "alert_reread_fingerprint_mismatch");

  const race = await executeFalsePositiveDisposition(realDispositionConfig(), packet, bundle, ready.precondition, adapterFor(packet, { changed: true }), { now });
  assert.equal(race.reason, "alert_reread_fingerprint_mismatch");
});

test("default-off disposition refuses dry-run, confirms success, and uses reread recovery on uncertain outcome", async () => {
  const { packet } = packetFor();
  const bundle = reviewsFor(packet);
  const adapter = adapterFor(packet);
  const ready = await prepareDispositionPrecondition(packet, bundle, adapter, { now });
  assert.equal(executeFalsePositiveDisposition(tempConfig(), packet, bundle, ready.precondition, adapter, { now }) instanceof Promise, true);
  assert.equal((await executeFalsePositiveDisposition(tempConfig(), packet, bundle, ready.precondition, adapter, { now })).reason, "disposition_capability_disabled");
  const realConfig = realDispositionConfig();
  const successAdapter = adapterFor(packet);
  const success = await executeFalsePositiveDisposition(realConfig, packet, bundle, ready.precondition, successAdapter, { now });
  assert.equal(success.ok, true);
  assert.equal(successAdapter.mutationCalls, 1);
  const uncertainAdapter = adapterFor(packet, { uncertain: true });
  const uncertain = await executeFalsePositiveDisposition(realConfig, packet, bundle, ready.precondition, uncertainAdapter, { now });
  assert.equal(uncertain.reason, "disposition_outcome_uncertain");
  assert.equal(uncertainAdapter.mutationCalls, 1);
});

test("configuration remains fail-closed for invalid disposition combinations", () => {
  assert.equal(normalizeSecurityFindingDispositionConfig(tempConfig()).allowSecurityFindingDisposition, false);
  assert.throws(() => normalizeSecurityFindingDispositionConfig(realDispositionConfig({ securityFindings: { dryRunOnly: true } })), /dryRunOnly/);
  assert.throws(() => normalizeSecurityFindingDispositionConfig(realDispositionConfig({ trustedRealRunApproved: false })), /trusted real-run/);
  assert.throws(() => normalizeSecurityFindingDispositionConfig(realDispositionConfig({ securityFindings: { allowedDispositionReasons: { code_scanning_alert: ["won't fix"] } } })), /Unsupported disposition reason/);
});

test("post-disposition reconciliation and linked issue completion fail closed before exact proof", async () => {
  const { packet } = packetFor();
  const bundle = reviewsFor(packet);
  const ready = await prepareDispositionPrecondition(packet, bundle, adapterFor(packet), { now });
  const disposition = await executeFalsePositiveDisposition(realDispositionConfig(), packet, bundle, ready.precondition, adapterFor(packet), { now });
  const bad = postDispositionReconciliation(packet, disposition, { providerState: "dismissed", reason: "false positive", noWeakeningVerified: false, currentMainScannerClean: true });
  assert.equal(bad.reason, "post_disposition_no_weakening_missing");
  const reconciliation = postDispositionReconciliation(packet, disposition, {
    providerState: "dismissed",
    reason: "false positive",
    noWeakeningVerified: true,
    currentMainScannerClean: true,
    currentMainDigest: "d".repeat(64),
    reconciledAt: now,
  });
  assert.equal(reconciliation.ok, true);
  const blocked = evaluateSecurityFindingLinkedIssueCompletion({
    issue: { number: 902, state: "OPEN", correlationKey: packet.correlationKey, closeRule: "confirmed_false_positive_disposition" },
    packet,
    disposition,
    reconciliation,
  });
  assert.equal(blocked.reason, "linked_issue_not_narrow");
  const close = evaluateSecurityFindingLinkedIssueCompletion({
    issue: { number: 1001, state: "OPEN", correlationKey: packet.correlationKey, closeRule: "confirmed_false_positive_disposition" },
    packet,
    disposition,
    reconciliation,
    parentIssueState: "OPEN",
  });
  assert.equal(close.close, true);
  assert.doesNotMatch(close.evidenceComment, /rawPayload|Bearer|token=/i);
});

test("lifecycle and recovery markers cover disposition stages and invalid transitions", () => {
  let lifecycle = createLifecycleRecord();
  for (const stage of [
    "classified",
    "reconciled",
    "false_positive_evidence_pending",
    "false_positive_packet_ready",
    "false_positive_reviews_pending",
    "false_positive_reviewed",
    "disposition_precondition_ready",
    "disposition_in_progress",
    "disposition_confirmed",
    "post_disposition_reconciliation_pending",
    "post_disposition_reconciled",
    "linked_issue_completion_pending",
    "completed",
  ]) {
    const advanced = advanceSecurityFindingLifecycle(lifecycle, stage, { packetDigest: "p", reviewDigest: "r" });
    assert.equal(advanced.ok, true, stage);
    lifecycle = advanced.lifecycle;
  }
  assert.equal(advanceSecurityFindingLifecycle(createLifecycleRecord(), "disposition_confirmed").reason, "security_findings_lifecycle_transition_invalid");
  assert.equal(securityFindingLifecycleStages.includes("disposition_confirmed"), true);
  const { packet } = packetFor();
  let state = createInitialRecoveryState({
    taskKey: "20260714-1459",
    issue: { number: 902, title: "security", url: "https://example.invalid/902" },
    runId: "run-2026-07-14T072000Z",
    branchName: "feature/auto-902-security-findings-20260714-1400",
    baseSha,
    currentHeadSha: headSha,
  });
  assert.equal(planSecurityFindingDispositionMarker(state, packet, "attempted").action, "perform_once");
  state = recordSecurityFindingDispositionMarker(state, packet, { stage: "attempted" });
  assert.equal(planSecurityFindingDispositionMarker(state, packet, "attempted").action, "skip_existing_marker");
});

test("disposition readiness dry-run reports packet review disposition reconciliation and completion counts without mutation", async () => {
  const finding = codeFinding();
  const { packet, classification, reconciliation } = packetFor(finding);
  const bundle = reviewsFor(packet);
  const adapter = adapterFor(packet);
  const config = tempConfig();
  try {
    const result = await runSecurityFindingsDryRun(config, {
      adapter: { async fetchSource(sourceKind) { return { sourceKind, status: "ok", findings: sourceKind === "code_scanning_alert" ? [finding] : [], failures: [] }; } },
      reports: [],
      now: () => now,
      currentFindings: { [finding.correlationKey]: finding },
      classificationInputs: {
        [finding.correlationKey]: { falsePositiveCandidate: { authorizedAnalysis: true, requiredProofGates: ["exact_alert", "review", "current_main"] } },
      },
      falsePositiveEvidence: {
        [finding.correlationKey]: {
          analysisKind: packet.analysisKind,
          analysisReasonCodes: packet.analysisReasonCodes,
          deterministicProofs: packet.deterministicProofs,
          currentMainProof: packet.currentMainProof,
          noWeakeningProof: packet.noWeakeningProof,
          reviewPackageDigest: packet.reviewPackageDigest,
          linkedIssue: packet.linkedIssue,
          reviewBundle: bundle,
          adapter,
          dispositionReason: "false positive",
          postDispositionReconciliationReady: true,
          completionReady: true,
        },
      },
    });
    assert.equal(classification.category, "false_positive_candidate");
    assert.equal(reconciliation.state, "current_open");
    assert.equal(result.ok, true);
    assert.equal(result.falsePositiveCandidateCount, 1);
    assert.equal(result.packetReadyCount, 1);
    assert.equal(result.reviewReadyCount, 1);
    assert.equal(result.dispositionReadyCount, 1);
    assert.equal(result.reconciliationReadyCount, 1);
    assert.equal(result.completionReadyCount, 1);
    assert.equal(result.mutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

function realDispositionConfig(extra = {}) {
  const base = tempConfig({
    dryRun: false,
    run: true,
    mode: "run",
    trustedRealRunApproved: true,
    securityFindings: {
      dryRunOnly: false,
      allowSecurityFindingDisposition: true,
      allowProvenFalsePositiveDisposition: true,
      allowSecurityFindingCompletionHygiene: true,
      dispositionDryRunOnly: false,
    },
  });
  return {
    ...base,
    ...extra,
    securityFindings: {
      ...base.securityFindings,
      ...(extra.securityFindings || {}),
    },
  };
}

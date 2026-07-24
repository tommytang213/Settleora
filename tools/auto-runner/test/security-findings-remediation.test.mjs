import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeDependabotAlert, normalizeSecurityFinding } from "../lib/security-findings-model.mjs";
import { classifySecurityFinding, securityFindingCategories } from "../lib/security-findings-classifier.mjs";
import { reconcileSecurityFinding, securityFindingReconciliationStates } from "../lib/security-findings-reconciliation.mjs";
import { routeSecurityFindingRemediation, securityFindingRoutes } from "../lib/security-findings-remediation.mjs";
import { buildSecurityFindingProposal, securityFindingIssueCreationCapability } from "../lib/security-findings-proposals.mjs";
import {
  advanceSecurityFindingLifecycle,
  createLifecycleRecord,
  readSecurityFindingsState,
  securityFindingsStatePath,
  validateSecurityFindingsState,
  writeSecurityFindingsState,
} from "../lib/security-findings-state.mjs";
import { classifySecurityFindingRecovery, planSecurityFindingMutationMarker, recordSecurityFindingMutationMarker } from "../lib/security-findings-recovery.mjs";
import { createInitialRecoveryState } from "../lib/recovery-state.mjs";
import { runSecurityFindingsDryRun } from "../lib/security-findings-dry-run.mjs";
import { classifyIssueLane } from "../lib/lane-policy.mjs";

const repository = "tommytang213/Settleora";
const now = "2026-07-14T06:50:00.000Z";

function tempConfig(extra = {}) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-security-remediation-"));
  chmodSync(logsRoot, 0o700);
  const { securityFindings = {}, ...rest } = extra;
  return {
    repoRoot: "/workspace/repos/Settleora",
    logsRoot,
    repositorySlug: repository,
    configPath: "/workspace/logs/settleora-auto-runner/security-findings/test/config.json",
    securityFindings: {
      allowSecurityFindingIngestion: true,
      allowSecurityFindingClassification: true,
      allowSecurityFindingProposalPlanning: true,
      allowSecurityFindingIssueCreation: false,
      allowedRepository: repository,
      enabledSourceKinds: ["dependabot_alert", "code_scanning_alert"],
      maxPages: 1,
      perPage: 10,
      maxItems: 20,
      maxRetries: 0,
      timeoutMs: 1000,
      persistState: true,
      maxProposalsPerRun: 10,
      ...securityFindings,
    },
    ...rest,
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
    analyzedSha: "a".repeat(40),
    locationPath: "tools/auto-runner/lib/security-findings-dry-run.mjs",
    locationLine: 12,
    ...overrides,
  }, { now });
  assert.equal(result.ok, true, result.errors?.join(","));
  return result.finding;
}

function dependencyFinding(overrides = {}) {
  return normalizeDependabotAlert({
    number: 7,
    state: "open",
    dependency: { package: { name: "yaml", ecosystem: "pub" }, manifest_path: "apps/mobile/pubspec.yaml" },
    security_advisory: { ghsa_id: "GHSA-xxxx-yyyy-zzzz", severity: "high" },
    security_vulnerability: { package: { name: "yaml", ecosystem: "pub" } },
    html_url: "https://github.com/tommytang213/Settleora/security/dependabot/7",
    created_at: now,
    updated_at: now,
    ...overrides,
  }, { repository, now }).finding;
}

test("classifier covers all categories and fails closed on unsafe evidence", () => {
  const safe = classifySecurityFinding({ finding: codeFinding(), authorityResolved: true }, { now });
  assert.equal(safe.category, "safe_code_fix");
  assert.equal(safe.suggestedLane, "workflow-docs-tooling");

  const dep = classifySecurityFinding({ finding: dependencyFinding(), sourceIdentityVerified: true }, { now });
  assert.equal(dep.category, "dependency_update");

  const retry = classifySecurityFinding({
    finding: { sourceKind: "code_scanning_alert", correlationKey: "k", idempotencyKey: "i" },
    providerFailure: { reason: "provider_retryable_failure" },
  }, { now });
  assert.equal(retry.category, "retryable_infrastructure");

  const fp = classifySecurityFinding({
    finding: codeFinding(),
    falsePositiveCandidate: { authorizedAnalysis: true, requiredProofGates: ["exact_alert", "review", "current_main"] },
  }, { now });
  assert.equal(fp.category, "false_positive_candidate");

  const manual = classifySecurityFinding({ finding: codeFinding({ locationPath: "services/api/Auth/Sessions.cs" }), authorityResolved: false }, { now });
  assert.equal(manual.category, "manual_security_product_decision");

  for (const locationPath of [
    "services/api/Auth/Sessions.cs",
    "services/api/Storage/FilePolicy.cs",
    "services/api/Settlement/PaymentService.cs",
  ]) {
    const unresolved = classifySecurityFinding({ finding: codeFinding({ locationPath }) }, { now });
    assert.equal(unresolved.category, "manual_security_product_decision", locationPath);
    assert.equal(unresolved.manualGateRequired, true, locationPath);
    const explicitFalse = classifySecurityFinding({ finding: codeFinding({ locationPath }), authorityResolved: false }, { now });
    assert.equal(explicitFalse.category, "manual_security_product_decision", locationPath);
    const explicitTrue = classifySecurityFinding({ finding: codeFinding({ locationPath }), authorityResolved: true }, { now });
    assert.equal(explicitTrue.category, "safe_code_fix", locationPath);
  }

  const ambiguous = classifySecurityFinding({ finding: codeFinding({ locationPath: "apps/mobile/lib/a.dart" }), relatedPaths: ["services/api/Auth/Sessions.cs"] }, { now });
  assert.equal(ambiguous.category, "unsupported_ambiguous");

  const testFileOnly = classifySecurityFinding({ finding: codeFinding({ locationPath: "apps/mobile/test/widget_test.dart", ruleId: null }) }, { now });
  assert.equal(testFileOnly.category, "unsupported_ambiguous");

  const unverifiedPr = classifySecurityFinding({ finding: { ...dependencyFinding(), sourceKind: "dependabot_pr", manifestPath: null }, sourceIdentityVerified: false }, { now });
  assert.equal(unverifiedPr.category, "unsupported_ambiguous");

  const rootNpm = classifySecurityFinding({
    finding: dependencyFinding({
      dependency: { package: { name: "yaml", ecosystem: "npm" }, manifest_path: "package-lock.json" },
      security_vulnerability: { package: { name: "yaml", ecosystem: "npm" } },
    }),
    sourceIdentityVerified: true,
  }, { now });
  assert.equal(rootNpm.category, "dependency_update");
  assert.equal(rootNpm.suggestedLane, "workflow-docs-tooling");

  assert.deepEqual(new Set(securityFindingCategories), new Set([
    "safe_code_fix",
    "dependency_update",
    "retryable_infrastructure",
    "false_positive_candidate",
    "manual_security_product_decision",
    "unsupported_ambiguous",
  ]));
});

test("root npm dependabot paths use exact workflow tooling lane scope only", () => {
  for (const allowedPath of ["package.json", "package-lock.json", "npm-shrinkwrap.json"]) {
    const lane = classifyIssueLane({
      number: 0,
      title: `Dependency update for ${allowedPath}`,
      labels: ["auto-ready"],
      body: [
        "## Auto-runner contract",
        "",
        "```json",
        JSON.stringify({
          contractVersion: 1,
          lane: "workflow-docs-tooling",
          allowedPaths: [allowedPath],
          validationProfile: "runner-tests",
          manualMergeRequired: true,
          autoMergeEligible: false,
          requiredReading: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
        }, null, 2),
        "```",
      ].join("\n"),
    });
    assert.equal(lane.allowedToImplement, true, allowedPath);
    assert.equal(lane.canonicalLane, "workflow-docs-tooling");
  }

  for (const rejectedPath of [".npmrc", ".env", "package.json.bak", "packages/client-web/package.json", ".github/workflows/scanner.yml"]) {
    const lane = classifyIssueLane({
      number: 0,
      title: `Dependency update for ${rejectedPath}`,
      labels: ["auto-ready"],
      body: [
        "## Auto-runner contract",
        "",
        "```json",
        JSON.stringify({
          contractVersion: 1,
          lane: "workflow-docs-tooling",
          allowedPaths: [rejectedPath],
          validationProfile: "runner-tests",
          manualMergeRequired: true,
          autoMergeEligible: false,
          requiredReading: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
        }, null, 2),
        "```",
      ].join("\n"),
    });
    assert.equal(lane.allowedToImplement, false, rejectedPath);
  }
});

test("reconciliation distinguishes current stale superseded resolved inaccessible and ambiguous states", () => {
  const finding = codeFinding();
  const cases = [
    [reconcileSecurityFinding({ finding, current: finding }, { now }).state, "current_open"],
    [reconcileSecurityFinding({ finding, current: { ...finding, ref: "refs/heads/old" } }, { now }).state, "stale_ref"],
    [reconcileSecurityFinding({ finding, current: { ...finding, fingerprint: "new" } }, { now }).state, "superseded_fingerprint"],
    [reconcileSecurityFinding({ finding, current: { ...finding, state: "fixed" } }, { now }).state, "resolved_upstream"],
    [reconcileSecurityFinding({ finding, failures: ["permission_denied"] }, { now }).state, "missing_or_inaccessible"],
    [reconcileSecurityFinding({ finding, matches: [finding, finding] }, { now }).state, "ambiguous"],
    [reconcileSecurityFinding({ finding: { ...finding, ref: "refs/pull/1/head" }, current: finding }, { now }).state, "requires_current_main_scan"],
  ];
  for (const [actual, expected] of cases) assert.equal(actual, expected);
  assert.deepEqual(new Set(securityFindingReconciliationStates), new Set([
    "current_open",
    "stale_ref",
    "superseded_fingerprint",
    "resolved_upstream",
    "missing_or_inaccessible",
    "ambiguous",
    "requires_current_main_scan",
  ]));
});

test("routes enforce current reconciliation before proposals and no mutation routes", () => {
  const finding = codeFinding();
  const safe = classifySecurityFinding({ finding, authorityResolved: true }, { now });
  assert.equal(routeSecurityFindingRemediation({ finding, classification: safe, reconciliation: { state: "current_open" } }).route, "propose_issue");
  assert.equal(routeSecurityFindingRemediation({ finding, classification: safe, reconciliation: { state: "resolved_upstream" } }).route, "no_action_resolved");
  const duplicateReuse = routeSecurityFindingRemediation({
    finding,
    classification: safe,
    reconciliation: { state: "current_open" },
    duplicate: {
      ok: true,
      status: "duplicate",
      evidence: [{ source: "issues.open", number: 902, state: "OPEN", confidence: "exact_marker", authority: "authoritative", lifecycle: "active", body: "must not persist" }],
    },
  });
  assert.equal(duplicateReuse.route, "reuse_existing_work");
  assert.equal(duplicateReuse.proposalAllowed, false);
  assert.equal(duplicateReuse.mutationAllowed, false);
  assert.deepEqual(duplicateReuse.reasonCodes, ["authoritative_duplicate_reuse"]);
  assert.deepEqual(duplicateReuse.duplicateEvidence, [{ source: "issues.open", number: 902, state: "OPEN", confidence: "exact_marker", authority: "authoritative", lifecycle: "active" }]);
  const completedDuplicate = routeSecurityFindingRemediation({
    finding,
    classification: safe,
    reconciliation: { state: "current_open" },
    duplicate: {
      ok: true,
      status: "duplicate",
      evidence: [{ source: "prs.closed", number: 916, state: "CLOSED", confidence: "exact_marker", authority: "authoritative", lifecycle: "completed" }],
    },
  });
  assert.equal(completedDuplicate.route, "blocked_ambiguous");
  assert.deepEqual(completedDuplicate.reasonCodes, ["completed_duplicate_still_open_requires_reconciliation"]);
  assert.equal(routeSecurityFindingRemediation({
    finding,
    classification: safe,
    reconciliation: { state: "resolved_upstream" },
    duplicate: {
      ok: true,
      status: "duplicate",
      evidence: [{ source: "prs.closed", number: 916, state: "CLOSED", confidence: "exact_marker", authority: "authoritative", lifecycle: "completed" }],
    },
  }).route, "no_action_resolved");
  assert.equal(routeSecurityFindingRemediation({ finding, classification: { category: "retryable_infrastructure" }, reconciliation: {} }).route, "retry_later");
  assert.equal(routeSecurityFindingRemediation({ finding, classification: { category: "false_positive_candidate" }, reconciliation: {} }).route, "collect_false_positive_evidence");
  assert.equal(routeSecurityFindingRemediation({ finding, classification: { category: "manual_security_product_decision" }, reconciliation: {} }).route, "manual_gate");
  assert.equal(routeSecurityFindingRemediation({ finding, classification: safe, reconciliation: { state: "ambiguous" } }).route, "blocked_ambiguous");
  assert.deepEqual(new Set(securityFindingRoutes), new Set([
    "propose_issue",
    "reuse_existing_work",
    "retry_later",
    "collect_false_positive_evidence",
    "manual_gate",
    "no_action_resolved",
    "blocked_ambiguous",
  ]));
});

test("security finding proposal is sanitized parser-valid exact-path generated work", () => {
  const finding = codeFinding();
  const classification = classifySecurityFinding({ finding, authorityResolved: true }, { now });
  const reconciliation = reconcileSecurityFinding({ finding, current: finding }, { now });
  const route = routeSecurityFindingRemediation({ finding, classification, reconciliation });
  const proposal = buildSecurityFindingProposal({ finding, classification, reconciliation, route });
  assert.equal(proposal.ok, true, proposal.reason);
  assert.equal(proposal.proposal.parentIssue, 902);
  assert.deepEqual(proposal.proposal.allowedPaths, [finding.locationPath]);
  assert.equal(proposal.proposal.autoRunnerContract.lane, "workflow-docs-tooling");
  assert.equal(proposal.proposal.autoRunnerContract.validationProfile, "runner-tests");
  assert.match(proposal.proposal.correlationKey, /^settleora:sf-remediation:v1:/);
  assert.doesNotMatch(JSON.stringify(proposal.proposal), /rawPayload|SARIF|snippet|Bearer|token=|ignore previous instructions/i);
});

test("dual issue creation gates stay default-off and require global plus security capability", () => {
  assert.equal(securityFindingIssueCreationCapability({ run: true, allowFollowupIssueCreation: true, securityFindings: { allowSecurityFindingIssueCreation: false } }).allowed, false);
  assert.equal(securityFindingIssueCreationCapability({ run: true, allowFollowupIssueCreation: false, securityFindings: { allowSecurityFindingIssueCreation: true } }).allowed, false);
  assert.equal(securityFindingIssueCreationCapability({
    run: true,
    configPath: "/workspace/auto-runner/config/test-production.json",
    runtimeMode: "external",
    runtimeRoot: "/workspace/auto-runner/runtime",
    repoRoot: "/workspace/repos/Settleora",
    logsRoot: "/workspace/logs/auto-runner/Settleora",
    projectId: "Settleora",
    repositorySlug: "tommytang213/Settleora",
    runtimeBundleDigest: "a".repeat(64),
    runtimeIdentity: Object.freeze({
      version: 1, projectId: "Settleora", repositorySlug: "tommytang213/settleora",
      runtimeRoot: "/workspace/auto-runner/runtime", repoRoot: "/workspace/repos/Settleora",
      logsRoot: "/workspace/logs/auto-runner/Settleora", namespace: "b".repeat(64),
    }),
    runtimeManifest: Object.freeze({ bundleDigest: "a".repeat(64), sourceSha: "c".repeat(40) }),
    trustedRealRunApproved: true,
    allowAutoMerge: true,
    autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"] },
    allowFollowupIssueCreation: true,
    maxFollowupIssuesPerRun: 3,
    allowReviewFixMutation: true,
    maxReviewFixCycles: 50,
    allowStaleClaimSteal: false,
    allowSystemdEnablement: false,
    securityFindings: { allowSecurityFindingIssueCreation: true },
  }).allowed, true);
});

test("lifecycle state reads checkpoint-1 records compatibly and rejects invalid transitions", () => {
  const config = tempConfig();
  try {
    const finding = codeFinding();
    const oldStatePath = securityFindingsStatePath(config);
    writeSecurityFindingsState(config, [finding]);
    const state = JSON.parse(readFileSync(oldStatePath, "utf8"));
    writeFileSync(oldStatePath, `${JSON.stringify({ ...state, stateVersion: 1, records: state.records.map(({ lifecycle, ...record }) => record) }, null, 2)}\n`, { mode: 0o600 });
    const read = readSecurityFindingsState(config);
    assert.equal(read.ok, true);
    assert.equal(read.state.stateVersion, 2);
    assert.equal(read.state.records[0].lifecycle.stage, "ingested");

    let lifecycle = createLifecycleRecord();
    let advanced = advanceSecurityFindingLifecycle(lifecycle, "classified", { classificationDigest: "c" });
    assert.equal(advanced.ok, true);
    advanced = advanceSecurityFindingLifecycle(advanced.lifecycle, "reconciled", { reconciliationDigest: "r" });
    assert.equal(advanced.ok, true);
    advanced = advanceSecurityFindingLifecycle(advanced.lifecycle, "proposal_planned", { proposalDigest: "p" });
    assert.equal(advanced.ok, true);
    assert.equal(advanceSecurityFindingLifecycle(createLifecycleRecord(), "proposal_created").reason, "security_findings_lifecycle_transition_invalid");
    assert.equal(validateSecurityFindingsState({ stateVersion: 2, records: [{ ...finding, lifecycle: { lifecycleVersion: 1, stage: "bad", history: [] } }] }).reason, "security_findings_lifecycle_stage_invalid");
  } finally {
    config.cleanup();
  }
});

test("recovery mapping and mutation markers are idempotent", () => {
  let state = createInitialRecoveryState({
    taskKey: "20260714-1437",
    issue: { number: 902, title: "security", url: "https://example.invalid/902" },
    runId: "run-2026-07-14T065000Z",
    branchName: "feature/auto-902-security-findings-20260714-1400",
    baseSha: "a".repeat(40),
    currentHeadSha: "b".repeat(40),
  });
  const proposal = { correlationKey: "settleora:security-remediation:v1:test", idempotencyKey: "digest" };
  assert.equal(classifySecurityFindingRecovery({ route: "propose_issue" }).outcomeClass, "followup_issue_required");
  assert.equal(planSecurityFindingMutationMarker(state, proposal).action, "perform_once");
  state = recordSecurityFindingMutationMarker(state, proposal, { issueNumber: 1001 });
  assert.equal(planSecurityFindingMutationMarker(state, proposal).action, "skip_existing_marker");
});

test("synthetic planning dry-run covers categories routes and zero mutation calls", async () => {
  const config = tempConfig();
  try {
    const safe = codeFinding();
    const dep = dependencyFinding();
    const adapter = {
      async fetchSource(sourceKind) {
        if (sourceKind === "dependabot_alert") return { sourceKind, status: "ok", findings: [dep], failures: [] };
        if (sourceKind === "code_scanning_alert") return { sourceKind, status: "ok", findings: [safe], failures: [] };
        return { sourceKind, status: "ok", findings: [], failures: [] };
      },
    };
    const result = await runSecurityFindingsDryRun(config, {
      adapter,
      reports: [],
      now: () => now,
      currentFindings: { [safe.correlationKey]: safe, [dep.correlationKey]: dep },
    });
    assert.equal(result.ok, true);
    assert.equal(result.normalizedCount, 2);
    assert.equal(result.classificationCounts.safe_code_fix, 1);
    assert.equal(result.classificationCounts.dependency_update, 1);
    assert.equal(result.routeCounts.propose_issue, 2);
    assert.equal(result.proposalCount, 2);
    assert.equal(result.mutationCalls, 0);
    assert.equal(result.issueCreationCapability.allowed, false);
  } finally {
    config.cleanup();
  }
});

test("authoritative duplicates reuse existing work without proposal mutation retry or disposition paths", async () => {
  const cases = [
    {
      name: "open issue duplicate",
      finding: codeFinding({ alertId: "101", fingerprint: "fp-101" }),
      evidenceFor: (finding) => ({ openIssues: [{ state: "OPEN", number: 902, body: finding.correlationKey }] }),
      classificationInputs: {},
    },
    {
      name: "open PR duplicate",
      finding: codeFinding({ alertId: "102", fingerprint: "fp-102" }),
      evidenceFor: (finding) => ({ openPrs: [{ state: "OPEN", number: 916, body: finding.idempotencyKey }] }),
      classificationInputs: {},
    },
    {
      name: "active durable state duplicate",
      finding: codeFinding({ alertId: "103", fingerprint: "fp-103" }),
      seedState: true,
      evidenceFor: () => ({}),
      classificationInputs: {},
    },
    {
      name: "false positive duplicate",
      finding: codeFinding({ alertId: "104", fingerprint: "fp-104" }),
      evidenceFor: (finding) => ({ openIssues: [{ state: "OPEN", number: 902, body: finding.correlationKey }] }),
      classificationInputs: (finding) => ({
        [finding.correlationKey]: {
          falsePositiveCandidate: { authorizedAnalysis: true, requiredProofGates: ["exact_alert", "review", "current_main"] },
        },
      }),
    },
    {
      name: "retryable classification duplicate",
      finding: codeFinding({ alertId: "105", fingerprint: "fp-105" }),
      evidenceFor: (finding) => ({ openIssues: [{ state: "OPEN", number: 902, body: finding.correlationKey }] }),
      classificationInputs: (finding) => ({
        [finding.correlationKey]: { providerFailure: { reason: "provider_retryable_failure" } },
      }),
    },
  ];

  for (const item of cases) {
    const config = tempConfig({ securityFindings: { allowFalsePositiveEvidence: true } });
    try {
      const finding = item.finding;
      if (item.seedState) writeSecurityFindingsState(config, [finding], { taskKey: "duplicate-seed" });
      const result = await runSecurityFindingsDryRun(config, {
        adapter: {
          async fetchSource(sourceKind) {
            return { sourceKind, status: "ok", findings: sourceKind === "code_scanning_alert" ? [finding] : [], failures: [] };
          },
        },
        reports: [],
        evidence: item.evidenceFor(finding),
        now: () => now,
        currentFindings: { [finding.correlationKey]: finding },
        classificationInputs: typeof item.classificationInputs === "function" ? item.classificationInputs(finding) : item.classificationInputs,
      });
      assert.equal(result.ok, true, item.name);
      assert.equal(result.duplicateCount, 1, item.name);
      assert.equal(result.reuseCount, 1, item.name);
      assert.equal(result.newCount, 0, item.name);
      assert.equal(result.routeCounts.reuse_existing_work, 1, item.name);
      assert.equal(result.proposalCount, 0, item.name);
      assert.equal(result.mutationCalls, 0, item.name);
      assert.equal(result.retryCount, 0, item.name);
      assert.equal(result.packetReadyCount, 0, item.name);
      assert.equal(result.packetBlockedCount, 0, item.name);
      assert.equal(result.dispositionReadyCount, 0, item.name);
      assert.equal(result.completionReadyCount, 0, item.name);
      const persisted = JSON.parse(readFileSync(result.statePath, "utf8"));
      assert.equal(persisted.records.length, 1, item.name);
      assert.equal(persisted.records[0].lifecycle.stage, "reconciled", item.name);
      assert.equal(persisted.records[0].route.route, "reuse_existing_work", item.name);
      assert.doesNotMatch(JSON.stringify(persisted), /must not persist|rawPayload|SARIF|snippet|Bearer|token=|secret=/i, item.name);
    } finally {
      config.cleanup();
    }
  }
});

test("duplicate evidence classes distinguish completed stale supporting and new findings", async () => {
  const cases = [
    {
      name: "completed closed duplicate remains ambiguous while finding is current",
      evidenceFor: (finding) => ({ closedIssues: [{ state: "CLOSED", number: 902, body: finding.correlationKey, reason: "completed" }] }),
      expected: { ok: false, reason: "ambiguous_duplicate_evidence", route: "blocked_ambiguous", duplicateCount: 1, newCount: 0, ambiguousMin: 1, proposalCount: 0 },
    },
    {
      name: "multiple authoritative matches are ambiguous",
      evidenceFor: (finding) => ({ openIssues: [{ state: "OPEN", body: finding.correlationKey }], openPrs: [{ state: "OPEN", body: finding.idempotencyKey }] }),
      expected: { ok: false, reason: "ambiguous_duplicate_evidence", route: "blocked_ambiguous", duplicateCount: 0, newCount: 0, ambiguousMin: 1, proposalCount: 0 },
    },
    {
      name: "stale closed non-completed evidence is ambiguous",
      evidenceFor: (finding) => ({ closedIssues: [{ state: "CLOSED", body: finding.correlationKey, reason: "not planned" }] }),
      expected: { ok: false, reason: "ambiguous_duplicate_evidence", route: "blocked_ambiguous", duplicateCount: 0, newCount: 0, ambiguousMin: 1, proposalCount: 0 },
    },
    {
      name: "ledger-only supporting evidence remains new",
      evidenceFor: (finding) => ({ ledgerEntries: [{ text: finding.correlationKey }] }),
      expected: { ok: true, reason: "dry_run_complete", route: "propose_issue", duplicateCount: 0, newCount: 1, ambiguousMin: 0, proposalCount: 1 },
    },
    {
      name: "no evidence remains new",
      evidenceFor: () => ({}),
      expected: { ok: true, reason: "dry_run_complete", route: "propose_issue", duplicateCount: 0, newCount: 1, ambiguousMin: 0, proposalCount: 1 },
    },
  ];

  for (const item of cases) {
    const config = tempConfig({ securityFindings: { persistState: false } });
    try {
      const finding = codeFinding({ alertId: item.name.replaceAll(/[^A-Za-z0-9]/g, "-").slice(0, 40), fingerprint: `fp-${item.name.length}` });
      const result = await runSecurityFindingsDryRun(config, {
        adapter: {
          async fetchSource(sourceKind) {
            return { sourceKind, status: "ok", findings: sourceKind === "code_scanning_alert" ? [finding] : [], failures: [] };
          },
        },
        reports: [],
        evidence: item.evidenceFor(finding),
        now: () => now,
        currentFindings: { [finding.correlationKey]: finding },
      });
      assert.equal(result.ok, item.expected.ok, item.name);
      assert.equal(result.reason, item.expected.reason, item.name);
      assert.equal(result.routeCounts[item.expected.route], 1, item.name);
      assert.equal(result.duplicateCount, item.expected.duplicateCount, item.name);
      assert.equal(result.newCount, item.expected.newCount, item.name);
      assert.equal(result.proposalCount, item.expected.proposalCount, item.name);
      assert.equal(result.mutationCalls, 0, item.name);
      assert.ok(result.ambiguousCount >= item.expected.ambiguousMin, item.name);
      if (!item.expected.ok) assert.equal(result.statePath, null, item.name);
    } finally {
      config.cleanup();
    }
  }
});

test("authoritative duplicate reruns are idempotent and incomplete source coverage is not authoritative", async () => {
  const config = tempConfig();
  try {
    const finding = codeFinding({ alertId: "106", fingerprint: "fp-106" });
    const adapter = {
      async fetchSource(sourceKind) {
        return { sourceKind, status: "ok", findings: sourceKind === "code_scanning_alert" ? [finding] : [], failures: [] };
      },
    };
    const first = await runSecurityFindingsDryRun(config, {
      adapter,
      reports: [],
      now: () => now,
      currentFindings: { [finding.correlationKey]: finding },
    });
    assert.equal(first.ok, true);
    assert.equal(first.proposalCount, 1);
    assert.equal(first.mutationCalls, 0);
    const second = await runSecurityFindingsDryRun(config, {
      adapter,
      reports: [],
      now: () => now,
      currentFindings: { [finding.correlationKey]: finding },
    });
    assert.equal(second.ok, true);
    assert.equal(second.duplicateCount, 1);
    assert.equal(second.routeCounts.reuse_existing_work, 1);
    assert.equal(second.reuseCount, 1);
    assert.equal(second.proposalCount, 0);
    assert.equal(second.mutationCalls, 0);
    const state = JSON.parse(readFileSync(second.statePath, "utf8"));
    assert.equal(state.records.length, 1);
    assert.equal(state.records[0].route.route, "reuse_existing_work");
    assert.equal(state.records[0].lifecycle.stage, "reconciled");

    const partialConfig = tempConfig({ securityFindings: { allowPartialPlanning: true } });
    try {
      const partial = await runSecurityFindingsDryRun(partialConfig, {
        adapter: {
          async fetchSource(sourceKind) {
            if (sourceKind === "dependabot_alert") return { sourceKind, status: "permission_denied", findings: [], failures: ["permission_denied"], reason: "permission_denied", httpStatus: 403 };
            return { sourceKind, status: "ok", findings: sourceKind === "code_scanning_alert" ? [finding] : [], failures: [] };
          },
        },
        reports: [],
        evidence: { openIssues: [{ state: "OPEN", body: finding.correlationKey }] },
        now: () => now,
        currentFindings: { [finding.correlationKey]: finding },
      });
      assert.equal(partial.ok, true);
      assert.equal(partial.reason, "dry_run_partial_source_failures");
      assert.equal(partial.duplicateCount, 1);
      assert.equal(partial.reuseCount, 1);
      assert.equal(partial.proposalCount, 0);
      assert.equal(partial.mutationCalls, 0);
      assert.equal(partial.statePath, null);
      assert.equal(partial.failuresByReason.permission_denied, 1);
    } finally {
      partialConfig.cleanup();
    }
  } finally {
    config.cleanup();
  }
});

test("dry-run keeps sensitive authority unresolved unless trusted input explicitly resolves it", async () => {
  for (const locationPath of [
    "services/api/Auth/Sessions.cs",
    "services/api/Storage/FilePolicy.cs",
    "services/api/Settlement/PaymentService.cs",
  ]) {
    const config = tempConfig({ securityFindings: { persistState: false } });
    try {
      const finding = codeFinding({ locationPath });
      const adapter = {
        async fetchSource(sourceKind) {
          return { sourceKind, status: "ok", findings: sourceKind === "code_scanning_alert" ? [finding] : [], failures: [] };
        },
      };
      const noInput = await runSecurityFindingsDryRun(config, {
        adapter,
        reports: [],
        now: () => now,
        currentFindings: { [finding.correlationKey]: finding },
      });
      assert.equal(noInput.ok, true, locationPath);
      assert.equal(noInput.classificationCounts.manual_security_product_decision, 1, locationPath);
      assert.equal(noInput.routeCounts.manual_gate, 1, locationPath);
      assert.equal(noInput.proposalCount, 0, locationPath);

      const explicitFalse = await runSecurityFindingsDryRun(config, {
        adapter,
        reports: [],
        now: () => now,
        currentFindings: { [finding.correlationKey]: finding },
        classificationInputs: { [finding.correlationKey]: { authorityResolved: false } },
      });
      assert.equal(explicitFalse.classificationCounts.manual_security_product_decision, 1, locationPath);
      assert.equal(explicitFalse.proposalCount, 0, locationPath);

      const untrustedTrue = await runSecurityFindingsDryRun(config, {
        adapter,
        reports: [],
        now: () => now,
        currentFindings: { [finding.correlationKey]: finding },
        classificationInputs: { [finding.correlationKey]: { authorityResolved: true, title: "safe", locationPath } },
      });
      assert.equal(untrustedTrue.classificationCounts.manual_security_product_decision, 1, locationPath);
      assert.equal(untrustedTrue.proposalCount, 0, locationPath);

      const trustedTrue = await runSecurityFindingsDryRun(config, {
        adapter,
        reports: [],
        now: () => now,
        currentFindings: { [finding.correlationKey]: finding },
        classificationInputs: { [finding.correlationKey]: { authorityResolved: true, authorityEvidenceTrusted: true } },
      });
      assert.equal(trustedTrue.classificationCounts.safe_code_fix, 1, locationPath);
      assert.equal(trustedTrue.routeCounts.propose_issue, 1, locationPath);
      assert.equal(trustedTrue.proposalCount, 1, locationPath);
    } finally {
      config.cleanup();
    }
  }
});

test("inaccessible endpoint fails planning instead of becoming zero findings", async () => {
  const config = tempConfig();
  try {
    const result = await runSecurityFindingsDryRun(config, {
      adapter: { async fetchSource(sourceKind) { return { sourceKind, status: "permission_denied", findings: [], failures: ["permission_denied"], reason: "permission_denied", httpStatus: 403 }; } },
      reports: [],
      now: () => now,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "source_failures");
    assert.deepEqual(result.classificationCounts, {});
    assert.deepEqual(result.routeCounts, {});
    assert.equal(result.proposalCount, 0);
  } finally {
    config.cleanup();
  }
});

test("incomplete source coverage blocks complete-source findings before planning", async () => {
  const config = tempConfig();
  try {
    const dep = dependencyFinding();
    const result = await runSecurityFindingsDryRun(config, {
      adapter: {
        async fetchSource(sourceKind) {
          if (sourceKind === "dependabot_alert") return { sourceKind, status: "ok", completeness: "complete", findings: [dep], failures: [] };
          return { sourceKind, status: "truncated", completeness: "truncated", reason: "page_limit_reached", findings: [], failures: ["page_limit_reached"] };
        },
      },
      reports: [],
      now: () => now,
      currentFindings: { [dep.correlationKey]: dep },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "source_failures");
    assert.equal(result.normalizedCount, 0);
    assert.deepEqual(result.classificationCounts, {});
    assert.deepEqual(result.routeCounts, {});
    assert.equal(result.proposalCount, 0);
    assert.equal(result.mutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

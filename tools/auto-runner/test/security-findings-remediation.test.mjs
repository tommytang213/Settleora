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
  assert.equal(routeSecurityFindingRemediation({ finding, classification: { category: "retryable_infrastructure" }, reconciliation: {} }).route, "retry_later");
  assert.equal(routeSecurityFindingRemediation({ finding, classification: { category: "false_positive_candidate" }, reconciliation: {} }).route, "collect_false_positive_evidence");
  assert.equal(routeSecurityFindingRemediation({ finding, classification: { category: "manual_security_product_decision" }, reconciliation: {} }).route, "manual_gate");
  assert.equal(routeSecurityFindingRemediation({ finding, classification: safe, reconciliation: { state: "ambiguous" } }).route, "blocked_ambiguous");
  assert.deepEqual(new Set(securityFindingRoutes), new Set([
    "propose_issue",
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
  assert.equal(securityFindingIssueCreationCapability({ run: true, allowFollowupIssueCreation: true, securityFindings: { allowSecurityFindingIssueCreation: true } }).allowed, true);
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

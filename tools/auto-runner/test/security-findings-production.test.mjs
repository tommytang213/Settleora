import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  consumeDispositionRunSlot,
  readSecurityFindingDispositionRunState,
  runSecurityFindingsProductionPhase,
  securityFindingsProductionPhaseEnabled,
} from "../lib/security-findings-production.mjs";

const repository = "tommytang213/Settleora";

function tempConfig(extra = {}) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-security-production-"));
  chmodSync(logsRoot, 0o700);
  return {
    repoRoot: "/workspace/repos/Settleora",
    logsRoot,
    repositorySlug: repository,
    configPath: "/workspace/logs/settleora-auto-runner/security-findings/test/config.json",
    dryRun: false,
    run: true,
    mode: "run",
    trustedRealRunApproved: true,
    securityFindings: {
      allowSecurityFindingsProductionPhase: false,
      allowSecurityFindingIngestion: true,
      allowSecurityFindingClassification: true,
      allowSecurityFindingProposalPlanning: true,
      allowSecurityFindingIssueCreation: false,
      allowFalsePositiveEvidence: false,
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
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "securityFindings")),
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
  };
}

test("security-findings production phase is default-off and dormant", async () => {
  const config = tempConfig();
  try {
    assert.equal(securityFindingsProductionPhaseEnabled(config), false);
    const result = await runSecurityFindingsProductionPhase(config, { runId: "run-default-off" });
    assert.equal(result.ok, true);
    assert.equal(result.enabled, false);
    assert.equal(result.reason, "security_findings_production_phase_disabled");
  } finally {
    config.cleanup();
  }
});

test("enabled production phase runs bounded sanitized no-op before issue polling", async () => {
  const config = tempConfig({ securityFindings: { allowSecurityFindingsProductionPhase: true } });
  try {
    const result = await runSecurityFindingsProductionPhase(config, {
      runId: "run-zero-findings",
      adapter: {
        async fetchSource(sourceKind) {
          return { sourceKind, status: "ok", findings: [], failures: [] };
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.enabled, true);
    assert.equal(result.outcome, "security_findings_phase_complete");
    assert.equal(result.mutationCalls, 0);
    assert.deepEqual(result.dryRunEquivalent.sourceCounts, { dependabot_alert: 0, code_scanning_alert: 0 });
  } finally {
    config.cleanup();
  }
});

test("enabled production phase fails closed on incomplete source coverage", async () => {
  const config = tempConfig({ securityFindings: { allowSecurityFindingsProductionPhase: true } });
  try {
    const result = await runSecurityFindingsProductionPhase(config, {
      runId: "run-incomplete-source",
      adapter: {
        async fetchSource(sourceKind) {
          if (sourceKind === "dependabot_alert") {
            return {
              sourceKind,
              status: "truncated",
              reason: "page_limit_reached",
              completeness: "truncated",
              findings: [],
              failures: ["page_limit_reached"],
            };
          }
          return { sourceKind, status: "ok", completeness: "complete", findings: [], failures: [] };
        },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "security_findings_phase_blocked");
    assert.equal(result.reason, "source_failures");
    assert.equal(result.dryRunEquivalent.failuresByReason.page_limit_reached, 1);
    assert.equal(result.dryRunEquivalent.dispositionReadyCount, 0);
    assert.equal(result.dryRunEquivalent.completionReadyCount, 0);
    assert.equal(result.mutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("disposition cap consumes attempted slot and blocks second disposition", () => {
  const config = tempConfig({
    securityFindings: {
      dryRunOnly: false,
      allowSecurityFindingDisposition: true,
      allowProvenFalsePositiveDisposition: true,
      dispositionDryRunOnly: false,
      maxDispositionsPerRun: 1,
    },
  });
  try {
    const packet = { packetDigest: "a".repeat(64), correlationKey: "settleora:security-finding:v1:test" };
    const first = consumeDispositionRunSlot(config, "run-cap", packet, "attempted");
    assert.equal(first.ok, true);
    const second = consumeDispositionRunSlot(config, "run-cap", packet, "attempted");
    assert.equal(second.ok, false);
    assert.equal(second.reason, "security_findings_disposition_cap_exhausted");
    const state = readSecurityFindingDispositionRunState(config, "run-cap");
    assert.equal(state.consumed, 1);
  } finally {
    config.cleanup();
  }
});

test("uncertain disposition outcome persists and locks cap through restart", () => {
  const config = tempConfig({
    securityFindings: {
      dryRunOnly: false,
      allowSecurityFindingDisposition: true,
      allowProvenFalsePositiveDisposition: true,
      dispositionDryRunOnly: false,
      maxDispositionsPerRun: 1,
    },
  });
  try {
    const packet = { packetDigest: "b".repeat(64), correlationKey: "settleora:security-finding:v1:uncertain" };
    const first = consumeDispositionRunSlot(config, "run-uncertain", packet, "uncertain");
    assert.equal(first.ok, true);
    const restarted = readSecurityFindingDispositionRunState(config, "run-uncertain");
    assert.equal(restarted.lockedByUncertainOutcome, true);
    const second = consumeDispositionRunSlot(config, "run-uncertain", packet, "attempted");
    assert.equal(second.reason, "security_findings_disposition_cap_locked_by_uncertain_outcome");
  } finally {
    config.cleanup();
  }
});

test("cap zero disables disposition attempts", () => {
  const config = tempConfig({
    securityFindings: {
      dryRunOnly: false,
      allowSecurityFindingDisposition: true,
      allowProvenFalsePositiveDisposition: true,
      dispositionDryRunOnly: false,
      maxDispositionsPerRun: 0,
    },
  });
  try {
    const result = consumeDispositionRunSlot(config, "run-zero", { packetDigest: "c".repeat(64) }, "attempted");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "security_findings_disposition_cap_zero");
  } finally {
    config.cleanup();
  }
});

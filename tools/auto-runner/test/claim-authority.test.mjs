import assert from "node:assert/strict";
import test from "node:test";
import { claimAuthorityModes, validateClaimAuthority } from "../lib/claim-authority.mjs";

const config = {
  eligibleLabels: ["auto-ready", "auto-bundle"],
  claimLabels: ["auto-claimed", "auto-running"],
  stopLabels: ["needs-tommy", "manual-gate", "danger-gate", "auto-failed", "auto-running", "auto-pr-opened", "blocked"],
};
const issue = { number: 959 };
const live = {
  number: 959,
  state: "OPEN",
  labels: ["area:ocr", "area:mobile-ui", "type:bug", "scope:day1", "auto-ready", "auto-failed"],
};
const preserved = {
  mode: claimAuthorityModes.preservedRecovery,
  taskKey: "20260724T075849",
  runId: "run-2026-07-24T075839Z-f6ba2d20a4df",
  supervisorRunId: "supervised-20260724T075831Z-f6ba2d20a4df",
  chargeId: "5c9ae164d122cabccefa40f98db88134633bd594c0b2834897f51679c7d7ad78",
  priorOutcome: "validation_failed",
  policy: { eligible: true, reasonCode: "preserved_claim_live_policy_eligible" },
  branchName: "feature/auto-959-harden-mobile-ocr-parsing-for-hk-chinese-2026-07-24t0758",
  baseSha: "ecf69d41e0dd96b9a05851af82db66e26d94ca2e",
  headSha: "92b60cec46114c11a47184687509d30da6f5df10",
  lineage: {
    ok: true,
    reasonCode: "historical_candidate_descendant_main_proven",
    currentMainSha: "9a8cf8025ba913c7af9400a532015632ec175993",
  },
  controlPlaneAdmission: { ok: true, reasonCode: "control_plane_recovery_admitted" },
  owner: { alive: false, runId: "run-2026-07-24T075839Z-f6ba2d20a4df" },
  lease: { valid: false, runId: "run-2026-07-24T075839Z-f6ba2d20a4df" },
};

test("fresh active claim requires every transient claim label", () => {
  const pass = validateClaimAuthority(config, issue, {
    ...live, labels: ["auto-ready", "auto-claimed", "auto-running"],
  }, { mode: claimAuthorityModes.freshActive });
  assert.equal(pass.ok, true);
  assert.equal(pass.mode, "fresh_active_claim");

  const fail = validateClaimAuthority(config, issue, {
    ...live, labels: ["auto-ready", "auto-running"],
  }, { mode: claimAuthorityModes.freshActive });
  assert.equal(fail.reasonCode, "claim_reread_missing_claim_label:auto-claimed");
});

test("exact preserved #959-shaped terminal recovery is admitted without mutation", () => {
  const before = structuredClone(live);
  const first = validateClaimAuthority(config, issue, live, preserved);
  const second = validateClaimAuthority(config, issue, live, preserved);
  assert.equal(first.ok, true);
  assert.equal(first.reasonCode, "preserved_claim_authority_passed");
  assert.deepEqual(first.authority.candidateIdentity.changedFiles, []);
  assert.deepEqual(second, first);
  assert.deepEqual(live, before);
  assert.equal(Object.hasOwn(first, "addLabels"), false);
  assert.equal(Object.hasOwn(first, "removeLabels"), false);
});

test("preserved authority fails closed for durable lineage failures", () => {
  for (const reasonCode of [
    "historical_candidate_marker_mismatch",
    "historical_candidate_charge_mismatch",
    "historical_candidate_lifecycle_mismatch",
    "historical_candidate_commit_intent_mismatch",
    "historical_candidate_later_effect_present",
  ]) {
    const result = validateClaimAuthority(config, issue, live, {
      ...preserved, lineage: { ok: false, reasonCode },
    });
    assert.equal(result.ok, false, reasonCode);
    assert.equal(result.reasonCode, reasonCode);
  }
});

test("preserved authority rejects stale claim labels and live policy contradictions", () => {
  const stale = validateClaimAuthority(config, issue, {
    ...live, labels: [...live.labels, "auto-claimed"],
  }, preserved);
  assert.equal(stale.reasonCode, "preserved_claim_stale_transient_label:auto-claimed");

  for (const [changed, reason] of [
    [{ ...live, state: "CLOSED" }, "claim_reread_issue_not_open"],
    [{ ...live, labels: ["area:ocr", "auto-failed"] }, "preserved_claim_live_eligibility_removed"],
    [{ ...live, labels: [...live.labels, "manual-gate"] }, "preserved_claim_stop_label:manual-gate"],
    [{ ...live, labels: ["auto-ready", "auto-failed"], number: 960 }, "claim_reread_issue_number_mismatch"],
  ]) {
    assert.equal(validateClaimAuthority(config, issue, changed, preserved).reasonCode, reason);
  }
  assert.match(
    validateClaimAuthority(config, issue, live, {
      ...preserved,
      policy: { eligible: false, reasonCode: "preserved_claim_live_policy_ineligible:manual_lane" },
    }).reasonCode,
    /^preserved_claim_live_policy_ineligible:/,
  );
});

test("terminal labels must exactly match the recorded prior outcome", () => {
  assert.equal(
    validateClaimAuthority(config, issue, live, { ...preserved, priorOutcome: "no_changes" }).reasonCode,
    "preserved_claim_terminal_label_outcome_mismatch:auto-failed",
  );
  assert.equal(
    validateClaimAuthority(config, issue, { ...live, labels: ["auto-ready"] }, preserved).reasonCode,
    "preserved_claim_terminal_label_missing:auto-failed",
  );
});

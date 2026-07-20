import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeCanonicalGithubEffect, executeCanonicalGithubEffectSync } from "../lib/github-effect-consumer.mjs";

const sha = (char) => char.repeat(40);
function fixture() {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-github-effect-"));
  const state = { repository: "owner/repo", logicalTask: { taskKey: "task", runId: "run", claimIdentity: "claim", chargeMarkerRef: "charge" }, mutationAuthority: { ownerSessionId: "session", generation: 1, status: "active" }, branch: { name: "feature/test", baseSha: sha("a"), headSha: sha("b"), candidateDigest: "candidate" } };
  return { config: { logsRoot }, state };
}

for (const [effectType, target] of [
  ["pr_update", { prNumber: 12 }], ["pr_retarget", { prNumber: 12 }], ["pr_ready", { prNumber: 12 }], ["pr_draft", { prNumber: 12 }],
  ["review_request", { prNumber: 12 }], ["review_trigger", { prNumber: 12 }], ["merge", { prNumber: 12 }], ["comment", { prNumber: 12 }],
  ["review_reply", { prNumber: 12 }], ["issue_progress_comment", { issueNumber: 34 }], ["issue_closure", { issueNumber: 34 }],
  ["umbrella_update", { issueNumber: 10 }], ["ledger_docs_update", {}], ["docs_branch_create", {}], ["docs_pr_create_update", { prNumber: 56 }],
  ["docs_pr_ready", { prNumber: 56 }], ["docs_pr_merge", { prNumber: 56 }], ["hygiene_component", { issueNumber: 34 }], ["branch_retention_verify", {}],
]) test(`canonical ${effectType} consumer adopts a crash-window success without replay`, async () => {
  const { config, state } = fixture(); let present = false; let executions = 0;
  const input = { effectType, ...target, headSha: sha("b"), baseSha: sha("a"), effect: { operation: effectType, stableFingerprint: `${effectType}:12:34`, expectedHeadSha: sha("b") } };
  const adapters = { readLive: (intent) => present ? { complete: true, present: true, identity: intent.identity, effect: intent.effect } : { complete: true, present: false }, execute: () => { executions += 1; present = true; throw new Error("response lost"); } };
  const first = effectType === "pr_update" ? executeCanonicalGithubEffectSync(config, state, input, adapters) : await executeCanonicalGithubEffect(config, state, input, adapters);
  assert.equal(first.ok, true); assert.equal(first.action, "adopted"); assert.equal(executions, 1);
  const second = effectType === "pr_update" ? executeCanonicalGithubEffectSync(config, state, input, adapters) : await executeCanonicalGithubEffect(config, state, input, adapters);
  assert.equal(second.ok, true); assert.equal(second.action, "already_confirmed"); assert.equal(executions, 1);
});

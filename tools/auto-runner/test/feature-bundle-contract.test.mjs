import assert from "node:assert/strict";
import test from "node:test";
import { planFeatureBundleIssue } from "../lib/feature-bundle-contract.mjs";

function issueWithBundle({ slices, lane = "workflow-docs-tooling", labels = ["auto-ready", "auto-bundle"], extraContract = "", extraBundle = "", bodyPrefix = "" }) {
  return {
    number: 890,
    title: "Feature bundle fixture",
    url: "https://example.invalid/issues/890",
    labels,
    body: `${bodyPrefix}
## Auto-runner contract
\`\`\`json
{
  "contractVersion": 1,
  "lane": "${lane}",
  "allowedPaths": ["tools/auto-runner/**"],
  "validationProfile": "runner-tests",
  "manualMergeRequired": true,
  "autoMergeEligible": false,
  "requiredReading": ["tools/auto-runner/settleora-auto-runner.mjs"],
  "bundle": {
    "bundleVersion": 1,
    "strategy": "feature-bundle",
    "slices": ${JSON.stringify(slices)}
    ${extraBundle}
  }
  ${extraContract}
}
\`\`\`
`,
  };
}

function slice(id, overrides = {}) {
  return {
    id,
    title: `${id} title`,
    objective: `${id} objective`,
    allowedPaths: ["tools/auto-runner/lib/**"],
    validationProfile: "runner-tests",
    requiredReading: ["tools/auto-runner/README.md"],
    ...overrides,
  };
}

test("feature-bundle planner accepts valid 2-, 3-, and 4-slice contracts", () => {
  for (const count of [2, 3, 4]) {
    const slices = Array.from({ length: count }, (_, index) => slice(`slice-${index + 1}`));
    const result = planFeatureBundleIssue(issueWithBundle({ slices }));
    assert.equal(result.ok, true);
    assert.equal(result.plan.sliceCount, count);
    assert.equal(result.plan.slices.map((item) => item.sequence).join(","), Array.from({ length: count }, (_, i) => i + 1).join(","));
    assert.match(result.plan.planDigest, /^[a-f0-9]{64}$/);
  }
});

test("feature-bundle planner rejects missing auto-bundle label and invalid slice counts", () => {
  assert.equal(planFeatureBundleIssue(issueWithBundle({ slices: [slice("one")], labels: ["auto-ready"] })).reasonCode, "missing_auto_bundle_label");
  for (const count of [0, 1, 5]) {
    const result = planFeatureBundleIssue(
      issueWithBundle({ slices: Array.from({ length: count }, (_, index) => slice(`slice-${index + 1}`)) }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, "bundle_slice_count_out_of_range");
  }
});

test("feature-bundle planner rejects duplicate ids and invalid dependencies", () => {
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("same-id"), slice("same-id")] })).reasonCode,
    "bundle_slice_id_duplicate",
  );
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first", { dependsOn: ["second"] }), slice("second")] })).reasonCode,
    "bundle_slice_dependency_not_prior",
  );
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first"), slice("second", { dependsOn: ["missing"] })] })).reasonCode,
    "bundle_slice_dependency_unknown",
  );
});

test("feature-bundle planner rejects unsupported profiles, path escapes, unsafe reading paths, oversized text, and unknown fields", () => {
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first"), slice("second", { validationProfile: "api-domain" })] })).reasonCode,
    "bundle_slice_validation_profile_not_allowed",
  );
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first"), slice("second", { allowedPaths: ["services/api/**"] })] })).reasonCode,
    "bundle_slice_path_outside_parent",
  );
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first"), slice("second", { requiredReading: ["../secrets"] })] })).reasonCode,
    "bundle_slice_required_reading_unsafe",
  );
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first"), slice("second", { objective: "x".repeat(501) })] })).reasonCode,
    "bundle_slice_text_invalid",
  );
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first"), { ...slice("second"), unexpected: true }] })).reasonCode,
    "bundle_slice_unknown_field",
  );
});

test("feature-bundle planner rejects executable-looking text and focused or manual lanes", () => {
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first"), slice("second", { objective: "run npm test" })] })).reasonCode,
    "bundle_slice_executable_text",
  );
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first"), slice("second")], lane: "auth-session-security" })).reasonCode,
    "parent_contract_not_runnable",
  );
  assert.equal(
    planFeatureBundleIssue(issueWithBundle({ slices: [slice("first"), slice("second")], lane: "cross-domain" })).reasonCode,
    "parent_contract_not_runnable",
  );
});

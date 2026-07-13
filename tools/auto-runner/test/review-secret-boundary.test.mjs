import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { analyzeReviewSecretBoundary, providerBoundReviewDigest } from "../lib/review-secret-boundary.mjs";
import { runGeminiIntegratedReview } from "../lib/gemini-reviewer.mjs";

test("review secret boundary blocks real secret files and credential content", () => {
  const realKey = `AIza${"A".repeat(30)}`;
  const cases = [
    {
      name: "changed env file",
      files: [".env"],
      diff: diffFor(".env", ["+GEMINI_API_KEY=test-key"]),
      rule: "changed_secret_like_path",
    },
    {
      name: "approved secrets root",
      files: ["workspace/logs/settleora-auto-runner/secrets/reviewer.env"],
      diff: diffFor("workspace/logs/settleora-auto-runner/secrets/reviewer.env", ["+GEMINI_API_KEY=test-key"]),
      rule: "changed_secret_like_path",
    },
    {
      name: "api key assignment",
      files: ["tools/auto-runner/lib/example.mjs"],
      diff: diffFor("tools/auto-runner/lib/example.mjs", [`+const apiKey = "${realKey}";`]),
      rule: "known_credential_format",
    },
    {
      name: "bearer token",
      files: ["tools/auto-runner/lib/example.mjs"],
      diff: diffFor("tools/auto-runner/lib/example.mjs", [`+const header = "Bearer ${"A".repeat(28)}";`]),
      rule: "bearer_token",
    },
    {
      name: "private key block",
      files: ["tools/auto-runner/lib/example.mjs"],
      diff: diffFor("tools/auto-runner/lib/example.mjs", [`+${"-----BEGIN "}PRIVATE KEY-----`]),
      rule: "private_key_block",
    },
    {
      name: "secret-looking value in test file",
      files: ["tools/auto-runner/test/example.test.mjs"],
      diff: diffFor("tools/auto-runner/test/example.test.mjs", [`+const apiKey = "${realKey}";`]),
      rule: "known_credential_format",
    },
    {
      name: "deleted credential value",
      files: ["tools/auto-runner/lib/example.mjs"],
      diff: diffFor("tools/auto-runner/lib/example.mjs", [`-const apiKey = "${realKey}";`]),
      rule: "known_credential_format",
    },
    {
      name: "malformed diff",
      files: ["tools/auto-runner/lib/example.mjs"],
      diff: "+const apiKey = \"test-key\";\n",
      rule: "malformed_diff_missing_file_header",
    },
    {
      name: "truncated diff",
      files: ["tools/auto-runner/lib/example.mjs"],
      diff: `${diffFor("tools/auto-runner/lib/example.mjs", ["+const ok = true;"])}\n[truncated]`,
      rule: "diff_truncated",
    },
    {
      name: "symlink change",
      files: ["tools/auto-runner/test/link"],
      diff: [
        "diff --git a/tools/auto-runner/test/link b/tools/auto-runner/test/link",
        "new file mode 120000",
        "index 0000000..1111111",
        "--- /dev/null",
        "+++ b/tools/auto-runner/test/link",
        "@@ -0,0 +1 @@",
        "+/workspace/logs/settleora-auto-runner/secrets/reviewer.env",
      ].join("\n"),
      rule: "symlink_changed_file",
    },
  ];
  for (const item of cases) {
    const result = analyzeReviewSecretBoundary({ changedFiles: item.files, diff: item.diff, diffTruncated: item.name === "truncated diff" });
    assert.equal(result.blocked, true, item.name);
    assert.equal(result.ok, false, item.name);
    assert.equal(result.blockers.some((blocker) => blocker.rule === item.rule), true, item.name);
  }
});

test("review secret boundary allows policy references and canonical test fixtures", () => {
  const cases = [
    {
      name: "symbol only",
      diff: diffFor("tools/auto-runner/lib/config.mjs", ["+const apiKeyEnv = \"GEMINI_API_KEY\";"]),
    },
    {
      name: "env file path reference",
      diff: diffFor("tools/auto-runner/lib/config.mjs", ["+const envFilePath = profile.envFilePath || null;"]),
    },
    {
      name: "approved root policy string",
      diff: diffFor("tools/auto-runner/README.md", ["+Secrets must stay under /workspace/logs/settleora-auto-runner/secrets/."]),
      classification: "policy_reference",
    },
    {
      name: "dot env docs reference",
      diff: diffFor("docs/workflow/AUTONOMOUS_CODEX_RUNNER.md", ["+Do not commit .env files or copy local .env.example content into reports."]),
      classification: "policy_reference",
    },
    {
      name: "canonical synthetic fixture",
      diff: diffFor("tools/auto-runner/test/example.test.mjs", ["+const apiKey = \"not-a-real-api-key-for-boundary-test\";"]),
      classification: "synthetic_test_fixture",
    },
    {
      name: "existing #893 synthetic fixture",
      diff: diffFor("tools/auto-runner/test/auto-runner.test.mjs", ["+return fakeGeminiResponse({ error: { message: \"api_key=super-secret-key model unavailable\" } }, 404);"]),
      classification: "synthetic_test_fixture",
    },
  ];
  for (const item of cases) {
    const result = analyzeReviewSecretBoundary({ changedFiles: [pathFromDiff(item.diff)], diff: item.diff });
    assert.equal(result.ok, true, item.name);
    assert.equal(result.blocked, false, item.name);
    if (item.classification) {
      assert.equal(result.allowedReferences.some((allowed) => allowed.classification === item.classification), true, item.name);
    }
  }
});

test("synthetic fixture allowlist requires both test path and canonical placeholder", () => {
  const productionPlaceholder = analyzeReviewSecretBoundary({
    changedFiles: ["tools/auto-runner/lib/example.mjs"],
    diff: diffFor("tools/auto-runner/lib/example.mjs", ["+const apiKey = \"test-api-key-for-review\";"]),
  });
  assert.equal(productionPlaceholder.blocked, true);
  assert.equal(productionPlaceholder.blockers[0].classification, "credential_value");

  const filenameInsideContent = analyzeReviewSecretBoundary({
    changedFiles: ["tools/auto-runner/lib/example.mjs"],
    diff: diffFor("tools/auto-runner/lib/example.mjs", ["+const apiKey = \"test-api-key-for-review\"; // tools/auto-runner/test/example.test.mjs"]),
  });
  assert.equal(filenameInsideContent.blocked, true);

  const unknownPseudoTestPath = analyzeReviewSecretBoundary({
    changedFiles: ["tools/auto-runner/pseudo-test/example.mjs"],
    diff: diffFor("tools/auto-runner/pseudo-test/example.mjs", ["+const apiKey = \"test-api-key-for-review\";"]),
  });
  assert.equal(unknownPseudoTestPath.blocked, true);
});

test("diagnostics are file and hunk associated, bounded, and sanitized", () => {
  const realKey = `AIza${"B".repeat(30)}`;
  const diff = diffFor("tools/auto-runner/lib/example.mjs", [
    " const before = true;",
    `-const oldApiKey = "${realKey}";`,
    `+const newApiKey = "${realKey}";`,
  ], { oldStart: 40, newStart: 40 });
  const result = analyzeReviewSecretBoundary({ changedFiles: ["tools/auto-runner/lib/example.mjs"], diff });
  assert.equal(result.blocked, true);
  const knownFormatBlockers = result.blockers.filter((item) => item.rule === "known_credential_format");
  assert.equal(knownFormatBlockers.length, 2);
  assert.deepEqual(knownFormatBlockers.map((item) => item.lineKind), ["deleted", "added"]);
  assert.deepEqual(knownFormatBlockers.map((item) => item.fileLine), [41, 41]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, new RegExp(realKey));
  assert.doesNotMatch(serialized, /const oldApiKey|const newApiKey/);
  assert.equal(result.sanitizedDiagnostics.length <= 50, true);
});

test("diff metadata is ignored as credential content", () => {
  const result = analyzeReviewSecretBoundary({
    changedFiles: ["tools/auto-runner/test/example.test.mjs"],
    diff: [
      "diff --git a/tools/auto-runner/test/example.test.mjs b/tools/auto-runner/test/example.test.mjs",
      `index ${"api_key="}${"A".repeat(16)}..bbbbbbbb 100644`,
      "--- a/tools/auto-runner/test/example.test.mjs",
      "+++ b/tools/auto-runner/test/example.test.mjs",
      "@@ -1,0 +1,1 @@",
      "+const ok = true;",
    ].join("\n"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
});

test("provider call is not attempted when boundary blocks", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-boundary-provider-block-"));
  try {
    let calls = 0;
    const result = await runGeminiIntegratedReview(
      geminiConfig(tempRoot),
      reviewPackage({
        changedFiles: ["tools/auto-runner/lib/example.mjs"],
        diff: diffFor("tools/auto-runner/lib/example.mjs", [`+const apiKey = "AIza${"C".repeat(30)}";`]),
      }),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        fetchImpl: async () => {
          calls += 1;
          throw new Error("should not call");
        },
      },
    );
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_secret_boundary_violation");
    assert.equal(result.liveCallAttempted, false);
    assert.equal(calls, 0);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("synthetic fixtures remain visible in provider-bound review text", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-boundary-provider-pass-"));
  try {
    let prompt = "";
    const result = await runGeminiIntegratedReview(
      geminiConfig(tempRoot),
      reviewPackage({
        changedFiles: ["tools/auto-runner/test/example.test.mjs"],
        diff: diffFor("tools/auto-runner/test/example.test.mjs", ["+const apiKey = \"not-a-real-api-key-for-boundary-test\";"]),
      }),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        fetchImpl: async (_url, request) => {
          prompt = JSON.parse(request.body).contents[0].parts[0].text;
          return fakeGeminiResponse({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: integratedVerdict() }] } }] });
        },
      },
    );
    assert.equal(result.status, "pass");
    assert.match(prompt, /not-a-real-api-key-for-boundary-test/);
    assert.equal(result.secretBoundary.ok, true);
    assert.equal(result.secretBoundary.allowedReferences.some((item) => item.classification === "synthetic_test_fixture"), true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("raw diff and provider-bound digests are deterministic", () => {
  const diff = diffFor("tools/auto-runner/test/example.test.mjs", ["+const apiKey = \"test-api-key\";"]);
  const first = analyzeReviewSecretBoundary({ changedFiles: ["tools/auto-runner/test/example.test.mjs"], diff });
  const second = analyzeReviewSecretBoundary({ changedFiles: ["tools/auto-runner/test/example.test.mjs"], diff });
  assert.equal(first.rawDiffSha256, second.rawDiffSha256);
  assert.equal(providerBoundReviewDigest(diff), providerBoundReviewDigest(diff));
});

test("route remains blocked for unsupported aggregate size instead of rewriting package scope", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-boundary-route-block-"));
  try {
    const changedFiles = Array.from({ length: 41 }, (_item, index) => `tools/auto-runner/lib/file-${index}.mjs`);
    const diff = changedFiles.map((file) => diffFor(file, ["+const ok = true;"])).join("\n");
    const result = await runGeminiIntegratedReview(geminiConfig(tempRoot), reviewPackage({ changedFiles, diff }), {
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () => {
        throw new Error("should not call");
      },
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_external_reviewer_split_required");
    assert.equal(result.route.tier, "block_split_or_escalate");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("current aggregate #893 diff passes boundary analysis without real credential blockers", () => {
  const diff = spawnSync("git", ["diff", "--binary", "origin/main...HEAD"], { encoding: "utf8" });
  const files = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], { encoding: "utf8" });
  assert.equal(diff.status, 0);
  assert.equal(files.status, 0);
  const changedFiles = files.stdout.trim().split(/\r?\n/).filter(Boolean);
  const result = analyzeReviewSecretBoundary({ changedFiles, diff: diff.stdout });
  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
});

function diffFor(file, lines, { oldStart = 1, newStart = 1 } = {}) {
  return [
    `diff --git a/${file} b/${file}`,
    "index 1111111..2222222 100644",
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${oldStart},${Math.max(lines.length, 1)} +${newStart},${Math.max(lines.length, 1)} @@`,
    ...lines,
  ].join("\n");
}

function pathFromDiff(diff) {
  return String(diff).match(/^diff --git a\/.+? b\/(.+)$/m)?.[1] || "tools/auto-runner/test/example.test.mjs";
}

function geminiConfig(logsRoot) {
  mkdirSync(path.join(logsRoot, "state"), { recursive: true });
  mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
  return {
    logsRoot,
    reviewerBudget: {
      monthlyReviewerBudgetUsd: 80,
      monthlyReviewerHardStopUsd: 95,
      totalMonthlyAutomationBudgetUsd: 300,
      codexSubscriptionBudgetUsd: 200,
      warnAtPercent: 80,
    },
    reviewerTiers: {
      cheap_independent: {
        enabled: true,
        provider: "gemini",
        providerProfile: "gemini",
        command: null,
        model: "gemini-2.5-flash-lite",
        inputUsdPerMillionTokens: 0.1,
        outputUsdPerMillionTokens: 0.4,
      },
    },
    reviewerProviderProfiles: {
      gemini: {
        provider: "gemini",
        apiKeyEnv: "GEMINI_API_KEY",
        envFilePath: null,
        defaultModel: "gemini-2.5-flash-lite",
      },
    },
  };
}

function reviewPackage({ changedFiles, diff }) {
  return {
    packagePath: "/workspace/logs/settleora-auto-runner/reviews/test-package.json",
    summary: {
      issue: { number: 893, title: "Boundary test" },
      laneDecision: { lane: "workflow-docs-tooling", reviewerTier: "cheap_independent" },
      changedFiles,
      currentHead: "h".repeat(40),
      baseSha: "b".repeat(40),
      validation: { passed: true, results: [] },
      diffTruncated: false,
    },
    diff,
  };
}

function fakeGeminiResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function integratedVerdict() {
  return JSON.stringify({
    verdict: "pass",
    confidence: "high",
    summary: "Review package is scoped and safe.",
    findings: [],
  });
}

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { analyzeReviewSecretBoundary, providerBoundReviewDiffChars, providerBoundReviewDigest } from "../lib/review-secret-boundary.mjs";
import { runGeminiIntegratedReview } from "../lib/gemini-reviewer.mjs";
import {
  buildReviewFixPrompt,
  evaluateReviewFixMutationDecision,
  extractReviewFixTrigger,
  redactSecretLikeText,
  writeReviewFixEvidence,
} from "../lib/review-fix-policy.mjs";

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

test("structured review-fix finding evidence redacts retained fields", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fix-structured-evidence-"));
  try {
    const secret = "fake-cycle15-canary-secret-value";
    const externalReview = {
      status: "blocked",
      reason: "blocked_external_reviewer_non_pass",
      provider: "gemini",
      sanitizedResponseSummary: {
        verdict: "fail",
        findings: [{
          provider: "gemini",
          path: `/workspace/logs/settleora-auto-runner/secrets/${secret}`,
          line: 12,
          range: { startLine: 12, endLine: 13, label: `Authorization: Bearer ${secret}` },
          title: `token=${secret}`,
          body: `GEMINI_API_KEY=${secret}`,
          ruleId: `api_key=${secret}`,
        }],
      },
    };
    const trigger = extractReviewFixTrigger({ externalReview });
    const written = writeReviewFixEvidence({ logsRoot: tempRoot }, {
      issue: { number: 921, title: "Structured secrets" },
      lane: "workflow-docs-tooling",
      branchName: "feature/review-fix",
      sanitizedFindings: trigger.findings,
    });
    const evidence = readFileSync(written.evidencePath, "utf8");
    assert.doesNotMatch(evidence, new RegExp(secret));
    assert.doesNotMatch(evidence, /\/workspace\/logs\/settleora-auto-runner\/secrets/);
    assert.doesNotMatch(evidence, /\[object Object\]/);
    assert.match(evidence, /"line": 12/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review-fix secret redaction covers assignments, headers, query values, and harmless prose", () => {
  const secret = "fake-cycle15-canary-redaction-value";
  const keys = [
    "GEMINI_API_KEY",
    "api_key",
    "api-key",
    "apiKey",
    "ApiKey",
    "apikey",
    "x-api-key",
    "X-API-Key",
    "x-goog-api-key",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "access-token",
    "refresh-token",
    "id-token",
    "accessToken",
    "AccessToken",
    "refreshToken",
    "idToken",
    "secret",
    "client_secret",
    "client-secret",
    "clientSecret",
    "password",
    "passwd",
    "authorization",
    "apiToken",
    "authToken",
    "bearerToken",
    "sessionToken",
    "personalAccessToken",
    "github-token",
    "private_key",
    "clientCredential",
    "auth",
    "authHeader",
    "authorizationHeader",
    "jwt",
    "bearer",
    "session",
    "cookie",
    "set-cookie",
    "csrf",
    "xsrf",
    "private-token",
    "client-key",
  ];
  for (const key of keys) {
    const forms = [
      `${key}=${secret}`,
      `${key} = ${secret}`,
      `${key}:${secret}`,
      `${key}: ${secret}`,
      `"${key}": "${secret}"`,
      `${key}='${secret}'`,
      `${key}="${secret}"`,
      `${key.toUpperCase()}=${secret}`,
      `${key.toLowerCase()}:${secret}`,
    ];
    for (const form of forms) {
      const redacted = redactSecretLikeText(`before ${form} after`);
      assert.doesNotMatch(redacted, new RegExp(secret), form);
      assert.match(redacted, /\[REDACTED\]/, form);
      assert.equal(redactSecretLikeText(redacted), redacted, form);
    }
  }

  const bearerScheme = "Bearer";
  const basicScheme = "Basic";
  const authorization = redactSecretLikeText(`Authorization: ${bearerScheme} ${secret}\nAuthorization: ${basicScheme} ${secret}\n${bearerScheme} ${secret}\n${basicScheme} ${secret}`);
  assert.doesNotMatch(authorization, new RegExp(secret));
  assert.match(authorization, /Authorization: Bearer \[REDACTED\]/);
  assert.match(authorization, /Authorization: Basic \[REDACTED\]/);
  assert.match(authorization, /Bearer \[REDACTED\]/);
  assert.match(authorization, /Basic \[REDACTED\]/);
  assert.equal(redactSecretLikeText(authorization), authorization);
  const basicBase64 = redactSecretLikeText("Authorization: Basic dXNlcjpwYXNzd29yZA==");
  assert.equal(basicBase64, "Authorization: Basic [REDACTED]");
  assert.equal(redactSecretLikeText("authorization=Bearer"), "authorization=Bearer");
  assert.equal(redactSecretLikeText(`authorization=Bearer ${secret}`), "authorization=Bearer [REDACTED]");

  const query = redactSecretLikeText(`https://example.invalid/path?token=${secret}&safe=visible`);
  assert.doesNotMatch(query, new RegExp(secret));
  assert.match(query, /\?token=\[REDACTED\]&safe=visible/);
  const apiKeyHeader = redactSecretLikeText(`X-API-Key: ${secret}\nx-api-key=${secret}&safe=visible`);
  assert.doesNotMatch(apiKeyHeader, new RegExp(secret));
  assert.match(apiKeyHeader, /X-API-Key:\s*\[REDACTED\]/);
  assert.match(apiKeyHeader, /x-api-key=\[REDACTED\]&safe=visible/);
  const multiValueHeaders = redactSecretLikeText([
    `X-API-Key: ${secret}; safe=visible`,
    `Cookie: session=${secret}; safe=visible`,
    `Set-Cookie: session=${secret}; Path=/; HttpOnly`,
    `authHeader: Bearer ${secret}; safe=visible`,
  ].join("\n"));
  assert.doesNotMatch(multiValueHeaders, new RegExp(secret));
  assert.match(multiValueHeaders, /X-API-Key: \[REDACTED\]/);
  assert.match(multiValueHeaders, /Cookie: \[REDACTED\]/);
  assert.match(multiValueHeaders, /Set-Cookie: \[REDACTED\]/);
  assert.match(multiValueHeaders, /authHeader: \[REDACTED\]/);
  assert.equal(redactSecretLikeText(multiValueHeaders), multiValueHeaders);

  const terminated = redactSecretLikeText([
    `token=${secret},safe`,
    `token=${secret};safe`,
    `token=${secret}&safe=visible`,
    `token=${secret}\nsafe`,
    `{"token":"${secret}"}`,
    `[token=${secret}]`,
  ].join("\n"));
  assert.doesNotMatch(terminated, new RegExp(secret));
  assert.match(terminated, /safe=visible/);

  const harmless = redactSecretLikeText("access token budget, client secret policy, API key rotation design, and authorization policy remain meaningful");
  assert.equal(harmless, "access token budget, client secret policy, API key rotation design, and authorization policy remain meaningful");

  const long = redactSecretLikeText(`${"x".repeat(10_000)} token=${secret} ${"y".repeat(10_000)}`);
  assert.doesNotMatch(long, new RegExp(secret));
});

test("review-fix prompt and evidence never serialize fake canary values", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fix-canary-evidence-"));
  try {
    const secret = "fake-cycle15-canary-prompt-evidence-value";
    const trigger = {
      actionable: true,
      source: "integrated_gemini",
      verdict: "fail",
      findings: [{
        provider: "gemini",
        severity: "high",
        path: `tools/auto-runner/lib/review-fix-policy.mjs?token=${secret}&safe=visible`,
        file: `tools/auto-runner/lib/review-fix-policy.mjs#access_token=${secret}`,
        line: 46,
        range: { startLine: 46, endLine: 48, label: `client_secret="${secret}"` },
        title: `api_key=${secret}`,
        message: `Authorization: Bearer ${secret}`,
        body: `password: ${secret}`,
        details: `refresh_token=${secret}; safe detail remains`,
        rule: `id_token=${secret}`,
        ruleId: `secret='${secret}'`,
        check: `x-goog-api-key=${secret}`,
        invariant: `passwd=${secret}`,
        authorityInvariant: `authorization policy with authorization: Basic ${secret}`,
      }],
    };
    const decision = evaluateReviewFixMutationDecision({
      config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
      issue: { number: 921, title: "Secret canary", labels: [] },
      laneDecision: {
        lane: "workflow-docs-tooling",
        allowedToImplement: true,
        autoMergeEligible: true,
        manualMergeRequired: false,
        allowedPaths: ["tools/auto-runner/**"],
        contract: { autoMergeEligible: true, manualMergeRequired: false },
      },
      changedFiles: ["tools/auto-runner/lib/review-fix-policy.mjs"],
      validation: { passed: true },
      trigger,
    });
    assert.equal(decision.allowed, true);
    assert.doesNotMatch(JSON.stringify(decision), new RegExp(secret));
    assert.match(JSON.stringify(decision), /safe=visible/);

    const prompt = buildReviewFixPrompt({
      issue: { number: 921, title: "Secret canary" },
      laneDecision: {
        lane: "workflow-docs-tooling",
        allowedPaths: ["tools/auto-runner/**"],
        contract: { autoMergeEligible: true, manualMergeRequired: false },
      },
      branchName: "feature/review-fix",
      changedFiles: ["tools/auto-runner/lib/review-fix-policy.mjs"],
      validation: { passed: true },
      trigger,
    });
    assert.doesNotMatch(prompt, new RegExp(secret));
    assert.match(prompt, /safe=visible/);

    const written = writeReviewFixEvidence({ logsRoot: tempRoot }, {
      issue: { number: 921, title: "Secret canary" },
      trigger,
      decision,
      nested: {
        safe: "visible",
        child: [{ header: `Authorization: Basic ${secret}` }],
      },
    });
    const evidence = readFileSync(written.evidencePath, "utf8");
    assert.doesNotMatch(evidence, new RegExp(secret));
    assert.match(evidence, /"safe": "visible"/);
    assert.doesNotMatch(evidence, /\[object Object\]/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
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

test("provider-bound integrated review text includes large approved aggregate diffs", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-boundary-provider-large-"));
  try {
    const lines = Array.from({ length: 700 }, (_item, index) => `+const generatedLine${index} = "${"x".repeat(180)}";`);
    const diff = diffFor("tools/auto-runner/test/large-aggregate.test.mjs", lines);
    assert.equal(diff.length > 120_000, true);
    assert.equal(diff.length < providerBoundReviewDiffChars, true);

    let prompt = "";
    const result = await runGeminiIntegratedReview(
      geminiConfig(tempRoot),
      reviewPackage({
        changedFiles: ["tools/auto-runner/test/large-aggregate.test.mjs"],
        diff,
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
    assert.equal(result.providerBoundDiffSha256, providerBoundReviewDigest(diff));
    assert.match(prompt, /generatedLine699/);
    assert.doesNotMatch(prompt, /\n\[truncated\]\s*$/);
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

test("minimal synthetic aggregate diff passes boundary analysis without real credential blockers", () => {
  const changedFiles = ["tools/auto-runner/test/review-secret-boundary.test.mjs"];
  const result = analyzeReviewSecretBoundary({
    changedFiles,
    diff: diffFor("tools/auto-runner/test/review-secret-boundary.test.mjs", [
      "+const safeFixture = \"not-a-real-api-key-for-boundary-test\";",
      "+const policy = \"token budget, secret boundary, and authorization policy\";",
    ]),
  });
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

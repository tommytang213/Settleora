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

function runtimeCanary(label = "value") {
  return ["fake", "cycle18", "canary", label].join("-");
}

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
  const quotedHeader = redactSecretLikeText(`curl -H "x-api-key: ${secret}" https://example.invalid`);
  assert.doesNotMatch(quotedHeader, new RegExp(secret));
  assert.match(quotedHeader, /"x-api-key: \[REDACTED\]"/);
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

  const wrapped = redactSecretLikeText(`headers={"x-api-key":"${secret}","safe":"visible"} query={accessToken:${secret},safe:visible}`);
  assert.doesNotMatch(wrapped, new RegExp(secret));
  assert.match(wrapped, /headers=\{"x-api-key":"\[REDACTED\]","safe":"visible"\}/);
  assert.match(wrapped, /query=\{accessToken:\[REDACTED\],safe:visible\}/);
  assert.equal(redactSecretLikeText(wrapped), wrapped);

  const harmless = redactSecretLikeText("access token budget, client secret policy, API key rotation design, and authorization policy remain meaningful");
  assert.equal(harmless, "access token budget, client secret policy, API key rotation design, and authorization policy remain meaningful");

  const long = redactSecretLikeText(`${"x".repeat(10_000)} token=${secret} ${"y".repeat(10_000)}`);
  assert.doesNotMatch(long, new RegExp(secret));
});

test("review-fix redaction rescans wrappers with existing markers and remains idempotent", () => {
  const secret = runtimeCanary("mixed-wrapper");
  const second = runtimeCanary("second-wrapper");
  const cases = [
    {
      name: "safe raw prior",
      input: `headers="safe=visible; x-api-key=${secret}; prior=[REDACTED]"`,
      keep: /safe=visible/,
    },
    {
      name: "prior raw",
      input: `headers="prior=[REDACTED]; x-api-key=${secret}; safe=visible"`,
      keep: /safe=visible/,
    },
    {
      name: "raw prior",
      input: `headers="x-api-key=${secret}; prior=[REDACTED]; safe=visible"`,
      keep: /safe=visible/,
    },
    {
      name: "multiple raw",
      input: `headers="token=${secret}; safe=visible; prior=[REDACTED]; client_secret=${second}"`,
      keep: /safe=visible/,
    },
    {
      name: "malformed marker later raw",
      input: `headers="prior=[REDACTED; safe=visible; x-api-key=${secret}"`,
      keep: /safe=visible/,
    },
    {
      name: "json-like nested",
      input: `headers={"prior":"[REDACTED]","x-api-key":"${secret}","safe":"visible"}`,
      keep: /"safe":"visible"/,
    },
    {
      name: "query wrapper",
      input: `query="safe=visible&accessToken=${secret}&prior=[REDACTED]"`,
      keep: /safe=visible/,
    },
  ];
  for (const item of cases) {
    const redacted = redactSecretLikeText(item.input);
    assert.doesNotMatch(redacted, new RegExp(secret), item.name);
    assert.doesNotMatch(redacted, new RegExp(second), item.name);
    assert.match(redacted, /\[REDACTED\]/, item.name);
    assert.match(redacted, item.keep, item.name);
    assert.equal(redactSecretLikeText(redacted), redacted, item.name);
  }
});

test("review-fix redaction treats completed markers as secret boundaries", () => {
  const secret = runtimeCanary("marker-boundary");
  const second = runtimeCanary("marker-boundary-second");
  const cases = [
    {
      name: "marker adjacent api key",
      input: `[REDACTED]x-api-key=${secret}`,
      keep: /\[REDACTED\]x-api-key=\[REDACTED\]/,
    },
    {
      name: "marker adjacent token",
      input: `[REDACTED]token=${secret}`,
      keep: /\[REDACTED\]token=\[REDACTED\]/,
    },
    {
      name: "marker adjacent bearer authorization",
      input: `[REDACTED]Authorization: Bearer ${secret}`,
      keep: /\[REDACTED\]Authorization: Bearer \[REDACTED\]/,
    },
    {
      name: "marker adjacent basic authorization",
      input: `[REDACTED]Authorization: Basic ${secret}`,
      keep: /\[REDACTED\]Authorization: Basic \[REDACTED\]/,
    },
    {
      name: "quoted wrapper marker adjacent api key",
      input: `headers="[REDACTED]x-api-key=${secret}"`,
      keep: /headers="\[REDACTED\]x-api-key=\[REDACTED\]"/,
    },
    {
      name: "unquoted wrapper marker adjacent token",
      input: `prior=[REDACTED]token=${secret}`,
      keep: /prior=\[REDACTED\]token=\[REDACTED\]/,
    },
    {
      name: "marker adjacent camel case alias",
      input: `[REDACTED]accessToken=${secret}`,
      keep: /\[REDACTED\]accessToken=\[REDACTED\]/,
    },
    {
      name: "marker adjacent quoted json key",
      input: `headers={"prior":"[REDACTED]","next":[REDACTED]"x-api-key":"${secret}","safe":"visible"}`,
      keep: /"safe":"visible"/,
    },
    {
      name: "marker followed by safe text",
      input: `[REDACTED]safe text remains meaningful and visible`,
      exact: `[REDACTED]safe text remains meaningful and visible`,
    },
    {
      name: "marker comma punctuation secret",
      input: `[REDACTED],token=${secret};safe=visible`,
      keep: /safe=visible/,
    },
    {
      name: "marker query punctuation secret",
      input: `[REDACTED]&accessToken=${secret}&safe=visible`,
      keep: /&safe=visible/,
    },
    {
      name: "multiple markers before secret",
      input: `[REDACTED][REDACTED]clientSecret=${secret}`,
      keep: /\[REDACTED\]\[REDACTED\]clientSecret=\[REDACTED\]/,
    },
    {
      name: "partial marker before later secret",
      input: `[REDACTED token=${secret};safe=visible`,
      keep: /safe=visible/,
    },
    {
      name: "suffix-only malformed marker before later secret",
      input: `REDACTED]token=${secret};safe=visible`,
      keep: /safe=visible/,
    },
    {
      name: "doubled malformed marker before later secret",
      input: `[[REDACTED]]token=${secret};safe=visible`,
      keep: /safe=visible/,
    },
    {
      name: "nested wrapper query preserves safe field",
      input: `headers="outer={[REDACTED]token=${secret}&safe=visible; query=[REDACTED]accessToken=${second}&safe=visible}"`,
      keep: /safe=visible/,
    },
  ];
  for (const item of cases) {
    const redacted = redactSecretLikeText(item.input);
    assert.doesNotMatch(redacted, new RegExp(secret), item.name);
    assert.doesNotMatch(redacted, new RegExp(second), item.name);
    if (item.exact) {
      assert.equal(redacted, item.exact, item.name);
    } else {
      assert.match(redacted, item.keep, item.name);
      assert.match(redacted, /\[REDACTED\]/, item.name);
    }
    assert.equal(redactSecretLikeText(redacted), redacted, item.name);
  }
});

test("review-fix redaction fails closed for malformed quoted secret values", () => {
  const secret = runtimeCanary("malformed-quoted");
  const second = runtimeCanary("malformed-quoted-second");
  const harmless = `notes="'${secret}`;
  assert.equal(redactSecretLikeText(harmless), harmless);

  const cases = [
    {
      name: "marker unterminated double quoted token",
      input: `[REDACTED]token="${secret}`,
      keep: /\[REDACTED\]token="\[REDACTED\]"/,
    },
    {
      name: "marker unterminated single quoted token",
      input: `[REDACTED]token='${secret}`,
      keep: /\[REDACTED\]token='\[REDACTED\]'/,
    },
    {
      name: "mismatched single close for double quoted token",
      input: `token="${secret}'`,
      keep: /token="\[REDACTED\]"'/,
    },
    {
      name: "mismatched double close for single quoted token",
      input: `token='${secret}"`,
      keep: /token='\[REDACTED\]'"/,
    },
    {
      name: "marker api key alias malformed quote",
      input: `[REDACTED]x-api-key="${secret}`,
      keep: /\[REDACTED\]x-api-key="\[REDACTED\]"/,
    },
    {
      name: "marker camel case alias malformed quote",
      input: `[REDACTED]accessToken='${secret}`,
      keep: /\[REDACTED\]accessToken='\[REDACTED\]'/,
    },
    {
      name: "quoted json key malformed quoted value",
      input: `[REDACTED]"token":"${secret}`,
      keep: /\[REDACTED\]"token":"\[REDACTED\]"/,
    },
    {
      name: "single quoted json key malformed quoted value",
      input: `[REDACTED]'token':'${secret}`,
      keep: /\[REDACTED\]'token':'\[REDACTED\]'/,
    },
    {
      name: "malformed bearer authorization value",
      input: `Authorization: Bearer "${secret}`,
      keep: /Authorization: Bearer \[REDACTED\]/,
    },
    {
      name: "malformed basic authorization value",
      input: `Authorization: Basic '${secret}`,
      keep: /Authorization: Basic \[REDACTED\]/,
    },
    {
      name: "malformed value inside quoted wrapper",
      input: `headers="[REDACTED]token='${secret}"`,
      keep: /headers="\[REDACTED\]token='\[REDACTED\]'"/,
    },
    {
      name: "malformed value inside unquoted wrapper",
      input: `headers={[REDACTED]token="${secret}}`,
      keep: /headers=\{\[REDACTED\]token="\[REDACTED\]"\}/,
    },
    {
      name: "query malformed value preserves safe field",
      input: `https://example.invalid/path?[REDACTED]token="${secret}&safe=visible`,
      keep: /&safe=visible/,
    },
    {
      name: "json-like malformed value preserves comma safe field",
      input: `{[REDACTED]"token":"${secret},"safe":"visible"}`,
      keep: /"safe":"visible"/,
    },
    {
      name: "malformed value reaches bounded end",
      input: `prefix [REDACTED]token="${secret}`,
      keep: /\[REDACTED\]token="\[REDACTED\]"/,
    },
    {
      name: "malformed value reaches newline",
      input: `[REDACTED]token="${secret}\nsafe=visible`,
      keep: /\nsafe=visible/,
    },
    {
      name: "multiple malformed secret assignments",
      input: `[REDACTED]token="${secret};[REDACTED]clientSecret='${second}`,
      keep: /\[REDACTED\]clientSecret='\[REDACTED\]'/,
    },
    {
      name: "existing marker malformed and balanced secret",
      input: `[REDACTED]token="${secret}; x-api-key="${second}"`,
      keep: /x-api-key="\[REDACTED\]"/,
    },
  ];
  for (const item of cases) {
    const redacted = redactSecretLikeText(item.input);
    assert.doesNotMatch(redacted, new RegExp(secret), item.name);
    assert.doesNotMatch(redacted, new RegExp(second), item.name);
    assert.match(redacted, item.keep, item.name);
    assert.equal(redactSecretLikeText(redacted), redacted, item.name);
  }
});

test("review-fix redaction is stack-safe and bounded for adversarial wrappers", () => {
  const secret = runtimeCanary("adversarial-wrapper");
  const started = process.hrtime.bigint();
  const nested = `${"headers=".repeat(1_000)}token=${secret}`;
  assert.doesNotThrow(() => redactSecretLikeText(nested));
  const nestedRedacted = redactSecretLikeText(nested);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  assert.equal(elapsedMs < 1_000, true, `elapsed ${elapsedMs}ms`);
  assert.doesNotMatch(nestedRedacted, new RegExp(secret));
  assert.equal(nestedRedacted.length <= 20_000, true);

  const nearBound = `${"headers=".repeat(2_200)}token=${secret};safe=visible;${"x".repeat(3_000)}`;
  const nearBoundRedacted = redactSecretLikeText(nearBound);
  assert.doesNotMatch(nearBoundRedacted, new RegExp(secret));
  assert.equal(nearBoundRedacted.length <= 20_000, true);

  const sibling = [
    `headers="safe=visible; x-api-key=${secret}"`,
    `query="token=${secret}&safe=visible"`,
    `metadata={"clientSecret":"${secret}","safe":"visible"}`,
  ].join(" ");
  const siblingRedacted = redactSecretLikeText(sibling);
  assert.doesNotMatch(siblingRedacted, new RegExp(secret));
  assert.match(siblingRedacted, /safe=visible/);

  const malformed = `headers="'[{token=${secret}; prior=[REDACTED; safe=visible" query={accessToken:${secret}`;
  const malformedRedacted = redactSecretLikeText(malformed);
  assert.doesNotThrow(() => redactSecretLikeText(malformed));
  assert.doesNotMatch(malformedRedacted, new RegExp(secret));
  assert.match(malformedRedacted, /safe=visible/);

  const budgetSecret = ["s"].join("");
  const manySecrets = Array.from({ length: 4_100 }, () => `token=${budgetSecret}`).join(";");
  const budgetRedacted = redactSecretLikeText(manySecrets);
  assert.equal(budgetRedacted, "[REDACTED]");
  assert.doesNotMatch(budgetRedacted, new RegExp(budgetSecret));

  let repeated = siblingRedacted;
  for (let index = 0; index < 10; index += 1) {
    const next = redactSecretLikeText(repeated);
    assert.equal(next, repeated);
    assert.equal(next.length <= 20_000, true);
    repeated = next;
  }

  const prose = redactSecretLikeText(`Harmless prose remains meaningful while headers="safe=visible; x-api-key=${secret}; prior=[REDACTED]"`);
  assert.match(prose, /Harmless prose remains meaningful/);
  assert.match(prose, /safe=visible/);
  assert.doesNotMatch(prose, new RegExp(secret));
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

test("review-fix malformed quoted canaries never reach prompts or evidence", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fix-malformed-canary-"));
  try {
    const secret = runtimeCanary("prompt-evidence-malformed");
    const trigger = {
      actionable: true,
      source: "integrated_gemini",
      verdict: "fail",
      findings: [{
        provider: "gemini",
        severity: "high",
        path: `tools/auto-runner/lib/review-fix-policy.mjs?[REDACTED]token="${secret}&safe=visible`,
        file: `tools/auto-runner/lib/review-fix-policy.mjs#[REDACTED]accessToken='${secret}`,
        line: 136,
        range: { startLine: 136, endLine: 137, label: `[REDACTED]"token":"${secret}` },
        title: `[REDACTED]x-api-key="${secret}`,
        message: `Authorization: Bearer "${secret}`,
        body: `headers="[REDACTED]token='${secret}"`,
        details: `query={[REDACTED]clientSecret:"${secret},safe:visible}`,
        rule: `token="${secret}'`,
        ruleId: `token='${secret}"`,
        check: `[REDACTED]token="${secret}\nsafe=visible`,
        invariant: "harmless malformed quote text remains visible",
        authorityInvariant: `history={[REDACTED]token="${secret};safe=visible}`,
      }],
    };
    const decision = evaluateReviewFixMutationDecision({
      config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
      issue: { number: 921, title: "Malformed canary", labels: [] },
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
    const prompt = buildReviewFixPrompt({
      issue: { number: 921, title: "Malformed canary" },
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
    const written = writeReviewFixEvidence({ logsRoot: tempRoot }, {
      issue: { number: 921, title: "Malformed canary" },
      trigger,
      decision,
      findingInventory: [{ fingerprint: `[REDACTED]token="${secret}`, history: [`Authorization: Basic '${secret}`] }],
      durableStateFixture: { prompt: `[REDACTED]accessToken='${secret}`, safe: "visible" },
    });
    const evidence = readFileSync(written.evidencePath, "utf8");
    for (const output of [JSON.stringify(decision), prompt, evidence]) {
      assert.doesNotMatch(output, new RegExp(secret));
      assert.match(output, /\[REDACTED\]/);
    }
    assert.match(prompt, /safe=visible/);
    assert.match(evidence, /"safe": "visible"/);
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

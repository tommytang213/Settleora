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

test("review-fix redaction gives nested direct secrets precedence over wrapper matches", () => {
  const secret = runtimeCanary("nested-wrapper");
  const second = runtimeCanary("nested-wrapper-second");
  const third = runtimeCanary("nested-wrapper-third");
  const cases = [
    {
      name: "reviewer headers wrapper exact form",
      input: `headers={token: "${secret}",safe:visible}`,
      keep: /headers=\{token:"\[REDACTED\]",safe:visible\}/,
    },
    {
      name: "reviewer metadata wrapper exact form",
      input: `metadata={clientSecret: '${secret}'}`,
      keep: /metadata=\{clientSecret:'\[REDACTED\]'\}/,
    },
    {
      name: "reviewer query wrapper exact form",
      input: `query={ accessToken : "${secret}" , safe : visible }`,
      keep: /query=\{ accessToken:"\[REDACTED\]" , safe : visible \}/,
    },
    {
      name: "quoted json api key",
      input: `headers={"x-api-key":"${secret}",safe:visible}`,
      keep: /"x-api-key":"\[REDACTED\]",safe:visible/,
    },
    {
      name: "unquoted api key",
      input: `headers={x-api-key:${secret},safe:visible}`,
      keep: /x-api-key:\[REDACTED\],safe:visible/,
    },
    {
      name: "nested bearer authorization",
      input: `headers={Authorization: Bearer ${secret};safe=visible}`,
      keep: /Authorization: Bearer \[REDACTED\];safe=visible/,
    },
    {
      name: "nested basic authorization",
      input: `headers={Authorization: Basic ${secret};safe=visible}`,
      keep: /Authorization: Basic \[REDACTED\];safe=visible/,
    },
    {
      name: "camel case alias",
      input: `metadata={clientSecret:${secret};safe=visible}`,
      keep: /clientSecret:\[REDACTED\];safe=visible/,
    },
    {
      name: "snake case alias",
      input: `metadata={client_secret:${secret};safe=visible}`,
      keep: /client_secret:\[REDACTED\];safe=visible/,
    },
    {
      name: "hyphenated alias",
      input: `metadata={client-secret:${secret};safe=visible}`,
      keep: /client-secret:\[REDACTED\];safe=visible/,
    },
    {
      name: "multiple sibling secrets",
      input: `headers={token:${secret};clientSecret:'${second}';safe:visible}`,
      keep: /token:\[REDACTED\];clientSecret:'\[REDACTED\]';safe:visible/,
    },
    {
      name: "nested wrapper inside wrapper",
      input: `outer={headers={token:"${secret}",safe:visible};safe=visible}`,
      keep: /outer=\{headers=\{token:"\[REDACTED\]",safe:visible\};safe=visible\}/,
    },
    {
      name: "several sibling wrappers",
      input: `headers={token:"${secret}",safe:visible} metadata={clientSecret:'${second}',safe:visible} query={api_key=${third}&safe=visible}`,
      keep: /metadata=\{clientSecret:'\[REDACTED\]',safe:visible\} query=\{api_key=\[REDACTED\]&safe=visible\}/,
    },
    {
      name: "marker adjacent nested secret",
      input: `[REDACTED]headers={token:${secret};safe=visible}`,
      keep: /\[REDACTED\]headers=\{token:\[REDACTED\];safe=visible\}/,
    },
    {
      name: "balanced plus malformed nested secret",
      input: `headers={token:"${secret}",clientSecret:'${second};safe=visible}`,
      keep: /^headers=\{token:"\[REDACTED\]",clientSecret:\[REDACTED\]$/,
    },
    {
      name: "nested query preserves ampersand safe field",
      input: `query={token=${secret}&safe=visible}`,
      keep: /token=\[REDACTED\]&safe=visible/,
    },
    {
      name: "json-like secret comma safe field",
      input: `metadata={"token":"${secret}","safe":"visible"}`,
      keep: /"token":"\[REDACTED\]","safe":"visible"/,
    },
    {
      name: "safe wrapper remains meaningful",
      input: "headers={safe:visible,mode:test}",
      exact: "headers={safe:visible,mode:test}",
    },
    {
      name: "harmless prose",
      input: "Harmless prose says token, secret, and authorization policy without assignments.",
      exact: "Harmless prose says token, secret, and authorization policy without assignments.",
    },
  ];
  for (const item of cases) {
    const redacted = redactSecretLikeText(item.input);
    assert.doesNotMatch(redacted, new RegExp(secret), item.name);
    assert.doesNotMatch(redacted, new RegExp(second), item.name);
    assert.doesNotMatch(redacted, new RegExp(third), item.name);
    if (item.exact) {
      assert.equal(redacted, item.exact, item.name);
    } else {
      assert.match(redacted, item.keep, item.name);
      assert.match(redacted, /\[REDACTED\]/, item.name);
    }
    assert.equal(redactSecretLikeText(redacted), redacted, item.name);
  }
});

test("review-fix redaction covers escaped nested secret assignments", () => {
  const secret = runtimeCanary("escaped-nested");
  const second = runtimeCanary("escaped-nested-second");
  const third = runtimeCanary("escaped-nested-third");
  const backslash = "\\";
  const doubleQuote = "\"";
  const singleQuote = "'";
  const escapedQuote = (depth = 1, quote = doubleQuote) => `${backslash.repeat(depth)}${quote}`;
  const escapedObject = (key, value, depth = 1) =>
    `{${escapedQuote(depth)}${key}${escapedQuote(depth)}:${escapedQuote(depth)}${value}${escapedQuote(depth)},${escapedQuote(depth)}safe${escapedQuote(depth)}:${escapedQuote(depth)}visible${escapedQuote(depth)}}`;
  const cases = [
    {
      name: "escaped json token assignment",
      input: escapedObject("token", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped clientSecret",
      input: escapedObject("clientSecret", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped accessToken",
      input: escapedObject("accessToken", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped api-key alias",
      input: escapedObject("api-key", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped snake case alias",
      input: escapedObject("client_secret", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped hyphenated alias",
      input: escapedObject("client-secret", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped single quoted token assignment",
      input: `{${escapedQuote(1, singleQuote)}token${escapedQuote(1, singleQuote)}:${escapedQuote(1, singleQuote)}${secret}${escapedQuote(1, singleQuote)},${escapedQuote(1, singleQuote)}safe${escapedQuote(1, singleQuote)}:${escapedQuote(1, singleQuote)}visible${escapedQuote(1, singleQuote)}}`,
      keep: /\\'safe\\':\\'visible\\'/,
    },
    {
      name: "escaped key with unescaped value",
      input: `headers={${escapedQuote()}token${escapedQuote()}:${secret},${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()}}`,
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "unescaped key with escaped quoted value",
      input: `headers={token:${escapedQuote()}${secret}${escapedQuote()},safe:visible}`,
      keep: /safe:visible/,
    },
    {
      name: "one additional escaping layer",
      input: escapedObject("token", secret, 2),
      keep: /\\\\"safe\\\\":\\\\"visible\\\\"/,
    },
    {
      name: "escaped object inside quoted wrapper",
      input: `headers="${escapedObject("token", secret)}"`,
      keep: /headers=".*\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped object inside escaped quoted wrapper",
      input: `headers=${escapedQuote()}${escapedObject("token", secret)}${escapedQuote()}`,
      keep: /headers=\\".*\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped object inside unquoted wrapper",
      input: `headers=${escapedObject("token", secret)}`,
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped object inside query parameter",
      input: `https://example.invalid/path?headers=${escapedObject("token", secret)}&mode=read`,
      keep: /&mode=read/,
    },
    {
      name: "escaped bearer authorization",
      input: `Authorization: Bearer ${escapedQuote()}${secret}${escapedQuote()}`,
      keep: /Authorization: Bearer \[REDACTED\]/,
    },
    {
      name: "escaped basic authorization",
      input: `Authorization: Basic ${escapedQuote()}${secret}${escapedQuote()}`,
      keep: /Authorization: Basic \[REDACTED\]/,
    },
    {
      name: "marker adjacent escaped assignment",
      input: `[REDACTED]${escapedObject("token", secret)}`,
      keep: /\[REDACTED\]/,
    },
    {
      name: "multiple escaped sibling secret assignments",
      input: `{${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${secret}${escapedQuote()},${escapedQuote()}clientSecret${escapedQuote()}:${escapedQuote()}${second}${escapedQuote()},${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()}}`,
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "mixed escaped and ordinary nested secret assignments",
      input: `headers={${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${secret}${escapedQuote()},clientSecret:${second},safe:visible}`,
      keep: /safe:visible/,
    },
    {
      name: "balanced escaped secret plus malformed escaped secret",
      input: `headers={${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${secret}${escapedQuote()},${escapedQuote()}clientSecret${escapedQuote()}:${escapedQuote()}${second},${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()}}`,
      keep: /^headers=\{\\"token\\":\\"\[REDACTED\]\\",\\"clientSecret\\":\[REDACTED\]\}$/,
    },
    {
      name: "escaped safe adjacent field remains visible",
      input: escapedObject("token", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "wrapper containing only escaped safe fields remains meaningful",
      input: `headers={${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()},${escapedQuote()}mode${escapedQuote()}:${escapedQuote()}read${escapedQuote()}}`,
      exact: `headers={${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()},${escapedQuote()}mode${escapedQuote()}:${escapedQuote()}read${escapedQuote()}}`,
    },
    {
      name: "harmless backslash quote prose remains meaningful",
      input: `Harmless text says ${escapedQuote()}token${escapedQuote()} and ${escapedQuote()}secret${escapedQuote()} are words, not assignments.`,
      exact: `Harmless text says ${escapedQuote()}token${escapedQuote()} and ${escapedQuote()}secret${escapedQuote()} are words, not assignments.`,
    },
    {
      name: "deeper ambiguous escape fails closed",
      input: `headers={${escapedQuote(3)}token${escapedQuote(3)}:${escapedQuote(3)}${third}${escapedQuote(3)},${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()}}`,
      keep: /\\"safe\\":\\"visible\\"/,
    },
  ];
  for (const item of cases) {
    const redacted = redactSecretLikeText(item.input);
    assert.doesNotMatch(redacted, new RegExp(secret), item.name);
    assert.doesNotMatch(redacted, new RegExp(second), item.name);
    assert.doesNotMatch(redacted, new RegExp(third), item.name);
    if (item.exact) {
      assert.equal(redacted, item.exact, item.name);
    } else {
      assert.match(redacted, item.keep, item.name);
      assert.match(redacted, /\[REDACTED\]/, item.name);
    }
    assert.equal(redactSecretLikeText(redacted), redacted, item.name);
  }

  const nearBound = `${"headers=".repeat(1_000)}${escapedObject("token", secret)}${"x".repeat(2_000)}`.slice(0, 19_900);
  const nearBoundStarted = process.hrtime.bigint();
  const nearBoundRedacted = redactSecretLikeText(nearBound);
  const nearBoundElapsedMs = Number(process.hrtime.bigint() - nearBoundStarted) / 1_000_000;
  assert.equal(nearBoundElapsedMs < 1_000, true, `near-bound elapsed ${nearBoundElapsedMs}ms`);
  assert.doesNotMatch(nearBoundRedacted, new RegExp(secret));
  assert.equal(nearBoundRedacted.length <= 20_000, true);

  const manySiblingFragments = Array.from({ length: 1_000 }, (_item, index) =>
    `h${index}=${escapedObject("token", secret)}`).join(" ");
  const manyStarted = process.hrtime.bigint();
  const manyRedacted = redactSecretLikeText(manySiblingFragments);
  const manyElapsedMs = Number(process.hrtime.bigint() - manyStarted) / 1_000_000;
  assert.equal(manyElapsedMs < 1_000, true, `many elapsed ${manyElapsedMs}ms`);
  assert.doesNotMatch(manyRedacted, new RegExp(secret));
  assert.match(manyRedacted, /safe/);

  const budgetSecret = ["q"].join("");
  const manySecrets = Array.from({ length: 1_100 }, () => `${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${budgetSecret}${escapedQuote()}`).join(";");
  const budgetRedacted = redactSecretLikeText(manySecrets);
  assert.equal(budgetRedacted, "[REDACTED]");
  assert.doesNotMatch(budgetRedacted, new RegExp(budgetSecret));
});

test("review-fix redaction consumes complete backslash-containing unquoted secret values", () => {
  const secret = runtimeCanary("backslash-unquoted");
  const second = runtimeCanary("backslash-unquoted-second");
  const backslash = "\\";
  const cases = [
    {
      name: "reviewer example semicolon sibling",
      input: `password=abc${backslash}def;safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "doubled backslash query sibling",
      input: `token=abc${backslash}${backslash}def&safe=visible`,
      keep: /&safe=visible/,
    },
    {
      name: "client secret to bounded end",
      input: `clientSecret=abc${backslash}def`,
      keep: /clientSecret=\[REDACTED\]$/,
    },
    {
      name: "trailing backslash",
      input: `token=abc${backslash}`,
      keep: /token=\[REDACTED\]$/,
    },
    {
      name: "several backslashes",
      input: `password=ab${backslash}${backslash}cd${backslash}${backslash}${backslash}ef;safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "backslash and spaces through deterministic delimiter",
      input: `password=abc${backslash} def ghi;safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "query value with adjacent safe parameter",
      input: `https://example.invalid/path?token=${secret}${backslash}tail&safe=visible`,
      keep: /&safe=visible/,
    },
    {
      name: "json-like wrapper with safe sibling",
      input: `headers={token:${secret}${backslash}tail,safe:visible}`,
      keep: /,safe:visible/,
    },
    {
      name: "multiple backslash assignments",
      input: `token=${secret}${backslash}tail;clientSecret=${second}${backslash}tail;safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "marker-adjacent unquoted backslash secret",
      input: `[REDACTED]token=${secret}${backslash}tail;safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "harmless windows prose without recognized assignment",
      input: `Harmless path C:${backslash}Users${backslash}Public remains meaningful.`,
      exact: `Harmless path C:${backslash}Users${backslash}Public remains meaningful.`,
    },
  ];
  for (const item of cases) {
    const redacted = redactSecretLikeText(item.input);
    assert.doesNotMatch(redacted, new RegExp(secret), item.name);
    assert.doesNotMatch(redacted, new RegExp(second), item.name);
    assert.doesNotMatch(redacted, /abc\\def|abc\\\\def|tail/, item.name);
    if (item.exact) {
      assert.equal(redacted, item.exact, item.name);
    } else {
      assert.match(redacted, item.keep, item.name);
      assert.match(redacted, /\[REDACTED\]/, item.name);
    }
    assert.equal(redactSecretLikeText(redacted), redacted, item.name);
  }
});

test("review-fix redaction treats escaped quotes inside quoted secrets as data", () => {
  const secret = runtimeCanary("escaped-quote-value");
  const second = runtimeCanary("escaped-quote-value-second");
  const backslash = "\\";
  const doubleQuote = "\"";
  const singleQuote = "'";
  const escapedQuote = (depth = 1, quote = doubleQuote) => `${backslash.repeat(depth)}${quote}`;
  const escapedObject = (key, value, depth = 1, quote = doubleQuote) =>
    `{${escapedQuote(depth, quote)}${key}${escapedQuote(depth, quote)}:${escapedQuote(depth, quote)}${value}${backslash.repeat(depth + 2)}${quote}tail${escapedQuote(depth, quote)},${escapedQuote(depth, quote)}safe${escapedQuote(depth, quote)}:${escapedQuote(depth, quote)}visible${escapedQuote(depth, quote)}}`;
  const cases = [
    {
      name: "reviewer escaped double quoted example",
      input: escapedObject("token", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped single quoted equivalent",
      input: escapedObject("token", secret, 1, singleQuote),
      keep: /\\'safe\\':\\'visible\\'/,
    },
    {
      name: "two embedded escaped quotes",
      input: `{${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${secret}${backslash}${backslash}${backslash}${doubleQuote}mid${backslash}${backslash}${backslash}${doubleQuote}tail${escapedQuote()},${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()}}`,
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped quote near beginning",
      input: `{${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${backslash}${backslash}${backslash}${doubleQuote}${secret}tail${escapedQuote()},${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()}}`,
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped quote near closing boundary",
      input: `{${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${secret}tail${backslash}${backslash}${backslash}${doubleQuote}${escapedQuote()},${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()}}`,
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "clientSecret alias",
      input: escapedObject("clientSecret", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "accessToken alias",
      input: escapedObject("accessToken", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "api-key alias",
      input: escapedObject("api-key", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "escaped bearer authorization",
      input: `Authorization: Bearer ${escapedQuote()}${secret}${backslash}${backslash}${backslash}${doubleQuote}tail${escapedQuote()}`,
      keep: /Authorization: Bearer \[REDACTED\]/,
    },
    {
      name: "escaped basic authorization",
      input: `Authorization: Basic ${escapedQuote()}${secret}${backslash}${backslash}${backslash}${doubleQuote}tail${escapedQuote()}`,
      keep: /Authorization: Basic \[REDACTED\]/,
    },
    {
      name: "one additional escape layer with embedded escaped quote",
      input: escapedObject("token", secret, 2),
      keep: /\\\\"safe\\\\":\\\\"visible\\\\"/,
    },
    {
      name: "malformed escaped quoted value fail closed",
      input: `{${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${secret}${backslash}${backslash}${backslash}${doubleQuote}tail,${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()}}`,
      keep: /^\{\\"token\\":\[REDACTED\]\}$/,
    },
    {
      name: "mixed ordinary and escaped nested assignments",
      input: `headers={${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${secret}${backslash}${backslash}${backslash}${doubleQuote}tail${escapedQuote()},clientSecret:${second},safe:visible}`,
      keep: /safe:visible/,
    },
    {
      name: "multiple sibling escaped quoted secrets",
      input: `{${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${secret}${backslash}${backslash}${backslash}${doubleQuote}tail${escapedQuote()},${escapedQuote()}clientSecret${escapedQuote()}:${escapedQuote()}${second}${backslash}${backslash}${backslash}${doubleQuote}tail${escapedQuote()},${escapedQuote()}safe${escapedQuote()}:${escapedQuote()}visible${escapedQuote()}}`,
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "marker adjacent escaped quoted secret",
      input: `[REDACTED]${escapedObject("token", secret)}`,
      keep: /\[REDACTED\]/,
    },
    {
      name: "adjacent escaped safe field visible",
      input: escapedObject("token", secret),
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "harmless escaped quote prose",
      input: `Harmless text says ${escapedQuote()}token${escapedQuote()} and value ${escapedQuote()}${secret}${escapedQuote()} without assignment.`,
      exact: `Harmless text says ${escapedQuote()}token${escapedQuote()} and value ${escapedQuote()}${secret}${escapedQuote()} without assignment.`,
      harmlessKeepsSecret: true,
    },
  ];
  for (const item of cases) {
    const redacted = redactSecretLikeText(item.input);
    if (item.harmlessKeepsSecret) {
      assert.equal(redacted, item.exact, item.name);
    } else {
      assert.doesNotMatch(redacted, new RegExp(secret), item.name);
      assert.doesNotMatch(redacted, new RegExp(second), item.name);
      assert.doesNotMatch(redacted, /tail/, item.name);
      assert.match(redacted, item.keep, item.name);
      assert.match(redacted, /\[REDACTED\]/, item.name);
    }
    assert.equal(redactSecretLikeText(redacted), redacted, item.name);
  }

  const nearBound = `${"headers=".repeat(900)}${escapedObject("token", secret)}${"x".repeat(2_000)}`.slice(0, 19_950);
  const nearBoundStarted = process.hrtime.bigint();
  const nearBoundRedacted = redactSecretLikeText(nearBound);
  const nearBoundElapsedMs = Number(process.hrtime.bigint() - nearBoundStarted) / 1_000_000;
  assert.equal(nearBoundElapsedMs < 1_000, true, `near-bound elapsed ${nearBoundElapsedMs}ms`);
  assert.doesNotMatch(nearBoundRedacted, new RegExp(secret));
  assert.equal(nearBoundRedacted.length <= 20_000, true);

  const manySiblingFragments = Array.from({ length: 1_000 }, (_item, index) =>
    `h${index}=${escapedObject("token", secret)}`).join(" ");
  const manyStarted = process.hrtime.bigint();
  const manyRedacted = redactSecretLikeText(manySiblingFragments);
  const manyElapsedMs = Number(process.hrtime.bigint() - manyStarted) / 1_000_000;
  assert.equal(manyElapsedMs < 1_000, true, `many elapsed ${manyElapsedMs}ms`);
  assert.doesNotMatch(manyRedacted, new RegExp(secret));

  const budgetSecret = ["r"].join("");
  const manySecrets = Array.from({ length: 1_100 }, () =>
    `${escapedQuote()}token${escapedQuote()}:${escapedQuote()}${budgetSecret}${escapedQuote()}`).join(";");
  const budgetRedacted = redactSecretLikeText(manySecrets);
  assert.equal(budgetRedacted, "[REDACTED]");
  assert.doesNotMatch(budgetRedacted, new RegExp(budgetSecret));
});

test("review-fix redaction consumes quoted delimiters and unquoted escaped quotes", () => {
  const secret = runtimeCanary("quoted-delimiter");
  const second = runtimeCanary("unquoted-escaped-quote");
  const third = runtimeCanary("alias-escaped-quote");
  const backslash = "\\";
  const doubleQuote = "\"";
  const singleQuote = "'";
  const escapedQuote = (depth = 1, quote = doubleQuote) => `${backslash.repeat(depth)}${quote}`;
  const quoted = (key, value, quote = doubleQuote) => `${key}=${quote}${value}${quote}`;
  const escapedQuoted = (key, value, depth = 1) => `${escapedQuote(depth)}${key}${escapedQuote(depth)}:${escapedQuote(depth)}${value}${escapedQuote(depth)}`;
  const unquotedEscaped = (key, value, quote = doubleQuote) => `${key}=${value}${backslash}${quote}rawtail`;
  const cases = [
    {
      name: "double quoted semicolon",
      input: `${quoted("token", `${secret};rawtail`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "single quoted semicolon",
      input: `${quoted("token", `${secret};rawtail`, singleQuote)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "quoted ampersand",
      input: `${quoted("token", `${secret}&rawtail`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "quoted question",
      input: `${quoted("token", `${secret}?rawtail`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "quoted close brace",
      input: `${quoted("token", `${secret}}rawtail`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "quoted close bracket",
      input: `${quoted("token", `${secret}]rawtail`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "quoted close paren",
      input: `${quoted("token", `${secret})rawtail`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "quoted comma",
      input: `${quoted("token", `${secret},rawtail`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "several quoted delimiters",
      input: `${quoted("token", `${secret};&?}]),rawtail`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "delimiter before structural close",
      input: `${quoted("token", `${secret};`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "escaped quote plus quoted delimiters",
      input: `${quoted("token", `${secret}${backslash}${doubleQuote}rawtail;&?`)},safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "one additional escaped quote layer plus delimiters",
      input: `{${escapedQuoted("token", `${secret};rawtail&?`, 2)},${escapedQuote(2)}safe${escapedQuote(2)}:${escapedQuote(2)}visible${escapedQuote(2)}}`,
      keep: /\\\\"safe\\\\":\\\\"visible\\\\"/,
    },
    {
      name: "malformed quoted delimiters fail closed",
      input: `token="${secret};rawtail,safe=visible`,
      keep: /^token=\[REDACTED\]$/,
      dropsSafe: true,
    },
    {
      name: "safe sibling after structural closure",
      input: `token="${secret};rawtail",safe=visible`,
      keep: /,safe=visible/,
    },
    {
      name: "unquoted escaped double quote",
      input: `${unquotedEscaped("token", second)};safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "unquoted escaped single quote",
      input: `${unquotedEscaped("token", second, singleQuote)};safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "multiple unquoted escaped quotes",
      input: `token=${second}${backslash}${doubleQuote}mid${backslash}${doubleQuote}rawtail;safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "unquoted escaped quote near start",
      input: `token=a${backslash}${doubleQuote}${second}rawtail;safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "unquoted escaped quote near end",
      input: `token=${second}rawtail${backslash}${doubleQuote};safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "clientSecret escaped quote alias",
      input: `${unquotedEscaped("clientSecret", third)};safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "accessToken escaped quote alias",
      input: `${unquotedEscaped("accessToken", third)}&safe=visible`,
      keep: /&safe=visible/,
    },
    {
      name: "api-key escaped quote alias",
      input: `${unquotedEscaped("api-key", third)}?safe=visible`,
      keep: /\?safe=visible/,
    },
    {
      name: "query escaped quote sibling",
      input: `https://example.invalid/path?token=${second}${backslash}${doubleQuote}rawtail&safe=visible`,
      keep: /&safe=visible/,
    },
    {
      name: "wrapper unquoted escaped quote",
      input: `headers={token:${second}${backslash}${doubleQuote}rawtail,safe:visible}`,
      keep: /,safe:visible/,
    },
    {
      name: "marker adjacent unquoted escaped quote",
      input: `[REDACTED]token=${second}${backslash}${doubleQuote}rawtail;safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "several sibling assignments",
      input: `token=${second}${backslash}${doubleQuote}rawtail;clientSecret=${third}${backslash}${singleQuote}rawtail;safe=visible`,
      keep: /;safe=visible/,
    },
    {
      name: "ambiguous quote join fails closed through tail",
      input: `token="${secret}"rawtail;safe=visible`,
      keep: /^token=\[REDACTED\];safe=visible$/,
    },
    {
      name: "harmless escaped quote prose",
      input: `Harmless text says token ${backslash}${doubleQuote}${second}${backslash}${doubleQuote} without assignment.`,
      exact: `Harmless text says token ${backslash}${doubleQuote}${second}${backslash}${doubleQuote} without assignment.`,
      harmlessKeepsSecret: true,
    },
  ];
  for (const item of cases) {
    const redacted = redactSecretLikeText(item.input);
    if (item.harmlessKeepsSecret) {
      assert.equal(redacted, item.exact, item.name);
      continue;
    }
    assert.doesNotMatch(redacted, new RegExp(secret), item.name);
    assert.doesNotMatch(redacted, new RegExp(second), item.name);
    assert.doesNotMatch(redacted, new RegExp(third), item.name);
    assert.doesNotMatch(redacted, /rawtail/, item.name);
    if (item.dropsSafe) assert.doesNotMatch(redacted, /safe=visible/, item.name);
    assert.match(redacted, item.keep, item.name);
    assert.match(redacted, /\[REDACTED\]/, item.name);
    assert.equal(redactSecretLikeText(redacted), redacted, item.name);
  }

  const nearBound = `${"prefix=".repeat(700)}token="${secret};rawtail&?}]),"${"x".repeat(5_000)}`.slice(0, 19_950);
  const nearBoundStarted = process.hrtime.bigint();
  const nearBoundRedacted = redactSecretLikeText(nearBound);
  const nearBoundElapsedMs = Number(process.hrtime.bigint() - nearBoundStarted) / 1_000_000;
  assert.equal(nearBoundElapsedMs < 1_000, true, `near-bound elapsed ${nearBoundElapsedMs}ms`);
  assert.doesNotMatch(nearBoundRedacted, new RegExp(secret));
  assert.doesNotMatch(nearBoundRedacted, /rawtail/);
  assert.equal(nearBoundRedacted.length <= 20_000, true);

  const manySiblingFragments = Array.from({ length: 1_000 }, (_item, index) =>
    `h${index}={token:${second}${backslash}${doubleQuote}rawtail,safe:visible}`).join(" ");
  const manyStarted = process.hrtime.bigint();
  const manyRedacted = redactSecretLikeText(manySiblingFragments);
  const manyElapsedMs = Number(process.hrtime.bigint() - manyStarted) / 1_000_000;
  assert.equal(manyElapsedMs < 1_000, true, `many elapsed ${manyElapsedMs}ms`);
  assert.doesNotMatch(manyRedacted, new RegExp(second));
  assert.doesNotMatch(manyRedacted, /rawtail/);
  assert.match(manyRedacted, /safe/);

  const budgetSecret = ["s"].join("");
  const manySecrets = Array.from({ length: 1_100 }, () => `token="${budgetSecret};rawtail"`).join(";");
  const budgetRedacted = redactSecretLikeText(manySecrets);
  assert.equal(budgetRedacted, "[REDACTED]");
  assert.doesNotMatch(budgetRedacted, new RegExp(budgetSecret));
});

test("review-fix redaction consumes complete Authorization assignment escaped tails", () => {
  const secret = runtimeCanary("authorization-escaped-tail");
  const second = runtimeCanary("authorization-second");
  const third = runtimeCanary("authorization-third");
  const backslash = "\\";
  const doubleQuote = "\"";
  const escapedQuote = `${backslash}${doubleQuote}`;
  const lowerKey = ["author", "ization"].join("");
  const camelKey = ["Author", "ization"].join("");
  const bearer = ["Bear", "er"].join("");
  const basic = ["Bas", "ic"].join("");
  const escapedDelimiter = (char, slashCount = 1) => `${backslash.repeat(slashCount)}${char}`;
  const auth = (key, separator, scheme, value, suffix = ";safe=visible") =>
    `${key}${separator}${scheme} ${value}${suffix}`;
  const cases = [
    {
      name: "bearer escaped semicolon sibling",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter(";")}tail`),
      keep: new RegExp(`${lowerKey}=${bearer} \\[REDACTED\\];safe=visible`),
      drops: /tail/,
    },
    {
      name: "basic escaped semicolon sibling",
      input: auth(lowerKey, "=", basic, `${secret}${escapedDelimiter(";")}tail`),
      keep: new RegExp(`${lowerKey}=${basic} \\[REDACTED\\];safe=visible`),
      drops: /tail/,
    },
    {
      name: "bearer escaped quote semicolon sibling",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`),
      keep: new RegExp(`${lowerKey}=${bearer} \\[REDACTED\\];safe=visible`),
    },
    {
      name: "basic escaped quote semicolon sibling",
      input: auth(lowerKey, "=", basic, `${secret}${escapedQuote}rawtail`),
      keep: new RegExp(`${lowerKey}=${basic} \\[REDACTED\\];safe=visible`),
    },
    {
      name: "camel case key",
      input: auth(camelKey, "=", bearer, `${secret}${escapedQuote}rawtail`),
      keep: new RegExp(`${camelKey}=${bearer} \\[REDACTED\\];safe=visible`),
    },
    {
      name: "colon assignment in wrapper",
      input: `headers={${auth(camelKey, ":", bearer, `${secret}${escapedQuote}rawtail`)}}`,
      keep: new RegExp(`${camelKey}:\\s*${bearer} \\[REDACTED\\];safe=visible`),
    },
    {
      name: "whitespace around key separator and scheme",
      input: `${lowerKey}  = \t${bearer}   ${secret}${escapedQuote}rawtail;safe=visible`,
      keep: new RegExp(`${lowerKey}  = \t${bearer} \\[REDACTED\\];safe=visible`),
    },
    {
      name: "repeated escaped quotes",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedQuote}mid${escapedQuote}rawtail`),
      keep: /;safe=visible/,
    },
    {
      name: "repeated backslashes",
      input: auth(lowerKey, "=", bearer, `${secret}${backslash}${backslash}${backslash}rawtail`),
      keep: /;safe=visible/,
    },
    {
      name: "escaped ampersand",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter("&")}tail`, "&safe=visible"),
      keep: /&safe=visible/,
      drops: /tail/,
    },
    {
      name: "escaped question mark",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter("?")}tail`, "?safe=visible"),
      keep: /\?safe=visible/,
      drops: /tail/,
    },
    {
      name: "escaped comma",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter(",")}tail`, ",safe=visible"),
      keep: /,safe=visible/,
      drops: /tail/,
    },
    {
      name: "escaped closing brace",
      input: `headers={${auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter("}")}tail`, "}safe=visible")}`,
      keep: /}safe=visible/,
      drops: /tail/,
    },
    {
      name: "escaped closing bracket",
      input: `[${auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter("]")}tail`, "]safe=visible")}`,
      keep: /\]safe=visible/,
      drops: /tail/,
    },
    {
      name: "escaped closing parenthesis",
      input: `(${auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter(")")}tail`, ")safe=visible")}`,
      keep: /\)safe=visible/,
      drops: /tail/,
    },
    {
      name: "repeated escaped delimiters",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter(";")}mid${escapedDelimiter("&")}tail`, "&safe=visible"),
      keep: /&safe=visible/,
      drops: /mid|tail/,
    },
    {
      name: "escaped delimiter near credential start",
      input: auth(lowerKey, "=", bearer, `${escapedDelimiter(";")}${secret}tail`),
      keep: /;safe=visible/,
      drops: /tail/,
    },
    {
      name: "escaped delimiter immediately before structural delimiter",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter(";")}`, ";safe=visible"),
      keep: /;safe=visible/,
    },
    {
      name: "odd backslash run before delimiter",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter(";", 3)}tail`),
      keep: /;safe=visible/,
      drops: /tail/,
    },
    {
      name: "even backslash run before delimiter",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter(";", 2)}`),
      keep: /;safe=visible/,
    },
    {
      name: "repeated backslashes plus escaped quote and escaped delimiter",
      input: auth(lowerKey, "=", bearer, `${secret}${backslash}${backslash}${escapedQuote}mid${escapedDelimiter(";")}tail`),
      keep: /;safe=visible/,
      drops: /mid|tail/,
    },
    {
      name: "escaped quote near credential start",
      input: auth(lowerKey, "=", bearer, `${escapedQuote}${secret}rawtail`),
      keep: /;safe=visible/,
    },
    {
      name: "escaped quote near deterministic delimiter",
      input: auth(lowerKey, "=", bearer, `${secret}rawtail${escapedQuote}`),
      keep: /;safe=visible/,
    },
    {
      name: "ampersand sibling",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`, "&safe=visible"),
      keep: /&safe=visible/,
    },
    {
      name: "query sibling",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`, "?safe=visible"),
      keep: /\?safe=visible/,
    },
    {
      name: "comma sibling",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`, ",safe=visible"),
      keep: /,safe=visible/,
    },
    {
      name: "closing brace boundary",
      input: `headers={${auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`, "}safe=visible")}`,
      keep: /}safe=visible/,
    },
    {
      name: "closing bracket boundary",
      input: `[${auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`, "]safe=visible")}`,
      keep: /\]safe=visible/,
    },
    {
      name: "closing parenthesis boundary",
      input: `(${auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`, ")safe=visible")}`,
      keep: /\)safe=visible/,
    },
    {
      name: "newline boundary",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`, "\nsafe=visible"),
      keep: /\nsafe=visible/,
    },
    {
      name: "input end boundary",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`, ""),
      keep: new RegExp(`${lowerKey}=${bearer} \\[REDACTED\\]$`),
    },
    {
      name: "nested wrapper assignment",
      input: `outer={headers={${auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`)}};mode=read}`,
      keep: /mode=read/,
    },
    {
      name: "escaped json-like wrapper assignment",
      input: `headers={${escapedQuote}${lowerKey}${escapedQuote}:${bearer} ${secret}${escapedQuote}rawtail,${escapedQuote}safe${escapedQuote}:${escapedQuote}visible${escapedQuote}}`,
      keep: /\\"safe\\":\\"visible\\"/,
    },
    {
      name: "marker adjacent assignment",
      input: `[REDACTED]${auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`)}`,
      keep: /\[REDACTED\]/,
    },
    {
      name: "multiple authorization assignments",
      input: `${auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`)} ${auth(camelKey, "=", basic, `${second}${escapedQuote}rawtail`, "&safe=visible")}`,
      keep: /&safe=visible/,
    },
    {
      name: "mixed authorization and ordinary secret assignments",
      input: `${auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`)} clientSecret=${third}${escapedQuote}rawtail&safe=visible`,
      keep: /&safe=visible/,
    },
    {
      name: "malformed bearer ambiguous whitespace fails closed",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail safe=visible`, ""),
      keep: new RegExp(`${lowerKey}=${bearer} \\[REDACTED\\]$`),
      dropsSafe: true,
    },
    {
      name: "malformed basic ambiguous whitespace fails closed",
      input: auth(lowerKey, "=", basic, `${second}${escapedQuote}rawtail safe=visible`, ""),
      keep: new RegExp(`${lowerKey}=${basic} \\[REDACTED\\]$`),
      dropsSafe: true,
    },
    {
      name: "over-depth escaped delimiter fails closed",
      input: auth(lowerKey, "=", bearer, `${secret}${escapedDelimiter(";", 17)}tail;safe=visible`, ""),
      keep: new RegExp(`${lowerKey}=${bearer} \\[REDACTED\\]$`),
      dropsSafe: true,
      drops: /tail/,
    },
    {
      name: "already redacted bearer idempotent",
      input: `${lowerKey}=${bearer} [REDACTED];safe=visible`,
      exact: `${lowerKey}=${bearer} [REDACTED];safe=visible`,
      allowMarker: true,
    },
    {
      name: "already redacted basic idempotent",
      input: `${lowerKey}=${basic} [REDACTED];safe=visible`,
      exact: `${lowerKey}=${basic} [REDACTED];safe=visible`,
      allowMarker: true,
    },
    {
      name: "harmless prose",
      input: `${bearer}, ${basic}, and ${lowerKey} policy text without assignment grammar stays readable.`,
      exact: `${bearer}, ${basic}, and ${lowerKey} policy text without assignment grammar stays readable.`,
      harmlessKeepsText: true,
    },
  ];
  for (const item of cases) {
    const redacted = redactSecretLikeText(item.input);
    if (item.exact) {
      assert.equal(redacted, item.exact, item.name);
      assert.equal(redactSecretLikeText(redacted), redacted, item.name);
      continue;
    }
    if (item.harmlessKeepsText) {
      assert.equal(redacted, item.input, item.name);
      continue;
    }
    assert.doesNotMatch(redacted, new RegExp(secret), item.name);
    assert.doesNotMatch(redacted, new RegExp(second), item.name);
    assert.doesNotMatch(redacted, new RegExp(third), item.name);
    assert.doesNotMatch(redacted, /rawtail/, item.name);
    if (item.drops) assert.doesNotMatch(redacted, item.drops, item.name);
    assert.match(redacted, item.keep, item.name);
    assert.match(redacted, /\[REDACTED\]/, item.name);
    if (item.dropsSafe) assert.doesNotMatch(redacted, /safe=visible/, item.name);
    assert.equal(redactSecretLikeText(redacted), redacted, item.name);
  }

  const nearBound = `${"headers=".repeat(750)}${auth(lowerKey, "=", bearer, `${secret}${escapedQuote}rawtail`)}${"x".repeat(4_000)}`.slice(0, 19_950);
  const nearBoundStarted = process.hrtime.bigint();
  const nearBoundRedacted = redactSecretLikeText(nearBound);
  const nearBoundElapsedMs = Number(process.hrtime.bigint() - nearBoundStarted) / 1_000_000;
  assert.equal(nearBoundElapsedMs < 1_000, true, `near-bound authorization elapsed ${nearBoundElapsedMs}ms`);
  assert.doesNotMatch(nearBoundRedacted, new RegExp(secret));
  assert.doesNotMatch(nearBoundRedacted, /rawtail/);
  assert.equal(nearBoundRedacted.length <= 20_000, true);

  const manySiblingFragments = Array.from({ length: 1_000 }, (_item, index) =>
    `h${index}={${auth(lowerKey, "=", bearer, `${second}${escapedQuote}rawtail`)}}`).join(" ");
  const manyStarted = process.hrtime.bigint();
  const manyRedacted = redactSecretLikeText(manySiblingFragments);
  const manyElapsedMs = Number(process.hrtime.bigint() - manyStarted) / 1_000_000;
  assert.equal(manyElapsedMs < 1_000, true, `many authorization elapsed ${manyElapsedMs}ms`);
  assert.doesNotMatch(manyRedacted, new RegExp(second));
  assert.doesNotMatch(manyRedacted, /rawtail/);
  assert.match(manyRedacted, /safe=visible/);

  const budgetSecret = ["authorization", "budget"].join("-");
  const manySecrets = Array.from({ length: 1_100 }, () =>
    auth(lowerKey, "=", bearer, `${budgetSecret}${escapedQuote}rawtail`)).join(";");
  const budgetRedacted = redactSecretLikeText(manySecrets);
  assert.equal(budgetRedacted.length <= 20_000, true);
  assert.doesNotMatch(budgetRedacted, new RegExp(budgetSecret));
  assert.doesNotMatch(budgetRedacted, /rawtail/);
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
      keep: /^\[REDACTED\]token=\[REDACTED\]$/,
    },
    {
      name: "marker unterminated single quoted token",
      input: `[REDACTED]token='${secret}`,
      keep: /^\[REDACTED\]token=\[REDACTED\]$/,
    },
    {
      name: "mismatched single close for double quoted token",
      input: `token="${secret}'`,
      keep: /^token=\[REDACTED\]$/,
    },
    {
      name: "mismatched double close for single quoted token",
      input: `token='${secret}"`,
      keep: /^token=\[REDACTED\]$/,
    },
    {
      name: "marker api key alias malformed quote",
      input: `[REDACTED]x-api-key="${secret}`,
      keep: /^\[REDACTED\]x-api-key=\[REDACTED\]$/,
    },
    {
      name: "marker camel case alias malformed quote",
      input: `[REDACTED]accessToken='${secret}`,
      keep: /^\[REDACTED\]accessToken=\[REDACTED\]$/,
    },
    {
      name: "quoted json key malformed quoted value",
      input: `[REDACTED]"token":"${secret}`,
      keep: /^\[REDACTED\]"token":\[REDACTED\]$/,
    },
    {
      name: "single quoted json key malformed quoted value",
      input: `[REDACTED]'token':'${secret}`,
      keep: /^\[REDACTED\]'token':\[REDACTED\]$/,
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
      keep: /^headers="\[REDACTED\]token=\[REDACTED\]$/,
    },
    {
      name: "malformed value inside unquoted wrapper",
      input: `headers={[REDACTED]token="${secret}}`,
      keep: /^headers=\{\[REDACTED\]token=\[REDACTED\]$/,
    },
    {
      name: "query malformed value fails closed through unsafe field",
      input: `https://example.invalid/path?[REDACTED]token="${secret}&safe=visible`,
      keep: /^https:\/\/example\.invalid\/path\?\[REDACTED\]token=\[REDACTED\]$/,
    },
    {
      name: "json-like malformed value fails closed through unsafe key",
      input: `{[REDACTED]"token":"${secret},"safe":"visible"}`,
      keep: /^\{\[REDACTED\]"token":\[REDACTED\]":"visible"\}$/,
    },
    {
      name: "malformed value reaches bounded end",
      input: `prefix [REDACTED]token="${secret}`,
      keep: /prefix \[REDACTED\]token=\[REDACTED\]$/,
    },
    {
      name: "malformed value reaches newline",
      input: `[REDACTED]token="${secret}\nsafe=visible`,
      keep: /\nsafe=visible/,
    },
    {
      name: "multiple malformed secret assignments",
      input: `[REDACTED]token="${secret};[REDACTED]clientSecret='${second}`,
      keep: /^\[REDACTED\]token=\[REDACTED\]$/,
    },
    {
      name: "existing marker malformed and balanced secret",
      input: `[REDACTED]token="${secret}; x-api-key="${second}"`,
      keep: /^\[REDACTED\]token=\[REDACTED\]"$/,
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

  const prettyWrapper = [
    "headers={",
    ...Array.from({ length: 1_000 }, (_item, index) => `  safe${index}: visible,`),
    `  token: "${secret}",`,
    "  safeFinal: visible",
    "}",
  ].join("\n");
  assert.equal(prettyWrapper.length > 18_000, true);
  const prettyStarted = process.hrtime.bigint();
  const prettyRedacted = redactSecretLikeText(prettyWrapper);
  const prettyElapsedMs = Number(process.hrtime.bigint() - prettyStarted) / 1_000_000;
  assert.equal(prettyElapsedMs < 1_000, true, `pretty elapsed ${prettyElapsedMs}ms`);
  assert.doesNotMatch(prettyRedacted, new RegExp(secret));
  assert.match(prettyRedacted, /safeFinal: visible/);
  assert.equal(prettyRedacted.length <= 20_000, true);

  const manySiblingWrappers = Array.from({ length: 1_000 }, (_item, index) => `headers${index}={safe:visible,token:${secret}}`).join(" ");
  const siblingStarted = process.hrtime.bigint();
  const manySiblingRedacted = redactSecretLikeText(manySiblingWrappers);
  const siblingElapsedMs = Number(process.hrtime.bigint() - siblingStarted) / 1_000_000;
  assert.equal(siblingElapsedMs < 1_000, true, `sibling elapsed ${siblingElapsedMs}ms`);
  assert.doesNotMatch(manySiblingRedacted, new RegExp(secret));
  assert.match(manySiblingRedacted, /safe:visible/);
  assert.equal(manySiblingRedacted.length <= 20_000, true);

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

  const budgetSecret = ["not", "real"].join("-");
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

test("review-fix nested wrapper canaries never reach prompt evidence or durable fixtures", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fix-nested-canary-"));
  try {
    const secret = runtimeCanary("prompt-evidence-nested-wrapper");
    const nestedWrapper = `headers={token: "${secret}",safe:visible}`;
    const trigger = {
      actionable: true,
      source: "integrated_gemini",
      verdict: "fail",
      findings: [{
        provider: "gemini",
        severity: "high",
        path: `tools/auto-runner/lib/review-fix-policy.mjs?${nestedWrapper}`,
        file: `tools/auto-runner/lib/review-fix-policy.mjs#metadata={clientSecret:'${secret}'}`,
        line: 606,
        range: { startLine: 606, endLine: 607, label: `query={ accessToken : "${secret}" , safe : visible }` },
        title: `nested wrapper token ${nestedWrapper}`,
        message: `headers={"x-api-key":"${secret}",safe:visible}`,
        body: `Authorization: Bearer ${secret}`,
        details: `metadata={client_secret:${secret};safe=visible}`,
        rule: `headers={client-secret:${secret};safe=visible}`,
        ruleId: `query={token=${secret}&safe=visible}`,
        check: `outer={headers={token:"${secret}",safe:visible};safe=visible}`,
        invariant: "safe adjacent fields stay visible",
        authorityInvariant: `history={headers={token:"${secret}",safe:visible}}`,
      }],
    };
    const decision = evaluateReviewFixMutationDecision({
      config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
      issue: { number: 921, title: "Nested wrapper canary", labels: [] },
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
      issue: { number: 921, title: "Nested wrapper canary" },
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
      issue: { number: 921, title: "Nested wrapper canary" },
      trigger,
      decision,
      promptFixture: nestedWrapper,
      structuredFindings: trigger.findings,
      findingInventory: [{ fingerprint: `headers={token:"${secret}",safe:visible}`, history: [`metadata={clientSecret:'${secret}'}`] }],
      durableStateFixture: {
        prompt: `query={ accessToken : "${secret}" , safe : visible }`,
        evidence: `headers={"x-api-key":"${secret}",safe:visible}`,
        inventory: [`headers={client-secret:${secret};safe=visible}`],
        fingerprints: [`query={token=${secret}&safe=visible}`],
        history: [`outer={headers={token:"${secret}",safe:visible};safe=visible}`],
        safe: "visible",
      },
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

test("review-fix escaped nested canaries never reach prompt evidence or durable fixtures", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fix-escaped-canary-"));
  try {
    const secret = runtimeCanary("prompt-evidence-escaped-nested");
    const backslash = "\\";
    const escapedQuote = `${backslash}"`;
    const escapedWrapper = `headers={${escapedQuote}token${escapedQuote}:${escapedQuote}${secret}${escapedQuote},${escapedQuote}safe${escapedQuote}:${escapedQuote}visible${escapedQuote}}`;
    const trigger = {
      actionable: true,
      source: "integrated_gemini",
      verdict: "fail",
      findings: [{
        provider: "gemini",
        severity: "high",
        path: `tools/auto-runner/lib/review-fix-policy.mjs?${escapedWrapper}`,
        file: `tools/auto-runner/lib/review-fix-policy.mjs#metadata={${escapedQuote}clientSecret${escapedQuote}:${escapedQuote}${secret}${escapedQuote}}`,
        line: 606,
        range: { startLine: 606, endLine: 607, label: `query={ ${escapedQuote}accessToken${escapedQuote} : ${escapedQuote}${secret}${escapedQuote} , safe : visible }` },
        title: `escaped nested token ${escapedWrapper}`,
        message: `headers={${escapedQuote}api-key${escapedQuote}:${escapedQuote}${secret}${escapedQuote},safe:visible}`,
        body: `Authorization: Bearer ${escapedQuote}${secret}${escapedQuote}`,
        details: `metadata={${escapedQuote}client_secret${escapedQuote}:${escapedQuote}${secret}${escapedQuote};safe=visible}`,
        rule: `headers={${escapedQuote}client-secret${escapedQuote}:${escapedQuote}${secret}${escapedQuote};safe=visible}`,
        ruleId: `query={${escapedQuote}token${escapedQuote}=${escapedQuote}${secret}${escapedQuote}&safe=visible}`,
        check: `outer={headers={${escapedQuote}token${escapedQuote}:${escapedQuote}${secret}${escapedQuote},safe:visible};safe=visible}`,
        invariant: "escaped safe adjacent fields stay visible",
        authorityInvariant: `history={headers={${escapedQuote}token${escapedQuote}:${escapedQuote}${secret}${escapedQuote},safe:visible}}`,
      }],
    };
    const decision = evaluateReviewFixMutationDecision({
      config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
      issue: { number: 921, title: "Escaped nested canary", labels: [] },
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
      issue: { number: 921, title: "Escaped nested canary" },
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
      issue: { number: 921, title: "Escaped nested canary" },
      trigger,
      decision,
      promptFixture: escapedWrapper,
      structuredFindings: trigger.findings,
      findingInventory: [{ fingerprint: `headers={${escapedQuote}token${escapedQuote}:${escapedQuote}${secret}${escapedQuote},safe:visible}`, history: [`metadata={${escapedQuote}clientSecret${escapedQuote}:${escapedQuote}${secret}${escapedQuote}}`] }],
      durableStateFixture: {
        prompt: `query={ ${escapedQuote}accessToken${escapedQuote} : ${escapedQuote}${secret}${escapedQuote} , safe : visible }`,
        evidence: `headers={${escapedQuote}api-key${escapedQuote}:${escapedQuote}${secret}${escapedQuote},safe:visible}`,
        inventory: [`headers={${escapedQuote}client-secret${escapedQuote}:${escapedQuote}${secret}${escapedQuote};safe=visible}`],
        fingerprints: [`query={${escapedQuote}token${escapedQuote}=${escapedQuote}${secret}${escapedQuote}&safe=visible}`],
        history: [`outer={headers={${escapedQuote}token${escapedQuote}:${escapedQuote}${secret}${escapedQuote},safe:visible};safe=visible}`],
        safe: "visible",
      },
    });
    const evidence = readFileSync(written.evidencePath, "utf8");
    for (const output of [JSON.stringify(decision.sanitizedFindings), JSON.stringify(decision), prompt, evidence]) {
      assert.doesNotMatch(output, new RegExp(secret));
      assert.match(output, /\[REDACTED\]/);
    }
    assert.match(prompt, /safe/);
    assert.match(evidence, /visible/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review-fix backslash and escaped-quote canaries never reach prompt evidence or durable fixtures", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fix-backslash-escaped-canary-"));
  try {
    const backslashSecret = runtimeCanary("prompt-evidence-backslash-value");
    const escapedQuoteSecret = runtimeCanary("prompt-evidence-escaped-quote-value");
    const backslash = "\\";
    const escapedQuote = `${backslash}"`;
    const embeddedEscapedQuote = `${backslash}${backslash}${backslash}"`;
    const suffix = "rawsuffix";
    const backslashAssignment = `password=${backslashSecret}${backslash}${suffix};safe=visible`;
    const escapedQuoteAssignment = `{${escapedQuote}token${escapedQuote}:${escapedQuote}${escapedQuoteSecret}${embeddedEscapedQuote}${suffix}${escapedQuote},${escapedQuote}safe${escapedQuote}:${escapedQuote}visible${escapedQuote}}`;
    const trigger = {
      actionable: true,
      source: "integrated_gemini",
      verdict: "fail",
      findings: [{
        provider: "gemini",
        severity: "high",
        path: `tools/auto-runner/lib/review-fix-policy.mjs?${backslashAssignment}`,
        file: `tools/auto-runner/lib/review-fix-policy.mjs#headers=${escapedQuoteAssignment}`,
        line: 702,
        range: { startLine: 148, endLine: 702, label: `inventory=${backslashAssignment}; history=${escapedQuoteAssignment}` },
        title: `Backslash ${backslashAssignment}`,
        message: `Escaped quote ${escapedQuoteAssignment}`,
        body: `mixed ${backslashAssignment} ${escapedQuoteAssignment}`,
        details: `fingerprint ${escapedQuoteAssignment}`,
        rule: `report ${backslashAssignment}`,
        ruleId: `sarif ${escapedQuoteAssignment}`,
        check: `state ${backslashAssignment}`,
        invariant: `prompt ${escapedQuoteAssignment}`,
        authorityInvariant: `evidence ${backslashAssignment}`,
      }],
    };
    const decision = evaluateReviewFixMutationDecision({
      config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
      issue: { number: 921, title: "Backslash escaped canary", labels: [] },
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
      issue: { number: 921, title: "Backslash escaped canary" },
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
      issue: { number: 921, title: "Backslash escaped canary" },
      trigger,
      decision,
      promptFixture: `${backslashAssignment} ${escapedQuoteAssignment}`,
      structuredFindings: trigger.findings,
      findingInventory: [{
        fingerprint: `fp:${backslashAssignment}`,
        history: [`history:${escapedQuoteAssignment}`],
      }],
      durableStateFixture: {
        prompt: backslashAssignment,
        evidence: escapedQuoteAssignment,
        inventory: [backslashAssignment],
        fingerprints: [escapedQuoteAssignment],
        history: [`report:${backslashAssignment}`, `sarif:${escapedQuoteAssignment}`],
        safe: "visible",
      },
    });
    const evidence = readFileSync(written.evidencePath, "utf8");
    for (const output of [JSON.stringify(decision.sanitizedFindings), JSON.stringify(decision), prompt, evidence]) {
      assert.doesNotMatch(output, new RegExp(backslashSecret));
      assert.doesNotMatch(output, new RegExp(escapedQuoteSecret));
      assert.doesNotMatch(output, new RegExp(suffix));
      assert.match(output, /\[REDACTED\]/);
    }
    assert.match(prompt, /safe/);
    assert.match(evidence, /visible/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review-fix Authorization assignment canaries never reach prompt evidence or durable fixtures", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fix-authorization-assignment-canary-"));
  try {
    const secret = runtimeCanary("prompt-evidence-authorization-assignment");
    const second = runtimeCanary("prompt-evidence-basic-assignment");
    const backslash = "\\";
    const escapedQuote = `${backslash}"`;
    const escapedSemicolon = `${backslash};`;
    const lowerKey = ["author", "ization"].join("");
    const bearer = ["Bear", "er"].join("");
    const basic = ["Bas", "ic"].join("");
    const bearerAssignment = `${lowerKey}=${bearer} ${secret}${escapedSemicolon}rawtail;safe=visible`;
    const basicAssignment = `${lowerKey}=${basic} ${second}${escapedQuote}mid${escapedSemicolon}rawtail;safe=visible`;
    const trigger = {
      actionable: true,
      source: "integrated_gemini",
      verdict: "fail",
      findings: [{
        provider: "gemini",
        severity: "high",
        path: `tools/auto-runner/lib/review-fix-policy.mjs?${bearerAssignment}`,
        file: `tools/auto-runner/lib/review-fix-policy.mjs#${basicAssignment}`,
        line: 776,
        range: { startLine: 774, endLine: 776, label: `inventory=${bearerAssignment}; history=${basicAssignment}` },
        title: `Authorization assignment ${bearerAssignment}`,
        message: `Escaped tail ${basicAssignment}`,
        body: `mixed ${bearerAssignment} ${basicAssignment}`,
        details: `fingerprint ${bearerAssignment}`,
        rule: `report ${basicAssignment}`,
        ruleId: `sarif ${bearerAssignment}`,
        check: `state ${basicAssignment}`,
        invariant: `prompt ${bearerAssignment}`,
        authorityInvariant: `evidence ${basicAssignment}`,
      }],
    };
    const decision = evaluateReviewFixMutationDecision({
      config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
      issue: { number: 921, title: "Authorization assignment canary", labels: [] },
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
      issue: { number: 921, title: "Authorization assignment canary" },
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
      issue: { number: 921, title: "Authorization assignment canary" },
      trigger,
      decision,
      promptFixture: `${bearerAssignment} ${basicAssignment}`,
      structuredFindings: trigger.findings,
      findingInventory: [{
        fingerprint: `fp:${bearerAssignment}`,
        history: [`history:${basicAssignment}`],
      }],
      durableStateFixture: {
        decision: bearerAssignment,
        prompt: basicAssignment,
        evidence: bearerAssignment,
        inventory: [basicAssignment],
        fingerprints: [bearerAssignment],
        history: [`report:${basicAssignment}`, `sarif:${bearerAssignment}`],
        logs: `logs:${basicAssignment}`,
        safe: "visible",
      },
    });
    const evidence = readFileSync(written.evidencePath, "utf8");
    for (const output of [JSON.stringify(decision.sanitizedFindings), JSON.stringify(decision), prompt, evidence]) {
      assert.doesNotMatch(output, new RegExp(secret));
      assert.doesNotMatch(output, new RegExp(second));
      assert.doesNotMatch(output, /rawtail/);
      assert.match(output, new RegExp(`${bearer} \\[REDACTED\\]|${basic} \\[REDACTED\\]`));
    }
    assert.match(prompt, /safe=visible/);
    assert.match(evidence, /visible/);
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

test("JavaScript credential-named member references are policy metadata rather than credential values", () => {
  const diff = diffFor("tools/auto-runner/lib/example.mjs", [
    "+  diagnosticAuthorization: cycleDecision.diagnosticAuthorization,",
    "-  authorization = prior.authorization;",
  ]);
  const result = analyzeReviewSecretBoundary({
    changedFiles: ["tools/auto-runner/lib/example.mjs"],
    diff,
  });
  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
  assert.equal(result.allowedReferences.length, 2);
  assert.ok(result.allowedReferences.every((item) => item.classification === "code_reference"));
});

test("arbitrary dotted credential assignments remain blocked", () => {
  const unsafeReference = ["secret", "value", "token"].join(".");
  const diff = diffFor("tools/auto-runner/lib/example.mjs", [
    `+API_TOKEN = ${unsafeReference};`,
  ]);
  const result = analyzeReviewSecretBoundary({ changedFiles: ["tools/auto-runner/lib/example.mjs"], diff });
  assert.equal(result.blocked, true);
  assert.equal(result.blockers[0].classification, "credential_value");
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

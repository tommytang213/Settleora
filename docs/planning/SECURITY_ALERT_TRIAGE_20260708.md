# Security Alert Triage 2026-07-08

## Scope

This document records Bundle A triage and follow-up Bundle B hardening for the
open GitHub code-scanning alert set checked on 2026-07-08 from the repository
`tommytang213/Settleora`.

Live GitHub code-scanning alerts were fetched with `gh api` from the current
repository context. The live open count was `42`, matching the user-provided
export summary from 2026-07-08 12:23 HKT. Dependabot alerts were not fetched in
this Bundle A branch; the uploaded export recorded `0`.

This file records only safe alert metadata: alert numbers, tools, rule IDs,
severity buckets, file paths, and safe triage rationale. It intentionally does
not store secrets, tokens, provider payloads, reset material, alert payload
details beyond file/rule metadata, or raw sensitive runtime data.

## Bundle A Changes

- `services/api/Dockerfile`: adds a dedicated non-root runtime user/group,
  creates writable local storage directories for the current local defaults,
  copies published output with non-root ownership, preserves port `8080`, and
  runs the API as `settleora`.
- `services/api/src/Settleora.Api/Expenses/RecurringBills/RecurringBillEndpoints.cs`:
  adds explicit server-side business authorization checks after recurring
  template visibility lookup on pause, resume, archive, and draft generation.
  This keeps lifecycle and generation writes under API/domain authorization and
  does not move decisions to clients.
- `services/api/tests/Settleora.Api.Tests/LocalFileObjectStorageProviderTests.cs`:
  strengthens traversal and encoded/special-character object-key tests and
  proves write/read/delete reject traversal keys before touching disk.
- `services/api/tests/Settleora.Api.Tests/RecurringBillEndpointTests.cs`:
  extends fail-closed coverage for removed group members and cross-user
  lifecycle/draft-generation attempts, with no bills, occurrences, or recurring
  audit events written.

## Alert Family Triage

| Alerts | Tool | Rule | Severity | Area | Classification | Bundle / next action |
| --- | --- | --- | --- | --- | --- | --- |
| #43 | Semgrep OSS | `dockerfile.security.missing-user-entrypoint.missing-user-entrypoint` | error | `services/api/Dockerfile` | `fix-now` | Bundle A adds a non-root runtime user while preserving `8080`; validate with compose and image build where Docker is available. |
| #11, #10 | CodeQL | `cs/path-injection` | high | `LocalFileObjectStorageProvider.cs` | `false-positive-with-proof` | Runtime already rejects rooted paths, separators, dot segments, unsafe characters, overlong keys, and root escape after full-path normalization. Bundle A adds stronger proof tests. |
| #12, #9, #8 | CodeQL | `cs/path-injection` | high | local storage tests | `test-only-or-suppress-with-proof` | Tests intentionally create temporary roots and exercise path safety. Bundle A strengthens proof; Bundle C should add CodeQL suppression notes if alerts remain. |
| #5 | CodeQL | `cs/user-controlled-bypass` | high | `RecurringBillEndpoints.cs` | `fix-now` | Bundle A adds explicit business authorization checks for lifecycle/generation writes after server-visible template lookup and adds focused fail-closed tests. |
| #13 | CodeQL | `js/command-line-injection` | critical | `scripts/ai/v3-controller.mjs` | `fix-soon` | Bundle B should refactor command execution to avoid shell interpolation or validate fixed command allowlists. Not changed in Bundle A to keep runtime/API fixes focused. |
| #4 | CodeQL | `py/command-line-injection` | critical | `tools/github/sync-day1-board-fields.py` | `fix-soon` | Bundle B should replace shell execution with argument-array subprocess calls or strict allowlists. Not changed in Bundle A. |
| #48 | CodeQL | `cs/sensitive-data-transmission` | medium | password reset SMTP boundary | `future-gated` | Requires auth/password-reset delivery review and likely suppression/refactor proof. Do not change password-reset runtime in Bundle A. |
| #2 | CodeQL | `cs/sensitive-data-transmission` | medium | admin local-user tests | `test-only-or-suppress-with-proof` | Test-only alert. Bundle C should add proof/suppression if still open. |
| #47, #45, #44 | Semgrep OSS | `javascript.lang.security.audit.spawn-shell-true.spawn-shell-true` | error | repo validation tools | `fix-soon` | Bundle B should harden tooling command execution. |
| #36-#34, #33, #31, #30-#28, #26, #23 | Semgrep OSS | `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | warning | GitHub Actions | `fix-soon` | Bundle B should pin actions by commit SHA in a CI/tooling hardening branch. |
| #32, #27, #25, #24 | Semgrep OSS | `yaml.github-actions.security.run-shell-injection.run-shell-injection` | error | GitHub Actions shell interpolation | `fix-soon` | Bundle B should move untrusted expressions into environment variables or otherwise eliminate shell interpolation risk. |
| #3 | CodeQL | `actions/missing-workflow-permissions` | medium | `.github/workflows/scaffold-validation.yml` | `fix-soon` | Bundle B should add least-privilege workflow permissions. |
| #22-#14 | CodeQL | `js/path-injection` | high | `tools/generate-clients.mjs` | `fix-soon` | Bundle B should confine generated-client paths with allowlisted repo-relative roots. OpenAPI/client generation is out of Bundle A. |
| #46, #42 | Semgrep OSS | `javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp` | warning | JS tooling/controller | `fix-soon` | Bundle B or C should replace dynamic regex construction or add proof/suppression. |
| #7, #6 | CodeQL | `cs/web/xss` | high | API tests only | `test-only-or-suppress-with-proof` | Bundle C should add test-only proof/suppression if still open; do not broaden API behavior in Bundle A. |

## Bundle B Follow-ups

### Bundle B1 Tooling Hardening Status

Bundle B1 was opened after PR #779 / Bundle A merged to `main` at
`85c45f0018b8f20e6c34e6283776bcdfbea5a65f`.

Live GitHub code-scanning readback on `refs/heads/main` before Bundle B1 edits
reported `41` open alerts. The exact-head PR #779 readback on
`refs/pull/779/head` reported `0` open alerts, confirming the Bundle A
exact-head test-only alert noise was removed for that PR head. The remaining
main-context readback still included older storage/recurring entries plus the
Bundle B/C families recorded below.

Bundle B1 fixed the command/tooling families in repo tooling only:

- CodeQL `js/command-line-injection` in `scripts/ai/v3-controller.mjs` by
  replacing arbitrary `SETTLEORA_AI_V3_CODEX_COMMAND` executable selection with
  a small reviewed command allowlist, argument-array command resolution, and
  literal executable dispatch for Codex launch.
- CodeQL `py/command-line-injection` in
  `tools/github/sync-day1-board-fields.py` by replacing the generic subprocess
  runner with a `gh`-only runner that passes only argument arrays to a fixed
  executable.
- Semgrep `spawn-shell-true` findings in `tools/validate-docs.mjs`,
  `tools/doctor-validation.mjs`, and `tools/diagnose-npm-env.mjs` by removing
  `shell: true` usage while preserving fixed executable names and argument
  arrays.
- CodeQL `js/path-injection` findings in `tools/generate-clients.mjs` by
  confining generated-client output roots to the committed web/Dart generated
  directories or the explicit `validate-clients` temp directory shape
  `settleora-client-validation-*`, and by checking generated entry paths before
  recursive delete or write.
- Semgrep dynamic RegExp findings in touched tooling by replacing the
  controller glob RegExp builder with a small glob matcher and replacing the
  generated Dart nullable-field dynamic RegExp with a literal string scanner
  over an allowlisted method set.

Bundle B1 added a focused Node built-in smoke test for generated-client output
path confinement in `tools/tests/generate-clients-path-confinement.test.mjs`.

Bundle B1 validation evidence:

- `node --check scripts/ai/v3-controller.mjs`: passed.
- `python3 -m py_compile tools/github/sync-day1-board-fields.py`: passed.
- `node --check tools/generate-clients.mjs`: passed.
- `node --check tools/validate-clients.mjs`,
  `node --check tools/validate-docs.mjs`,
  `node --check tools/doctor-validation.mjs`,
  `node --check tools/diagnose-npm-env.mjs`, and
  `node --check tools/tests/generate-clients-path-confinement.test.mjs`:
  passed.
- `node --test tools/tests/generate-clients-path-confinement.test.mjs`:
  passed with `2` tests.
- `git diff --check`: passed with no output.
- `npm run validate:docs`: passed; output included
  `Documentation validation passed.`
- `npm run validate:scaffold`: passed; output included
  `Scaffold validation passed (19 paths).`
- `npm run validate:openapi`: passed; Redocly reported the OpenAPI
  description is valid.
- `npm run generate:clients`: passed; generated web/Dart clients under the
  committed generated output roots.
- `git diff --name-only`: showed only Bundle B1 tooling/docs paths and no
  generated-client output files.
- `git diff --stat`: showed only Bundle B1 tooling/docs paths and no
  generated-client output files.
- `npm run validate:clients`: passed; generated temp outputs under
  `/tmp/settleora-client-validation-*/client-web` and
  `/tmp/settleora-client-validation-*/client-dart`, then reported
  `Generated client validation passed.`

### Bundle B2 GitHub Actions Hardening Status

Bundle B2 was opened after PR #780 / Bundle B1 merged to `main` at
`be4fecda4aa2cd8766916c7698517c47d82ed781`.

Live GitHub code-scanning readback on `refs/heads/main` before Bundle B2 edits
reported `25` open alerts. The Bundle B2-relevant alert families were:

- Semgrep OSS
  `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag`:
  alerts `#36`, `#35`, `#34`, `#33`, `#31`, `#30`, `#29`, `#28`, `#26`, and
  `#23` across `.github/workflows/scaffold-validation.yml`,
  `.github/workflows/mobile-ios-validation.yml`,
  `.github/workflows/api-image-ghcr.yml`, and
  `.github/workflows/ai-integration-scope-guard.yml`.
- Semgrep OSS
  `yaml.github-actions.security.run-shell-injection.run-shell-injection`:
  alerts `#32`, `#27`, `#25`, and `#24` across
  `.github/workflows/mobile-ios-validation.yml`,
  `.github/workflows/api-image-ghcr.yml`, and
  `.github/workflows/ai-integration-scope-guard.yml`.
- CodeQL `actions/missing-workflow-permissions`: alert `#3` in
  `.github/workflows/scaffold-validation.yml`.

Bundle B2 fixed the GitHub Actions families only:

- `.github/workflows/ai-integration-scope-guard.yml`: pinned
  `actions/checkout@v4` to
  `34e114876b0b11c390a56381ad16ebd13914f8d5`; moved `github.base_ref` and
  `github.head_ref` values into step `env:` variables before using them in
  shell commands.
- `.github/workflows/api-image-ghcr.yml`: pinned `actions/checkout@v6` to
  `df4cb1c069e1874edd31b4311f1884172cec0e10`,
  `docker/login-action@v3` to
  `c94ce9fb468520275223c153574b00df6fe4bcc9`,
  `docker/setup-buildx-action@v3` to
  `8d2750c68a42422c14e847fe6c8ac0403b4cbd6f`, and
  `docker/build-push-action@v6` to
  `10e90e3645eae34f1e60eeb005ba3a3d33f178e8`; moved the workflow dispatch
  event name and optional image tag into step `env:` variables before shell
  use.
- `.github/workflows/mobile-ios-validation.yml`: pinned
  `actions/checkout@v6` to
  `df4cb1c069e1874edd31b4311f1884172cec0e10` and
  `subosito/flutter-action@v2` to
  `1a449444c387b1966244ae4d4f8c696479add0b2`; moved `inputs.expected_head`
  into a step `env:` variable before shell use.
- `.github/workflows/scaffold-validation.yml`: added top-level
  `permissions: contents: read`; pinned `actions/checkout@v6` to
  `df4cb1c069e1874edd31b4311f1884172cec0e10`,
  `actions/setup-node@v6` to
  `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`, and
  `actions/setup-dotnet@v5` to
  `26b0ec14cb23fa6904739307f278c14f94c95bf1`.

Existing security workflows already had least-privilege permissions and pinned
action SHAs:

- `.github/workflows/security-semgrep.yml` keeps `contents: read` plus
  `security-events: write` because it uploads Semgrep SARIF.
- `.github/workflows/security-trivy.yml` keeps `contents: read` plus
  `security-events: write` because it uploads Trivy SARIF.

Bundle C remains separate and is not changed by Bundle B2.

## Bundle C Follow-ups

- Add CodeQL/Semgrep suppression proof for local storage tests if test-only
  alerts remain after Bundle A.
- Add suppression proof for API test-only XSS alerts.
- Review the password-reset SMTP sensitive-transmission alert under the
  auth/password-reset delivery/security gate without changing reset behavior
  silently.
- Add suppression proof for admin local-user test-only sensitive transmission
  if confirmed test-only.

### Bundle C Proof/Suppression Review Status

Bundle C was reviewed after PR #781 / Bundle B2 merged to `main` at
`4de7680ec3bde565aadb23866c20030693391a4a`.

Live GitHub code-scanning readback on `refs/heads/main` before Bundle C edits
reported `10` open alerts. Safe metadata only was read and recorded here; raw
alert source/sink payloads, reset material, SMTP payloads, provider payloads,
workflow logs, secrets, and tokens were not stored.

| Alert | Tool | Rule | Severity / security severity | Path | Line | Bundle C classification | Decision |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| `#48` | CodeQL | `cs/sensitive-data-transmission` | error / medium | `services/api/src/Settleora.Api/Auth/PasswordReset/IPasswordResetSmtpEmailSender.cs` | 145 | `manual-dismissal-required-with-proof` | The flagged send boundary is the approved password-reset SMTP delivery boundary: it builds a plain-text reset email only after delivery readiness, recipient availability, and reset email composition have already succeeded. The current implementation intentionally sends the approved reset link/body through SMTP and keeps reset material out of persistence, logs, audit, reports, and public API responses. Changing subject/body/link shape, reset material semantics, recipient resolution, or delivery behavior is outside Bundle C. Because the repo has no established CodeQL inline suppression format, leave this alert open for manual GitHub code-scanning dismissal under #777 with this rationale. |
| `#12` | CodeQL | `cs/path-injection` | error / high | `services/api/tests/Settleora.Api.Tests/LocalStorageReadinessCheckTests.cs` | 42 | `false-positive/test-only-with-proof` | Test-only temporary directory setup under `Path.GetTempPath()` and an isolated GUID path. The test verifies readiness creates and accesses a local storage root. It is not runtime user input and is not exposed to API callers. |
| `#11`, `#10` | CodeQL | `cs/path-injection` | error / high | `services/api/src/Settleora.Api/Storage/LocalFileObjectStorageProvider.cs` | 84, 66 | `false-positive-with-proof` | Bundle A added proof tests showing object keys reject rooted paths, separators, dot segments, encoded traversal, special characters, overlong keys, unsupported providers, missing roots, and root escape before write/read/delete. Runtime storage remains guarded by provider/object-key validation and normalized root containment. |
| `#9` | CodeQL | `cs/path-injection` | error / high | `services/api/tests/Settleora.Api.Tests/LocalStorageReadinessCheckTests.cs` | 63 | `false-positive/test-only-with-proof` | Test-only cleanup of the same isolated temporary directory tree created by the test. The path is server/test-owned, GUID-scoped, and not derived from API input. |
| `#8` | CodeQL | `cs/path-injection` | error / high | `services/api/tests/Settleora.Api.Tests/LocalFileObjectStorageProviderTests.cs` | 204 | `false-positive/test-only-with-proof` | Test-only creation of an isolated temporary root for storage-provider tests. Bundle A coverage proves traversal keys are rejected before touching disk and valid object keys stay inside the temp root. |
| `#7`, `#6` | CodeQL | `cs/web/xss` | error / high | `services/api/tests/Settleora.Api.Tests/ExpenseBillRevisionEndpointTests.cs` | 3785, 1994 | `false-positive/test-only-with-proof` | Test-only in-memory HTTP request body construction for API endpoint tests. These tests post JSON to the ASP.NET test server and assert authorization/conflict behavior; they do not render HTML, write frontend output, or change API response encoding. No supported repo suppression format exists, so manual dismissal is required if GitHub keeps these alerts on `main`. |
| `#5` | CodeQL | `cs/user-controlled-bypass` | error / high | `services/api/src/Settleora.Api/Expenses/RecurringBills/RecurringBillEndpoints.cs` | 265 | `already-fixed-by-bundle-a-main-alert-stale` | Bundle A added explicit business authorization after visible-template lookup for recurring lifecycle/generation writes and focused fail-closed tests for removed members and cross-user attempts. PR #779 exact-head code scanning returned zero open alerts, so this remaining `main` alert is treated as stale until GitHub reprocesses `main` or is manually dismissed with the Bundle A proof. |
| `#2` | CodeQL | `cs/sensitive-data-transmission` | error / medium | `services/api/tests/Settleora.Api.Tests/AdminLocalUserEndpointTests.cs` | 936 | `false-positive/test-only-with-proof` | Test-only in-memory admin local-user request construction. The test intentionally exercises authenticated admin user creation and sign-in through the ASP.NET test server using fixed fake credentials, then asserts raw submitted passwords/session/provider/storage marker strings are not leaked in responses or audit-safe payloads. No runtime endpoint behavior is changed by this proof. |

Bundle C did not add inline suppressions because no project-accepted CodeQL or
Semgrep suppression-comment format is currently used in the repository, and
adding scanner-specific comments without an established policy would create a
new suppression convention. Bundle C also did not refactor shared test request
helpers or the password-reset SMTP sender solely to satisfy scanner heuristics:
the test helpers are intentionally test-only and the SMTP sender is an approved
delivery boundary whose behavior must not change silently.

Recommended manual GitHub code-scanning dismissal posture under #777:

- Dismiss `#48` as approved/expected password-reset SMTP delivery with the
  rationale above. This is a manual security/public-exposure gate because it is
  the one intentional external reset-material delivery boundary.
- Dismiss `#12`, `#9`, `#8`, `#7`, `#6`, and `#2` as test-only false positives
  with the proof above if PR-head scanning stays clean and no runtime alert is
  introduced.
- Dismiss or wait for reprocessing of stale `#5`, `#11`, and `#10` only after
  confirming the exact analyzed commit includes Bundle A proof/fixes; do not
  treat their presence on `main` as evidence of an unfixed runtime regression
  without a fresh CodeQL trace on the current commit.

## Guardrails

Bundle A does not change OpenAPI contracts, generated clients, schema or
migrations, password-reset runtime, settlement/payment/bill calculation logic,
storage API boundaries, deployment behavior beyond Dockerfile non-root runtime
hardening, secrets, `.env`, authentication/session runtime semantics, or client
authorization authority.

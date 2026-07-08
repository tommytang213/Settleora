# Security Alert Triage 2026-07-08

## Scope

This document records Bundle A triage for the open GitHub code-scanning alert
set checked on 2026-07-08 from the repository `tommytang213/Settleora`.

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

- Harden critical command execution in `scripts/ai/v3-controller.mjs` and
  `tools/github/sync-day1-board-fields.py`.
- Harden repo JS validation tools that use shell execution.
- Pin GitHub Actions to immutable SHAs and add least-privilege workflow
  permissions.
- Fix GitHub Actions shell interpolation findings.
- Refactor `tools/generate-clients.mjs` path handling under a reviewed
  OpenAPI/generated-client tooling gate.
- Resolve or prove dynamic RegExp findings.

## Bundle C Follow-ups

- Add CodeQL/Semgrep suppression proof for local storage tests if test-only
  alerts remain after Bundle A.
- Add suppression proof for API test-only XSS alerts.
- Review the password-reset SMTP sensitive-transmission alert under the
  auth/password-reset delivery/security gate without changing reset behavior
  silently.
- Add suppression proof for admin local-user test-only sensitive transmission
  if confirmed test-only.

## Guardrails

Bundle A does not change OpenAPI contracts, generated clients, schema or
migrations, password-reset runtime, settlement/payment/bill calculation logic,
storage API boundaries, deployment behavior beyond Dockerfile non-root runtime
hardening, secrets, `.env`, authentication/session runtime semantics, or client
authorization authority.

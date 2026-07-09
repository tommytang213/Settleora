# Autonomous Codex Runner Canary

This file records harmless canary entries for contracted DevBox auto-runner
workflow-docs issues. Entries are documentation-only evidence that the runner
can create a scoped branch and human-review PR without touching product
runtime behavior.

## 2026-07-09 Issue 805

- Source issue: `#805` - Auto-runner canary: workflow docs harmless PR.
- Generated task key: `20260709T045739`.
- Branch:
  `feature/auto-805-auto-runner-canary-workflow-docs-harmles-2026-07-09t0457`.
- Lane: `workflow-docs-tooling`.
- Allowed path: `docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md`.
- Validation profile: `docs-only`.
- Merge policy: human review and manual merge required; no auto-merge.
- Canary outcome intent: prove the DevBox auto-runner can prepare a
  non-sensitive workflow-docs PR from a valid contracted issue.
- Forbidden-scope confirmation: no product runtime, API, auth/session/security,
  storage/privacy, money/settlement/bill calculation, schema/migration,
  OpenAPI/generated-client, Docker/CI/deployment, secret, production, or mobile
  release change is intended by this canary entry.

## 2026-07-09 Issue 805 Follow-up

- Source issue: `#805` - Auto-runner canary: workflow docs harmless PR.
- Generated task key: `20260709T075054`.
- Branch:
  `feature/auto-805-auto-runner-canary-workflow-docs-harmles-2026-07-09t0750`.
- Lane: `workflow-docs-tooling`.
- Allowed path: `docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md`.
- Validation profile: `docs-only`.
- Merge policy: human review and manual merge required; no auto-merge.
- Canary outcome intent: prove the DevBox auto-runner can again prepare a
  non-sensitive workflow-docs PR from a valid contracted issue while leaving
  PR creation and merge decisions to the runner and human review.
- Forbidden-scope confirmation: no product runtime, API, auth/session/security,
  storage/privacy, money/settlement/bill calculation, schema/migration,
  OpenAPI/generated-client, Docker/CI/deployment, secret, production, or mobile
  release change is intended by this canary entry.

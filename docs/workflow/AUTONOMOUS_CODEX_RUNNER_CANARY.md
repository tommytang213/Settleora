# Autonomous Codex Runner Canary

This file records harmless canary entries for contracted DevBox auto-runner
workflow-docs and low-risk UI issues. Entries are documentation-only evidence
that the runner can create a scoped branch and human-review PR without
touching product runtime behavior.

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

## 2026-07-10 Issues 852 And 853

- Source issue #852:
  `Mobile UI canary: MoneyText single-announcement semantics guardrail`.
- Source issue #853:
  `Mobile UI canary: shared header semantic heading guardrail`.
- Run ID: `run-2026-07-10T161551Z`.
- Lane: `client-ui-low-risk`.
- Allowed paths:
  `apps/mobile/lib/ui/settleora_components.dart` and
  `apps/mobile/test/ui/settleora_component_guardrail_test.dart`.
- Validation profile: `mobile-ui-low-risk`.
- Canary outcome:
  - #852 stopped before implementation with `danger-gate` because the
    positive-scope scanner classified presentation-only MoneyText amount and
    currency wording as `money_settlement`.
  - #853 completed through PR #854 and merged with reviewed head
    `d707c2240a95988a2db64bca8e23908a4f87fca1` and merge SHA
    `10e47554fa4d0329e1164786ade70217605d817b`.
- Current posture:
  #852 remains open and danger-gated pending merge of a focused classifier
  hardening PR plus a separately authorized rerun. This partial max-2 result
  does not approve broad trusted operation, a long run, stale-claim stealing,
  follow-up issue creation, review-fix mutation, systemd enablement, or
  sensitive/product-runtime work.

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

## 2026-07-09 Issue 818

- Source issue: `#818` - Auto-runner canary: Gemini integrated workflow docs
  checkpoint.
- Generated task key: `20260709T141831`.
- Branch:
  `feature/auto-818-auto-runner-canary-gemini-integrated-wor-2026-07-09t1418`.
- Lane: `workflow-docs-tooling`.
- Allowed path: `docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md`.
- Validation profile: `docs-only`.
- Merge policy: human review and manual merge required; no auto-merge.
- Canary checkpoint: the `#800` Gemini-integrated pre-PR reviewer gate
  canary real-run path was exercised through the DevBox auto-runner workflow.
- Forbidden-scope confirmation: no product runtime, API, auth/session/security,
  storage/privacy, money/settlement/bill calculation, schema/migration,
  OpenAPI/generated-client, Docker/CI/deployment, secret, production, or mobile
  release change is intended by this canary entry.

## 2026-07-09 Issue 825

- Source issue: `#825` - Auto-merge canary 1: workflow docs checkpoint.
- Generated task key: `20260709T172445`.
- Branch:
  `feature/auto-825-auto-merge-canary-1-workflow-docs-checkp-2026-07-09t1724`.
- Lane: `workflow-docs-tooling`.
- Allowed path: `docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md`.
- Validation profile: `docs-only`.
- Merge policy: bounded low-risk canary auto-merge eligible after runner-owned
  review, validation, PR creation, CI, and auto-merge gates.
- Canary checkpoint: the first bounded low-risk auto-merge canary issue
  exercised the DevBox auto-runner auto-merge path after PR `#824`.
- Forbidden-scope confirmation: no product runtime, API, auth/session/security,
  storage/privacy, money/settlement/bill calculation, schema/migration,
  OpenAPI/generated-client, Docker/CI/deployment, secret, production, or mobile
  release change is intended by this canary entry.

## 2026-07-10 Issue 835

- Source issue: `#835` - Review-fix fixture canary: workflow docs checkpoint.
- Generated task key: `20260710T071153`.
- Branch:
  `feature/auto-835-review-fix-fixture-canary-workflow-docs--2026-07-10t0711`.
- Lane: `workflow-docs-tooling`.
- Allowed path: `docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md`.
- Validation profile: `docs-only`.
- Merge policy: bounded low-risk canary auto-merge eligible after runner-owned
  review, validation, PR creation, CI, and auto-merge gates.
- Canary checkpoint: this issue exercises the deterministic review-fix fixture
  path for low-risk review-fix mutation after PR `#834`.
- Review-fix canary marker: `review-fix-cycle-completed`.
- Forbidden-scope confirmation: no product runtime, API, auth/session/security,
  storage/privacy, money/settlement/bill calculation, schema/migration,
  OpenAPI/generated-client, Docker/CI/deployment, secret, production, or mobile
  release change is intended by this canary entry.

## 20260724-0946 runnable canary A

- Source issue: `#982` - Runnable documentation evidence A.
- Generated task key: `20260724T034402`.
- Lane: `workflow-docs-tooling`.
- Allowed path: `docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md`.
- Validation profile: `docs-only`.
- Merge policy: bounded low-risk canary auto-merge eligible after runner-owned
  review, validation, PR creation, CI, and auto-merge gates.
- Canary checkpoint: this is runnable canary A for issue `#912` live
  acceptance.
- Forbidden-scope confirmation: no product runtime, API, auth/session/security,
  storage/privacy, money/settlement/bill calculation, schema/migration,
  OpenAPI/generated-client, Docker/CI/deployment, secret, production, or mobile
  release change is intended by this canary entry.

## 20260724-0946 runnable canary B

- Source issue: `#983` - Runnable documentation evidence B.
- Generated task key: `20260724T043318`.
- Lane: `workflow-docs-tooling`.
- Allowed path: `docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md`.
- Validation profile: `docs-only`.
- Merge policy: bounded low-risk canary auto-merge eligible after runner-owned
  review, validation, PR creation, CI, and auto-merge gates.
- Canary checkpoint: this is runnable canary B for issue `#912` live
  acceptance.
- Forbidden-scope confirmation: no product runtime, API, auth/session/security,
  storage/privacy, money/settlement/bill calculation, schema/migration,
  OpenAPI/generated-client, Docker/CI/deployment, secret, production, or mobile
  release change is intended by this canary entry.

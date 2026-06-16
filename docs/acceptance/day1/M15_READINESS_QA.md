# M15 Readiness QA

## Purpose And Scope

M15 prepares Day 1 acceptance evidence and manual gate readiness. It reconciles current repo evidence against the Day 1 scope, creates an evidence map, prepares manual review gates, and records the next safe action.

M15 does not implement missing Day 1 product features. It does not change runtime behavior, API behavior, OpenAPI operation behavior, generated clients, auth/session/security behavior, schema/migrations, storage/privacy/file behavior, deployment/CI behavior, or money/split/settlement/OCR/reconciliation logic.

Future Day 1 completion claims must cite evidence from this acceptance package and the live repo.

## Slice Checklist

| Slice | Status for this branch | Evidence |
| --- | --- | --- |
| M15-001 acceptance state reconcile | completed_pending_review | `DAY1_ACCEPTANCE_STATE.md` reconciles Day 1 requirement areas using conservative statuses. |
| M15-002 evidence map hardening | completed_pending_review | `DAY1_EVIDENCE_MAP.md` separates implemented, docs-only, validation, missing, and manual evidence. |
| M15-003 manual gate package hardening | completed_pending_review | `MANUAL_GATE_PACKAGE.md` defines maintainer, UI, security, storage, money, OCR, deployment, and GitHub settings gates. |
| M15-004 acceptance readiness QA finalize | completed_pending_review | This file records scope, validation plan/results, remaining gates, and next action. |

## Current Completion Status

This branch creates the Day 1 acceptance package under `docs/acceptance/day1/` and adds a lightweight README reference. It is ready for maintainer review after local validation and PR CI complete.

Manual UI retest and manual code review remain `deferred_until_day1_acceptance`; they are not passed by this branch.

## Validation Matrix

| Command | Expected outcome | Current result |
| --- | --- | --- |
| `git status --short` | Clean before branch creation, then only scoped docs changes before commit, clean after commit. | Passed before branch creation with no output after `main` fast-forward. Before validation, showed `M README.md` and untracked `docs/acceptance/`. |
| `git diff --name-only` | Only `README.md` and `docs/acceptance/day1/*.md` changed before commit. | Tracked diff showed `README.md`; untracked acceptance files were separately listed under `docs/acceptance/day1/`. |
| `git diff --check` | No whitespace errors. | Passed with no output. |
| `npm run validate:docs` | Documentation validation passes. | Passed: `Documentation validation passed.` |
| `npm run validate:scaffold` | Scaffold validation passes. | Passed: `Scaffold validation passed (19 paths).` |
| `npm run validate:openapi` | OpenAPI lint passes; OpenAPI is unchanged but referenced by this evidence package. | Passed: `packages/contracts/openapi/settleora.v1.yaml: validated in 130ms`; Redocly also printed an update notice for CLI 2.32.2. |

Slow runtime suites are intentionally not part of the default M15 local validation because this branch is docs-only and does not change mobile, API runtime, Docker, migrations, generated clients, or OpenAPI content. Existing API/mobile validation commands remain listed in the evidence map for the implementation they cover.

## Remaining Manual Gates

- Maintainer review.
- Mobile UI retest.
- Manual code review.
- Security/auth/session review.
- Storage/file privacy review.
- Money/split/settlement calculation review.
- OCR capture/review review.
- Notification review.
- Recurring/forecasting review.
- Sync/offline/local-mode review.
- Import/export/reporting review.
- Docker/self-hosted deployment review.
- TrueNAS SCALE deployment considerations.
- GitHub repository settings review, including private vulnerability reporting and branch protection/CI expectations.

## Recommended Next Action

Open the PR for maintainer review and CI. After review, the next automated action should be a targeted Day 1 gap implementation slice chosen from the evidence map, or a maintainer-run manual Day 1 acceptance gate if the maintainer decides the evidence package is ready for manual review.

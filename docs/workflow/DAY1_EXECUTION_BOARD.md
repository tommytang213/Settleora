# Settleora Day 1 Execution Board

## Purpose

The `Settleora Day 1 Execution Board` is the GitHub-native execution board for Day 1 MVP work. It is intended to behave like a lightweight Jira board while preserving the Settleora Codex branch, validation, report, and manual-gate workflow.

The board tracks epics, features, tasks, bugs, hardening, design, and documentation. It separates Day 1 execution from Day 2 and Day 3 planning, keeps a clear Codex-ready queue, and makes high-risk work visible before any PR starts.

## Statuses

Recommended project statuses:

| Status | Meaning |
|---|---|
| `Inbox` | Captured but not triaged. |
| `Needs Decision` | Requires product, architecture, or scope decision before implementation. |
| `Needs Figma / Reference` | UI-sensitive work needs Figma, screenshot, design reference, or UX direction first. |
| `Ready for Codex` | Scoped, labeled, and ready for one focused Codex task. |
| `Codex Running` | A Codex branch/task is actively in progress. |
| `Report Uploaded` | Codex report exists and the task is ready for human review or PR preparation. |
| `PR Ready` | Branch and PR are ready for normal review/merge gates. |
| `CI / Merge Gate` | Required local validation and GitHub checks are being evaluated. |
| `Merged` | Work landed through an approved PR path. |
| `Deferred Day 2/3` | Useful work intentionally deferred outside Day 1. |
| `Blocked` | Work cannot proceed without a dependency, decision, permission, or manual gate. |

## Project Fields

Recommended project fields:

| Field | Suggested type | Notes |
|---|---|---|
| `Work Type` | Single select | `epic`, `feature`, `task`, `bug`, `hardening`, `design`, `docs`. |
| `Area` | Single select | Product/architecture area, aligned with `area:*` labels. |
| `Day Scope` | Single select | `Day 1`, `Day 2`, `Day 3`. |
| `Status` | Single select | Uses the statuses above. |
| `Priority` | Single select | `P0`, `P1`, `P2`, `P3`. |
| `Risk` | Single select | `low`, `medium`, `high`, `manual-gate`. |
| `Size` | Single select | `XS`, `S`, `M`, `L`, `XL`. |
| `Man-days Remaining` | Number | Current remaining estimate, not original estimate. |
| `Progress %` | Number | Human-maintained progress indicator. |
| `Bundle ID` | Text | Groups 2-4 safe related sub-slices into one PR when appropriate. |
| `Validation Class` | Single select | `docs-only`, `mobile-ui`, `api`, `openapi-client`, `storage`, `money`, `migration`, `deploy`, `full`. |
| `Figma Required` | Single select or checkbox | Use for UI-sensitive work that needs visual reference first. |
| `Manual Gate` | Single select or checkbox | Required for sensitive runtime, schema, release, or exposure work. |

## Labels

Seeded labels:

```text
area:auth
area:bills
area:ocr
area:settlement
area:sync
area:storage
area:mobile-ui
area:web-user
area:web-admin
area:infra
area:qa
type:epic
type:feature
type:task
type:bug
type:hardening
type:docs
type:design
risk:money
risk:auth-security
risk:storage-authz
risk:openapi
risk:migration
scope:day1
scope:day2
scope:day3
codex:ready
codex:running
codex:report-uploaded
figma:required
manual-gate
```

Existing legacy labels such as `product-scope`, `documentation`, `ux`, `mobile`, and `recurring-bills` may remain. Do not delete or rename existing labels as part of board bootstrap.

## Views

Recommended board views:

| View | Filter/grouping intent |
|---|---|
| `Day 1 Board` | Day 1 items grouped by `Status`. |
| `Roadmap / Area` | Epics grouped by `Day Scope` or `Area` and ordered by priority. |
| `Codex Queue` | `Ready for Codex`, `Codex Running`, and `Report Uploaded` items. |
| `Blockers` | `Blocked`, `Needs Decision`, and manual-gate items. |
| `Needs Figma` | Mobile/web/admin UI items where `Figma Required` is true or `figma:required` is present. |
| `Risk View` | Items with `risk:*`, `manual-gate`, migration, storage/authz, auth/security, money, OpenAPI, deploy, or store-release risk. |
| `Deferred Day 2/3` | Items with `Day Scope` outside Day 1 or status `Deferred Day 2/3`. |

## Manual Gates

Manual gates are required before implementation or merge when work touches:

- Auth/session/security-critical runtime or policy.
- Storage/file privacy, file access authorization, file byte handling, retention, or upload policy.
- Money, split, rounding, settlement, payment, recurring generation authority, or bill calculation authority.
- Database schema, EF migrations, destructive data operations, or migration policy.
- OpenAPI contract changes and generated-client refresh.
- CI, deployment, Docker, release infrastructure, public/admin exposure, production deploy, or mobile store release.
- Secrets, credentials, tokens, auth config, `.env`, SSH, or local Codex state.
- Any task that explicitly says PR-only, human-merge-only, or manual-gated.

Manual-gated issues should carry `manual-gate` plus the specific risk label, for example `risk:money`, `risk:storage-authz`, `risk:auth-security`, `risk:migration`, or `risk:openapi`.

## Codex Workflow

1. Triage an issue into the correct Day scope, area, type, risk, size, validation class, and status.
2. Confirm required reading and architecture guardrails in the issue body.
3. Move only safe, scoped items to `Ready for Codex`.
4. Start one task branch per focused Codex task, based on current `origin/main` unless the task says otherwise.
5. Keep product/runtime changes out of planning-only tasks.
6. Run the validation requested by the issue and task prompt.
7. Upload the Codex report and move the item to `Report Uploaded`.
8. Open a PR only after the report is complete and scope guard is clean.
9. Use normal GitHub PR merge gates. Do not push directly to `main`.

## Bundle Planning

Use `Bundle ID` only when 2-4 related sub-slices are safe to review together. Good bundle candidates:

- Same area, same validation class, same risk profile.
- Documentation plus matching seed/project metadata.
- Closely related mobile UI polish with no API, money, storage, auth, migration, deployment, or generated-client impact.

Avoid bundling:

- Multiple manual-gated domains.
- Money logic with UI polish.
- OpenAPI changes with unrelated runtime work.
- Migration work with broad product features.
- Storage/authz changes with unrelated file UI.
- Anything that would make review or rollback unclear.

## Re-run Safety

The bootstrap seed uses stable issue titles and labels. Re-running the bootstrap must:

- Reuse an issue when an exact title already exists.
- Add only missing expected labels to reused issues.
- Avoid closing, deleting, or rewriting unrelated issues.
- Avoid deleting labels.
- Reuse Project fields and items by title/URL where possible.
- Avoid changing project views unless GitHub exposes a safe idempotent create/update API for views.

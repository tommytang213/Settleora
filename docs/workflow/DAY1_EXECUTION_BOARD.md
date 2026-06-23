# Settleora Day 1 Execution Board

## Purpose

The `Settleora Day 1 Execution Board` is the GitHub-native execution board for Day 1 MVP work. It is intended to behave like a lightweight Jira board while preserving the Settleora Codex branch, validation, report, and manual-gate workflow.

The board tracks epics, features, tasks, bugs, hardening, design, and documentation. It separates Day 1 execution from Day 2 and Day 3 planning, keeps a clear Codex-ready queue, and makes high-risk work visible before any PR starts.

The current 64 seeded issues are an initial execution-board skeleton, not complete Day 1 backlog coverage. Review [Day 1 execution coverage matrix](../planning/DAY1_EXECUTION_COVERAGE_MATRIX.md) and [Day 1 decision register](../planning/DAY1_DECISION_REGISTER.md) before creating any expanded missing-issue backlog.

For weekly PWT baseline, burndown, blocker-load, and GitHub Project Insights
tracking, use [Day 1 PWT burndown tracking](DAY1_PWT_BURNDOWN_TRACKING.md).

## Statuses

Recommended project statuses:

| Status | Meaning |
|---|---|
| `Inbox` | Captured but not triaged. |
| `Needs Product Decision` | Requires Tommy to decide product behavior, trust/privacy expectations, Day 1 scope tradeoff, UX taste/approval, or an explicit disagreement before implementation. |
| `Needs Technical Design` | Requires Assistant/Codex to produce technical design, architecture packet, API/schema slicing, validation plan, task breakdown, or implementation plan before coding. |
| `Needs Figma / Reference` | UI-sensitive work needs Figma, screenshot, design reference, or UX direction first. |
| `Needs Architecture Review` | Requires architecture, security, money, storage/privacy, API/OpenAPI, sync, migration, deployment, or other manual-gated review before implementation or merge. |
| `Ready for Codex` | Scoped, labeled, and ready for one focused Codex task. |
| `Codex Running` | A Codex branch/task is actively in progress. |
| `Report Uploaded` | Codex report exists and the task is ready for human review or PR preparation. |
| `PR Ready` | Branch and PR are ready for normal review/merge gates. |
| `CI / Merge Gate` | Required local validation and GitHub checks are being evaluated. |
| `Merged` | Work landed through an approved PR path. |
| `Deferred Day 2/3` | Useful work intentionally deferred outside Day 1. |
| `Blocked` | Work cannot proceed without a dependency, decision, permission, or manual gate. |

If changing the live GitHub Project status options is risky, keep the current
options temporarily and use `Blocking Gate`, `Gate Owner`, and labels to carry
the cleaner taxonomy. A separate Project mutation task must apply any status
option changes.

`Needs Decision` must not become a catch-all. Use or map it only when the
decision type is separately visible. Product requirement/detail gaps, technical
design gaps, Figma/reference needs, architecture/security/money/storage/API/sync
gates, and implementation readiness are different states with different owners.

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
| `Initial MD` or `Baseline MD` | Number | Original task or child-item estimate for expected-vs-actual tracking. Use blank for split parents until child issues carry estimates. |
| `Man-days Remaining` | Number | Current remaining estimate, not original estimate. |
| `Estimate Confidence` | Single select | `Low`, `Medium`, `High`; mirrors task planning metadata. |
| `Planned Start` | Date | Planning start date used for PWT target tracking. |
| `Target Finish` | Date | Planning target, not a promise. Do not use it to hide blockers. |
| `Actual Done Date` | Date | Date the item reached done/merged state, or report-complete date for docs/report-only items. |
| `Target PWT Week` / `Iteration` | Iteration or text | Weekly PWT target bucket for expected-vs-actual charts. |
| `Blocking Gate` | Single select or text | Product decision, technical design, Figma/reference, architecture review, security, money, storage/privacy, API/OpenAPI, sync, migration, deployment, manual approval, or none. |
| `Gate Owner` | Single select | Tommy, Assistant/Codex, Figma/design loop, reviewer, CI/merge gate, external dependency, or none. |
| `Forecast Status` or `Ahead/Behind` | Single select | `Ahead`, `On track`, `Behind`, `Not applicable`; comes from task reports. |
| `Progress %` | Number | Human-maintained progress indicator. |
| `Bundle ID` | Text | Groups 2-4 safe related sub-slices into one PR when appropriate. |
| `Validation Class` | Single select | `docs-only`, `mobile-ui`, `api`, `openapi-client`, `storage`, `money`, `migration`, `deploy`, `full`. |
| `Figma Required` | Single select or checkbox | Use for UI-sensitive work that needs visual reference first. |
| `Manual Gate` | Single select or checkbox | Required for sensitive runtime, schema, release, or exposure work. |

The fields above are recommendations for graphable planning. This document does
not mutate the live GitHub Project. A separate GitHub Project field-sync task
may add or populate fields if Tommy approves that mutation.

Estimate rules:

- `Initial MD` uses the coarse task scale from the Codex task guide:
  `S = 1`, `M = 2`, `L = 5`.
- `XL` and split parents stay blank or are split before estimation.
- `Man-days Remaining` changes only when work is completed, scope changes,
  estimates are corrected, or a parent is split into child estimates.
- Do not double count parent and child estimates.
- Docs-only, report-only, PR/merge-gate, and audit tasks still carry small
  estimates when they consume planned capacity.

## Gate Ownership

Tommy owns product behavior, functional requirements, trust/privacy
expectations, Day 1 scope tradeoffs, UX taste/approval, and explicit
disagreements.

Assistant/Codex owns technical design recommendations, architecture packets,
API/schema slicing, security/money/storage/sync implementation planning,
validation design, and task breakdown. No task should block on Tommy merely
because technical implementation details are missing.

Figma/reference ownership depends on the visual artifact review loop. If the
visual direction is missing, use `Needs Figma / Reference`; if the visual
direction exists but technical slicing is missing, use `Needs Technical Design`.

Architecture/security/money/storage/API/sync gates must be explicit in
`Blocking Gate` and should use `Needs Architecture Review` or `Blocked` until
the gate is cleared. Only move work to `Ready for Codex` when product
requirements, technical design, visual references, manual gates, validation
scope, and implementation boundaries are clear enough for one focused branch.

## Task And Report Planning Fields

Future task prompts should carry the `Planning metadata` block defined in
[Codex task guide](CODEX_TASK_GUIDE.md). Future reports should carry the
`Planning outcome` block. The board fields above are the Project-facing version
of those blocks and are intended to feed PWT burndown, expected-vs-actual,
forecast, scope-change, and ahead/behind charts.

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
| `Blockers` | `Blocked`, `Needs Product Decision`, `Needs Technical Design`, `Needs Architecture Review`, and manual-gate items. |
| `Needs Figma` | Mobile/web/admin UI items where `Figma Required` is true or `figma:required` is present. |
| `Risk View` | Items with `risk:*`, `manual-gate`, migration, storage/authz, auth/security, money, OpenAPI, deploy, or store-release risk. |
| `Deferred Day 2/3` | Items with `Day Scope` outside Day 1 or status `Deferred Day 2/3`. |
| `PWT Forecast` | Day 1 items grouped by `Target PWT Week` / `Iteration`, with `Initial MD`, `Man-days Remaining`, `Target Finish`, `Actual Done Date`, and `Forecast Status`. |

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

### Mobile Release Gate

Codemagic, TestFlight, App Store, Play Store, production, and public mobile
release actions are manual-only. The release evidence and sign-off checklist is
defined in [Codemagic/TestFlight setup](CODEMAGIC_TESTFLIGHT_SETUP.md) for
#383 under parent epic #380. Codex may prepare docs, PRs, and validation
reports, but must not submit to TestFlight, App Store, or Play Store; change
signing secrets; expose production/public infrastructure; trigger
production/mobile-store releases; or bypass manual gates without a future
explicit human approval task.

### OpenAPI / Generated-Client Gate

Issues that touch OpenAPI contracts, generated client output, or client
generation tooling must carry `risk:openapi`, `manual-gate`, and validation
class `openapi-client` unless they are documentation-only control tasks. Their
issue bodies must explicitly state:

- OpenAPI is the source of truth.
- Generated clients must not be hand-edited.
- Contract changes are reviewed before generated clients are refreshed.
- Generated-client diffs come from the repo generation command, not manual
  edits.
- API/domain authority remains authoritative for authorization, money, storage
  access, status transitions, sync acceptance, and audit.
- Generated client availability does not imply permission.
- Actual contract/generated-client changes require a manual gate and explicit
  generation plus validation commands.

Use this checklist on future OpenAPI/generated-client issues:

```markdown
### OpenAPI / Generated-Client Checklist

- [ ] OpenAPI source-of-truth rule is acknowledged.
- [ ] Contract change scope is listed, or this is confirmed docs-only.
- [ ] Generated web/Dart client impact is listed.
- [ ] Contract review/manual-gate status is listed.
- [ ] Generation command is listed when clients change.
- [ ] Validation commands are listed.
- [ ] No generated-client files will be hand-edited.
- [ ] Client availability is not treated as authorization.
- [ ] API/domain remains authoritative for authorization, money, storage access,
      status transitions, sync acceptance, and audit.
```

## Codex Workflow

1. Triage an issue into the correct Day scope, area, type, risk, size, validation class, and status.
2. Confirm required reading and architecture guardrails in the issue body.
3. Add the required planning metadata: initial MD estimate, estimate basis,
   confidence, planned start, target finish, target PWT week/iteration,
   expected status, expected burndown impact, blocking gates, gate owner,
   Figma/reference need, and manual approval need.
4. For PRD V5 versus MVP Day 1 conflicts, use the decision register and row-by-row matrix notes rather than silently promoting every broader PRD V5 item or narrowing every broader PRD V5 line.
5. Move only safe, scoped items to `Ready for Codex`.
6. Start one task branch per focused Codex task, based on current `origin/main` unless the task says otherwise.
7. Keep product/runtime changes out of planning-only tasks.
8. Run the validation requested by the issue and task prompt.
9. Upload the Codex report with the planning outcome block and move the item to `Report Uploaded`.
10. Open a PR only after the report is complete and scope guard is clean.
11. Use normal GitHub PR merge gates. Do not push directly to `main`.

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

Field and hierarchy synchronization is handled separately by `python3 tools/github/sync-day1-board-fields.py`. It updates supported Project fields for existing seeded items from seed metadata and labels, skips estimation fields when no reliable value exists, and writes marker-bounded Markdown parent/child sections to issue bodies when GitHub sub-issue commands are unavailable.

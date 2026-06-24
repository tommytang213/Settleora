# Codex Task Guide

This guide defines repeatable Settleora Codex task rules so future prompts can stay short without losing project safety boundaries. It does not replace [PROGRAM_ARCHITECTURE.md](../../PROGRAM_ARCHITECTURE.md); read the architecture document first for authoritative system rules.

## Required Pre-task Reading

- [PROGRAM_ARCHITECTURE.md](../../PROGRAM_ARCHITECTURE.md)
- [README.md](../../README.md)
- Relevant service, app, infrastructure, contract, or workflow docs for the requested change.
- Relevant architecture docs only when the task touches that area.
- [SETTLEORA_CLOUD_SAAS_READINESS.md](../architecture/SETTLEORA_CLOUD_SAAS_READINESS.md) for cloud, hosted deployment, subscription entitlement, managed provisioning, multi-tenant SaaS, or federation work.

## Standard Task Boundaries

- Use one branch per task and one focused goal per task.
- Do not add unrelated feature work.
- Do not push directly to `main`.
- Do not force push.
- Do not use `git add .`; stage explicit paths only.
- Do not amend commits unless explicitly requested.

## Standard Task Planning Metadata

Every future Codex task file must include this block before implementation
instructions:

```markdown
## Planning metadata

- Work type:
- Area:
- Related issue(s):
- Initial MD estimate:
- Estimate basis:
- Estimate confidence: Low / Medium / High
- Planned start:
- Target finish:
- Target PWT week / iteration:
- Expected Project status after completion:
- Expected burndown impact:
- Blocking gate before task:
- Blocking gate expected after task:
- Gate owner:
- Figma/reference required: Yes / No
- Manual approval required before merge: Yes / No
```

Fill the fields as follows:

- `Work type`, `Area`, and `Related issue(s)` should match the Day 1 board
  fields and labels where a Project item exists.
- `Initial MD estimate` uses the coarse Day 1 man-day scale: `S = 1 MD`,
  `M = 2 MD`, `L = 5 MD`. `XL` or split-parent work stays blank until split
  into child tasks. Do not count a split parent and its children together.
- Use `TBD` only when an estimate cannot be made safely, and state why in
  `Estimate basis`.
- Docs-only, audit-only, report-only, and workflow-only tasks still carry a
  small MD estimate.
- PR/merge-gate tasks estimate the gate overhead separately. Use `S = 1 MD`
  unless CI, manual review, stale-branch, or merge-risk overhead makes `M`
  more honest.
- `Estimate basis` should name the relevant source docs, changed surface,
  validation class, known blockers, and whether the estimate is a child task or
  parent/split placeholder.
- `Planned start`, `Target finish`, and `Target PWT week / iteration` are
  planning targets for PWT tracking, not delivery promises.
- For implementation bundles, derive `Target finish` from estimate, domain
  risk, dependency state, validation class, manual gates, and the current PWT
  cadence.
- `Expected burndown impact` should say whether the task is expected to burn
  MD, create/split estimates, change remaining MD, or produce no burn because
  it is a read-only audit.
- `Blocking gate before task` and `Blocking gate expected after task` must
  distinguish product requirement/detail needed from Tommy, technical design
  needed from Assistant/Codex, design/Figma reference needed, architecture,
  security, money, storage, API/OpenAPI, sync, migration, deployment, manual
  approval, and actual implementation readiness.
- `Gate owner` must not default to Tommy for missing technical detail. Tommy
  owns product behavior, trust/privacy expectations, Day 1 scope tradeoffs,
  UX taste/approval, and explicit disagreements. Assistant/Codex owns technical
  design recommendations, architecture packets, API/schema slicing,
  security/money/storage/sync implementation planning, validation design, and
  task breakdown. Figma/reference ownership depends on the visual artifact
  review loop.
- `Figma/reference required` is `Yes` for UI-sensitive work without an
  approved screen, screenshot, design reference, or UX direction.
- `Manual approval required before merge` is `Yes` for manual-gated domains
  listed in this guide or in the task prompt.
- Do not use target dates to hide blockers, fake progress, or move work to
  `Ready for Codex` before gates are clear.

Implementation readiness means the task has enough product requirements,
technical design, architecture gates, Figma/reference gates, validation scope,
and merge rules to start one focused branch. A task should block on Tommy only
when a product, trust/privacy, Day 1 scope, UX approval, or explicit
disagreement decision is required.

## Architecture Guardrails

- The API owns core business database writes.
- Workers must not directly mutate core business tables.
- OpenAPI is the source of truth.
- Generated clients are not hand-edited.
- Generated-client diffs must come from the repo generation command, not
  manual edits.
- File bytes go through the storage abstraction.
- File metadata belongs in PostgreSQL.
- Do not expose direct filesystem paths or storage provider internals.
- Money must be decimal-safe.
- Currency must always be attached to monetary values.
- Rounding policy is centralized.
- On-device OCR is required.
- The server OCR worker is complementary infrastructure.

## OpenAPI And Generated-Client Change Control

Any issue, branch, or PR that touches `packages/contracts/openapi/`,
`packages/client-web/src/generated/`, `packages/client-dart/lib/generated/`, or
client-generation tooling must state these controls in its issue body or task
prompt before implementation starts:

- OpenAPI is the source of truth for generated web and Dart/mobile clients.
- Generated clients must not be hand-edited.
- Contract changes must be reviewed before generated clients are refreshed.
- Generated-client diffs must come from the repo generation command, currently
  `npm run generate:clients`, followed by the required client validation.
- API/domain authority remains authoritative for authorization, money, storage
  access, status transitions, sync acceptance, and audit.
- Generated client availability does not imply permission; API authorization
  and domain policy still decide whether a caller may use an operation.
- Any actual OpenAPI contract change, generated-client refresh, generation
  tooling change, or API behavior change that requires client regeneration
  requires a manual gate and explicit validation.

Future OpenAPI/generated-client issue bodies must include a checklist covering:

- Whether the OpenAPI contract changes.
- Whether generated web and Dart clients are expected to change.
- The contract review owner or manual-gate status.
- The exact generation and validation commands to run.
- Confirmation that no generated-client files are manually edited.
- Confirmation that no authorization, money, storage access, status transition,
  sync acceptance, or audit authority moves from API/domain code into clients.

## Validation Rules

- Use [CODEX_VALIDATION_REPORT_BUDGET.md](CODEX_VALIDATION_REPORT_BUDGET.md) for the current validation profiles, Codemagic budget rule, chat/report budget rule, and task prompt budget rule.
- Choose validation from the changed-file scope before running slow commands.
- Start repo tooling, API, Docker, and mobile validation with the relevant doctor command:
  - `npm run doctor:validation` for Node/npm/dotnet preflight.
  - `npm run doctor:docker` only for Docker, compose, API Docker image, API runtime, or migration validation.
  - `npm run doctor:mobile` only for mobile app or generated Dart client validation.
- Run dotnet validation for API changes.
- Run npm validation for repo tooling, documentation, or contract changes.
- Run `npm run generate:clients` and `npm run validate:clients` when OpenAPI or generated client output changes.
- Run Docker validation only for Docker, compose, API runtime, migration, or explicitly Docker-relevant API validation changes.
- Run mobile validation only when mobile app files, mobile docs, generated Dart client output, or mobile validation tooling changes.
- For mobile validation, use Flutter commands from `apps/mobile`: `flutter pub get`, `flutter analyze`, and `flutter test`. Do not use `dart test` for the Flutter app.
- When exact `npm ci` is required, run it once. If it fails with the known local npm certificate, cache, or `Exit handler never called!` pattern, record the exact failure, run one recovery command (`npm ci --no-audit --prefer-offline`), and do not loop repeated npm installs.
- Retry long validation commands only after a concrete code, environment, dependency, or tooling change that could address the failure. Do not blindly loop `npm ci`, Docker builds, `flutter pub get`, `flutter analyze`, or `flutter test`.
- Do not claim exact `npm ci` passed when only the recovery install passed.
- Do not commit `.npmrc` changes that disable SSL verification, including `strict-ssl=false`; use [local tooling troubleshooting](LOCAL_TOOLING_TROUBLESHOOTING.md) for safe machine-level fixes.
- For changes limited to documentation-only paths such as `docs/**/*.md`, `README.md`, and static docs assets, skip slow npm/dotnet/Docker validation unless the diff touches package files, validation scripts, OpenAPI/contracts, generated clients, code, tests, migrations, Docker/compose, CI, or runtime config.
- For docs-only changes run at minimum `git status --short`, `git diff --name-only`, and `git diff --check`.
- For tooling/docs changes, prefer scoped validation such as `npm run validate:docs`, `npm run validate:scaffold`, and `npm run validate:openapi` before escalating to API, Docker, or mobile suites.
- Keep docs-only tasks on the docs-only profile unless changed files make API, OpenAPI, client, Docker, mobile, or CI validation directly relevant.
- For focused backend endpoint or test hardening, prefer focused `dotnet test --filter ...` during implementation and reserve broader API validation for PR/merge gates or wider runtime risk.
- Codemagic is manual-only for mobile/iOS, Codemagic config, signing/TestFlight/App Store prep, release branches/tags, or explicitly requested mobile validation gates. It is not a routine backend/API/docs PR check.
- Keep workflow chat replies compact and put detailed validation logs, skipped-check rationale, files changed, warnings, and scope evidence in the Codex report file.
- Do not weaken validation for code, API, security, runtime, migration, generated-client, or infrastructure changes.
- Do not fake validation success; report the exact failing command and error summary.

## Git Rules

- Work on the requested branch and keep changes scoped.
- Stage only the intended files by explicit path.
- Commit with the requested message when one is provided.
- Push only the task branch unless asked otherwise.
- Do not merge to `main` unless the task explicitly asks for a PR/merge-gate action and the development-stage main merge policy permits it.

## Day 1 PR Merge-Gate And CI Evidence

Day 1 PR and merge-gate tasks must leave enough evidence for a reviewer to
replay the decision. A docs-only checklist or reference issue may complete that
documentation slice, but it must not be described as completing the runtime,
deployment, release, security, storage, money, schema, OpenAPI, generated-client,
or UI implementation that the checklist discusses. Parent epics and follow-up
implementation issues remain authoritative for incomplete code/runtime work.

Before opening a PR or entering a merge gate, record:

- Exact local commands run from the repo root, with exact pass/fail results.
- The changed file list from the task base to `HEAD`.
- A forbidden-change scope guard stating whether the diff touches runtime,
  API behavior, OpenAPI/contracts, generated clients, CI workflows, Docker,
  deployment, secrets, auth/session/security, storage/privacy, schema,
  money/settlement/payment/bill calculation, OCR runtime, or UI code.
- Clean worktree evidence before PR creation and again immediately before any
  merge.

Every PR evidence block must include:

- PR URL and title.
- PR base branch, head branch, and exact head SHA.
- Confirmation that the PR body accurately lists scope, files changed,
  validation, and known manual gates.
- GitHub checks/CI result summary for the exact PR head SHA.
- Mergeability and clean/dirty status.
- Unresolved review thread or blocking comment status.

Manual gates must be explicit. Trigger and report a manual gate for CI workflow
changes, deployment/Docker/release infrastructure, production deploy, public or
admin exposure, mobile store release, signing, secrets/credentials/tokens,
OpenAPI contracts, generated clients, auth/session/security-critical runtime,
storage/privacy/file-byte authorization, money/settlement/payment/bill
calculation authority, schema/migrations, destructive data operations, Day 1
scope reduction, architecture direction replacement, branch deletion/cleanup,
force-like history changes, or any task marked PR-only, human-merge-only, or
manual-gated.

Source branches are retained by default:

- Do not delete task/source branches unless the human explicitly requests
  deletion.
- After a PR merge, verify the remote source branch still exists.
- If GitHub repository settings auto-delete the source branch despite no
  explicit deletion request, restore the exact reviewed source branch SHA with a
  normal branch creation push. Do not force push.
- Report the source branch retention or restoration result explicitly.

Day 1 PR/merge-gate reports must include:

- Status, branch names, source branch, target/base branch, and head SHA.
- Source, integration, and task commit SHAs where applicable.
- Files changed.
- Commit hash and PR URL.
- Issue status and whether the issue was closed, left open, or only completed
  for a docs/reference/checklist slice.
- Exact validation commands and results.
- GitHub CI/check names, conclusions, and SHA checked.
- Merge result, merge commit, or stop reason.
- Scope guard result.
- Source branch retention/restoration state.
- Failures, follow-ups, next action, manual decisions needed, and start/end
  timezone plus elapsed time.
- Confirmation that no forbidden runtime, API, security, money, schema,
  deployment, secret, OpenAPI, generated-client, storage, settlement, OCR, or UI
  changes were made when the task is documentation-only.

## Development-Stage Main Merge Policy

Settleora is currently in development stage with no production deployment. Future explicit PR/merge-gate tasks may auto-merge to `main` only through a GitHub PR when all required gates pass:

- Worktree is clean before validation and immediately before merge.
- Source branch head matches the expected SHA.
- `origin/main` matches the expected starting SHA immediately before merge.
- PR base, head branch, and head SHA match the task.
- Changed files are within the task's allowed scope.
- Required local validation passes and exact commands are reported.
- GitHub CI/checks pass on the exact PR head.
- PR is mergeable and clean.
- PR head is unchanged immediately before merge.
- No manual gate is triggered.
- Merge is a normal GitHub merge commit unless the task explicitly says otherwise.
- Source branch is not deleted unless the human explicitly requests deletion.
- Remote source branch retention is verified after merge, or restored to the
  exact reviewed source branch SHA if GitHub auto-deleted it despite no explicit
  deletion request.

Dev-stage auto-merge never means direct push to `main`, force push, skipped validation, skipped GitHub CI, merge of a dirty/stale/unstable/changed-head PR, or auto-merge of production, security, destructive, or otherwise manual-gated work.

Manual gates remain required for production deploys, mobile store releases, public/admin exposure changes, destructive migrations or destructive data operations, branch deletion/cleanup, force-like history changes, secrets/auth config changes, auth/session/security-critical runtime work, storage/file privacy/authz changes, money/settlement calculation authority changes, schema migrations, CI/deployment infrastructure changes, reducing Day 1 scope, replacing architecture direction, and any task that explicitly says PR-only or human-merge-only.

## Standard Report Planning Outcome

Every Codex report must include this block:

```markdown
## Planning outcome

- Initial MD estimate:
- Actual elapsed:
- Estimate change:
- Remaining MD delta:
- Target finish met: Yes / No / Not applicable
- Ahead/behind:
- Project fields that should be updated:
- New blockers:
- Next target date recommendation:
```

Interpret the fields as follows:

- `Initial MD estimate` repeats the task-file estimate so PWT snapshots can
  compare baseline and outcome.
- `Actual elapsed` records real elapsed time where known, or the task clock
  window when exact labor time is unavailable.
- `Estimate change` records whether the baseline was confirmed, increased,
  decreased, split, or changed to/from `TBD`.
- `Remaining MD delta` records the recommended change to `Man-days Remaining`
  after the task. Use `0` for read-only audits or planning tasks that do not
  burn an estimated implementation item.
- `Target finish met` is `Not applicable` for read-only audits where no planned
  burn or completion target was expected.
- `Ahead/behind` values:
  - `Ahead`: done earlier than target or burned more MD than planned without
    adding scope.
  - `On track`: target met or variance is within the agreed tolerance.
  - `Behind`: target missed, validation failed, scope expanded, or blockers
    remain.
  - `Not applicable`: read-only audit where no planned burn was expected.
- `Project fields that should be updated` is a recommendation only unless the
  task explicitly allows GitHub Project mutation.
- `New blockers` must separate product decisions, technical design,
  Figma/reference, architecture/security/money/storage/API/sync gates, and
  actual implementation readiness.
- `Next target date recommendation` should be honest about blockers and should
  not create a false target when the next step is a decision or gate.

## Final Report Format

- Files changed.
- Commit hash.
- Branch pushed: yes/no.
- Validation results by command.
- Warnings or follow-up tasks.

## Current Milestone Notes

- `GET /health` and `GET /health/ready` exist. Readiness covers PostgreSQL, RabbitMQ, and configured local storage without exposing dependency details or physical paths.
- EF Core migrations define schema foundations for users/groups, auth identity, credentials, sessions, audit events, user payment profiles, file metadata, expense/bill tables, recurring bill templates/occurrences, settlement requests/payments/proof attachments, and settlement basket/residual tables.
- Guarded backend slices exist for first-owner bootstrap, local sign-in, refresh, current user, sign-out, current-account sessions, self profile, self payment details, self payment QR, groups, group members, personal/group bills, bill submit/participant accept/reject, bill attachment attach/list/content/remove, bill-scoped receipt OCR review intake, apply-preview, and draft-only apply for existing receipt attachments, recurring bill template create/list/get/update/pause/resume/archive, recurring forecast reads, explicit recurring draft generation, settlement candidate preview, settlement request create/read, settlement payment read/claim/confirmation/dispute/cancellation, settlement request dispute/cancellation, settlement-scoped counterparty payment details and QR content, and settlement payment proof attach/list/content/remove.
- OpenAPI and generated web/Dart clients include the current backend slices. Regenerate clients after OpenAPI changes and review generated diffs.
- Generic public file APIs, standalone receipt/OCR upload/download runtime outside bill attachments, OCR engine/runtime, OCR worker runtime, automatic OCR-to-bill finalization, non-draft shared-bill OCR revision apply, multi-participant OCR-to-split inference, recurring auto-generation workers, recurring reminders/notifications, advanced recurrence exceptions, reconciliation, broad residual credit-ledger/refund/simplification behavior beyond bounded receiver-confirmed residual effects, broader audit UI/export/retention cleanup, and broad mobile/web/admin product UI are still not implemented beyond placeholders, the starter mobile auth/session shell, and the starter mobile receipt review flow.

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

## Architecture Guardrails

- The API owns core business database writes.
- Workers must not directly mutate core business tables.
- OpenAPI is the source of truth.
- Generated clients are not hand-edited.
- File bytes go through the storage abstraction.
- File metadata belongs in PostgreSQL.
- Do not expose direct filesystem paths or storage provider internals.
- Money must be decimal-safe.
- Currency must always be attached to monetary values.
- Rounding policy is centralized.
- On-device OCR is required.
- The server OCR worker is complementary infrastructure.

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

Dev-stage auto-merge never means direct push to `main`, force push, skipped validation, skipped GitHub CI, merge of a dirty/stale/unstable/changed-head PR, or auto-merge of production, security, destructive, or otherwise manual-gated work.

Manual gates remain required for production deploys, mobile store releases, public/admin exposure changes, destructive migrations or destructive data operations, branch deletion/cleanup, force-like history changes, secrets/auth config changes, auth/session/security-critical runtime work, storage/file privacy/authz changes, money/settlement calculation authority changes, schema migrations, CI/deployment infrastructure changes, reducing Day 1 scope, replacing architecture direction, and any task that explicitly says PR-only or human-merge-only.

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

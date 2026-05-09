# Codex Task Guide

This guide defines repeatable Settleora Codex task rules so future prompts can stay short without losing project safety boundaries. It does not replace [PROGRAM_ARCHITECTURE.md](../../PROGRAM_ARCHITECTURE.md); read the architecture document first for authoritative system rules.

## Required Pre-task Reading

- [PROGRAM_ARCHITECTURE.md](../../PROGRAM_ARCHITECTURE.md)
- [README.md](../../README.md)
- Relevant service, app, infrastructure, contract, or workflow docs for the requested change.
- Relevant architecture docs only when the task touches that area.

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

- Run dotnet validation for API changes.
- Run npm validation for repo tooling, documentation, or contract changes.
- Run `npm run generate:clients` and `npm run validate:clients` when OpenAPI or generated client output changes.
- Run Docker validation for Docker, compose, or API runtime changes.
- Do not fake validation success; report the exact failing command and error summary.

## Git Rules

- Work on the requested branch and keep changes scoped.
- Stage only the intended files by explicit path.
- Commit with the requested message when one is provided.
- Push only the task branch unless asked otherwise.
- Do not merge to `main` unless the task explicitly asks for it.

## Final Report Format

- Files changed.
- Commit hash.
- Branch pushed: yes/no.
- Validation results by command.
- Warnings or follow-up tasks.

## Current Milestone Notes

- `GET /health` and `GET /health/ready` exist. Readiness covers PostgreSQL, RabbitMQ, and configured local storage without exposing dependency details or physical paths.
- EF Core migrations define schema foundations for users/groups, auth identity, credentials, sessions, audit events, user payment profiles, file metadata, expense/bill tables, settlement requests/payments/proof attachments, and settlement basket/residual tables.
- Guarded backend slices exist for first-owner bootstrap, local sign-in, refresh, current user, sign-out, current-account sessions, self profile, self payment details, self payment QR, groups, group members, personal/group bills, bill submit/participant accept/reject, settlement candidate preview, settlement request create/read, settlement payment read/claim/confirmation/dispute/cancellation, settlement request dispute/cancellation, settlement-scoped counterparty payment details and QR content, and settlement payment proof attach/list/content/remove.
- OpenAPI and generated web/Dart clients include the current backend slices. Regenerate clients after OpenAPI changes and review generated diffs.
- Generic public file APIs, receipt upload/download runtime, OCR runtime, recurring bills, forecasting, reconciliation, basket/residual runtime, balance projection endpoints, broader audit UI/export/retention cleanup, mobile/web/admin product UI, and OCR worker runtime are still not implemented beyond placeholders or starter state.

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

- `GET /health` exists.
- `GET /health/ready` currently checks PostgreSQL.
- EF Core migrations define schema-only user profile, user group, group membership, auth account, auth identity, system role assignment, local password credential, auth session, auth session family, auth refresh credential, and auth audit event tables.
- Auth runtime foundations now include password hashing, credential workflow, session runtime, refresh-session runtime, sign-in abuse policy, first-owner local bootstrap for fresh deployments, refresh-capable local sign-in, public refresh, current-user, sign-out, sign-out-all, session-list, session-revocation endpoints, the `SettleoraSession` bearer middleware/current-actor/policy foundation, an internal business authorization service foundation, guarded self-profile read/update endpoints, guarded group create/list/read/update foundation endpoints, guarded admin local-user list/read/create foundation endpoints, and generated web/Dart client foundations from OpenAPI. Regenerate clients after OpenAPI changes. General registration, invitations, group member management, broader admin user management, owner/admin role assignment, payment details, UI behavior, EF Core business workflows beyond the current group foundation, expenses, bills, settlements, OCR endpoints, and worker behavior do not exist yet.
- Infrastructure readiness checks should be additive and scoped.
- The next likely infrastructure check is RabbitMQ readiness.

# Settleora Agent Rules

Current repository files are the source of truth. Uploaded or copied snapshots are advisory only when they differ from the repo.

Before starting work, read:

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- Active `.ai/*` files
- Relevant domain docs for the changed area

## Branch Model

- `main` is the human-only production branch.
- `ai/integration` is the AI integration branch for safe internal task PRs.
- `ai/task/*` branches hold one focused AI task each.

## Absolute Prohibitions

- No direct push to `main`.
- No auto-merge to `main`.
- No secrets, credentials, tokens, `.env`, `~/.ssh`, or local Codex state.
- No silent Docker, deployment, or environment changes.
- No silent auth, session, or security changes.
- No silent database schema or migration changes.
- No silent OpenAPI or generated-client changes.
- No silent settlement, payment, or bill calculation logic changes.

Future task PRs may be eligible for auto-merge into `ai/integration` only after the scope guard, requested validation, CI, AI review, and QA all pass. Auto-merge to `main` is never allowed.

## Required Task Report Fields

- Task status and branch names.
- Source, integration, and task commit SHAs.
- Files changed.
- Validation commands and exact results.
- Scope guard result.
- PR URL when created.
- Human review or stop reason.
- Confirmation that no forbidden runtime, API, security, money, schema, deployment, or secret changes were made.

# Settleora Agent Rules

Current repository files are the source of truth. Uploaded or copied snapshots are advisory only when they differ from the repo.

Before starting work, read:

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- Active `.ai/*` files
- Relevant domain docs for the changed area

## Branch Model

- `main` is the production branch. During the current development stage, explicit PR/merge-gate tasks may merge to `main` automatically only through GitHub PRs after all required gates pass.
- `ai/integration` is the AI integration branch for safe internal task PRs.
- `ai/task/*` branches hold one focused AI task each.

## Absolute Prohibitions

- No direct push to `main`.
- No auto-merge to `main` except for explicit development-stage PR/merge-gate tasks that satisfy the policy below.
- No secrets, credentials, tokens, `.env`, `~/.ssh`, or local Codex state.
- No silent Docker, deployment, or environment changes.
- No silent auth, session, or security changes.
- No silent database schema or migration changes.
- No silent OpenAPI or generated-client changes.
- No silent settlement, payment, or bill calculation logic changes.

## Development-Stage Main Merge Policy

While Settleora has no production deployment, a task explicitly marked as a PR/merge gate may automatically merge to `main` only when all of these are true:

- Worktree is clean before validation and immediately before merge.
- The source branch head matches the expected SHA.
- `origin/main` matches the expected starting SHA immediately before merge.
- PR base, head branch, and head SHA match the task.
- Changed files are within the task's allowed scope.
- Required local validation passes, with exact commands and results reported.
- GitHub CI/checks pass on the exact PR head.
- PR is mergeable and clean.
- PR head is unchanged immediately before merge.
- No manual gate is triggered.
- Merge is a normal GitHub merge commit unless the task explicitly says otherwise.
- Source branch is not deleted unless the human explicitly requests deletion.

Dev-stage auto-merge does not allow direct pushes to `main`, force pushes, skipped validation, skipped CI, dirty or stale PRs, changed-head merges, or merges for production/security/destructive/manual-gated work.

Manual gates are still required for production deploys, mobile store releases, public/admin exposure changes, destructive migrations or destructive data operations, branch deletion/cleanup, force-like history changes, secrets/auth config changes, auth/session/security-critical runtime work, storage/file privacy/authz changes, money/settlement calculation authority changes, schema migrations, CI/deployment infrastructure changes, reducing Day 1 scope, replacing architecture direction, and any task that explicitly says PR-only or human-merge-only.

Task PRs may also be eligible for auto-merge into `ai/integration` after the scope guard, requested validation, CI, AI review, and QA all pass.

## Required Task Report Fields

- Task status and branch names.
- Source, integration, and task commit SHAs.
- Files changed.
- Validation commands and exact results.
- Scope guard result.
- PR URL when created.
- Human review or stop reason.
- Confirmation that no forbidden runtime, API, security, money, schema, deployment, or secret changes were made.

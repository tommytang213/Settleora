# AI V3 Pipeline

## Purpose

Version 3 adds repo-local control files for AI-assisted development: milestone state, a task queue, reusable agent prompts, and a minimal scope guard for PRs into `ai/integration`. It is a governance bootstrap, not a product runtime feature.

## Branch Model

- `main`: human-only production branch. No AI direct pushes or auto-merges.
- `ai/integration`: AI integration branch for reviewed internal task PRs.
- `ai/task/*`: one focused AI task branch.

## Agent Roles

- AI Architect: selects exactly one safe next task from `.ai/task-queue.json`.
- AI Coder: implements exactly one task on an `ai/task/*` branch.
- AI Reviewer: reviews PR scope, validation, and authority-boundary violations.
- AI QA: evaluates milestone readiness and updates `.ai/qa-report.md`.
- Controller loop: manual or scripted coordination that advances one task at a time and stops on risk.

## Loop Steps

1. Read `PROGRAM_ARCHITECTURE.md`, `README.md`, `docs/workflow/CODEX_TASK_GUIDE.md`, `AGENTS.md`, and active `.ai/*` files.
2. Pick one eligible task.
3. Create an `ai/task/*` branch from `origin/ai/integration`.
4. Implement only the task's allowed scope.
5. Run scope guard and relevant validation.
6. Open a PR into `ai/integration`.
7. Review scope, validation, CI, and QA.
8. Merge into `ai/integration` only when all checks pass and the task is auto-merge eligible.
9. Stop for human review before any `main` merge.

## Auto-Merge Rules For `ai/integration`

Future task PRs may be auto-merge eligible only when:

- The task queue marks `autoMergeAllowed: true`.
- `scripts/ai/v3-scope-guard.mjs` passes.
- Required validation and CI pass.
- AI review finds no authority-boundary violation.
- AI QA has no blocking finding.
- The PR does not touch human-gated areas.

This bootstrap PR is not auto-merge eligible.

## Stop Rules

Stop immediately when a task touches or requires backend/API behavior, OpenAPI or generated clients, auth/session/security, database schema or migrations, settlement/payment/bill calculation logic, storage/file privacy policy, Docker/deployment/env config, production secrets, or unclear branch divergence.

## Human Review Boundaries

Humans must review:

- All merges to `main`.
- Any branch protection or repository settings.
- Backend/API/schema/money/security/deployment changes.
- Scope reductions or milestone changes.
- Any task where validation cannot run or the scope guard fails.

## Branch Protection Recommendations

- `main`: require pull request review, require status checks, require linear history, block force pushes and deletions, restrict direct pushes, disable auto-merge.
- `ai/integration`: require PRs, require the scope guard workflow, require validation checks, block force pushes and deletions, allow only reviewed task branches.
- `ai/task/*`: no protection required beyond normal repository permissions; branches should be short lived and focused.

## Manual Setup Still Required

- Configure branch protection in GitHub.
- Decide which CI checks are required for `ai/integration`.
- Decide whether any future controller script may auto-merge eligible `ai/integration` PRs.
- Keep `main` merges human-reviewed and manual.

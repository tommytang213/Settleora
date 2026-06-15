# AI V3 Pipeline

## Purpose

Version 3 adds repo-local control files for AI-assisted development: milestone state, a task queue, reusable agent prompts, and a minimal scope guard for PRs into `ai/integration`. It is a governance bootstrap, not a product runtime feature.

## Branch Model

- `main`: production branch. No AI direct pushes. During development stage, explicit PR/merge-gate tasks may auto-merge by normal GitHub merge commit only after the main merge gates pass.
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
9. For `main`, stop unless the task is an explicit development-stage PR/merge gate and all main merge gates pass.

## Auto-Merge Rules For `ai/integration`

Future task PRs may be auto-merge eligible only when:

- The task queue marks `autoMergeAllowed: true`.
- `scripts/ai/v3-scope-guard.mjs` passes.
- Required validation and CI pass.
- AI review finds no authority-boundary violation.
- AI QA has no blocking finding.
- The PR does not touch human-gated areas.

This bootstrap PR is not auto-merge eligible.

## Development-Stage Auto-Merge Rules For `main`

Future PR/merge-gate tasks may auto-merge to `main` only while the project remains in development stage with no production deployment and only when:

- The task explicitly authorizes a PR/merge-gate action into `main`.
- The worktree is clean before validation and immediately before merge.
- The source branch head matches the expected SHA.
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

This policy does not permit direct pushes to `main`, force pushes, skipped validation, skipped GitHub CI, dirty or stale PRs, changed-head merges, production/security/destructive/manual-gated auto-merges, or branch deletion.

## Stop Rules

Stop immediately when a task touches or requires backend/API behavior, OpenAPI or generated clients, auth/session/security, database schema or migrations, settlement/payment/bill calculation logic, storage/file privacy policy, Docker/deployment/env config, production secrets, or unclear branch divergence.

## Human Review Boundaries

Humans must review:

- This policy-update PR itself, because it changes the previous blanket `main` merge rule.
- Any branch protection or repository settings.
- Backend/API/schema/money/security/deployment changes.
- Scope reductions or milestone changes.
- Any task where validation cannot run or the scope guard fails.
- Any task that explicitly says PR-only or human-merge-only.

## Branch Protection Recommendations

- `main`: require PRs, require status checks, require linear history, block force pushes and deletions, restrict direct pushes, and allow only gated development-stage auto-merge unless a manual gate applies.
- `ai/integration`: require PRs, require the scope guard workflow, require validation checks, block force pushes and deletions, allow only reviewed task branches.
- `ai/task/*`: no protection required beyond normal repository permissions; branches should be short lived and focused.

## Manual Setup Still Required

- Configure branch protection in GitHub.
- Decide which CI checks are required for `ai/integration`.
- Decide whether any future controller script may auto-merge eligible `ai/integration` PRs.
- Keep manual gates for production deploys, mobile store releases, public/admin exposure changes, destructive migrations or destructive data operations, branch deletion/cleanup, force-like history changes, secrets/auth config changes, auth/session/security-critical runtime work, storage/file privacy/authz changes, money/settlement calculation authority changes, schema migrations, CI/deployment infrastructure changes, reducing Day 1 scope, replacing architecture direction, and PR-only or human-merge-only tasks.

# Controller Prompt

Run the AI V3 loop manually or through a small script. Never run it as an undeclared background service.

For each iteration:

1. Ask the Architect prompt for exactly one next task.
2. Stop if the selected task is a stop task or human-gated.
3. Ask the Coder prompt to implement on an `ai/task/*` branch.
4. Require scope guard, validation, and CI.
5. Ask the Reviewer prompt to inspect the PR.
6. Ask the QA prompt to update milestone readiness where relevant.
7. Merge only eligible PRs into `ai/integration` when policy allows.

For `main`, merge only when the task is explicitly marked as a development-stage PR/merge gate and all main merge gates pass: clean worktree before validation and immediately before merge, expected source SHA, expected `origin/main` starting SHA, matching PR base/head/head SHA, changed files within allowed scope, required local validation, GitHub CI/checks on the exact PR head, clean mergeability, unchanged PR head immediately before merge, no manual gate, normal GitHub merge commit unless explicitly overridden, and no source-branch deletion unless the human explicitly requests it.

Never direct-push to `main`, force push, delete branches without explicit human approval, change GitHub settings, skip validation or CI, merge dirty/stale/changed-head PRs, merge production/security/destructive/manual-gated work, or continue after a forbidden scope change.

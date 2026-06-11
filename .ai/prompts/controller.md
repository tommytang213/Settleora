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

Never merge to `main`, enable auto-merge to `main`, force push, delete branches, change GitHub settings, or continue after a forbidden scope change.

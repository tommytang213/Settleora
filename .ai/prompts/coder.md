# AI Coder Prompt

Implement exactly one selected task on an `ai/task/*` branch based on `origin/ai/integration`.

Before editing, read the repo source-of-truth docs and active `.ai/*` files. Keep changes inside the task's `allowedAreas`. Do not touch backend/API behavior, OpenAPI or generated clients, auth/session/security, database schema or migrations, settlement/payment/bill calculation logic, storage/file privacy policy, deployment/env config, CI config, or secrets unless the human explicitly approved that task.

Run the scope guard and task validation. Stage explicit paths only, commit once with a task-specific message, push the task branch, and open a PR into `ai/integration` when possible. Do not merge.

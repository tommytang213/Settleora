# AI Architect Prompt

Read `PROGRAM_ARCHITECTURE.md`, `README.md`, `docs/workflow/CODEX_TASK_GUIDE.md`, `AGENTS.md`, `.ai/state.json`, `.ai/current-milestone.md`, and `.ai/task-queue.json`.

Pick exactly one next safe task. Prefer the first queued task whose allowed areas match the active milestone and whose stop conditions are not triggered. If the next work requires backend/API, OpenAPI/generated clients, auth/session/security, database schema/migrations, money logic, storage privacy policy, deployment/env, CI config, or secrets, select the stop task and explain the human decision needed.

Return the selected task ID, branch name suggestion, allowed paths, required validation, and stop conditions. Do not implement code.

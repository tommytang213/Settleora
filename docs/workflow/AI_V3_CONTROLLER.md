# AI V3 Controller

The AI V3 controller is a single-DevBox loop for advancing safe task PRs into `ai/integration`. It reads the `.ai` milestone state, selects the next safe queued task or safe QA bugfix, writes a full Codex task prompt under `/workspace/logs/ai-v3-controller/tasks/`, and can invoke `codex-vm-full` with that prompt on stdin when run explicitly in real-run mode.

GitHub Actions does not call GPT or Codex directly in v0. Actions only provide repository checks and scope guard feedback. The DevBox remains the execution boundary for Codex credentials, local logs, prompt generation, PR creation, check waiting, and controlled auto-merge into `ai/integration`.

## Execution Model

- v0 is single-VM first. It uses one repository checkout and a lock file at `/workspace/logs/ai-v3-controller/controller.lock`.
- Worktrees can be added later when the controller needs concurrent task branches.
- Multi-VM coordination is deferred until the single-VM loop is stable.
- Real runs resolve `codex-vm-full` from the DevBox login-shell `PATH` with `bash -lc 'command -v codex-vm-full'`, then call the resolved command with the generated task prompt as stdin. Do not pass shell commands to `codex-vm-full`.
- Codex stdout and stderr are redirected to a per-iteration file under `/workspace/logs/ai-v3-controller/codex-runs/`. The controller does not buffer full Codex output in Node memory; run logs record the Codex command source, exit status, and log path, and failures include a short tail of the Codex log.
- Set `SETTLEORA_AI_V3_CODEX_COMMAND` to an explicit command path to override `codex-vm-full` during controller launch debugging.
- If Codex cannot be found or launched, the controller run log records the attempted command, launch error details, stdout/stderr when present, resolver details, and the current `PATH`.

## Commands

Dry run:

```bash
cd /workspace/repos/Settleora
node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1
```

Single real task run without auto-merge:

```bash
cd /workspace/repos/Settleora
node scripts/ai/v3-controller.mjs --run --max-iterations 1
```

Bounded real loop with eligible safe PR auto-merge into `ai/integration` only:

```bash
cd /workspace/repos/Settleora
node scripts/ai/v3-controller.mjs --run --max-iterations 8 --allow-auto-merge
```

Preferred milestone runner wrapper:

```bash
cd /workspace/repos/Settleora
scripts/ai/run-v3-milestone.sh 8
```

The wrapper starts from the repository root, refuses to run from `main`, refuses a `main` integration branch in `.ai/state.json`, exports a stable `PATH` containing `/opt/flutter/bin`, `${HOME}/bin`, `${HOME}/.local/bin`, and `/home/tommytang213/bin`, verifies `node` and `codex-vm-full`, then runs:

```bash
node scripts/ai/v3-controller.mjs --run --allow-auto-merge --max-iterations <N>
```

Pass the bounded iteration count as the first argument or set `SETTLEORA_AI_V3_MAX_ITERATIONS`; the default is `8`.

## Auto-Merge Constraints

The controller may only auto-merge into `ai/integration`. It rechecks PR base branch, draft state, merge state, checks, changed-file scope, forbidden paths, scope guard output, updated task-branch `.ai` state, GitHub review state, and the expected head SHA before merge. It must never merge into `main`, force push, delete branches, or bypass failing or ambiguous checks.

Auto-merge is blocked when the task branch marks itself human-gated, records a stop reason, records a forbidden change, marks the selected queue item as human-required or non-auto-mergable, records blocked/failed validation language in `.ai/qa-report.md` or `.ai/task-queue.json`, has unresolved `CHANGES_REQUESTED`, has Codex review suggestions from `chatgpt-codex-connector[bot]`, or cannot be inspected unambiguously. The run log records the precise `autoMergeBlockReason` for these stops instead of relying on the merge command to fail.

## QA Fallback Loop

The controller reads `.ai/qa-report.md` and `.ai/qa-findings.json`. Open findings with `controllerAction: "create_bugfix_task"` can become bugfix prompts when their scope is safe. Findings that require forbidden paths or human-gated work stop the loop. Each finding is limited to two bugfix cycles, and each controller invocation is capped by `--max-iterations`.

## No-Change Tasks

After Codex returns, the controller compares `origin/<integrationBranch>` to the task branch before pushing or creating a PR. If there are zero changed files, the run log records `noChanges: true` and `noCommit: true`, skips PR creation, and stops with a clear `stopReason`. The controller must never fabricate an empty commit solely to create a PR.

## Human Stop Boundaries

Stop for backend/API behavior, OpenAPI/generated-client changes, auth/session/security changes, database schema or migrations, settlement/payment/bill calculation logic, Docker/env/deployment/CI changes, secrets, ambiguous GitHub state, repeated validation failures, forbidden changed files, human-gated controller state, validation-blocked state, or UI testing readiness.

## Logs And Reports

- Controller logs: `/workspace/logs/ai-v3-controller/`
- Generated task prompts: `/workspace/logs/ai-v3-controller/tasks/`
- Full per-iteration Codex output: `/workspace/logs/ai-v3-controller/codex-runs/`
- Per-run JSON logs: `/workspace/logs/ai-v3-controller/run-*.json`
- Current Codex task report copy: `.codex/last-report.md`

## Stale Lock Recovery

If the controller refuses to start because `controller.lock` exists, inspect the JSON file for the recorded pid and start time. If the pid is still active, do not remove the lock. If the pid is not active and the controller cannot remove it automatically, archive the lock content in the run notes and remove only `/workspace/logs/ai-v3-controller/controller.lock`.

## Inspecting Failures

Start with the newest `/workspace/logs/ai-v3-controller/run-*.json`, then open the prompt path recorded for the failed iteration. Check the PR checks with `gh pr checks <number>`, inspect changed files with `git diff --name-only origin/ai/integration...HEAD`, and rerun `node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD` before deciding whether to queue a safe bugfix or stop for human review.

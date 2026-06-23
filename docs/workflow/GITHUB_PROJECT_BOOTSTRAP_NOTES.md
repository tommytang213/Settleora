# GitHub Project Bootstrap Notes

## Bootstrap Files

- `docs/workflow/DAY1_EXECUTION_BOARD.md` defines the board workflow, statuses, fields, labels, views, gates, Codex queue, and bundle planning.
- `tools/github/day1-board-seed.json` is the seed source of truth for labels, project metadata, epics, and initial feature/task issues.
- `tools/github/bootstrap-day1-board.sh` applies the seed idempotently through `gh`.
- `tools/github/README.md` documents local usage and safety behavior.

## Project Target

```text
Owner: tommytang213
Repository: tommytang213/Settleora
Project title: Settleora Day 1 Execution Board
```

The bootstrap script first validates the seed JSON, then creates or reuses labels and issues. GitHub Project creation/configuration is attempted only when `gh project` can access Projects for the owner. If the authenticated token lacks `read:project` or `project` scope, the script reports the blocker and continues with label/issue bootstrap unless `--skip-project` is supplied.

## Idempotency Rules

The script is designed for safe re-runs:

- Labels are created when missing and reused when present.
- Issue lookup is by exact title across open and closed issues.
- Existing issues are not closed, deleted, retitled, or body-rewritten.
- Missing expected labels are added to reused issues.
- Existing labels are not deleted.
- Project mutation is conservative and stops when permissions are missing.

## Existing Issue Reuse

The seed intentionally reuses known product-scope issues where they already match Day 1 board work:

- #297 `Remove developer-style visual preference readout from mobile Profile screen`
- #298 `Audit mobile screens for developer-facing placeholder/readout copy`
- #300 `Standardize mobile date fields with a reusable date picker component`
- #301 `Audit and standardize mobile reusable components and design-system consistency`
- #302 `Define modern responsive web UI design language for user and admin apps`
- #291 `Track seasonal and flexible-date recurring bill forecasting`
- #294 `Add autopay policy defaults and per-recurring-bill paid-state overrides`

Those issues remain the canonical tracking items for their existing topic. The bootstrap adds missing board labels only.

## Manual GitHub Project Step

If project access is blocked, refresh the GitHub CLI token outside Codex and re-run:

```bash
gh auth refresh -s read:project -s project
tools/github/bootstrap-day1-board.sh
```

Do not paste tokens into the repo or task prompt. Do not commit local GitHub auth files.

## What This Bootstrap Does Not Do

- It does not implement product code.
- It does not change OpenAPI, generated clients, schema, migrations, runtime auth, storage bytes, money logic, CI, Docker, deployment, or mobile/web/admin UI.
- It does not mark Day 1 acceptance as passed.
- It does not auto-merge to `main`.
- It does not delete branches, labels, issues, project fields, or views.

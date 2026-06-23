# GitHub Project Bootstrap Notes

## Bootstrap Files

- `docs/workflow/DAY1_EXECUTION_BOARD.md` defines the board workflow, statuses, fields, labels, views, gates, Codex queue, and bundle planning.
- `tools/github/day1-board-seed.json` is the seed source of truth for labels, project metadata, epics, and initial feature/task issues.
- `tools/github/bootstrap-day1-board.sh` applies the seed idempotently through `gh`.
- `tools/github/sync-day1-board-fields.py` populates supported Project field values for existing seeded items and writes marker-bounded hierarchy sections to existing seeded issue bodies.
- `docs/planning/DAY1_EXECUTION_COVERAGE_MATRIX.md` maps source-traceable Day 1 requirements to existing issues and missing issue candidates for review before backlog expansion.
- `tools/github/README.md` documents local usage and safety behavior.

## Project Target

```text
Owner: tommytang213
Repository: tommytang213/Settleora
Project title: Settleora Day 1 Execution Board
```

The bootstrap script first validates the seed JSON, then creates or reuses labels and issues. GitHub Project creation/configuration is attempted only when `gh project` can access Projects for the owner. If the authenticated token lacks `read:project` or `project` scope, the script reports the blocker and continues with label/issue bootstrap unless `--skip-project` is supplied.

When Project access is available, the script creates or reuses the target Project, creates or reuses the supported Project fields, updates the default `Status` field options to the Day 1 status list when needed, and adds seeded issue URLs to the Project if missing. GitHub Project view creation is not automated because the current `gh project` commands and GitHub GraphQL mutation schema do not expose a safe idempotent ProjectV2 view create/update operation.

After bootstrap, run:

```bash
python3 tools/github/sync-day1-board-fields.py
```

This sync command sets supported field values from `tools/github/day1-board-seed.json` and issue labels. It deliberately does not invent priority, progress, bundle, or man-day estimates when the seed has no reliable values. The current `gh issue edit` command does not expose a safe sub-issue flag, so the command uses an idempotent Markdown hierarchy fallback in existing issue bodies until a supported sub-issue API path is verified.

The current 64 seeded issues are only an initial execution-board skeleton. They must not be treated as proof that Day 1 is fully planned or complete; use the coverage matrix before generating missing issues.

## Idempotency Rules

The script is designed for safe re-runs:

- Labels are created when missing and reused when present.
- Issue lookup is by exact title across open and closed issues.
- Existing issues are not closed, deleted, retitled, or body-rewritten.
- Missing expected labels are added to reused issues.
- Existing labels are not deleted.
- Project fields are created or reused by exact name.
- Seeded issues are added to the Project by URL when missing.
- Project mutation is conservative and stops when permissions are missing.
- Project views remain a manual configuration step until GitHub exposes a supported idempotent API.
- Field/hierarchy sync rewrites only marker-bounded hierarchy sections and supported Project fields for existing seeded items.

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
- It does not create or update Project views through an unsupported API path.
- It does not mark Day 1 acceptance as passed.
- It does not auto-merge to `main`.
- It does not delete branches, labels, issues, project fields, or views.

# Settleora GitHub Bootstrap Tools

## Day 1 Execution Board

Run from the repository root:

```bash
tools/github/bootstrap-day1-board.sh
```

Useful options:

```bash
tools/github/bootstrap-day1-board.sh --dry-run
tools/github/bootstrap-day1-board.sh --skip-project
tools/github/bootstrap-day1-board.sh --repo tommytang213/Settleora --owner tommytang213
```

The script reads `tools/github/day1-board-seed.json`, then creates/reuses labels and issues. It uses exact issue-title matching to avoid duplicate issues on re-run.

When GitHub Project access is available, the script creates/reuses the `Settleora Day 1 Execution Board`, creates/reuses the supported Project fields, updates the default `Status` field options to the Day 1 status list when needed, and adds seeded issue URLs to the Project when missing.

The 64 seeded issues are an initial execution-board skeleton. They are not complete Day 1 backlog coverage. Use `docs/planning/DAY1_EXECUTION_COVERAGE_MATRIX.md` to review missing and partial coverage before generating any additional issues.

Project views are not automated because the current GitHub CLI and GraphQL mutation schema do not expose a safe idempotent ProjectV2 view create/update operation. Configure views manually from `docs/workflow/DAY1_EXECUTION_BOARD.md` after the script reports the view limitation.

Project setup needs GitHub Projects token scopes. If `gh project list --owner tommytang213` fails with missing `read:project` or `project` scopes, refresh `gh` outside Codex and re-run:

```bash
gh auth refresh -s read:project -s project
```

Do not commit GitHub auth files, tokens, `.env`, SSH config, or local Codex state.

## Day 1 Field And Hierarchy Sync

After the seed issues and Project fields exist, synchronize supported Project item field values and issue hierarchy markers:

```bash
python3 tools/github/sync-day1-board-fields.py
```

Useful options:

```bash
python3 tools/github/sync-day1-board-fields.py --dry-run
python3 tools/github/sync-day1-board-fields.py --skip-fields
python3 tools/github/sync-day1-board-fields.py --skip-hierarchy
python3 tools/github/sync-day1-board-fields.py --repo tommytang213/Settleora --owner tommytang213 --project-number 2
```

The sync tool reads `tools/github/day1-board-seed.json` and updates existing seeded Project items only. It sets supported fields such as `Work Type`, `Area`, `Day Scope`, `Status`, `Risk`, `Size`, `Validation Class`, `Figma Required`, and `Manual Gate` from labels and seed metadata. It does not invent priority, man-day estimates, progress, or bundle IDs when the seed has no reliable value.

The installed `gh issue edit` command does not currently expose a safe `--add-sub-issue` option. Until a supported sub-issue API path is verified, hierarchy sync uses idempotent Markdown fallback sections in issue bodies:

```text
<!-- settleora-board-children:start -->
<!-- settleora-board-children:end -->
<!-- settleora-board-parent:start -->
<!-- settleora-board-parent:end -->
```

The tool preserves existing issue body content outside those markers and does not retitle, close, delete, or create issues.

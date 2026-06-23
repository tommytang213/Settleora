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

Project views are not automated because the current GitHub CLI and GraphQL mutation schema do not expose a safe idempotent ProjectV2 view create/update operation. Configure views manually from `docs/workflow/DAY1_EXECUTION_BOARD.md` after the script reports the view limitation.

Project setup needs GitHub Projects token scopes. If `gh project list --owner tommytang213` fails with missing `read:project` or `project` scopes, refresh `gh` outside Codex and re-run:

```bash
gh auth refresh -s read:project -s project
```

Do not commit GitHub auth files, tokens, `.env`, SSH config, or local Codex state.

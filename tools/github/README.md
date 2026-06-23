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

Project setup needs GitHub Projects token scopes. If `gh project list --owner tommytang213` fails with missing `read:project` or `project` scopes, refresh `gh` outside Codex and re-run:

```bash
gh auth refresh -s read:project -s project
```

Do not commit GitHub auth files, tokens, `.env`, SSH config, or local Codex state.

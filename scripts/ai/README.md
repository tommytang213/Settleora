# AI Scripts

## Scope Guard

`v3-scope-guard.mjs` is a no-dependency Node.js script for classifying changed files in AI task PRs.

Default use:

```bash
node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD
```

Options:

- `--base <git-ref>` defaults to `origin/ai/integration`.
- `--head <git-ref>` defaults to `HEAD`.
- `--milestone-file <path>` defaults to `.ai/current-milestone.md`.
- `--allow-bootstrap-workflow` permits only `.github/workflows/ai-integration-scope-guard.yml` for this bootstrap self-test.

For M1, the guard allows `.ai/**`, `AGENTS.md`, `docs/**`, `apps/mobile/lib/bills/**`, and `apps/mobile/test/**`. It forbids backend/API, worker, contracts, generated clients, infrastructure, GitHub workflow/settings, Docker/compose/env-looking files, and migration-looking paths.

This script is not a background service and does not merge branches. It is a local and CI validation helper.

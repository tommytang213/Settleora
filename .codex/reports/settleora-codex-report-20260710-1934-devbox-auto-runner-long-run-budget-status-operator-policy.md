# Settleora Codex Report - DevBox Auto-Runner Long-Run Budget Status + Operator Policy

- Status: `pr_opened`
- Branch: `feature/devbox-auto-runner-long-run-budget-status-20260710-1934`
- Base commit: `bd81cf72d9858a861817429351e9fbf4242b29c8`
- Implementation commit SHA: `308e4b292561455ffaf433e7483111cb9077f191`
- PR URL: `https://github.com/tommytang213/Settleora/pull/845`

## Files Changed

- `tools/auto-runner/lib/config.mjs`
- `tools/auto-runner/lib/control-plane.mjs`
- `tools/auto-runner/test/auto-runner.test.mjs`
- `tools/auto-runner/README.md`
- `docs/workflow/AUTONOMOUS_CODEX_RUNNER.md`
- `docs/planning/ISSUE_PROGRESS_LEDGER.md`
- `.codex/reports/settleora-codex-report-20260710-1934-devbox-auto-runner-long-run-budget-status-operator-policy.md`

## Implementation Summary

- Added `--max-prs` as an alias for the existing iteration-loop budget in normal and `--extend` control parsing.
- Hardened status JSON/text with PR/iteration budget aliases, remaining budget, and separate completed/merged/failed/blocked/skipped counts.
- Improved run/event listing text and JSON details with PR head SHA, merge SHA, wait attempts, review verdicts, independent AI provider/tier/verdict, and final outcome where existing summaries contain them.
- Documented exact safe-boundary semantics for `--pause`, `--stop-after-current`, and bounded `--extend`.
- Added an operator command card for future manually approved long-running runs.
- Updated the #800 ledger checkpoint.

## Operator Commands Now Supported

```bash
node tools/auto-runner/settleora-auto-runner.mjs --status
node tools/auto-runner/settleora-auto-runner.mjs --status --json
node tools/auto-runner/settleora-auto-runner.mjs --list-runs
node tools/auto-runner/settleora-auto-runner.mjs --list-events --run <run-id>
node tools/auto-runner/settleora-auto-runner.mjs --pause
node tools/auto-runner/settleora-auto-runner.mjs --stop-after-current
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-iterations +5
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-prs +5
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-runtime +12h
```

`--pause` and `--stop-after-current` are observed only at safe boundaries before selecting new work. Extensions are explicit, bounded, and do not bypass lane policy, manual gates, provider budget hard stops, independent-review gates, changed-file policy, checks, code scanning, secrets policy, stop labels, or auto-merge gates.

## Sample Output Summary

`--status --json` against existing local summaries reported:

- `active: false`
- latest run `run-2026-07-10T100911Z`
- `completedIterations: 2`, `completedPrs: 2`
- outcome counts: completed `2`, merged `1`, failed `0`, blocked `0`, skipped `1`
- summary path `/workspace/logs/settleora-auto-runner/summaries/run-2026-07-10T100911Z.json`

`--list-events --run run-2026-07-10T100439Z` reported issue #839 and #840 events, PR #841 and #842 head SHAs, independent AI review pass lines, Codex mechanics approve lines, local validation passed lines, merge SHA `0a1b7c4e9e346620fb207157c16a1617e1e73457` for PR #841, and final outcomes `auto_merged` / `auto_failed`.

## Validation Results

- `git status --short`: showed only the scoped modified files before report creation.
- `git diff --name-only`: listed only auto-runner tooling/tests, workflow docs, planning ledger, and this report.
- `git diff --check`: passed with no output.
- `npm run validate:docs`: passed, ending with `Documentation validation passed.`
- `npm run validate:scaffold`: passed, ending with `Scaffold validation passed (19 paths).`
- `node --test tools/auto-runner/test/*.test.mjs`: passed, `# tests 130`, `# pass 130`, `# fail 0`.
- `node --check tools/auto-runner/settleora-auto-runner.mjs`: passed with no output.
- `for f in tools/auto-runner/settleora-auto-runner.mjs tools/auto-runner/lib/*.mjs; do node --check "$f" || exit 1; done`: passed with no output.
- `node tools/auto-runner/settleora-auto-runner.mjs --status --json`: passed and produced sanitized status JSON.
- `node tools/auto-runner/settleora-auto-runner.mjs --list-runs`: passed and listed recent run summaries.
- `node tools/auto-runner/settleora-auto-runner.mjs --list-events --run run-2026-07-10T100439Z`: passed and listed real recent event evidence.
- `node tools/auto-runner/settleora-auto-runner.mjs --pause; test $? -ne 0`: passed expected no-active-runner failure behavior without leaving a misleading control state.
- `node tools/auto-runner/settleora-auto-runner.mjs --extend --max-prs +0; test $? -ne 0`: passed expected malformed extension rejection.
- `node tools/auto-runner/settleora-auto-runner.mjs --extend --max-runtime -1h; test $? -ne 0`: passed expected malformed runtime extension rejection.

## Scope Guard Result

Diff is scoped to auto-runner tooling/tests, workflow/operator docs, issue-progress ledger, and this task report.

No backend/API/auth/session/security runtime, storage/privacy/authz runtime, money/settlement/payment/bill calculation logic, schema/migrations, OpenAPI/generated clients, Docker/CI/deployment/env, OCR/runtime, sync/import/export/backup/restore runtime, mobile release/signing, public/admin exposure, secrets, provider payloads, accounting files, `/workspace/logs/**`, or product runtime files were modified.

## Ledger And Issues

- #800 ledger updated: yes.
- Current open PRs/issues touched: #800 ledger only; no GitHub issue mutation performed by this task.
- No broad run, `99 PR / 240h` run, systemd/service enablement, stale-claim stealing, follow-up issue creation, review-fix mutation enablement, or product-runtime run was performed.

## Remaining Gates For Broad Unattended Runs

- Explicit human approval for any 99 PR / 240h or broad trusted run.
- Manual approval before systemd/service execution.
- Manual approval before stale-claim stealing, follow-up issue creation, or broader review-fix mutation.
- Independent-review, changed-file, checks, code-scanning, secrets, stop-label, provider-budget, lane, and manual-gate enforcement must remain active.

## Next Recommended Action

Review the PR, confirm the operator output meets the next-day audit need, and keep #800 open until broad unattended-run gates are explicitly approved.

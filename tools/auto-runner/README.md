# Settleora Auto-Runner Tooling

This directory contains the DevBox-native unattended Codex auto-runner skeleton.
It is issue-label driven and writes all mutable runtime state under
`/workspace/logs/settleora-auto-runner/`.

Preflight diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --preflight
```

Preflight prints bounded JSON with pass/warn/fail checks for repo root,
branch/worktree status, `gh`, GitHub issue polling, `codex-vm-full`
resolution, logs-root writability, config policy defaults, and the fact that
the command does not install or enable systemd units. It does not run Codex
implementation or review prompts and does not mutate GitHub or branches.

Dry-run diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once --require-pre-pr-review
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
```

`--fixture-issues <json>` is dry-run only. It uses local issue objects to prove
multi-iteration behavior without calling `gh issue edit`, `gh issue comment`,
`gh issue create`, creating branches, pushing, opening PRs, running real Codex,
or enabling auto-merge. Stop labels such as `auto-pr-opened` are honored.

Issue contracts:

`auto-ready` and `auto-bundle` only make an issue eligible for selection. They
do not authorize implementation. Real-run and dry-run implementation require a
body-level contract:

````markdown
## Auto-runner contract

```json
{
  "contractVersion": 1,
  "lane": "workflow-docs-tooling",
  "allowedPaths": [
    "tools/auto-runner/**",
    "docs/workflow/**"
  ],
  "validationProfile": "workflow-tooling",
  "manualMergeRequired": true,
  "autoMergeEligible": false,
  "requiredReading": [
    "PROGRAM_ARCHITECTURE.md",
    "docs/workflow/CODEX_TASK_GUIDE.md",
    "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"
  ]
}
```
````

Contracts are parsed from the issue body only. Missing contracts, malformed
JSON, missing fields, unknown fields, unsupported versions, unsupported lanes,
unknown validation profiles, and `allowedPaths` outside the lane manifest all
fail closed as safe blocked outcomes. Issue text never supplies shell
commands; it only names a validation profile defined in
`tools/auto-runner/lib/lane-policy.mjs`.

Initial implementation lanes:

- `workflow-docs-tooling`: `tools/auto-runner/**`, `docs/workflow/**`, and
  `scripts/ai/**`.
- `docs-planning`: `docs/planning/**` and `docs/qa/**`.

Product/runtime/danger lanes remain disabled or manual-gated placeholders.
Auto-merge, stale-claim stealing, follow-up issue creation, review-fix
mutation, trusted overnight real-run operation, and systemd enablement remain
disabled/gated.

Bounded real-run mode requires an explicit flag:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --run --max-iterations 20
node tools/auto-runner/settleora-auto-runner.mjs --run --max-runtime 8h
```

Summary mode:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --write-summary --since 24h
```

Real-run mutation and PR creation stay gated by lane policy, local validation,
and the mandatory pre-PR AI review verdict. Auto-merge is disabled by default.
Terminal real-run outcomes remove `auto-running`; PR-opened outcomes add
`auto-pr-opened`, and blocked/failure outcomes add the configured stop label.

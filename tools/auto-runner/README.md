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
resolution, logs-root writability, config policy defaults, trusted real-run
approval state, whether normal `--run` would refuse, whether canary real-run
would refuse and why, disabled auto-merge/follow-up/stale-claim/review-fix
mutation/systemd defaults, and the fact that the command does not install or
enable systemd units. It does not run Codex implementation or review prompts
and does not mutate GitHub or branches.

Dry-run diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once --require-pre-pr-review
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --canary --max-iterations 2 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
```

`--fixture-issues <json>` is dry-run only. It uses local issue objects to prove
multi-iteration behavior without calling `gh issue edit`, `gh issue comment`,
`gh issue create`, creating branches, pushing, opening PRs, running real Codex,
or enabling auto-merge. Stop labels such as `auto-pr-opened` are honored.
Canary dry-run writes evidence under
`/workspace/logs/settleora-auto-runner/canary/` without live GitHub mutation.

Eligible labels are polled with one simple GitHub issue search per label, for
example `repo:tommytang213/Settleora is:issue is:open label:auto-ready`.
Multiple label searches are aggregated and deduplicated by issue number. A
dedicated canary config can set `eligibleLabels` to only
`auto-canary-ready`; the issue body contract still decides whether any selected
issue may be implemented.

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

Normal real-run is refused by default. A plain `--run` requires
`trustedRealRunApproved: true` in config and still refuses unsafe mutation
toggles. This repository does not currently approve overnight trusted
operation.

```bash
node tools/auto-runner/settleora-auto-runner.mjs --run --max-iterations 20
node tools/auto-runner/settleora-auto-runner.mjs --run --max-runtime 8h
```

Trusted real-run canary mode is a separate, narrower gate. A canary real-run
requires both CLI intent and config approval:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --run --canary --max-iterations 1 --config /workspace/logs/settleora-auto-runner/canary-approved-config.json
```

The config used for that command must set `trustedRealRunCanaryApproved: true`.
Canary mode only accepts contracted `workflow-docs-tooling` and `docs-planning`
lanes, refuses contracts with `autoMergeEligible: true`, requires
`manualMergeRequired: true`, caps iterations to
`trustedRealRunCanaryMaxIterations` (default `2`), writes evidence under
`/workspace/logs/settleora-auto-runner/canary/`, and keeps PRs human-review and
human-merge only.

Canary mode refuses auto-merge, follow-up issue creation, stale-claim stealing,
review-fix mutation, and systemd enablement. It does not approve overnight
operation and does not install or enable systemd.

Summary mode:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --write-summary --since 24h
```

Real-run mutation and PR creation stay gated by lane policy, local validation,
unexpected pre-review GitHub mutation checks, and the mandatory pre-PR AI
review verdict. Implementation Codex is instructed to implement locally,
validate locally, write the local report only, and not push, open/update PRs,
merge, or mutate GitHub labels/issues/comments. The runner owns explicit-path
staging, commit, push, PR creation/update, CI watching, and issue outcome
labels/comments after an approved review verdict.

After implementation Codex exits, the runner treats local checkout state as the
source of changed-file truth. It collects unstaged tracked paths from
`git diff --name-only`, staged paths from `git diff --cached --name-only`, and
untracked paths from `git ls-files --others --exclude-standard`, then
deduplicates and sorts the combined set. That post-Codex set drives
contract/lane allowlist checks, validation planning, review-package evidence,
canary/summaries, and explicit-path staging. `no_changes` is used only when the
post-Codex working tree, index, and untracked-file set are clean. If any
changed path is outside the contract or lane allowlist, the runner fails closed
and leaves the checkout for operator inspection instead of silently restoring
or discarding implementation changes.

Before review, the runner checks for a remote task branch or PR for the task
branch and fails closed if either exists unexpectedly.

The reviewer subprocess boundary is channel-separated. The runner selects the
reviewer process `stdout` stream as the only machine-parseable response
payload and writes the full raw review log, including `stderr` and diagnostic
session transcript material, for human inspection. The verdict extractor does
not parse the full raw log. If the selected `stdout` payload is empty, missing,
or invalid, review fails closed instead of falling back to transcript/log
content.

Within the selected response payload, the review verdict parser extracts JSON
object candidates from raw JSON, fenced `json`, or JSON surrounded by
prose/tool output, validates each object against the strict verdict schema, and
accepts only when exactly one schema-valid verdict object exists. Invalid
schema/example candidates, including placeholder enum strings such as
`approve | changes_requested | needs_tommy | danger_gate | unable_to_review`,
are counted and ignored only when there is exactly one valid verdict object.
Malformed JSON candidates, oversized candidates, non-object raw JSON,
missing-field, unknown-field, out-of-enum without a valid verdict, zero valid
verdicts, or multiple valid verdicts fail closed as `unable_to_review`.
Review results, canary evidence, and summaries include diagnostics for the
selected response payload boundary, raw review log path, selected-payload valid
and invalid candidate counts, raw-log candidate counts when useful, selected
JSON source when present, and failure reason when review cannot be accepted.
Auto-merge is disabled by default.

`auto-claimed` and `auto-running` are active claim labels. Terminal real-run
outcomes remove both labels. PR-opened outcomes add `auto-pr-opened`,
blocked/manual outcomes add `needs-tommy`, danger outcomes add `danger-gate`,
and validation/review/runner failure outcomes add `auto-failed`. `no_changes`
removes both active labels, comments the outcome, and leaves the issue open.

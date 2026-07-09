# Settleora Auto-Runner Tooling

This directory contains the DevBox-native unattended Codex auto-runner skeleton.
It is issue-label driven and writes all mutable runtime state under
`/workspace/logs/settleora-auto-runner/`.

Preflight diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --preflight
node tools/auto-runner/settleora-auto-runner.mjs --readiness
```

Preflight/readiness is report-only. `--readiness` is the preferred command
when preparing for a future overnight approval review. It prints a concise
pass/warn/fail summary to stderr, prints the full machine-readable JSON to
stdout, and writes both JSON and Markdown reports under:

```text
/workspace/logs/settleora-auto-runner/readiness/
```

The readiness report includes timestamp, repository, current branch and `HEAD`,
config path, pass/warn/fail totals, remaining manual gates, repo-root and clean
worktree checks, `origin/main` reachability, local `HEAD` relation to
`origin/main`, `gh auth status`, repository reachability, #800 open state,
#805 closed state, eligible issue search health using simple per-label
queries, trusted real-run refusal state, separate canary approval state,
risky gate defaults, reviewer tier/budget policy, active/stale claim label
readouts, active `auto-pr-opened` issue readouts, open auto-runner PR
readouts, Codex command resolution without invocation, Node version, log-write
sanity, and disk-space sanity.

`pass` means the checked condition matches conservative readiness
expectations. `warn` means inspect before trusting unattended operation.
`fail` means the state is not suitable for unattended operation. Enabling
`allowAutoMerge`, `allowFollowupIssueCreation`, `allowStaleClaimSteal`,
`allowReviewFixMutation`, or `allowSystemdEnablement` reports `fail` unless
the config matches the explicitly documented bounded low-risk auto-merge
canary approval path.

Reviewer budget and routing are a report-only policy foundation. External
reviewer tiers are disabled and unconfigured by default:
`cheap_independent`, `strong_independent`, and `tie_breaker`.
`codex_mechanics` remains available for the existing Codex-backed mechanics
review path. Readiness reports provider profile names, model names, token
prices, and whether a command is configured; it does not print command strings
or secrets. Defaults assume USD 80/month normal reviewer budget, USD 95/month
reviewer hard stop, USD 200/month Codex subscription budget, USD 300/month
total automation ceiling, and an 80% warning threshold. Cost estimates are
local token-price arithmetic only and do not call external provider APIs.

The approved independent reviewer provider direction is Google-only for now.
`cheap_independent` may be configured to use a Gemini Flash or Flash-Lite class
model such as `gemini-2.5-flash-lite` or `gemini-2.5-flash`, and
`strong_independent` may be configured to use a Gemini Pro class model such as
`gemini-2.5-pro`. `tie_breaker` remains disabled. Claude and OpenAI reviewer
provider wiring is intentionally absent.

Gemini provider configuration is disabled by default in
`runner-config.example.json`. Model names, token prices, and provider profile
names are configurable, but API keys must stay outside the repository. The
runner first reads `GEMINI_API_KEY` from the process environment. An external
env file can be configured only by explicit path under:

```text
/workspace/logs/settleora-auto-runner/secrets/
```

For example, an operator may create
`/workspace/logs/settleora-auto-runner/secrets/reviewer.env` containing
`GEMINI_API_KEY=...` and point the local, uncommitted runner config at that
path. Do not commit live config files from `/workspace/logs/**`, API keys,
`.env` files, authorization headers, or credentials.

Gemini reviewer smoke-test mode is standalone and non-mutating:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --reviewer-smoke-test --config /workspace/logs/settleora-auto-runner/local-gemini-reviewer-config.json
node tools/auto-runner/settleora-auto-runner.mjs --reviewer-smoke-test --live-external-reviewer-calls --config /workspace/logs/settleora-auto-runner/local-gemini-reviewer-config.json
```

The first command performs config, key, budget, tier, and reporting checks
without opting into a live external reviewer call. The second command may make
one tiny Gemini `generateContent` call only when the configured Gemini tier is
enabled, the API key is available from the approved boundary, projected
reviewer spend is below the hard stop, and the estimated smoke cost is below
the tiny smoke cap, defaulting to USD 0.05. The payload is synthetic and asks
for strict JSON only. Output reports provider, model, estimated tokens/cost,
actual usage if returned by Gemini, verdict, elapsed time, and a sanitized
response summary under `/workspace/logs/settleora-auto-runner/reviews/smoke-tests/`.
Missing keys produce `blocked_for_live_smoke_test_key_missing`; that is an
operator setup blocker, not a repo implementation failure.

Integrated Gemini pre-PR review is now wired into the normal runner review
flow before branch push or PR creation. It remains disabled by default because
the built-in `cheap_independent` tier is disabled. When an external,
uncommitted config under `/workspace/logs/settleora-auto-runner/` enables the
Gemini `cheap_independent` tier, the runner requires a passing Gemini verdict
for the first approved low-risk lanes only:

- `workflow-docs-tooling` with changed files under `tools/auto-runner/**`,
  `docs/workflow/**`, or `scripts/ai/**`.
- `docs-planning` with changed files under `docs/planning/**` or
  `docs/qa/**`.

All other lanes, sensitive routes, strong-review routes, huge/cross-domain
routes, unsupported models, missing keys, malformed verdicts, provider
failures, budget failures, accounting failures, and secret-boundary violations
fail closed before PR creation. The integrated Gemini reviewer writes only
sanitized local evidence under
`/workspace/logs/settleora-auto-runner/reviews/integrated/` and sanitized
accounting under
`/workspace/logs/settleora-auto-runner/state/reviewer-accounting.json`. It
does not create GitHub comments, labels, issues, branches, commits, pushes, or
PRs.

External config activation example:

```json
{
  "reviewerTiers": {
    "cheap_independent": {
      "enabled": true,
      "provider": "gemini",
      "providerProfile": "gemini-cheap",
      "command": null,
      "model": "gemini-2.5-flash-lite",
      "inputUsdPerMillionTokens": 0.1,
      "outputUsdPerMillionTokens": 0.4
    }
  },
  "reviewerProviderProfiles": {
    "gemini-cheap": {
      "provider": "gemini",
      "apiKeyEnv": "GEMINI_API_KEY",
      "envFilePath": "/workspace/logs/settleora-auto-runner/secrets/reviewer.env",
      "defaultModel": "gemini-2.5-flash-lite"
    }
  }
}
```

The readiness command does not approve trusted overnight operation, normal
trusted real-run, canary real-run, auto-merge lanes, stale-claim stealing,
follow-up issue creation, review-fix mutation, or systemd enablement. It does
not run Codex implementation or review prompts, change labels, comment on
issues, create/update/merge PRs, create branches, commit, push, request
auto-merge, install/enable systemd units, steal stale claims, or create
follow-up issues.

Low-risk auto-merge foundation:

Auto-merge remains disabled in built-in defaults and in the example config.
The only initial lane candidates are `workflow-docs-tooling` and
`docs-planning`, and a merge can be considered only when an external,
uncommitted config sets `allowAutoMerge: true` and the issue contract sets
`autoMergeEligible: true` plus `manualMergeRequired: false`.

Even then, the runner fails closed unless the changed files exactly match the
issue contract and lane allowlists, integrated Gemini passed when configured,
Codex mechanics review approved, local validation passed, the PR is
open/non-draft/mergeable/clean against `main`, the PR head is the
runner-created commit, the expected `origin/main` base still matches, all
required checks passed on the exact head, review threads are resolved, the PR
ref has no open code-scanning alerts, no blocking comment/review/manual-gate
markers exist, and the issue is still open without stop labels. The merge
method is normal GitHub merge commit only. Sanitized auto-merge evidence is
written under `/workspace/logs/settleora-auto-runner/auto-merge/`.

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

For eligible auto-runner issues, the classifier parses and validates the
contract before applying broad danger-word heuristics. Explicit exclusion
sections such as `## Non-goals`, `## Out of scope`, and
`## Prohibited actions` are treated as negative scope, not implementation
requests. Positive scope text, the title, dangerous contract `allowedPaths`,
malformed contracts, disabled lanes, and manual-gated domains still fail
closed with the normal danger/manual gate outcomes.

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
lanes, caps iterations to `trustedRealRunCanaryMaxIterations` (default `2`),
writes evidence under `/workspace/logs/settleora-auto-runner/canary/`, and
keeps PRs human-review and human-merge only unless the separate bounded
auto-merge canary approval below is active.

Normal canary mode refuses contracts with `autoMergeEligible: true`, requires
`manualMergeRequired: true`, and refuses auto-merge, follow-up issue creation,
stale-claim stealing, review-fix mutation, and systemd enablement. It does not
approve overnight operation and does not install or enable systemd.

Bounded low-risk auto-merge canary mode is narrower than normal canary
approval and requires all of these at once:

- CLI intent: `--run --canary`.
- External, uncommitted config path under the operator-controlled log area.
- `trustedRealRunCanaryApproved: true`.
- `trustedRealRunApproved: false`.
- `lowRiskAutoMergeCanaryApproved: true`.
- `allowAutoMerge: true`.
- `maxIterations` no greater than `2`.
- No stale-claim stealing, follow-up issue creation, review-fix mutation, or
  systemd enablement.

The only accepted auto-merge canary issue contracts are exact-path contracts
for `workflow-docs-tooling` with `tools/auto-runner/**` and `docs/workflow/**`,
or `docs-planning` with `docs/planning/**` and `docs/qa/**`, plus
`autoMergeEligible: true` and `manualMergeRequired: false`. Broader globs,
`scripts/ai/**`, non-docs paths, product/security/storage/money/schema/
OpenAPI/generated-client/Docker/deployment/env/secret/public/admin scope, stop
labels, missing Gemini pass when Gemini is configured, missing Codex mechanics
approval, failing checks, unresolved review threads, PR-ref code-scanning
alerts, stale PR heads, base mismatch, dirty worktrees, and issue-state
mismatches remain blocking gates. This max-2 path exists only to prove the
live auto-merge gates on two bounded low-risk issues after a separate explicit
task creates and runs that canary.

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

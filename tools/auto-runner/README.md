# Settleora Auto-Runner Tooling

This directory contains the DevBox-native unattended Codex auto-runner skeleton.
It is issue-label driven and writes all mutable runtime state under
`/workspace/logs/settleora-auto-runner/`.

Preflight diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --preflight
node tools/auto-runner/settleora-auto-runner.mjs --readiness
```

Local status and control:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --status
node tools/auto-runner/settleora-auto-runner.mjs --status --json
node tools/auto-runner/settleora-auto-runner.mjs --list-runs
node tools/auto-runner/settleora-auto-runner.mjs --list-events --run run-2026-07-10T100439Z
node tools/auto-runner/settleora-auto-runner.mjs --stop-after-current
node tools/auto-runner/settleora-auto-runner.mjs --pause
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-iterations +5
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-prs +5
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-runtime +12h
```

Detached supervisor foundation:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs submit --dry-run --profile default --max-tasks 8 --max-runtime 8h --json
node tools/auto-runner/settleora-auto-runnerctl.mjs status --latest
node tools/auto-runner/settleora-auto-runnerctl.mjs report --latest
node tools/auto-runner/settleora-auto-runnerctl.mjs health --run <supervisor-run-id>
```

The supervisor is an additive wrapper around the existing runner. It writes
immutable run specs and state under
`/workspace/logs/settleora-auto-runner/supervisor/`, using SHA-256 storage keys
for filesystem directories while keeping logical run/profile IDs in JSON
content. Run specs store a logical `profile` and `runnerConfigSha256`, not an
arbitrary config path, and monitoring events are written only to local
owner-only `monitoring-events.jsonl` files. The supervisor starts a
later-installed systemd user-unit instance by validated run ID and exits after
the service is accepted/running. It does not approve broader lanes, install
units, enable linger, deploy monitoring, send outbound webhooks, or run
automatically after reboot. Future TrueNAS monitoring is a pull-health model
over SSH. See
`docs/workflow/AUTONOMOUS_CODEX_RUNNER_SUPERVISOR.md`.

Supervised runs pass a validated `--supervisor-run-id` into the runner. The
runner writes it as sanitized summary metadata, and supervisor status/report/
health use only that exact correlation to resolve the runner JSON/Markdown
summary pair. The supervisor does not choose reports by newest summary time.
If a successful child exits without one unique trusted correlated report, the
supervisor terminal state fails closed and the process exits nonzero.

Status reads the runner lock, active-run state, latest summaries, and local
control file under `/workspace/logs/settleora-auto-runner/`. It reports the
active run id when known, mode/config path, start time, elapsed/max/remaining
runtime, PR/iteration budget and remaining count, completed/merged/failed/
blocked/skipped counts, current or latest issue/PR with head SHA where known,
terminal outcome or stop reason, last event time, summary/log/control paths,
and active control flags. `--json` emits the same sanitized data as JSON,
including `maxPrs`/`completedPrs` aliases for the iteration budget used by
current canary/trusted runner loops. The status surface does not print
environment variables, provider payloads, API keys, authorization headers,
`.env` values, raw Gemini output, raw Codex mechanics output, selected
response payloads, or provider request bodies. New run summaries,
iteration-state JSON, active-run JSON, recent summaries, Markdown summaries,
and list/status/event surfaces persist sanitized metadata and evidence paths
only. Supervised summaries include `supervisorRunId`; existing unsupervised
summaries remain readable without backfill. Raw model output, prompts, stdout/stderr, full diffs, and provider
payloads remain in dedicated local evidence files under
`/workspace/logs/settleora-auto-runner/`. Historical local summary/state files
are not automatically rewritten; readback surfaces sanitize old local files
before displaying or rolling them up.

`--list-runs` reads recent run summaries from
`/workspace/logs/settleora-auto-runner/summaries/`. `--list-events --run
<run-id>` reconstructs ordered issue, branch, PR, review, checks, merge, and
outcome evidence from the existing summary and iteration state where present.
Text and JSON output include branch names, issue/PR numbers, PR head SHAs,
review verdicts, independent AI provider/tier/verdict, local validation
commands, check-wait attempts, merge SHAs, and final outcomes where available.
Missing or partially written evidence is reported as unknown rather than
fabricated.

Control commands write an atomic local control file under
`/workspace/logs/settleora-auto-runner/state/runner-control.json`; this file is
runtime state and must not be committed. The active runner reads it only at
safe boundaries before selecting the next issue. `--pause` and
`--stop-after-current` therefore do not interrupt a mid-commit, mid-review,
mid-check, or mid-merge step. Extensions require explicit bounded syntax:
`--max-iterations +N` and its operator alias `--max-prs +N` accept `+1`
through `+500`, and `--max-runtime +12h` accepts `+1m` through `+14d`.
Extension requests increase only the bounded runner loop budgets at the next
safe boundary before selecting new work; they do not override lane safety,
manual gates, provider budget hard stops, independent-review gates, danger
gates, changed-file policy, checks, code scanning, secrets policy, stop
labels, or max-frequency/safety policy. If no active runner exists, control
commands return a clear non-zero no-active-runner response instead of creating
misleading pending control state.

Operator command card for a future manually approved long run:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --status
node tools/auto-runner/settleora-auto-runner.mjs --status --json
node tools/auto-runner/settleora-auto-runner.mjs --list-runs
node tools/auto-runner/settleora-auto-runner.mjs --list-events --run <run-id>
node tools/auto-runner/settleora-auto-runner.mjs --pause
node tools/auto-runner/settleora-auto-runner.mjs --stop-after-current
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-prs +5
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-runtime +12h
```

`--pause` and `--stop-after-current` are safe-boundary controls only. The
active runner observes them before selecting new work, not mid-PR mutation,
mid-review, mid-check wait, or mid-merge. A `99 PR / 240h` run remains manually
gated and is not approved by this tooling surface.

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
- `client-ui-low-risk` with changed files under `apps/mobile/lib/ui/**` or
  `apps/mobile/test/ui/**`.

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
The low-risk lane candidates are `workflow-docs-tooling`, `docs-planning`,
and the default-off real-code canary lane `client-ui-low-risk`. A merge can be
considered only when an external, uncommitted config sets `allowAutoMerge:
true` and the issue contract sets `autoMergeEligible: true` plus
`manualMergeRequired: false`.

Even then, the runner fails closed unless the changed files exactly match the
issue contract and lane allowlists, Codex mechanics review approved, local
validation passed, the PR is
open/non-draft/mergeable/clean against `main`, the PR head is the
runner-created commit, the expected `origin/main` base still matches, all
required checks passed on the exact head, review threads are resolved, the PR
ref has no open code-scanning alerts, no blocking comment/review/manual-gate
markers exist, and the issue is still open without stop labels. The merge
method is normal GitHub merge commit only. Sanitized auto-merge evidence is
written under `/workspace/logs/settleora-auto-runner/auto-merge/`.

After a successful normal auto-merge, the runner re-reads the linked issue's
current labels and removes only present transient lifecycle labels from this
fixed allowlist: `auto-running`, `auto-claimed`, `auto-pr-opened`, and
`auto-failed`. Durable labels such as area labels, `workflow`, `canary`,
`auto-canary-ready`, priority, day-scope, and project labels are preserved.
Merge success remains authoritative if label cleanup, issue closure, or
post-merge comments fail; cleanup status and failure reasons are recorded in
auto-merge evidence, summaries, and event listings for operator follow-up.
The same merged issue also remains excluded by the current run's attempted set
before the next selection boundary, regardless of cleanup or closure status.
Dry-run mode previews the exact transient labels without mutating GitHub.

Fresh implementation ordering is exact-head-first. After Codex implementation
and local validation, the runner creates a normal local commit containing the
validated files and does not push it. Gemini and Codex mechanics review then
run against that committed `origin/main...HEAD` diff and record the reviewed
head SHA plus the exact changed-file set. Push and PR creation use the same
reviewed commit SHA. If an approved review-fix mode changes files, it creates a
new normal local follow-up commit and reruns exact-head reviews for that new
head; stale evidence from the prior head is not accepted.

For the real-code `client-ui-low-risk` lane, auto-merge additionally requires
a passing independent Gemini review for the exact head and changed-file set.
Runner PR bodies, PR comments, issue comments, summaries, and event listings
use explicit wording such as:

```text
Independent AI review: required; provider/tier: Gemini cheap_independent; verdict: pass; exact head: <sha>; evidence: <sanitized local path>
```

Disabled, skipped, missing, malformed, stale-head, mismatched-file,
provider-failed, or non-pass independent review evidence is reported as
blocked/fail-closed, not as optional or merely unconfigured. Codex mechanics
review is still required but does not replace the independent real-code review
gate. Existing-PR recovery for this lane requires both independent Gemini
evidence and Codex mechanics evidence on the exact PR head.

Codex mechanics review capture is file-backed and attempt-oriented. Each
attempt stores separate sanitized stdout, stderr, prompt, and combined log
metadata; summaries report attempt count, process status/signal, selected
response boundary, parse or contract failure category, final reason, and final
verdict when available. Stdout is primary. Stderr fallback is allowed only when
stdout is empty and stderr contains exactly one valid verdict object. Multiple
verdict objects across stdout/stderr are ambiguous and fail closed. The bounded
retry cap is two total attempts, and retry is limited to process/transport
failures such as missing selected payload or output-transport failure. Valid
`changes_requested`, `needs_tommy`, `danger_gate`, substantive
`unable_to_review`, malformed/ambiguous contract output, scope failures, and
manual/security blockers are not retried into approval.

Auto-merge mergeability is rechecked through a bounded wait loop before
failing closed for refreshable GitHub states. If checks are still pending, or
GitHub reports a refreshable merge state such as `BLOCKED` or `UNKNOWN`, the
runner re-reads PR metadata, exact head SHA, base branch, mergeability, merge
state, checks, review threads, code scanning, issue state, and blocking
comments/reviews before deciding. The default wait is 60 attempts with a
30-second bucketed delay, and config values are normalized to strict safe
bounds rather than passed directly into timers. Wait evidence records attempts,
elapsed wait, pending check names, and whether pending counts decreased. It
still merges only after every existing gate passes on the exact PR head. Stale
heads, wrong bases, failed or cancelled checks, unresolved threads, open
alerts, stop labels, broad changed files, manual markers, or timeout all block
with sanitized evidence.

Integrated Gemini retry is limited to transient provider/transport failures:
HTTP `429`, HTTP `503`/`UNAVAILABLE`, fetch/network failures, and timeout-like
errors. Budget hard stops, per-call caps, missing keys, unsupported models,
malformed verdicts, and non-pass verdicts are terminal and are not retried.
The default is one retry after the initial attempt, with sanitized attempt
evidence in the integrated review report.

Existing-PR recovery is default-off through `allowExistingPrRecovery: false`.
When a future explicit external config enables it for a specific issue/PR, the
runner can evaluate an already-open auto-runner PR instead of creating a new
branch. Recovery requires the low-risk canary contract, an open non-draft PR on
`main`, current PR title/body metadata with exact `#<issue>` linkage, exact
changed files within the issue contract, exact-head validation evidence,
exact-head Gemini and/or Codex mechanics evidence, current successful checks,
clean mergeability, resolved review threads, no PR-ref code-scanning alerts,
no stop labels, no blocking comments/reviews, and the unchanged expected PR
head. Linkage is checked by deterministic text scanning with numeric boundary
safety, so near-misses such as `#8250` or `#0825` do not match `#825`.
Sanitized evidence records which PR text sources were evaluated and matched.
Missing or stale evidence fails closed. If all evidence and terminal gates pass
and only checks are pending or mergeability is refreshable, recovery uses the
same bounded wait loop as normal auto-merge and re-reads PR head, base,
mergeability, checks, review threads, code scanning, issue state, labels,
blocking comments/reviews, and changed-file scope before each attempt.

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

Issue search is advisory only. Before claim or implementation, the runner
live-refreshes each bounded candidate by exact issue number, excludes issue
numbers already attempted in the same run, requires current open/eligible/
non-stopped state, and re-parses the live body contract. Stale or ineligible
candidates are skipped with sanitized events and the next distinct candidate is
considered. The run-scoped attempted set is persisted in active state,
iteration state, summaries, status, and event readbacks; it prevents same-run
reselection after merged, PR-opened, blocked, danger-gated, validation-failed,
review-failed, no-change, or auto-failed outcomes, even when GitHub indexing or
post-merge hygiene lags.

After claim labels are added, the runner re-reads the exact issue and requires
it to remain open, retain the expected current-run claim labels, and not gain a
stop/manual/danger label before branch creation, task generation, or Codex
launch.

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

Positive-scope scanning remains fail-closed. The only context-aware exception
is for validated `client-ui-low-risk` contracts using the exact
`mobile-ui-low-risk` profile, with every contracted path under
`apps/mobile/lib/ui/**` or `apps/mobile/test/ui/**`, when the only detected
danger reason is `money_settlement`. In that case, presentation-only proof
such as accessibility, semantics, visible display text, UI copy, layout/style
only, or read-only shared-widget rendering may suppress the active gate for
financial display nouns such as amount, currency, MoneyText, Payment, or
Balance. The lane decision records bounded evidence with detected danger
reasons, matched presentation proof, matched authority/mutation signals, and
whether the exception was applied; it does not include the full issue body.

The exception does not apply to any other danger category, invalid or missing
contracts, non-`client-ui-low-risk` lanes, broad paths, dangerous path names,
or ambiguous financial-authority wording. Calculation, rounding policy,
currency conversion, exchange-rate/FX behavior, amount entry or persistence,
payment/settlement/refund transitions, split/allocation math, amount-derived
authorization/policy, API/domain/database/storage writes, and settlement,
payment, or billing behavior continue to block as `money_settlement` or the
more specific danger category. Changed-file enforcement, independent review,
CI, security, and auto-merge gates are unchanged.

Initial implementation lanes:

- `workflow-docs-tooling`: `tools/auto-runner/**`, `docs/workflow/**`, and
  `scripts/ai/**`.
- `docs-planning`: `docs/planning/**` and `docs/qa/**`.
- `client-ui-low-risk`: `apps/mobile/lib/ui/**` and
  `apps/mobile/test/ui/**` only, for narrow shared Flutter UI component
  copy/styling and directly tied component tests.

Product/runtime/danger lanes remain disabled or manual-gated placeholders.
The `client-ui-low-risk` lane does not allow auth/session/security,
storage/privacy/authz, money/settlement/payment/bill calculation,
schema/migration, OpenAPI/generated-client, sync/import/export, OCR runtime,
Docker/CI/deployment/env, mobile release/signing, public/admin exposure, broad
`apps/mobile/**`, or generated files.
Auto-merge, stale-claim stealing, follow-up issue creation, review-fix
mutation, trusted overnight real-run operation, and systemd enablement remain
disabled/gated. Review-fix mutation is built as a default-off low-risk
foundation only; built-in config keeps `allowReviewFixMutation: false` and
`maxReviewFixCycles: 0`.

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
Canary mode only accepts contracted `workflow-docs-tooling`, `docs-planning`,
and `client-ui-low-risk` lanes, caps iterations to
`trustedRealRunCanaryMaxIterations` (default `2`), writes evidence under
`/workspace/logs/settleora-auto-runner/canary/`, and keeps PRs human-review
and human-merge only unless the separate bounded auto-merge canary approval
below is active.

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
- No stale-claim stealing, follow-up issue creation, or systemd enablement.
- Review-fix mutation remains off unless a separate explicit low-risk
  approval also sets `allowReviewFixMutation: true` with a positive
  `maxReviewFixCycles`.

The only accepted auto-merge canary issue contracts are non-empty safe subsets
of the approved low-risk prefixes: `workflow-docs-tooling` may use
`tools/auto-runner/**` or `docs/workflow/**`, `docs-planning` may use
`docs/planning/**` or `docs/qa/**`, and `client-ui-low-risk` may use only
`apps/mobile/lib/ui/**` or `apps/mobile/test/ui/**`. Contracts do not need to
list every approved prefix; least-privilege single-file contracts are
preferred for live canaries. They must still set `autoMergeEligible: true`
and `manualMergeRequired: false`. Broad root paths, `**`, `docs/**`,
`apps/mobile/**`, `scripts/ai/**`, generated clients, product/security/
storage/money/schema/OpenAPI/generated-client/Docker/deployment/env/secret/
public/admin scope, stop labels, missing required independent AI review pass,
missing Codex mechanics
approval, missing independent Gemini pass for `client-ui-low-risk`, failing checks, unresolved review threads, PR-ref code-scanning
alerts, stale PR heads, base mismatch, dirty worktrees, and issue-state
mismatches remain blocking gates. This max-2 path exists only to prove the
live auto-merge gates on two bounded low-risk issues after a separate explicit
task creates and runs that canary.

The `client-ui-low-risk` validation profile is fixed in runner source as:
`git status --short`, `git diff --name-only`, `git diff --check`, Flutter
`pub get`, Flutter `analyze`, and
`flutter test test/ui/settleora_component_guardrail_test.dart` from
`apps/mobile`. Issue contracts cannot provide shell commands.

Low-risk review-fix mutation foundation:

Review-fix mutation can only be considered in the same bounded low-risk canary
shape as auto-merge: `--run --canary`, external config,
`trustedRealRunCanaryApproved: true`, `trustedRealRunApproved: false`,
`lowRiskAutoMergeCanaryApproved: true`, `allowAutoMerge: true`,
`allowReviewFixMutation: true`, and a positive `maxReviewFixCycles`. Values
above one are clamped to one attempt. It cannot mix with stale-claim stealing,
follow-up issue creation, systemd enablement, broad trusted real-run approval,
dangerous lanes, stop labels, broad root paths, `**`, `docs/**`, traversal,
generated clients, secrets/env files, product/runtime/API/auth/session/
security/storage/privacy/money/settlement/schema/OpenAPI/Docker/deployment/
public/admin/mobile/OCR/sync/import/export/backup/restore scope, or files
outside the issue contract.

The trigger must be structured and actionable: integrated Gemini must return a
bounded strict-JSON blocking finding, or Codex mechanics review must return
`changes_requested` with `recommended_next_action: "run_safe_fix_cycle"` and
blocking findings. Malformed review output, provider/accounting/key failures,
unsupported models, budget hard stops, non-actionable findings, code scanning,
GitHub checks, unresolved review threads, manual blocker comments, dirty or
stale branch/base/head state, and dangerous paths fail closed without a fix.

When a fix attempt is allowed, the prompt includes only sanitized finding
summaries and the issue contract authority, restricts Codex to the current
branch and exact `allowedPaths`, and prohibits unrelated cleanup, broad
refactors, generated-client edits, secrets/env files, product/runtime/security/
money/schema/OpenAPI changes, pushes, PR updates, GitHub comments, merges,
branch deletion, and live provider calls. After the attempt, the runner reruns
changed-file policy checks, local validation, integrated Gemini when
configured, and Codex mechanics review. Evidence is written only under
`/workspace/logs/settleora-auto-runner/review-fix/`.

For the post-fix Codex mechanics review, the runner writes a dedicated
`post-review-fix-mechanics` review package. That package marks the initial
implementation report as `pre_fix_report` and stale background, includes the
structured finding that triggered the fix, the review-fix decision, changed
files before/after, post-fix validation results, and the final integrated
review or fixture pass status. The runner fails closed before mechanics review
if that post-fix evidence is missing, malformed, or not tied to the current
issue, head, or changed-file list.

Review-fix canary fixture:

A deterministic review-fix canary fixture exists only for a future one-issue
live canary. It is disabled by default and has no effect on normal Gemini or
Codex mechanics review. To use it, an external uncommitted config must enable
`reviewFixCanaryFixture.enabled`, provide a bounded single-line `marker` such
as `review-fix-cycle: completed`, and invoke the runner with the same
`--run --canary`, low-risk auto-merge canary, and review-fix mutation approval
shape above.

In fixture mode, the runner does not call Gemini for the integrated review
source. It checks only the changed low-risk issue-contract files for the exact
configured marker, writes sanitized evidence under
`/workspace/logs/settleora-auto-runner/review-fix/`, returns a structured
actionable finding when the marker is absent, and returns pass only after the
marker is present. The fixture still refuses broad paths, dangerous paths,
missing validation, non-auto-merge contracts, non-canary real-runs, broad
trusted real-run approval, and disabled review-fix mutation.

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
Successful auto-merge performs the post-merge transient-label cleanup above;
it does not remove stop/manual labels before merge to bypass gates.

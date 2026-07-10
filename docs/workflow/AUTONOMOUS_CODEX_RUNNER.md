# Autonomous Codex Runner

## Purpose

The DevBox-native auto-runner is a Settleora repo tool because its policy has
to track Settleora architecture boundaries, validation commands, issue labels,
and task prompt rules as they evolve. Keeping the source in this repo lets the
runner change through normal PR review while runtime logs, locks, prompts,
Codex output, review packages, summaries, and local report copies stay outside
the repo at `/workspace/logs/settleora-auto-runner/`.

This is not a Windows start-one-task wrapper. Tommy should be able to launch one
bounded DevBox process and let it process multiple eligible issues until it hits
`--max-iterations`, `--max-runtime`, no eligible work, or a systemic unsafe
condition.

## Relationship To Existing Automation

Manual Windows helper scripts such as `Start-SettleoraCodexTask.ps1` and
`Get-SettleoraCodexReport.ps1` were not present in the repository or working
tree during this implementation. This runner therefore documents the intended
DevBox behavior directly instead of depending on those scripts.

`scripts/ai/v3-controller.mjs` remains the milestone queue controller for
`.ai/task-queue.json` work into `ai/integration`. The auto-runner complements
it rather than replacing it: it polls GitHub issues labeled for automation,
branches from latest `origin/main`, generates issue-specific Codex prompts, and
prepares PRs for human review. It reuses the V3 controller's proven ideas:
single-checkout locking, DevBox-local `codex-vm-full` invocation, external log
roots, no empty commits, explicit stop reasons, and hard gates for unsafe
domains.

## Runtime Boundary

Repository source lives under `tools/auto-runner/` and this document. Runtime
artifacts live under `/workspace/logs/settleora-auto-runner/`:

- `locks/` prevents concurrent runner instances.
- `state/` records per-iteration claim and outcome state.
- `tasks/` stores generated Codex task prompts.
- `codex-runs/` stores full implementation Codex stdout/stderr.
- `reviews/` stores pre-PR review packages, prompts, and review logs.
- `reports/` stores copied local Codex reports.
- `summaries/` stores per-run JSON/Markdown and recent rollups.
- `auto-merge/` stores sanitized low-risk auto-merge decision evidence.
- `canary/` stores trusted-real-run canary evidence JSON for dry-run fixture
  exercises and any future manually approved canary real-run.
- `readiness/` stores report-only overnight readiness preflight JSON and
  Markdown.

Stale locks are removed only when the recorded PID is no longer active. Active
or unparsable locks stop the runner for human inspection.

## Status And Local Control

The local status surface is:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --status
node tools/auto-runner/settleora-auto-runner.mjs --status --json
```

It reads the lock, active-run state, latest summaries, and the local control
file. Output reports whether a runner appears active, active run id, mode and
config path, started time, elapsed/max/remaining runtime, PR/iteration budget
and remaining count, completed/merged/failed/blocked/skipped counts, current
or latest issue and PR with head SHA where known, terminal outcome or stop
reason, last event time, summary/report/log paths, and active control flags.
`--json` also exposes `maxPrs`, `completedPrs`, and `estimatedRemainingPrs`
aliases for the same iteration budget used by current canary/trusted runner
loops. It must remain sanitized: no provider payloads, raw Gemini output,
raw Codex mechanics output, provider request/response bodies, environment
variables, API keys, authorization headers, `.env` values, or secrets. Run
summaries, iteration state, active-run state, recent summaries, and event
listings persist sanitized metadata plus evidence paths only. Raw model
output, selected response payloads, prompts, stdout/stderr, full diffs, and
provider payloads belong in dedicated local evidence files under the approved
`/workspace/logs/settleora-auto-runner/` subdirectories. Historical local
summary/state files are operator-controlled evidence and are not
automatically rewritten by newer runner versions; new readback surfaces
sanitize old files before re-emitting them.

Recent run and event inspection is local and read-only:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --list-runs
node tools/auto-runner/settleora-auto-runner.mjs --list-events --run <run-id>
```

Run listing reads `/workspace/logs/settleora-auto-runner/summaries/`. Event
listing reconstructs issue, branch, PR, review, checks, merge/failure, and
outcome evidence from existing summary/state/evidence files where available.
It includes issue numbers, PR numbers, branch names, head SHAs, review
verdicts, independent AI provider/tier/verdict, validation commands,
check-wait attempts, merge SHAs, and final outcomes where recoverable. Missing
or partially written evidence is `unknown`, not inferred.

Safe local control is file-based under
`/workspace/logs/settleora-auto-runner/state/runner-control.json`:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --stop-after-current
node tools/auto-runner/settleora-auto-runner.mjs --pause
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-iterations +N
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-prs +N
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-runtime +12h
```

The runner observes control only at safe boundaries before selecting new work.
It does not pause or stop mid-commit, mid-review, mid-check wait, or mid-merge.
Extensions are explicit and bounded, and they increase only loop budgets. They
do not override lane safety, manual gates, danger gates, provider budget hard
stops, independent-review gates, changed-file policy, checks, code scanning,
secrets policy, stop labels, auto-merge gates, or max-frequency/safety policy.
If no active runner exists, control commands fail gracefully without writing a
misleading pending control state.

Operator command card for a future manually approved long-running run:

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

The current budget is still stored internally as iterations because each
selected issue can stop as blocked, failed, skipped, PR-opened, or merged. In
canary/trusted operator language `--max-prs` is a documented alias for that
same completed PR/iteration loop budget. A `99 PR / 240h` run remains manually
gated and is not approved by this operator surface.

## Overnight Readiness Preflight

The report-only readiness command is:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --readiness
```

`--preflight` remains an alias-compatible diagnostic path; `--readiness` is the
preferred spelling when checking whether the DevBox is safe to consider for a
future overnight approval. The command writes machine-readable JSON and
human-readable Markdown under:

```text
/workspace/logs/settleora-auto-runner/readiness/
```

It also prints a concise pass/warn/fail summary to stderr and the full JSON
object to stdout. `pass` means the checked condition matched the conservative
readiness expectation. `warn` means the operator should inspect the condition
before trusting unattended operation, but the check did not prove an unsafe
configuration. `fail` means the current state is not suitable for unattended
operation.

The readiness preflight checks repository existence, clean worktree state,
`origin/main` reachability, local `HEAD` relation to `origin/main`, GitHub
authentication and repository reachability, #800/#805 state, eligible issue
searches using simple per-label queries, trusted real-run refusal, separate
canary approval state, risky gate defaults, active claim labels, stale-claim
stealing posture, active `auto-pr-opened` issues, open auto-runner PRs, Codex
command resolution without invocation, Node version, log write sanity, and
disk-space sanity.

The readiness command does not approve trusted overnight operation. It does not
install or enable systemd units, run Codex implementation or review prompts,
create branches, commit, push, open/update/merge PRs, request auto-merge,
change labels, comment on issues, steal stale claims, create follow-up issues,
or run review-fix mutation. `allowAutoMerge`,
`allowFollowupIssueCreation`, `allowStaleClaimSteal`,
`allowReviewFixMutation`, and `allowSystemdEnablement` remain false by
default. Enabling any of them is reported as `fail` unless a future explicit
approval flag and documentation are added.

The readiness output also reports the reviewer-tier and reviewer-budget
configuration without exposing command strings or secrets. Missing accounting
state means current reviewer spend is treated as USD 0. If accounting is added
by a future approved slice, it must live under
`/workspace/logs/settleora-auto-runner/state/`, not committed repository
paths.

## Low-Risk Auto-Merge Wait And Recovery Evidence

Low-risk canary auto-merge keeps fail-closed semantics while waiting long
enough for normal GitHub check latency. The default bounded wait is 60
attempts with a 30-second delay bucket, giving slow ordinary validation checks
up to 30 minutes before the runner fails closed. External config values are
normalized to fixed safe bounds and delay buckets, with a hard cap of 60
attempts, so operator-provided values are not passed directly into timers.

Every wait attempt rechecks the exact PR head, base, mergeability, merge state,
checks, review threads, code scanning, issue state, changed-file scope, and
blocking labels/comments/reviews. Pending or refreshable merge states can be
retried. Stale heads or bases, failed or cancelled checks, unresolved threads,
open code-scanning alerts, stop labels, changed files outside the contract, or
manual blockers remain terminal blockers. Sanitized evidence records each
attempt, elapsed wait, pending check names, final outcome, and whether pending
check counts were decreasing.

Existing-PR recovery is default-off and only applies when an external config
names the issue/PR. The recovery inspection reads current PR metadata,
including title and body, then passes sanitized issue-linkage evidence into the
decision. A PR is linked only when current PR title or body contains the exact
`#<issue>` reference with numeric boundary safety. Near-misses such as
`#8250`, `#0825`, embedded token text, or regex-looking text do not match.
Missing title/body evidence, stale exact-head evidence, broad changed files,
unresolved review threads, open PR-ref code-scanning alerts, issue stop labels,
manual blockers, failed checks, or missing exact-head validation/review
evidence all fail closed. When all recovery evidence and terminal gates pass
and only required checks are pending or mergeability is in a refreshable state,
existing-PR recovery enters the same bounded wait loop as normal auto-merge
instead of requiring a second operator invocation.

Fresh implementation runs create the runner-owned commit locally before any
independent Gemini or Codex mechanics review runs. That local commit stays
unpushed until local validation and both required reviews pass. Review packages
use the committed `origin/main...HEAD` diff, record the reviewed commit SHA and
exact changed-file set, and the later push/PR step must use that same SHA. If a
review-fix mode is separately approved and changes files, the runner creates a
new normal local follow-up commit and reruns exact-head reviews for the new
head; old evidence cannot authorize the new commit. Stale, missing-head, or
changed-file-mismatched review evidence fails closed.

Codex mechanics review evidence is machine-readable. Each attempt records
status, signal, selected response boundary, parse/contract diagnostics, final
verdict when present, sanitized prompt/log paths, reviewed head, and changed
files. Reviewer stdout is the primary response boundary. If stdout is empty,
stderr may be selected only when it contains exactly one valid verdict object;
multiple verdict objects across stdout/stderr are ambiguous and fail closed.
The runner captures stdout/stderr through files to avoid buffered-output
transport failures. A bounded retry, capped at two total attempts, is reserved
for process/transport categories such as missing selected payload or launch
transport failure. Valid non-approve verdicts, ambiguous output, malformed
contract output, scope/policy failures, manual/security blockers, and
substantive `unable_to_review` verdicts are not retried into approval.

For `client-ui-low-risk` and any future real-code auto-merge lane,
independent review evidence must be unambiguous in PR bodies, PR comments,
issue comments, summaries, and event listings:

```text
Independent AI review: required; provider/tier: Gemini cheap_independent; verdict: pass; exact head: <sha>; evidence: <sanitized local path>
```

Disabled, skipped, missing, malformed, stale-head, mismatched-file,
provider-failed, or non-pass independent review evidence is reported as
blocked/fail-closed. The runner must not describe required real-code
independent review as optional wording such as `Gemini when configured`, and
must not post raw Gemini output to GitHub.

Positive-scope danger scanning also stays fail-closed before implementation.
Validated `client-ui-low-risk` contracts may use financial-domain display
nouns only through a narrow presentation-only proof. The exception is
available solely when the contract is valid, the lane is exactly
`client-ui-low-risk`, the validation profile is exactly
`mobile-ui-low-risk`, every contracted path remains within the lane manifest
and under `apps/mobile/lib/ui/**` or `apps/mobile/test/ui/**`, and the only
detected danger reason is `money_settlement`. The positive scope must contain
explicit presentation proof such as accessibility, semantics, visible display
text, UI copy, layout/style-only behavior, or read-only shared-widget
rendering, and must contain no money-authority or mutation signal.

Money authority and mutation still block. This includes arithmetic,
calculation, rounding or precision policy, currency conversion, exchange
rates/FX, amount entry or persistence, payment/settlement/refund transitions,
balance/debt/owed mutations, split/allocation math, amount-derived
authorization or policy, API/domain/database/storage writes, and settlement,
payment, or billing behavior. Multiple danger reasons, auth/security,
storage/privacy, schema, OpenAPI/generated-client, sync/import/export,
deployment, secrets, public/admin exposure, release, destructive, branch, or
architecture danger cannot use the exception. The lane decision records
bounded sanitized classifier evidence and does not emit full issue bodies.

## Reviewer Tier And Budget Policy

Reviewer routing is a disabled-by-default policy foundation. Codex remains the
implementation engine, and the legacy `reviewerCommand` behavior is preserved
unless a future approved config explicitly enables a separate provider tier.
The built-in tier names are:

- `cheap_independent`
- `strong_independent`
- `tie_breaker`
- `codex_mechanics`

External independent tiers are unconfigured and disabled by default. Tier
configuration may name a provider profile, command, model, and token prices,
but repository source must not contain provider API keys, tokens, `.env`
values, or personal credentials. Readiness and review-package summaries report
only sanitized provider profile names, whether a command is configured, model
names, and token-price numbers.

The first approved provider profile direction is Google-only. When explicitly
configured outside the repository, `cheap_independent` should use a Gemini
Flash or Flash-Lite class model such as `gemini-2.5-flash-lite` or
`gemini-2.5-flash` for routine PRs, and `strong_independent` should use a
Gemini Pro class model such as `gemini-2.5-pro` for risky, large, or sensitive
PRs. `tie_breaker` remains disabled. This policy does not add or approve
Claude or OpenAI reviewer provider wiring.

Gemini API keys must be supplied from the process environment as
`GEMINI_API_KEY` or from an explicitly configured external env file under
`/workspace/logs/settleora-auto-runner/secrets/`, such as
`/workspace/logs/settleora-auto-runner/secrets/reviewer.env`. The repository
must not store live provider config from `/workspace/logs/**`, API keys,
authorization headers, `.env` files, or secrets.

The Gemini smoke-test command is standalone and non-mutating:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --reviewer-smoke-test --config /workspace/logs/settleora-auto-runner/local-gemini-reviewer-config.json
node tools/auto-runner/settleora-auto-runner.mjs --reviewer-smoke-test --live-external-reviewer-calls --config /workspace/logs/settleora-auto-runner/local-gemini-reviewer-config.json
```

It does not run Codex implementation, create branches, commit, push, open or
update PRs, mutate labels, comment on issues, merge, enable canary/real-run,
enable auto-merge, enable stale-claim stealing, enable follow-up issue
creation, enable review-fix mutation, or install/enable systemd. With the live
flag, it may make one tiny Gemini call only if the API key is available through
the approved secret boundary, projected reviewer spend stays below the hard
stop, and the estimated smoke cost stays below the tiny cap. Missing keys are
reported as `blocked_for_live_smoke_test_key_missing` rather than leaking
environment details.

The first integrated Gemini reviewer gate runs inside the normal pre-PR review
flow before branch push or PR creation, but only when external config enables
the Gemini `cheap_independent` tier. Built-in defaults keep that tier disabled.
When enabled, the integrated gate is limited to low-risk
`workflow-docs-tooling`, `docs-planning`, and `client-ui-low-risk` work:

- `workflow-docs-tooling`: `tools/auto-runner/**`, `docs/workflow/**`, and
  `scripts/ai/**`.
- `docs-planning`: `docs/planning/**` and `docs/qa/**`.
- `client-ui-low-risk`: `apps/mobile/lib/ui/**` and
  `apps/mobile/test/ui/**`.

The gate reuses the reviewer routing and budget policy. It requires an
explicit strict-JSON Gemini pass verdict before PR creation, writes sanitized
local evidence under
`/workspace/logs/settleora-auto-runner/reviews/integrated/`, and records
sanitized accounting under
`/workspace/logs/settleora-auto-runner/state/reviewer-accounting.json`.
Missing keys, unsupported or host-like model values, malformed or ambiguous
verdicts, non-pass verdicts, provider failures, budget hard stops, per-call
cap failures, malformed accounting, accounting write failures, disallowed
lanes/paths, secret-boundary risks, strong-review routes, and
`block_split_or_escalate` routes fail closed before PR creation. The Gemini
reviewer itself does not mutate GitHub and does not post comments.

The default reviewer budget policy assumes the Codex subscription is already
about USD 200/month and leaves normal reviewer budget at USD 80/month, with a
USD 95/month reviewer hard stop inside a USD 300/month total automation ceiling:

```json
{
  "reviewerBudget": {
    "monthlyReviewerBudgetUsd": 80,
    "monthlyReviewerHardStopUsd": 95,
    "totalMonthlyAutomationBudgetUsd": 300,
    "codexSubscriptionBudgetUsd": 200,
    "warnAtPercent": 80
  }
}
```

Cost estimates are local arithmetic only:

```text
(estimated input tokens / 1,000,000 * input USD per million tokens)
+ (estimated output tokens / 1,000,000 * output USD per million tokens)
```

The runner does not call external provider billing APIs. Budget checks warn at
the configured percentage of the normal reviewer budget and block when the
projected reviewer spend exceeds the hard stop.

Transient integrated Gemini/provider failures are retried only for bounded
transport or provider availability cases: HTTP `429`, HTTP `503` or
`UNAVAILABLE`, fetch/network failures, and timeout-style errors. The default
is one retry after the initial attempt. Non-pass verdicts, malformed verdicts,
missing keys, unsupported models, per-call caps, monthly hard stops,
accounting failures, and secret-boundary failures are terminal and are not
retried as transient provider errors.

Deterministic routing uses changed paths, lane, changed-file count, estimated
additions/deletions when known, and broad domain count:

- Docs-only, ledger, and workflow docs route to `cheap_independent`.
- Auto-runner tooling routes to `cheap_independent`, escalating to
  `strong_independent` when large or sensitive.
- Normal app feature work routes to `cheap_independent` by default,
  escalating to `strong_independent` when large or risky.
- Auth/security/storage/privacy/money/schema/OpenAPI/generated-client paths
  require `strong_independent` review.
- Huge or cross-domain PRs route to `block_split_or_escalate` unless a future
  explicit large-bundle lane is approved.

This policy does not approve real canary runs, normal trusted real-runs,
overnight operation, auto-merge lanes, stale-claim stealing, follow-up issue
creation, review-fix mutation, or systemd enablement.

## Label Contract

Eligible issue labels:

- `auto-ready`
- `auto-bundle`

Configured eligible labels are polled with one simple GitHub issue search per
label, such as `repo:tommytang213/Settleora is:issue is:open label:auto-ready`.
Results from multiple labels are aggregated and deduplicated by issue number.
Dedicated canary configs may set `eligibleLabels` to only
`auto-canary-ready`; the runner still requires the body-level contract before
implementation.

Default stop labels:

- `needs-tommy`
- `manual-gate`
- `danger-gate`
- `auto-failed`
- `auto-running`
- `auto-pr-opened`
- `blocked`

Real-run claim behavior adds `auto-claimed` and `auto-running`, then posts a
bounded claim comment. Both labels are active in-flight claim labels, not
durable terminal labels. The runner re-reads and records claim state locally so
a later stale-claim policy can be implemented. Stale-claim stealing is disabled
by default and must stay disabled unless config explicitly allows it.

Terminal real-run outcomes always remove `auto-running` and `auto-claimed`.
`approved_pr_opened` adds `auto-pr-opened`, which is also a stop label so the
issue is not selected again while a PR is pending. `blocked_needs_tommy` adds
`needs-tommy`, `danger_gate` adds `danger-gate`, and `auto_failed`,
`validation_failed`, and `review_changes_requested_retry_exhausted` add
`auto-failed`. `no_changes` removes both active claim labels and comments the
outcome without closing the issue. The runner never closes issues
automatically.

Dry-run mode previews the exact label add/remove/comment operations instead of
calling `gh issue edit`, `gh issue comment`, or `gh issue create`.

`auto-bundle` means the issue may intentionally split into multiple prompts,
branches, or follow-up issues in a future lane policy. Each implementation
branch still has to stay reviewable.

## Issue Contract

`auto-ready` and `auto-bundle` are eligibility signals only. They do not
authorize implementation, path scope, validation commands, PR creation, or
merge behavior.

Every issue that the runner may implement must include a body-level contract:

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

The first supported contract version is `1`. The contract is parsed from the
issue body only. Issue comments do not override the contract in this slice.

The parser fails closed for a missing contract, malformed JSON, missing fields,
unknown fields, unsupported contract version, unsupported lane, unsupported
validation profile, or contract `allowedPaths` outside the lane manifest. In
real-run these cases become a safe blocked outcome such as
`blocked_needs_tommy`; in dry-run the same outcome is previewed without GitHub
mutation.

Issue text cannot provide shell commands. It can only name a
`validationProfile`, and that profile must exist in trusted runner code.

## Lane Policy

Auto-merge is disabled globally by default. Real mutation requires `--run`.
Lane classification is contract-first and backed by a trusted lane manifest in
`tools/auto-runner/lib/lane-policy.mjs`. Text heuristics may still force
danger/manual gates, but they never authorize implementation or allowed paths.
For eligible auto-runner issues, explicit exclusion sections such as
`Non-goals`, `Out of scope`, and `Prohibited actions` are treated as negative
scope rather than positive implementation requests. Positive scope text,
dangerous `allowedPaths`, malformed contracts, disabled lanes, and
manual-gated domains still fail closed.

Implemented lanes:

- `workflow-docs-tooling`: implementation and PR creation are allowed after
  validation and pre-PR review. Allowed paths are limited to
  `tools/auto-runner/**`, `docs/workflow/**`, and `scripts/ai/**`.
  Auto-merge is disabled by default and can only be attempted when external
  config and the issue contract explicitly opt into the low-risk lane gates.
  Follow-up issue creation remains disabled. Review-fix mutation remains
  disabled by default and can only be considered through the separate
  low-risk foundation below.
- `docs-planning`: implementation and PR creation are allowed for planning and
  QA/reporting docs under `docs/planning/**` and `docs/qa/**`. Auto-merge is
  disabled by default and can only be attempted through the same low-risk lane
  gates. Follow-up issue creation remains disabled. Review-fix mutation
  remains disabled by default and can only be considered through the separate
  low-risk foundation below.
- `client-ui-low-risk`: implementation and PR creation are allowed only for
  narrow shared Flutter UI component copy/styling and directly tied component
  tests under `apps/mobile/lib/ui/**` and `apps/mobile/test/ui/**`. Auto-merge
  is disabled by default and can only be attempted through the bounded canary
  low-risk lane gates. Follow-up issue creation and review-fix mutation remain
  disabled for this lane.

Disabled/manual-gated placeholder lanes exist for product runtime,
security runtime, storage/privacy, money/settlement, schema/migrations,
OpenAPI/generated clients, and deployment/CI/env scope.

The contract `allowedPaths` must be a subset of the lane manifest allowlist.
PR creation is blocked if any changed file is outside either the contract
allowlist or the lane allowlist. Generic words such as `config` do not by
themselves trigger the secrets/config danger gate, but auth config, security
config, deployment config, `.env`, secrets, credentials, SSH, and token-storage
work remain gated.

The runner must label/comment `danger-gate` or `needs-tommy` instead of
implementing unattended work for auth/session/security, storage/file
privacy/authz, money/settlement/bill calculation, schema/migrations,
OpenAPI/generated clients, sync/restore/import/export, Docker/CI/deploy,
secrets/config, public/admin exposure, mobile store release, production deploy,
destructive operations, branch deletion/cleanup, force-like history changes, or
architecture replacement.

AI review cannot clear these gates.

## Trusted Real-Run Canary Policy

Normal `--run` is not trusted by default. It is refused before issue polling,
claiming, branch creation, or GitHub mutation unless config explicitly sets
`trustedRealRunApproved: true` and all trusted mutation toggles remain disabled.

Canary real-run is a separate narrower approval path for a future manually
approved live test. It requires both CLI intent (`--canary` or
`--trusted-real-run-canary`) and config approval
(`trustedRealRunCanaryApproved: true`). Canary dry-run may be used with local
fixtures to exercise policy and evidence writing without GitHub mutation.

Canary mode is limited to contracted issues in these manifest lanes:

- `workflow-docs-tooling`
- `docs-planning`
- `client-ui-low-risk`

Normal canary mode refuses product/runtime/danger placeholder lanes, contracts
with `autoMergeEligible: true`, contracts with `manualMergeRequired: false`,
auto-merge, follow-up issue creation, stale-claim stealing, review-fix
mutation, and systemd enablement. Canary iteration count is capped by
`trustedRealRunCanaryMaxIterations`, defaulting to `2`.

Canary tasks still run scoped validation and the separate pre-PR AI review gate
before any PR creation. Canary PRs are human-review and human-merge only. This
policy does not approve overnight operation, follow-up issue creation,
stale-claim stealing, review-fix mutation, or systemd service/timer
installation or enablement.

A bounded low-risk auto-merge canary is a separate explicit approval mode, not
a normal canary default. It is allowed only when an external, uncommitted
config sets `trustedRealRunCanaryApproved: true`,
`trustedRealRunApproved: false`, `lowRiskAutoMergeCanaryApproved: true`, and
`allowAutoMerge: true`, the runner is invoked with `--run --canary`, and the
requested max iteration count is no greater than `2`. This max-2 path exists
only to prove the live low-risk auto-merge gates in a separate task; it does
not approve overnight operation or broader unattended operation.

The auto-merge canary accepts only issue-contract `allowedPaths` that are
non-empty safe subsets of these approved low-risk lane prefixes:

- `workflow-docs-tooling`: `tools/auto-runner/**` and `docs/workflow/**`.
- `docs-planning`: `docs/planning/**` and `docs/qa/**`.
- `client-ui-low-risk`: `apps/mobile/lib/ui/**` and
  `apps/mobile/test/ui/**`.

Contracts do not need to list every approved lane prefix. Least-privilege
single-file contracts are preferred for live canary issues, for example
`docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md` or
`docs/planning/ISSUE_PROGRESS_LEDGER.md`, as long as every entry is under one
of the approved prefixes. Those contracts must set `autoMergeEligible: true`
and `manualMergeRequired: false`. Broad root paths, `**`, `docs/**`,
`apps/mobile/**`, `scripts/ai/**`, generated clients, product/security/
storage/money/schema/OpenAPI/generated-client/Docker/deployment/env/secret/
public/admin scope, stop labels, missing Gemini pass when Gemini is
configured, missing Codex mechanics
approval, failing or mismatched-head checks, unresolved review threads, PR-ref
code-scanning alerts, stale PR heads, base mismatch, dirty worktree, and
issue-state mismatches all remain fail-closed gates.

The `client-ui-low-risk` validation profile is fixed in runner source and
runs `git status --short`, `git diff --name-only`, `git diff --check`,
Flutter `pub get`, Flutter `analyze`, and
`flutter test test/ui/settleora_component_guardrail_test.dart` from
`apps/mobile`. Issue contracts cannot provide shell commands or substitute a
broader mobile validation profile.

Canary evidence is written under:

```text
/workspace/logs/settleora-auto-runner/canary/
```

Each evidence JSON records the selected mode, issue number/title/labels/url,
the parsed contract, lane decision, canary policy decision, changed files,
validation results, review verdict, PR URL when available, and terminal
outcome.

Checkpoint: after the #818/#820 canary completed, a normal trusted real-run
pilot exercised the integrated Gemini pre-PR gate through the DevBox
auto-runner path for a low-risk workflow-docs task. This was a bounded pilot
only; it did not approve overnight operation, auto-merge, stale-claim stealing,
follow-up issue creation, review-fix mutation, or systemd enablement.

## Low-Risk Review-Fix Mutation Foundation

Review-fix mutation remains disabled in built-in defaults:
`allowReviewFixMutation: false` and `maxReviewFixCycles: 0`. Pathological
external values are normalized to a safe maximum of one attempt. A fix attempt
requires an external, uncommitted config path and the bounded low-risk canary
approval shape: `--run --canary`, `trustedRealRunCanaryApproved: true`,
`trustedRealRunApproved: false`, `lowRiskAutoMergeCanaryApproved: true`,
`allowAutoMerge: true`, `allowReviewFixMutation: true`, and
`maxReviewFixCycles` greater than zero. It cannot be mixed with stale-claim
stealing, follow-up issue creation, systemd enablement, or broad trusted
real-run approval.

The first eligible lanes are only `workflow-docs-tooling` and `docs-planning`.
The issue contract must set `autoMergeEligible: true` and
`manualMergeRequired: false`, and changed files must remain inside the exact
contract `allowedPaths` plus low-risk lane prefixes. Broad root paths, `**`,
`docs/**`, traversal, generated clients, `scripts/ai/**`, product/runtime,
API, auth/session/security, storage/privacy, money/settlement, schema/
migration, OpenAPI/generated-client, Docker/deployment/env/secret, public/
admin, mobile, OCR, sync, import/export, backup/restore, stop labels, dirty or
stale branches, and missing local validation remain fail-closed blockers.

A review-fix attempt is considered only after local validation has passed and a
structured actionable review result blocks PR creation: either integrated
Gemini returns a strict JSON non-pass finding with bounded findings, or Codex
mechanics review returns `changes_requested` with
`recommended_next_action: "run_safe_fix_cycle"` and bounded blocking findings.
Malformed reviewer output, missing output, provider/accounting/secret-boundary
failures, unsupported models, budget hard stops, non-actionable findings,
GitHub checks/code-scanning/review-thread failures, manual blocker comments,
and dangerous lane/path/scope do not trigger mutation.

The fix prompt uses the issue contract as authority, includes only sanitized
finding summaries, restricts Codex to the existing branch and exact
`allowedPaths`, and prohibits broad refactors, unrelated cleanup, generated
client edits, secrets/env files, product/runtime/security/money/schema/
OpenAPI changes, pushes, PR updates, GitHub comments, merges, branch deletion,
and live provider calls. The runner still owns explicit-path staging; no
`git add .` rule is relaxed.

After a fix attempt, the runner rechecks changed files against the contract,
reruns local validation, reruns any required or active integrated independent
review gate, reruns Codex mechanics review, and fails closed if any review
remains blocking. Sanitized
attempt evidence is written under:

```text
/workspace/logs/settleora-auto-runner/review-fix/
```

Evidence records issue/lane, branch and SHA context, changed files before and
after, reviewer source, sanitized findings, validation and review before/after,
whether a fix attempt happened, stop reason, whether PR/merge eligibility
continued, and a secret-boundary confirmation. Provider payloads, tokens,
`reviewer.env` values, authorization headers, raw local config data, and
secrets must not be logged, prompted, commented, or committed.

Post-fix Codex mechanics review receives a dedicated
`post-review-fix-mechanics` package. That package labels the initial
implementation report as `pre_fix_report` and stale background only, then
provides the structured finding that triggered the fix, the review-fix
decision, changed files before/after, post-fix validation, final integrated
review or fixture pass status, and current authoritative status. Missing,
malformed, stale-head, wrong-issue, or wrong-file post-fix evidence fails
closed before mechanics review.

### Deterministic Review-Fix Canary Fixture

The review-fix canary fixture is a local deterministic review source for a
future one-issue live canary. It is disabled in built-in config and requires
external, uncommitted config. It is accepted only with `--run --canary`, the
trusted real-run canary approval, broad trusted real-run disabled, low-risk
auto-merge canary approval, `allowAutoMerge: true`, review-fix mutation
enabled, and a positive review-fix cycle count clamped to one.

The fixture is restricted to `workflow-docs-tooling` and `docs-planning`
contracts with `autoMergeEligible: true`, `manualMergeRequired: false`, and
non-empty exact `allowedPaths` under the approved low-risk canary prefixes. It
refuses broad paths, dangerous product/runtime/API/auth/session/security/
storage/privacy/money/settlement/schema/migration/OpenAPI/generated-client/
Docker/deployment/env/secret/public/admin/mobile/OCR/sync/import/export/
backup/restore paths, missing validation, stop-label scopes, and malformed
fixture config.

When enabled, the fixture replaces only the integrated reviewer source for that
explicit canary mode; normal Gemini and Codex mechanics review paths are
unchanged when it is disabled. It scans the changed allowed files for the exact
configured marker, for example `review-fix-cycle: completed`. If absent, it
returns the same structured actionable failure shape consumed by the
review-fix loop. If present after the fix cycle, it returns a pass verdict.
Sanitized fixture evidence is written under:

```text
/workspace/logs/settleora-auto-runner/review-fix/
```

Fixture evidence includes fixture mode, issue number, lane, allowed paths,
reviewed head, marker identifier, finding count, and pre/post-fix phase. It
does not include raw provider payloads, secrets, local config bodies, or raw
marker values.

## Low-Risk Auto-Merge Foundation

Auto-merge remains disabled in built-in defaults. A normal trusted run may only
evaluate a low-risk auto-merge when external, uncommitted config sets
`allowAutoMerge: true` and the issue contract sets
`autoMergeEligible: true` with `manualMergeRequired: false`. A canary trusted
run also requires `lowRiskAutoMergeCanaryApproved: true` and the max-2 exact
path rules above.

The eligible low-risk auto-merge lanes are limited to
`workflow-docs-tooling`, `docs-planning`, and `client-ui-low-risk`. The runner
still fails closed unless changed files are exactly
inside the issue contract and lane allowlists, local validation passed,
Codex mechanics review approved, the
PR is open/non-draft/mergeable/clean on `main`, the PR head exactly matches the
runner-created commit, `origin/main` still matches the expected base, required
GitHub checks passed on the exact head, no unresolved review threads exist, no
open code-scanning alerts exist for the PR ref, no blocking comments/reviews
or manual gate markers are present, and the issue is still open without stop
labels such as `needs-tommy`, `danger-gate`, `blocked`, or `auto-failed`.

Because `client-ui-low-risk` is real code, auto-merge for that lane also
requires a passing independent Gemini review on the same head and changed-file
set. Disabled, skipped, missing, malformed, stale-head, mismatched-file,
provider-failed, or non-pass independent review evidence fails closed.
Codex mechanics review remains required, but it is not sufficient by itself
for real-code auto-merge. Existing-PR recovery for this lane requires both
independent Gemini evidence and Codex mechanics evidence on the exact PR head.

The only merge method for this foundation is normal GitHub merge-commit
semantics, equivalent to `gh pr merge <number> --merge`. The runner must not
direct-push to `main`, force-push, squash, rebase, delete branches, or merge
stale PR heads. If GitHub auto-deletes the source branch, the runner restores
the reviewed source branch SHA with a normal non-force push.

The auto-merge decision uses a bounded refresh loop for GitHub mergeability
states that can lag behind newly completed checks. While checks are pending or
the PR reports a refreshable state such as `BLOCKED` or `UNKNOWN`, the runner
rechecks PR metadata, exact head SHA, base branch, mergeability, merge state,
checks, review threads, code scanning, issue state, and blocking comments or
reviews. It still proceeds only when every existing gate passes on the exact
head. A stale head, changed base, failed check, unresolved review thread, open
code-scanning alert, stop label, manual marker, broad changed file, or wait
timeout fails closed with sanitized evidence.

Existing-PR recovery is disabled by default. A later explicit external config
may enable `allowExistingPrRecovery` for a specific low-risk canary issue and
PR. Recovery requires the PR branch/body to link the issue, exact changed
files within the issue contract, exact-head local validation evidence,
exact-head Gemini and/or Codex mechanics evidence, current successful checks,
clean mergeability, resolved review threads, no open PR-ref code-scanning
alerts, no issue stop labels, no blocking comments/reviews, and the unchanged
expected PR head. Missing or stale evidence fails closed.

Successful auto-merge closes the linked issue as completed and posts concise
sanitized PR/issue comments only after the merge succeeds. After a successful
normal merge, the runner re-reads the linked issue labels and removes only
the transient lifecycle labels it actually finds: `auto-running`,
`auto-claimed`, `auto-pr-opened`, and `auto-failed`. Durable classification
labels such as area labels, `workflow`, `canary`, `auto-canary-ready`,
priority, day-scope, and project labels are preserved. If label cleanup or
post-merge comments fail, merge success remains authoritative; the result
stays `merged`, issue closure/comment attempts continue independently, and
the cleanup failure is recorded for operator follow-up. Dry-run mode previews
the exact transient labels that would be removed without mutating GitHub.

Blocked auto-merge leaves the PR and issue open, records a terminal runner
outcome, and writes sanitized local evidence under
`/workspace/logs/settleora-auto-runner/auto-merge/`. Summaries report
eligibility, attempted state, result, exact PR head SHA, merge SHA when
available, issue closure result, issue label-cleanup result, and blocked
reason. This foundation does not run a live auto-merge canary or approve
trusted overnight operation.

## Validation Profiles

Validation profiles are named, trusted command lists in runner code. Supported
profiles are:

- `docs-only`
- `workflow-tooling`
- `runner-tests`
- `scaffold-docs`

Issue text cannot add, replace, append, or interpolate commands. Unknown or
injected profile names fail closed before implementation.

## Unattended Loop

The intended loop is:

1. Load config, state, and lock.
2. Poll open eligible GitHub issues.
3. Claim one issue safely in real-run mode.
4. Classify lane and manual/danger gates.
5. Record and continue on gated task-level outcomes.
6. Fetch latest `origin/main`.
7. Create `feature/auto-<issue-number>-<slug>-<timestamp>`.
8. Generate a Codex task prompt under the external log root.
9. Invoke DevBox-local Codex with the prompt on stdin.
10. Collect the report and post-Codex changed-file list from the checkout.
    Implementation Codex must leave intended changes as local files for the
    runner to own. It must not push, open/update PRs, merge, or mutate GitHub
    labels/issues/comments.
11. Plan and run scoped validation.
12. Check for unexpected pre-review GitHub mutation evidence, including a
    remote task branch or any PR for the task branch.
13. Build a mandatory pre-PR review package.
14. Run the integrated external reviewer gate when the configured tier and
    low-risk lane policy require it.
15. Run a separate Codex mechanics review-only AI pass outside the mutable
    checkout.
16. Block PR creation unless required external review passes and the mechanics
    review verdict is `approve`.
17. Stage explicit changed paths only, commit, push the branch, open/update PR,
    watch checks, and comment/label the outcome.
18. Write a per-iteration summary and continue to the next eligible issue.
19. Write a final run summary.

Normal per-issue terminal outcomes do not stop the whole session:
`approved_pr_opened`, `blocked_needs_tommy`, `danger_gate`, `auto_failed`,
`no_changes`, `validation_failed`,
`review_changes_requested_retry_exhausted`, and
`issue_created_for_followup`.

Systemic stop conditions include dirty real-run workspace, unavailable GitHub
auth in real-run mode, unavailable Codex in real-run mode, ambiguous repository
state, lock corruption, repeated infrastructure failure, or config/policy
corruption.

## Pre-PR AI Review Gate

Every implementation requires a separate pre-PR review before PR creation or PR
update. The review package includes the source issue, task prompt path, lane
decision, changed-file list, bounded diff, validation results, report summary,
and runner policy decisions.

The reviewer prompt says review only and do not edit files. The runner compares
branch, status, changed files, diff hash, and `HEAD` before and after review.
Any mutation blocks PR creation and marks the task failed/needs human review.

Reviewer output must contain:

```json
{
  "verdict": "approve | changes_requested | needs_tommy | danger_gate | unable_to_review",
  "confidence": "low | medium | high",
  "requirement_match": "pass | partial | fail | unclear",
  "code_quality": "pass | partial | fail | unclear",
  "scope_control": "pass | fail | unclear",
  "validation_adequacy": "pass | partial | fail | unclear",
  "blocking_findings": [],
  "non_blocking_findings": [],
  "recommended_next_action": "open_pr | run_safe_fix_cycle | mark_needs_tommy | mark_auto_failed | mark_danger_gate"
}
```

`changes_requested` may trigger a bounded safe fix cycle only when the lane
allows it, the requested changes stay inside original scope, and retry budget
remains. `needs_tommy`, `danger_gate`, and `unable_to_review` block PR creation.
Reviewer verdict JSON is parsed against the allowed enum values. The parser
does not parse the full diagnostic review log. The runner treats the reviewer
process `stdout` stream as the selected machine-parseable response payload and
keeps `stderr`/session transcript material only in the raw review log for human
diagnostics. If the selected `stdout` payload is empty or invalid, the review
fails closed; the runner must not fall back to parsing the combined raw log.

Within the selected response payload, the parser extracts JSON object
candidates from raw JSON, fenced `json` blocks, and JSON surrounded by
prose/tool output, then validates each object against the strict verdict
schema. It accepts only when exactly one schema-valid verdict object exists.
Invalid schema/example candidates, including placeholder enum strings such as
`approve | changes_requested | needs_tommy | danger_gate | unable_to_review`,
are counted and ignored only when there is exactly one valid verdict object.
Malformed JSON candidates, oversized candidates, non-object raw JSON, missing
required fields, unknown fields, out-of-enum values without a valid verdict,
zero valid verdicts, or multiple valid verdicts fail closed as
`unable_to_review`. Review results, canary evidence, and summaries record the
selected response payload boundary (`process.stdout`), the raw review log path,
selected-payload verdict candidate counts, raw-log candidate counts when useful,
selected JSON source (`raw_json`, `fenced_json`, or
`extracted_surrounded_json`) when present, and failure reason when review cannot
be accepted. Dry-run review diagnostics never approve PR creation.

## Follow-Up Issues

The runner may create follow-up GitHub issues in a future real-run lane when
Codex, review, or report evidence identifies prerequisite work, split-worthy
scope, defects, or manual decisions. Creation is policy-gated, bounded, labeled
`auto-followup`/`needs-triage`, linked to the source issue/PR, and duplicate
spam must be avoided. Dry-run only previews follow-up creation.

## Git And PR Rules

Real-run mode fetches latest `origin/main`, starts every task branch from
`origin/main`, never pushes directly to `main`, never force pushes, never
deletes branches, never amends commits, and refuses a dirty worktree.

After implementation Codex exits, the runner collects changed paths from the
post-Codex checkout: unstaged tracked changes with `git diff --name-only`,
staged/index changes with `git diff --cached --name-only`, and untracked files
with `git ls-files --others --exclude-standard`. The combined set is
deduplicated and sorted before lane/contract allowlist checks, validation
planning, review-package evidence, summaries/canary evidence, and explicit-path
staging/commit. `no_changes` is allowed only when that post-Codex working tree,
index, and untracked-file set is clean.

If any post-Codex changed path is outside the issue contract allowlist or lane
manifest allowlist, the runner fails closed with the offending paths recorded
and does not silently restore or discard implementation changes. Operator
cleanup remains a manual inspection step unless a future explicit safe cleanup
path is designed.

The runner never uses `git add .` and never fabricates empty commits.

PR creation/update is allowed only when validation passes, pre-PR review
approves, the implementation path did not create a remote task branch or PR
before review, the review did not mutate the checkout, lane policy does not
require manual/danger gate before PR, and the task report is present enough to
link. The runner does not merge into `main` by default.

Generated implementation prompts tell implementation Codex to implement
locally, validate locally, write the local report only, and leave intended file
changes in the checkout. The runner owns explicit-path staging, commit, push,
PR creation/update, CI watching, and issue outcome labels/comments after
validation and approved pre-PR review.

## Running

Preflight:

```bash
cd /workspace/repos/Settleora
node tools/auto-runner/settleora-auto-runner.mjs --preflight
```

Preflight prints a bounded JSON result with pass/warn/fail checks for the repo
root, branch/worktree status and whether real-run would refuse, `gh`
availability, `gh repo view tommytang213/Settleora`, issue polling,
`codex-vm-full` resolution, logs-root writability, config parseability, trusted
real-run disabled/enabled state, canary approval state, explicit
low-risk-auto-merge canary approval mode, whether normal `--run` would refuse,
whether canary real-run would refuse and why, disabled or explicitly approved
auto-merge/follow-up/stale-claim-steal/review-fix/systemd defaults, and the
fact that this command does not install or enable systemd. Preflight does not
acquire the runner lock, run implementation Codex, run review Codex, mutate
GitHub, create branches, or enable systemd units.

Dry-run:

```bash
cd /workspace/repos/Settleora
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once --require-pre-pr-review
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --canary --max-iterations 2 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
```

`--fixture-issues <json>` is accepted only with `--dry-run`. Fixture mode uses
local issue objects to simulate multiple eligible issues in one trigger,
continues after terminal dry-run outcomes, skips issues that already carry stop
labels such as `auto-pr-opened`, and stops on no eligible fixture work or
`--max-iterations`. It does not call real GitHub mutation commands, create
branches, push, open PRs, run real Codex, mutate `.codex`, or enable auto-merge.
Canary dry-run writes canary evidence under the external log root.

Bounded real-run, still disabled by default unless config explicitly approves
the selected trusted mode:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --run --once
node tools/auto-runner/settleora-auto-runner.mjs --run --max-iterations 20
node tools/auto-runner/settleora-auto-runner.mjs --run --max-runtime 8h
node tools/auto-runner/settleora-auto-runner.mjs --run --canary --max-iterations 1 --config /workspace/logs/settleora-auto-runner/canary-approved-config.json
```

Review-package diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --review-package /workspace/logs/settleora-auto-runner/reviews/<package>.json
```

Summaries:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --write-summary --since 24h
ls /workspace/logs/settleora-auto-runner/summaries/
```

To stop a foreground run, send `Ctrl+C`. This tooling only provides example
systemd user templates and does not install or enable them.

## Known Limitations

- Real issue mutation is guarded but not yet trusted for unattended production
  use.
- Follow-up issue creation is modeled and gated, not enabled by default.
- Stale-claim stealing is disabled.
- Safe review-fix cycles are modeled but intentionally conservative.
- Auto-merge to `main` is disabled by default; the first low-risk lane
  foundation exists but requires explicit external config and issue-contract
  opt-in before it can attempt a normal GitHub merge commit.
- Manual review is still required before enabling real unattended mutation.

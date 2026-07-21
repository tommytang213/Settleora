# Settleora Auto-Runner Tooling

## Canonical mutation consumer contract

When session lifecycle authority is enabled, production mutation consumers use
one durable pre-effect contract for Git commits and pushes, PR creation and
transitions, exact-head merge, comments and review replies, issue closure, and
component-wise post-merge/docs hygiene. Each consumer persists its exact
intent before mutation, revalidates the active run/session/generation and
task-charge identity, reads authoritative Git or GitHub state, executes only
when the effect is safely absent, reads the exact result back, and then
atomically confirms or adopts it. An unavailable read or an uncertain command
result remains pending for later reconciliation; it is never converted into a
terminal marker that could hide a successful crash-window effect.

Ordinary implementation, feature-bundle, review-fix, existing-PR stack, and
docs-hygiene state may all carry the same lifecycle authority. Stack state
preserves that authority through retarget, ready, merge, and final hygiene.
Startup/supervisor recovery discovers only owner-trusted pending intent files
and recognizes the persisted identities for commit, push, PR transition,
merge, comment/reply, closure, hygiene, and branch retention. Duplicate-like,
wrong-head, wrong-base, wrong-issue/PR, or contradictory live candidates fail
closed. Legacy mutation markers remain compatibility projections and cannot
adopt a crash window.

This directory contains the DevBox-native unattended Codex auto-runner skeleton.
It is issue-label driven and writes all mutable runtime state under
`/workspace/logs/settleora-auto-runner/`.

Current end-state audit: #880 monitoring acceptance is complete, #887 through
#893 are completed foundation children, and PR #907 merged the final #889
high-risk lane correction from exact source head
`9472142f69b5db443d1d1693f4a68e38e491d96f` as merge SHA
`e58340855ab5f700342ce1bfa02d12d2e287b5b3`. PR #908 then merged the final
closure documentation from exact source head
`f12d3ad1721506d1b9fa3d72f78a1417d457ff85` as current-main merge SHA
`4cbb807d09eb732699fb82acc0336f985b94b617`. Final current-main validation,
GitHub checks, and code-scanning proof passed after that merge. #800, #894,
and #889 are closed completed. The current restrictive defaults are
fail-closed deployment defaults, not a permanent low-risk-only design. See
`docs/planning/AUTO_RUNNER_END_STATE_GAP_AUDIT.md` and
`docs/planning/AUTO_RUNNER_FINAL_ACCEPTANCE_894.md` for the current evidence
matrix. #902 remains the next separate post-foundation enhancement and is not
implemented yet. Completing the runner foundation does not mean the Settleora
product Day 1 milestone is complete. Genuine manual actions remain manual.

Approved-domain auto-merge remains default-off. Enabling `allowAutoMerge` is
not enough: external config must also set `autoMergePolicy.approvedLanes` to a
bounded list of supported canonical runnable lane IDs and keep required
CI/security check names explicit. All observed exact-head checks must pass; `SKIPPED` or
`NEUTRAL` conclusions pass only for explicitly allowlisted canonical check
names. The merge gate then still requires the issue contract to be
auto-merge eligible, no manual action or split requirement, exact contract and
lane path matches, exact-head validation evidence, independent external review,
Codex mechanics/security review, GitHub checks, code scanning, clear review
threads, open issue state, and unchanged base/head. Supported sensitive lanes
and high-risk lanes can be approved this way when their exact lane contract,
paths, validation, strong review, Codex review, CI, scanner, issue-state, and
final refresh gates pass. Genuine manual decisions and actions remain manual:
production deploys, mobile store/TestFlight/Play submission, destructive
migration or data execution, secret/auth credential or auth-config mutation,
public/admin/network exposure, branch cleanup, force-like history changes,
Day 1 scope cuts, architecture replacement, and unresolved product, policy,
authorization, privacy, security, or financial authority decisions.

Generated follow-up work remains default-off through
`allowFollowupIssueCreation=false`. When explicitly enabled for a trusted run,
the runner now uses the generated-work proposal pipeline rather than ad hoc
issue creation: it validates proposal schema, idempotency/correlation,
duplicate evidence, labels, paths, contracts, validation profiles, reviewer
tiers, and manual-decision classification before mutation. Sanitized intent
and result evidence is written under
`/workspace/logs/settleora-auto-runner/generated-work/`.

Post-merge issue hygiene is componentized. A successful exact-head merge stays
`merged` even if later closure, comments, label cleanup, parent progress,
project status, or ledger reconciliation partially fails. Narrow issues close
only when their explicit close rule is satisfied; umbrellas such as #800 and
partially complete issues stay open with evidence-backed progress comments.

Recovery and continuation state is centralized under
`/workspace/logs/settleora-auto-runner/recovery/`. The state is versioned,
sanitized, written by temporary file plus rename, and records issue/run/
supervisor/task correlation, branch/base/head, PR linkage, current phase,
first incomplete action, retry attempts by outcome class/fingerprint,
head-bound validation/review/CI/scanner evidence, bundle/generated-work
linkage, idempotent mutation markers, bounded stop reasons, and the next safe
action. Head-changing actions invalidate local validation, external review,
Codex mechanics/security review, CI, code-scanning, merge/final-refresh, and
post-merge expectation evidence tied to older heads. Startup checks this
recovery root before polling unrelated issues; with recovery capability
default-off it fails closed for operator review instead of adopting arbitrary
work.

Session rotation and reportless-interruption decisions use the coordinated
version-1 authority in `lib/session-lifecycle.mjs`, persisted under
`/workspace/logs/settleora-auto-runner/session-lifecycle/`. It preserves the
same logical-task charge, claim, branch/PR/candidate identity, convergence
counters, findings, reservations, evidence, pending checks, report
correlation, phase, and next action. Rotation first retires the old session
and leaves mutation authority ownerless; only a validated successor handoff
can acquire the next authority generation.

The default context policy checkpoints at 60 percent, requires rotation at 75
percent, and treats 90 percent or failed compaction as emergency pressure.
Reported provider telemetry is combined with bounded deterministic byte-based
estimation and a conservative fallback window. Missing optional telemetry
therefore schedules checkpoints at long phase boundaries rather than
disabling rotation. A two-turn cooldown prevents ordinary rotation loops;
emergency rotation may bypass it only after a complete checkpoint. An
unjournaled mutation always blocks rotation.

Reportless recovery distinguishes remote compaction failure, provider stream
disconnect, main-process exit without a trusted terminal report,
wrapper/supervisor interruption, host restart/process loss, partial
report/checkpoint write, and ambiguous/contradictory state. Process and lease
readback outrank a stale `IN_PROGRESS` report. A live owner blocks takeover;
dead-owner recovery validates the checkpoint and exact identities, marks the
old session retired, and resumes from the earliest safe incomplete phase.
Observed commit, push, merge, comment, and reservation effects are never
replayed. Corrupt, mismatched, unsupported, or contradictory state stops
fail-closed.

Startup and supervisor recovery share one versioned authoritative-evidence
adapter. Production reads come from the runner-lock PID, durable supervisor
heartbeat lease, clean local Git state, remote branch head, and exact live
GitHub issue/PR/check/comment state. Process/lease disagreement, partial reads,
dirty Git, or marker/live-effect drift fails closed. Canonical evidence is
bounded and sanitized; callers cannot supply synthetic liveness conclusions.

Review convergence has one durable two-loop counter authority in that task/PR
lineage. `localSourceChangingRoundsPerEpoch` blocks at 50 and increments only
when one bounded local fix produces a new exact head;
`githubTriggeredFixEpochsPerPr` blocks at 50 and increments once per frozen,
deduplicated actionable GitHub finding batch that starts a new local epoch;
`lifetimeLocalSourceChangingRounds` is monotonic telemetry and never blocks.
Polling, pending checks, provider retries, unchanged reruns, restarts, and
session rotation consume no nested counter. A GitHub-triggered epoch resets
only the per-epoch local counter and must complete validation plus fresh Gemini
and local Codex reviews on the same candidate identity before push.
The production existing-PR stack adapter journals each unpushed cumulative
candidate, freezes and deduplicates combined local reviewer findings, applies
one bounded batch, invalidates stale evidence, and repeats all three gates.
Restart after finding freeze, local fix, candidate commit, reservation, or push
does not replay the completed effect.

`sourceChangingCycle` and stack `sourceCycles` remain labeled compatibility
projections only. `two_loop_v1.localSourceChangingRoundsPerEpoch` is the sole
blocking reservation count; a later GitHub epoch is not blocked by cumulative
legacy history. A reservation may consume the complete cumulative candidate's
bounded local commit chain exactly once, while lifetime telemetry and logical-
task charges remain independent.

Accepted logical-task accounting is separate under
`logical-task-budget/<budget-scope-digest>.json`. After claim labels are
authoritatively reread, the runner atomically writes an idempotent charge bound
to repository, issue, task lineage, claim identity, and accepted-at evidence
before source mutation. Candidate search/skip activity, internal convergence,
polling, retries, recovery, and session rotation do not charge. Corrupt or
contradictory durable state fails closed.

Bounded outage resubmission is a separate supervisor-side recovery controller
and remains default-off. It is not an immortal mutation worker and does not
poll unrelated issues before recovery state is reconciled. When explicitly
enabled by later external configuration, it may consider only exact
task/run/supervisor/issue/branch/base/head/PR-correlated terminal or proven
inactive source runs whose failure is a recognized prolonged transient outage:
GitHub API/Actions rate-limit, 5xx, timeout, or transport evidence; Codex,
independent reviewer, or scanner provider 429/5xx/timeout/transport evidence;
or explicit DevBox DNS/routing/TLS/connection failures. It refuses 401,
ordinary 403 without trusted rate-limit headers, 404, missing secrets/config,
dirty worktrees, corrupt state, stale evidence, identity drift, merge
conflict, failed tests/validation, code defects, review or scanner findings,
policy/manual/destructive gates, unsupported sources, unknown failures, and
terminal application failures.

The controller uses a configured minimum outage age, bounded exponential
backoff, deterministic-testable jitter, maximum attempts, maximum wall-clock
deadline, and provider/global circuit breaker. State lives under the recovery
root in sanitized owner-only JSON written by temp file plus rename. Dedicated
`outage_resubmission` markers move through `planned`,
`submission_uncertain`, `submitted`, `confirmed_running`, `recovered`,
`exhausted`, or `blocked` and are keyed from exact correlation, attempt, and
spec digest. Uncertain, submitted, confirmed-running, and planned-with-child
markers are reconciled against existing local supervisor state before source
recovery continuation or any new child planning can run. Child specs persist
the task key, current head SHA, and paired PR number/head SHA needed for later
disk-only reconciliation, and reject malformed, unpaired, or unknown outage
metadata. Outage children are explicitly recovery-only: the immutable spec
must include an exact target derived from validated recovery/source evidence,
the worker launches fixed scalar recovery-only arguments, and the runner exits
fail-closed instead of polling eligible issues when the exact target is
missing, mismatched, completed, unsafe, ambiguous, stale, or capability
disabled. Attempt and wall-clock exhaustion persist a terminal `exhausted`
marker when operator controls allow evaluation, so status and health stop
reporting an active source run and repeated controller passes become stable
terminal no-ops. A profile config digest mismatch blocks child planning before
any submission. Head/base/PR drift invalidates old exact-head evidence instead
of reusing it. Pause/stop and manual gates always win. The dry-run fixture path
reports intended child specs and mutation-call counters only; production
activation remains a separate manual #912 task.

Preflight diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --preflight
node tools/auto-runner/settleora-auto-runner.mjs --readiness
```

External reviewer package validation is non-mutating and requires an explicit
task-scoped config path:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --review-package /workspace/logs/settleora-auto-runner/reviews/package.json --config /workspace/logs/settleora-auto-runner/reviewer-validation/<task-key>/config.json
```

Security findings ingestion is default-off. The explicit non-mutating dry-run
requires a task-scoped config. It reads enabled sources, normalizes sanitized
records, derives correlation and idempotency keys, checks duplicate evidence,
and may persist sanitized state under
`/workspace/logs/settleora-auto-runner/security-findings/`. Checkpoint 2 can
also opt in to deterministic classification and proposal planning with
`allowSecurityFindingClassification` and
`allowSecurityFindingProposalPlanning`; issue creation still requires both the
global follow-up capability and `allowSecurityFindingIssueCreation`, and the
dry-run path forces previews only. It does not create issues, edit PRs, change
labels, dismiss alerts, close findings, update dependencies, push branches,
open PRs, merge, or mutate product code.

GitHub-backed security sources use explicit bounded pagination. Dependabot
alerts use GitHub's cursor pagination (`after` plus `Link: rel="next"`), while
Dependabot-authored PRs use repository pull-request page pagination. Each source
advances one page at a time until an empty/partial page or missing next cursor
proves exhaustion. A full final configured page is reported as truncated, an
item cap is reported as bounded, and provider or parser failures on later pages
fail the source instead of converting it into zero findings. Only fully complete
source reads can feed classification, disposition, proposal, or completion
planning by default.

Authoritative duplicate evidence is handled before any new-work path. Exactly
one active authoritative issue, PR, report, or durable-state match routes to
`reuse_existing_work`, increments duplicate/reuse counts, and cannot build a
proposal, call the issue mutation pipeline, evaluate false-positive
disposition readiness, schedule retry work, or advance linked issue
completion. Completed/merged duplicate evidence while the finding remains
current open blocks as ambiguous until reconciled. Ledger-only evidence stays
supporting and does not suppress new work.

False-positive disposition readiness is also default-off and fail-closed.
`allowFalsePositiveEvidence` only enables bounded packet/readiness evaluation
inside the non-mutating security-finding dry-run. A live disposition would
require separate trusted real-run approval plus
`allowSecurityFindingDisposition`,
`allowProvenFalsePositiveDisposition`, and exact source-specific supported
reasons. Repository defaults and this example keep those capabilities false,
`dispositionDryRunOnly=true`, `maxDispositionsPerRun=1`, short packet TTLs,
exact reread/precondition checks, strong/Codex/tie-breaker review gates, and
post-disposition reconciliation before linked issue completion hygiene.
Semgrep and Trivy artifact findings have no assumed mutable alert endpoint.

```bash
node tools/auto-runner/settleora-auto-runner.mjs --security-findings-dry-run --config /workspace/logs/settleora-auto-runner/security-findings/<task-key>/config.json --json
node tools/auto-runner/settleora-auto-runner.mjs --security-findings-disposition-dry-run --config /workspace/logs/settleora-auto-runner/security-findings/<task-key>/config.json --json
```

Dependent-PR stack execution is a separate default-off production entry. It is
not normal issue polling and has no fallback to issue claiming, generated issue
creation, canary mutation, supervisor/systemd launch, production deploy,
branch deletion, force-like history, direct `main` push, or product authority
changes.

```bash
node tools/auto-runner/settleora-auto-runner.mjs \
  --run-pr-stack \
  --config /workspace/logs/settleora-auto-runner/live-stack-acceptance/<task-key>/config.json \
  --stack-plan /workspace/logs/settleora-auto-runner/live-stack-acceptance/<task-key>/plan.json
```

Both paths must be absolute, owner-only, and under the configured logs root.
The config must set `prStackExecution.enabled=true`,
`prStackExecution.allowRun=true`, keep
`prStackExecution.productionProfileActive=false`, and explicitly enable only
the stack capabilities for existing PR convergence, exact-head review
requests, CI/scanner polling, exact-head merge, base retarget, ready
transition, semantic proof, and final hygiene. Forbidden capabilities remain
false. Plans are immutable stack identities with repository, stack ID, issue
IDs, and 2-4 ordered PR entries including expected bases, branches, heads,
parent relationship, and own-delta evidence. Read-only fixture plans,
repository mismatches, duplicate PRs, invalid relationships, PR #917, missing
evidence, stale heads, corrupt state, and production-profile activation fail
closed before mutation.

Durable stack state is written atomically under the same logs-root stack
directory with owner-only permissions. It records schema version, immutable PR
identity, active PR/action, source cycles per PR, exact heads/bases, findings,
review request dedupe, mutation markers, merge/current-main/own-delta/ready/
hygiene proof, timestamps, and bounded terminal or wait reasons. Restart reads
that state instead of replaying mutations; duplicate converge, merge, retarget,
ready, comment, closure, ledger, or hygiene actions are skipped by markers.
External waits are resumable as `github_codex_result_wait`,
`ci_check_completion_wait`, `scanner_result_wait`, and
`merge_state_refresh_wait`; wait retries do not consume source-changing cycles.

The action sequence is controlled by `nextStackAction(...)`: converge/gate the
parent, merge with exact-head protection, prove current `main`, retarget the
child to `main`, prove semantic own-delta preservation, ready draft children,
converge/gate/merge the child, then run final hygiene only after every merge
proof exists. The first live #919 -> #920 acceptance may resume its existing
durable state only after the corrective PR adding this entry merges; this
repository default does not activate that run.

The package reviewer routes to `cheap_independent`, `strong_independent`, or
`block_split_or_escalate` from lane metadata plus changed-file and size
evidence. Lane-required strong review is never downgraded. Evidence records
the reviewed head, base SHA when supplied, exact sorted changed files, changed
file digest, package digest, route/tier, provider profile/model, bounded
pricing, attempts, budget/accounting, sanitized evidence path, and a bounded
verdict schema. Provider keys must come only from the approved owner-only
secret file boundary or process environment and are sent in headers, never URL
query strings. This package mode only creates review evidence; approved-lane
auto-merge still requires explicit external profile configuration and all
exact-head gates.

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

Status and health readouts include a sanitized outage-recovery summary:
enabled/default-off posture, active source run, attempt budget, next eligible
time, deadline, circuit state, last reason, child run ID, terminal outcome,
inventory read status, total record count, valid record count, invalid record
count, and whether operator action is required. Canonical corrupt,
schema-invalid, symlinked, group/world-writable, or otherwise untrusted outage
state is never reported as zero records; health returns fail-closed HTTP 503
with bounded `malformed_state` or `untrusted_state` reason evidence. They
never expose raw provider bodies, raw JSON, parse text, prompts, arbitrary
config paths, shell commands, secrets, issue bodies, or full diffs, and they do
not trigger resubmission or repair state.

Detached supervisor foundation:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs submit --dry-run --profile default --max-tasks 8 --max-runtime 8h --json
node tools/auto-runner/settleora-auto-runnerctl.mjs status --latest
node tools/auto-runner/settleora-auto-runnerctl.mjs report --latest
node tools/auto-runner/settleora-auto-runnerctl.mjs health --run <supervisor-run-id>
node tools/auto-runner/settleora-auto-runnerctl.mjs pause --run <supervisor-run-id>
node tools/auto-runner/settleora-auto-runnerctl.mjs stop-after-current --run <supervisor-run-id>
node tools/auto-runner/settleora-auto-runnerctl.mjs extend --run <supervisor-run-id> --max-tasks +2
```

Windows wrapper operator evidence:

When a Windows wrapper submission is accepted, save both the supervisor run ID
and the proof JSON returned by the start wrapper. After an operator restart,
use the packaged status and report wrappers with that saved run ID/proof JSON
to retrieve the DevBox status and mapped report. The local Windows files are
operator evidence only; the DevBox supervisor state, health/status/report
output, mapped JSON/Markdown summaries, systemd state, and GitHub issue/PR
state are the source of truth for acceptance.

If Windows blocks the local signed or downloaded wrapper, use execution-policy
bypass only for that PowerShell process invocation. Do not weaken machine-wide
or user-wide execution policy as the documented path.

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
automatically after reboot. Future TrueNAS monitoring is a Uptime Kuma HTTP
pull-health model against a separate read-only DevBox health service; SSH
remains an operator diagnostic path. See
`docs/workflow/AUTONOMOUS_CODEX_RUNNER_SUPERVISOR.md` and
`docs/workflow/AUTONOMOUS_CODEX_RUNNER_MONITORING.md`.

Read-only health service foundation:

```bash
node tools/auto-runner/settleora-auto-runner-health-service.mjs --host 127.0.0.1 --port 8787
curl -fsS http://127.0.0.1:8787/health/auto-runner
```

The service exposes only `GET /health/auto-runner`, returns bounded sanitized
JSON with `Cache-Control: no-store`, binds loopback by default, and has no
runner control, GitHub, branch, lock deletion, retry, resume, PR, merge,
notification-provider, or Uptime Kuma private-API authority. Health reads do
not write notifier dedupe state or other runtime state. Any non-loopback bind
requires explicit deployment configuration plus an external request-secret file
under `/workspace/logs/settleora-auto-runner/secrets/`; no live secret is
created or configured by the repository.

The repository-only user-unit template is
`tools/auto-runner/systemd/settleora-auto-runner-health.service`. It uses
`Restart=on-failure` only for this read-only monitor service and includes
`[Install] WantedBy=default.target` so a later approved user-scope deployment
can use normal `systemctl --user enable --now` semantics. The mutation
supervisor template remains `Restart=no`. Installing, starting, enabling,
disabling, or exposing the health service remains a separate manual deployment
gate.

The Node-based health service intentionally does not use
`MemoryDenyWriteExecute=yes`. The `20260712-1609` deployment attempt proved
Node/V8 can crash under that directive before the service starts listening.
The template keeps the remaining hardening controls: `NoNewPrivileges=yes`,
`PrivateTmp=yes`, `ProtectSystem=strict`, `ProtectHome=read-only`, fixed
read/write path allowlists, `RestrictSUIDSGID=yes`, `LockPersonality=yes`,
`UMask=0077`, and loopback binding by default.

Terminal ntfy activity notifier foundation:

```bash
node tools/auto-runner/settleora-auto-runner-terminal-notifier.mjs
```

The notifier is a separate one-shot command intended for a later manually
installed user timer. It reads the trusted health/supervisor state model,
selects only newly observed healthy terminal supervised runs, sends one
sanitized activity notification for `completed`, `no-eligible-work`, or
successful budget exhaustion, and records local delivery only after confirmed
ntfy `2xx` response. It does not start, stop, resume, retry, pause, extend,
repair, relabel, branch, comment, merge, delete locks, mutate supervisor or
runner state, call GitHub, or run from the health endpoint.

Production ntfy configuration is fixed at
`/workspace/logs/settleora-auto-runner/secrets/ntfy-notifier.json`. The CLI
does not accept base URL, topic, token, config path, or shell-command
arguments. The config file must be owner-only under the approved secrets root,
use a strict schema, and contain redacted deployment values supplied later by
the #880 manual deployment task. Tests use only local HTTP stubs; this repo
foundation does not make live ntfy calls.

Repository-only templates:

- `tools/auto-runner/systemd/settleora-auto-runner-terminal-notifier.service`
- `tools/auto-runner/systemd/settleora-auto-runner-terminal-notifier.timer`

They use `Type=oneshot`, `UMask=0077`, a fixed working directory and entry
point, and a roughly 60-second timer cadence. They are not installed, started,
enabled, reloaded, or connected to live secrets by repository implementation
tasks.

The Node-based notifier service intentionally omits
`MemoryDenyWriteExecute=yes` for the same Node/V8 runtime compatibility reason
as the health service. It remains timer-owned, one-shot, `Restart=no`, and
confined to the existing read-only/read-write path boundaries. The rolled-back
deployment created external secret files that remain deployment-owned; do not
read, print, rotate, delete, or replace them merely because the units were
rolled back. The retry remains gated by #880 and must not include TrueNAS,
Uptime Kuma, ntfy server, Cloudflare, router, firewall, or live publication
changes in repository-only work.

Supervised runs pass a validated `--supervisor-run-id` into the runner. The
runner writes it as sanitized summary metadata, and supervisor status/report/
health use only that exact correlation to resolve the runner JSON/Markdown
summary pair. The supervisor does not choose reports by newest summary time.
If a successful child exits without one unique trusted correlated report, the
supervisor terminal state fails closed and the process exits nonzero.

Clean `main` and clean named non-main checkouts are valid real-run
launch/control-plane states. Detached or unnamed real-run launch fails closed.
Clean launch lets the runner acquire the lock, capture exact `origin/main`,
poll work, and complete a no-work summary from `main`. `main` is not a task
mutation branch. Fresh implementation work must first create the generated
task branch from exact `origin/main` and pass the mutation guard before task
prompt generation or Codex implementation. That guard rejects `main`, detached
or unnamed checkout state, the wrong branch, dirty state, changed
`origin/main`, or a task branch whose `HEAD` is not the expected base.

Supervisor control commands are selected-run controls. Before writing the
global runner control file, `settleora-auto-runnerctl` requires the selected
supervisor run to be controllable and the active runner's sanitized
`supervisorRunId` to exactly equal that selected run ID. Terminal supervisor
runs reject `pause`, `stop-after-current`, and `extend` without mutating the
supervisor state file, heartbeat, report mapping, monitoring evidence, or
`runner-control.json`. Foreground runners with no supervisor correlation and
other supervised runners cannot be controlled through an unrelated supervisor
run. Accepted controls keep the primary lifecycle state unchanged and record
only bounded `lastControl` metadata such as command, request timestamp,
accepted/failed status, extension deltas, and sanitized correlation IDs.

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
`origin/main`, `gh auth status`, repository reachability, #910 open state,
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
`cheap_independent` may be configured to use a supported Gemini Flash or
Flash-Lite class model. `strong_independent` and any enabled `tie_breaker`
profile should use a specific stable Gemini model, currently
`gemini-3.5-flash`, rather than a moving `latest` alias. Provider lifecycle
changes such as an unavailable configured model are operational blockers, not
review verdicts, and the runner must not silently fall back to weaker, preview,
or alias models. Model changes require official model/deprecation/pricing
verification, explicit endpoint support, token-price updates, a bounded smoke
or integrated provider proof, and exact-head rereview. Claude and OpenAI
reviewer provider wiring is intentionally absent.

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

Strong-review routes, huge/cross-domain routes, unsupported models, missing
keys, malformed verdicts, provider failures, budget failures, accounting
failures, and secret-boundary violations fail closed before PR creation. The
integrated Gemini reviewer writes only
sanitized local evidence under
`/workspace/logs/settleora-auto-runner/reviews/integrated/` and sanitized
accounting under
`/workspace/logs/settleora-auto-runner/state/reviewer-accounting.json`. It
does not create GitHub comments, labels, issues, branches, commits, pushes, or
PRs.

Large-bundle review approval is a separate default-off review-routing
capability. It can only be enabled by an explicit external config that binds
one coherent workflow/tooling bundle to exact issue, repository, lane, base,
head, changed-file digest, raw diff digest, provider-bound digest, true diff
stats, normalized domain set, task key or expiry, manual-merge-required
contract, auto-merge-ineligible contract, validation evidence, and clear
secret-boundary evidence. A passing approval may convert only a size-based
`block_split_or_escalate` route to `strong_independent`. Its merge flags must
exactly match the candidate task contract: coherent operator-authorized bundles
may remain auto-merge eligible, while genuine manual/danger contracts remain
manual. The approval does not itself enable auto-merge, trusted real runs,
issue creation, review-fix mutation, existing-PR mutation, stale-claim
stealing, systemd, CI/security waivers, or Codex review waivers.

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

Feature bundles:

`auto-bundle` additionally requires a validated contract `bundle` object with
`bundleVersion: 1`, `strategy: "feature-bundle"`, and exactly two to four
ordered slices. Slice IDs are stable bounded identifiers, each slice has a
non-empty title/objective, slice paths must be subsets of the parent contract
and lane manifest, slice validation profiles must be supported by the parent
lane, and required-reading paths must be bounded repo-relative paths. Shell
commands and executable-looking text are rejected from issue-provided bundle
metadata.

The runner executes a feature bundle as one branch and one final PR. It writes
one generated prompt/report per slice, validates and commits each completed
slice with explicit paths only, persists sanitized checkpoint state under
`/workspace/logs/settleora-auto-runner/bundles/`, runs one aggregate final
validation, builds one review package, requires strong independent external
review plus separate Codex mechanics/security review, pushes once, opens or
updates one PR, waits for exact-head checks, and then applies the existing
conditional auto-merge policy only when the issue and config permit it.
Manual-merge-required bundles leave the approved PR open.

Recovery loads the bundle state by validated issue/bundle identity and checks
schema version, plan digest, issue, branch, exact base, current head, clean
worktree, completed checkpoint commits, completed reports, and validation
evidence. Completed slices are never rerun. The first incomplete slice may
restart only from the exact last checkpoint head. Corrupt, partial, missing,
stale, mismatched, or ambiguous state fails closed.

For eligible auto-runner issues, the classifier parses and validates the
contract before applying broad danger-word heuristics. Explicit exclusion
sections such as `## Non-goals`, `## Out of scope`, and
`## Prohibited actions` are treated as negative scope, not implementation
requests. Positive scope text, the title, dangerous contract `allowedPaths`,
malformed contracts, disabled lanes, and genuine manual-action requests still
fail closed with the normal danger/manual gate outcomes.

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

Implementation lane matrix:

| Lane | Sensitivity | Branch strategy | Reviewer tier | Validation profile | Current posture |
| --- | --- | --- | --- | --- | --- |
| `workflow-docs-tooling` | low | normal | cheap | `workflow-tooling` / `runner-tests` | implementation, PR, and existing low-risk auto-merge gates when explicitly configured |
| `docs-planning` | low | normal | cheap | `docs-only` | implementation, PR, and existing low-risk auto-merge gates when explicitly configured |
| `client-ui-low-risk` | low | normal | cheap | `mobile-ui-low-risk` | narrow protected canary lane preserved |
| `mobile-application` | standard | normal | cheap | `mobile` | implementation and PR creation only |
| `mobile-build-config` | high | focused | strong | `mobile-build-config` | checked-in Flutter/native build inputs may auto-merge only after stronger exact gates; signing, release, generated output, and credentials remain manual/forbidden |
| `web-user-ui` | standard | normal | cheap | `web-ui` | implementation and PR creation only |
| `web-admin-ui` | sensitive | focused | strong | `web-ui` | implementation and PR creation only |
| `api-domain-runtime` | sensitive | focused | strong | `api-domain` | implementation and PR creation only |
| `auth-session-security` | high | focused | strong | `api-security` | code PR auto-merge eligible only after stronger exact gates; unresolved security policy and credential/auth-config mutation remain manual |
| `storage-file-privacy-authz` | high | focused | strong | `api-storage` | code PR auto-merge eligible only after stronger exact gates; unresolved privacy/authorization authority remains manual |
| `money-settlement-payment` | high | focused | strong | `api-money` | code PR auto-merge eligible only after stronger exact gates; unresolved financial semantics remain manual |
| `schema-migrations` | high | focused | strong | `api-migrations` | migration code may auto-merge after gates; destructive application remains manual |
| `openapi-generated-clients` | high | focused | strong | `openapi-generated-clients` | contract plus generated clients may auto-merge only through repo generation/validation gates |
| `sync-import-export-restore` | high | focused | strong | `sync-import-export` | code PR auto-merge eligible only under API/domain-authoritative acceptance; live restore/import/export mutation remains manual |
| `docker-compose-ci-deployment` | high | focused | strong | `compose-ci` | repo code may auto-merge after gates; live deployment/env/network/secret mutation remains manual |
| `cross-domain` | split | split-required | split/escalate | none | blocked until future bundle/split policy |

Compatibility aliases map `security-runtime`, `storage-privacy`,
`money-settlement`, and `deployment-ci-env` to their focused sensitive lanes.
`product-runtime` remains a disabled placeholder until an issue selects a
narrower domain lane.

High-risk lanes are not categorically PR-only. #888 operationalized external
reviewer tiers, and #889 plus the #907 correction implement exact-head
auto-merge expansion for supported canonical runnable domains. Reviewer
providers and approved lanes remain disabled by default until an external
profile explicitly enables them.

Genuine manual actions remain blocked even when related code lanes are
runnable: production deploy/promotion, mobile store/TestFlight/Play
submission, destructive migrations/data operations, secret or credential
creation/rotation/disclosure/mutation, public/admin exposure or network/TLS/
DNS/proxy/router/firewall changes, architecture replacement, force-like
history rewrites, branch deletion/cleanup, Day 1 scope cuts, and unresolved
product/policy/authority/financial semantics.

The `client-ui-low-risk` lane still does not allow auth/session/security,
storage/privacy/authz, money/settlement/payment/bill calculation authority,
schema/migration, OpenAPI/generated-client, sync/import/export, OCR runtime,
Docker/CI/deployment/env, mobile release/signing, public/admin exposure, broad
`apps/mobile/**`, or generated files.

`mobile-build-config` is separate from `mobile-application`.
`mobile-application` remains for Flutter product code under
`apps/mobile/lib/**` and tests under `apps/mobile/test/**`. The build-config
lane is for focused changes to checked-in project inputs such as
`apps/mobile/pubspec.yaml`, `apps/mobile/pubspec.lock`, tracked
`apps/mobile/assets/**` or `apps/mobile/l10n/**` when present, and native
platform project files under `android/`, `ios/`, `macos/`, `linux/`,
`windows/`, and `web/`. The lane does not permit generated output, caches,
signing/provisioning files, keystores, private keys, `.env` files, provider or
store credentials, TestFlight/App Store/Play publication, live release
actions, generated OpenAPI Dart clients, CI/deployment workflows, or unrelated
mobile product/runtime files. Ordinary non-secret manifests, plist files,
Gradle files, Xcode project metadata, non-secret entitlements, `Podfile`, and
checked-in platform source/resources are not manual merely because they are
native inputs.

The base `mobile-build-config` validation profile is fixed in runner source as:
`git status --short`, `git diff --name-only`, `git diff --check`,
`PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`, Flutter `pub get`,
Flutter `analyze`, and full Flutter `test` from `apps/mobile` using
`/opt/flutter/bin/flutter`. The validation planner appends platform build
proof from actual changed files. Android native/project changes append
`flutter build apk --debug`,
`./gradlew :app:dependencies --configuration debugRuntimeClasspath`, and
`./gradlew :app:assembleDebug`. Web project changes append
`flutter build web`.

Linux, iOS, macOS, and Windows project changes fail closed for auto-merge
unless exact external platform evidence is present. Current Linux DevBox proof
cannot complete `flutter build linux` because the host lacks
`libsecret-1>=0.18.4`, required by `flutter_secure_storage_linux`; Linux
changes therefore require `mobile-build:linux:external-ci` until the runner
host supports that build. iOS/macOS/Windows require
`mobile-build:ios:external-ci`, `mobile-build:macos:external-ci`, or
`mobile-build:windows:external-ci`. External evidence must match the exact
head SHA, base SHA, changed-file digest, inferred platform set, and canonical
check identifier; missing, skipped, neutral, stale, wrong-digest, or similarly
named checks block. `pubspec.yaml`, `pubspec.lock`, tracked assets, and
localizations are cross-platform build/dependency inputs and receive this
native/build posture rather than Dart-only proof. This lane does not activate
#912 external production profiles and does not claim Day 1 product completion.
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

Bounded review-fix convergence:

Review-fix mutation is still disabled by default and still requires an
external config with `allowReviewFixMutation: true`. When enabled, the default
and hard maximum source-changing budget is 50 cycles per PR per convergence
epoch. Lower explicit values are honored, zero disables mutation, malformed or
negative values fail closed, and values above 50 are clamped to the hard
maximum with the requested, normalized, and hard maximum values reported.
Provider/network/review/CI polling retries, scanner retries, process restart,
unchanged reruns, and waiting do not consume this budget. A cycle is consumed
only after a fix produces a source-changing committed/pushed exact head.

Mutation eligibility is contract-based instead of permanently low-risk-only.
The issue contract, allowed paths, lane `allowedToImplement`,
manual-decision classification, validation profile, reviewer tier, merge
policy, danger/manual separation, exact head, and stack state decide whether a
fix can run. Workflow/docs and normal runtime lanes may self-fix when the
contract allows them. Auth/security, storage/privacy/authz, money/settlement,
schema/migrations, OpenAPI/generated clients, Docker/CI/deployment, and other
sensitive lanes may self-fix only with stronger validation, strong independent
review, Codex mechanics/security review, and exact-head merge gates. A
sensitive folder name alone is not an operator interrupt. Production deploys,
store releases, destructive operations, secret/auth config mutation,
public/admin exposure, Day 1 scope cuts, architecture replacement, force-like
history changes, branch deletion, and unresolved product/policy choices remain
manual. Generated clients are changed only through the authoritative contract
or generator path.

Every new exact head invalidates validation, review, CI, scanner, and merge
evidence. Review requests are deduped by PR, exact head, reviewer purpose, and
tier. Old-head no-finding results are never reused. Material findings are
fingerprinted without secrets or raw provider payloads, frozen as a complete
inventory, and fixed as one focused batch. Duplicate and non-material findings
do not trigger mutation; manual findings stop with one bounded operator
notification.

The convergence controller detects repeated identical material finding sets,
findings that return after a claimed fix, candidate tree or patch-id
oscillation including A/B and short periodic loops, and lack of source
progress despite provider wording changes. The no-progress threshold defaults
to at least three source-changing cycles. Terminal reasons are:
`REVIEW_CONVERGED`, `MANUAL_DECISION_REQUIRED`, `NO_PROGRESS`,
`REVIEW_OSCILLATION`, `CYCLE_BUDGET_EXHAUSTED`, `VALIDATION_BLOCKED`,
`REVIEW_PROVIDER_BLOCKED`, `CI_OR_SCANNER_BLOCKED`, and
`UNSAFE_SCOPE_CHANGE`. Round 50 is admissible; reservation of source-changing
round 51 is refused. A diagnostic review may explain exhaustion, but cannot
authorize another source mutation.

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
marker is present. The fixture still refuses broad paths, missing validation,
non-auto-merge contracts, non-canary real-runs, and disabled review-fix
mutation.

Dependent PR stack execution:

The stack controller stores an ordered stack ID, expected parent/base
relationships, exact heads, merge policy, required checks, own-delta evidence,
active PR, completed/remaining entries, and mutation markers under the
external logs/state root. Startup recovery resumes the active PR before
unrelated polling. The automatic sequence is: converge the parent, complete
validation/review/CI/scanner gates, merge with expected-head protection, prove
current `main`, retarget the dependent PR, prove its semantic own delta is
preserved, converge and gate the child, merge the child, and perform issue,
umbrella, ledger, and project hygiene exactly once. Own-delta proof uses file
set, diffstat/numstat, stable patch ID, normalized patch comparison, and
forward/reverse patch-to-tree proof; raw diff hashes are evidence but not the
sole semantic identity. The first live acceptance stack after this
implementation merges is #919 -> #920, planned read-only by this task.

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
# Large-candidate review routing

Coherent large candidates automatically select strong cumulative review; the
legacy exact large-bundle approval is compatibility/exception evidence, not a
routine prerequisite. `lib/large-candidate-review-routing.mjs` owns versioned
route state, the immutable coverage manifest, dual-review section and final-
integration proof, deterministic split-or-block planning, context-limit
packets, exact-candidate invalidation, and atomic recovery state. Route state is
separate from reviewer verdict: required, in-progress, split, context-blocked,
coverage-incomplete, malformed, partial, or stale state can never pass review
or merge gates.

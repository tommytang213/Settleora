# Detached Auto-Runner Supervisor

## Runtime-bound child execution

Supervisor workers resolve controller and control entrypoints as absolute
verified paths under the executing `runtimeRoot`. The managed `repoRoot` is
passed only as explicit project command context. Stop-after-current, recovery,
and later controller-owned child launches must not use
`node tools/auto-runner/...` from the project checkout. Runtime identity and
bundle digest are preflight/status evidence, while same-canonical-repository
authority locking prevents a second project ID or logs root from becoming a
concurrent mutation owner.

Post-merge cleanup is runner-owned. The supervisor receives only bounded
sanitized policy, ownership, eligibility, phase, expected-head, presence,
active-reference count/category, result, blocker, and next-action fields. It
does not infer ownership, choose targets, execute deletion, or broaden retry
authority. `cleanup_required` preserves merge truth and resumes the same task.

## Source-failure status and recovery

The supervisor projects the bounded `operational_status_v1` source-failure
posture: classification, origin sources, frozen batch identity, exact
candidate, local/GitHub counters, retry posture, last fix result,
recertification phase, hard-stop reason, and next safe action. It never needs
raw CI/scanner payloads. Restart adopts persisted batch/fix effects by identity
and must not duplicate fix invocations, commits, pushes, reviews, task charges,
or hygiene effects.

This document defines the repository-side foundation and accepted Settleora
DevBox deployment posture. Repository changes alone do not install or enable
services; the separate authorized #912 activation installed the project units,
confirmed lingering, and admitted the reviewed external profiles.

Older path examples under `/workspace/logs/settleora-auto-runner` describe the
historical/development layout only. The accepted Settleora supervisor reads
and writes `/workspace/logs/auto-runner/Settleora`.

## Operator Surface

Default submission is intentionally bounded:

```bash
node /workspace/auto-runner/.runtime.launcher.mjs \
  --runtime-root /workspace/auto-runner/runtime \
  --entry settleora-auto-runnerctl.mjs -- submit \
  --mode trusted \
  --config /workspace/auto-runner/config/settleora.json
```

Defaults are `1` task and `3h`. Explicit bounded syntax is available:

```bash
node /workspace/auto-runner/.runtime.launcher.mjs \
  --runtime-root /workspace/auto-runner/runtime \
  --entry settleora-auto-runnerctl.mjs -- submit \
  --mode trusted \
  --config /workspace/auto-runner/config/settleora.json \
  --max-tasks 8 \
  --max-runtime 8h
```

`MaxTasks` accepts `1..500`. `MaxRuntime` accepts `1m..14d`. These are syntax
bounds only. Runner config, issue contracts, lane manifests, manual gates,
danger gates, review routes, provider budgets, changed-file policy, CI,
security rules, and merge policy remain authoritative.

Dry-run submit is non-mutating:

```bash
node /workspace/auto-runner/.runtime.launcher.mjs \
  --runtime-root /workspace/auto-runner/runtime \
  --entry settleora-auto-runnerctl.mjs -- submit \
  --dry-run \
  --mode trusted \
  --config /workspace/auto-runner/config/settleora.json \
  --max-tasks 8 \
  --max-runtime 8h \
  --json
```

It renders the normalized spec, unit name, runner argv, state and heartbeat
paths, and local monitoring event shapes without writing a durable run spec,
starting systemd, invoking Codex, mutating GitHub, creating branches, or
opening PRs.

## Trust Boundaries

The supervisor is lane-neutral. It does not hard-code `auto-canary-ready`,
`client-ui-low-risk`, `--canary` as a policy override, automatic merge
approval, or a specific issue area. The immutable run spec references an
approved external runner profile/config. That config and the issue contract
decide labels, canary/trusted mode, lanes, validation, review strength, PR
creation, auto-merge eligibility, and manual approval requirements.

Sensitive or manual-gated domains remain gated: auth/session/security,
storage/privacy/authz, money/settlement/payment/bill calculation,
schema/migrations, OpenAPI/generated clients, Docker/CI/deployment/env,
public/admin exposure, production deploys, mobile releases, destructive
operations, and architecture replacement.

## Immutable Run Specs

Run specs live outside the repo:

```text
/workspace/logs/settleora-auto-runner/supervisor/run-specs/<storage-key>/spec.json
```

The human-visible logical run ID remains in `spec.json` and `state.json`, but
filesystem directories use only a lowercase SHA-256 storage key derived from
the validated logical run ID. Artifact names are fixed literals:

```text
spec.json
state.json
heartbeat.json
stdout.log
stderr.log
monitoring-events.jsonl
```

They are written with exclusive-create semantics, `0600` permissions,
canonical deterministic JSON, and an adjacent supervisor-state SHA-256 digest.
The worker re-hashes the spec before launch and revalidates the referenced
profile config digest. Specs reject unknown fields, malformed types, unsafe
run IDs, arbitrary commands, shell fragments, environment overrides, extra
arguments, raw config paths, symlink paths, group/world-writable files, and
paths outside approved roots.

The spec stores a logical profile and `runnerConfigSha256`, not an
operator-provided config path and not config contents or secrets. A profile
resolves to an external config file under a fixed owner-controlled root through
a SHA-256 storage key derived from the validated logical profile name:

```text
/workspace/logs/settleora-auto-runner/configs/profiles/<profile-storage-key>/config.json
```

Dry-run may report the external profile config as missing without creating it.
Real submit and worker launch fail closed unless the profile config is a
regular non-symlink file under the fixed root, is not group/world writable,
and matches the recorded SHA-256 digest.

## systemd Lifecycle

The repository template is:

```text
tools/auto-runner/systemd/settleora-auto-runner@.service
```

It is a reviewed placeholder template. Each manual project activation renders
the exact admitted `projectId`, canonical external `runtimeRoot`, canonical
`logsRoot`, and sibling launcher path, then installs it under the matching
project-specific identity. #912 completed this for Settleora using:

```text
~/.config/systemd/user/settleora-auto-runner@.service
```

The controller renders and verifies the installed unit byte-for-byte before
submission. The rendered unit uses `Type=exec`, `WorkingDirectory` bound to the
verified external runtime, root-owned `/usr/bin/env -i` as the pre-Node boundary, the
absolute sibling launcher and Node worker entry point, project-specific unit
identity, validated `%i` run IDs, `UMask=0077`, `Restart=no`, bounded graceful
stop behavior, `SendSIGKILL=no`, journal output, and dedicated worker log
files. It does not use `EnvironmentFile=`. Another project uses its own lower-cased
`<projectId>-auto-runner@.service` identity and rendered paths; the retained
lower-case Settleora prefix is an explicit compatibility exception. Shared runtime
files do not imply a shared unit or mutation authority.

The supported activation contract is systemd 235 or newer and a canonical,
root-owned, non-group/world-writable absolute Node executable in the reviewed
major-22 range. Every Node ancestor must also be canonical, root-owned, and
non-writable; the canonical home leaf must be service-account-owned beneath a
root-owned non-writable directory chain. The unit invokes `/usr/bin/env -i` before Node and constructs
only `HOME`, `USER`, `LOGNAME`, a fixed `PATH`, `LANG`, `LC_ALL`, `TMPDIR`,
systemd-derived `XDG_RUNTIME_DIR`, the matching fixed user-bus
`DBUS_SESSION_BUS_ADDRESS`. `UnsetEnvironment=`
also removes Node, dynamic-loader, shell-startup, Git, SSH, and askpass
execution controls as defense in depth. Unknown ambient names are omitted.
Hosts without these capabilities or identities refuse submission; there is no
compatibility downgrade.

Secrets are not service environment. Gemini credentials continue through the
existing owner-controlled reviewer credential file selected by the reviewed
external profile. GitHub/Codex credentials use their owner-controlled client
stores under the validated home directory. Health and notifier processes
receive no mutation/provider secret. Repository merge, runtime bundle
deployment, unit installation/daemon reload, and service start/restart remain
four distinct operator decisions; this repository contract performs none of
the latter three.

If the runtime is manually rolled back to a generation whose controller
predates this contract, its byte-for-byte installed-unit check refuses nested
submission. Restore a boundary-aware runtime before submitting another unit;
do not reinstall the legacy `/usr/bin/env node` unit.

No instance is enabled by the template. Failed, killed, crashed, timed-out, or
reboot-interrupted mutation runs recover only through durable runner state and
safe-boundary continuation. The bounded review-convergence and stack state
roots live under `/workspace/logs/settleora-auto-runner/`, are owner-only,
atomic-write, schema-validated, and fail closed when corrupt or partial. The
supervisor must resume an active PR/stack before polling unrelated work, and
must use mutation markers to avoid duplicate commits, pushes, comments, review
requests, merges, retargets, issue closures, labels, ledger updates, or
project updates after restart.

Review-fix convergence does not notify the operator for each cycle, each fix,
retriable provider/network/CI wait, or parent-to-child stack transition. It
emits one bounded notification for genuine manual decisions, unsafe/destructive
scope, unrecoverable infrastructure/auth failure, no-progress or oscillation
terminal states, exhausted diagnostic fallback, or final stack completion.

## Windows-Origin Acceptance Checkpoint

The accepted Windows-origin proof is the 2026-07-12 run
`supervised-20260711T182122Z-6bd91d326f10`, which launched runner
`run-2026-07-11T182132Z` through the exported Windows wrapper package and the
`default` profile. The wrapper returned after the DevBox submission was
accepted/running. The operator then shut down Windows through the normal
Windows UI, restarted Windows later, and used the saved supervisor run ID plus
proof JSON with the status/report wrappers to retrieve the completed result.

The authoritative proof is the DevBox/GitHub reconciliation, not the
Windows-local files. Remote status/report/health all resolved the exact
supervisor run to terminal state `completed`, child terminal `completed`,
child status `0`, terminal reason `child_exit_mapped`, health exit `0`, and
strict report resolution `matched` for the JSON/Markdown summary pair under
`/workspace/logs/settleora-auto-runner/summaries/`. systemd reported
`Result=success`, `ExecMainStatus=0`, and `NRestarts=0`.

The runner continued independently for the real canary #864, opened and
auto-merged PR #877 after exact-head validation, Codex mechanics review,
Gemini `cheap_independent` review, GitHub checks, code scanning, review-thread
checks, and issue-state gates. PR #877 merged source head
`f126b05a2eb3d938c83bff2d29cb7ea7922fa9ec` into `main` as
`8d04e2c4de1e586ff9298ddd6d2f0f2a9c7d7743`; #864 closed completed. Because
the run budget was one task, #865 and #866 remained untouched.

This proves wrapper submission, SSH disconnect, and Windows shutdown do not
stop the accepted DevBox user-unit run. It does not change the recovery model:
`Restart=no` remains intentional, and failed, incomplete, killed,
reboot-interrupted, or ambiguous mutation runs do not auto-resume after a
DevBox reboot. Recovery still requires operator review and an explicit new
action.

## Worker Lifecycle

The worker receives only a validated run ID. It derives hashed storage paths,
revalidates spec/profile config hashes, verifies the initial `origin/main`,
writes `starting`, records a local `started` event, and spawns the existing
runner with an argv array. It maps `maxTasks` to the existing iteration budget,
`maxRuntime` to the existing runtime limit, `mode` to the existing runner mode,
and the resolved profile config path to `--config`.

Every supervised runner launch also passes the fixed argv pair
`--supervisor-run-id <validated-supervisor-run-id>`. The value is a logical
correlation ID only: it carries no authority, does not choose paths, cannot
override the runner's own run ID, and does not change lane, label, budget,
review, CI, PR, or merge policy. The runner persists the value as sanitized
summary metadata in JSON and Markdown summaries. Unsupervised foreground runs
remain compatible and have no supervisor correlation.

After child exit, the worker resolves the report through exact trusted
correlation:

```text
validated supervisor run ID
  -> fixed runner CLI argument
  -> runner summary supervisorRunId
  -> exact JSON/Markdown summary pair
  -> supervisor state, heartbeat, outbox, status, report, and health
```

The resolver scans only the fixed summaries root under the configured logs
root, only regular non-symlink `run-YYYY-MM-DDTHHMMSSZ.json` files, and only
bounded-size JSON candidates. A match requires the summary `supervisorRunId`
to equal the expected supervisor run ID, a valid runner run ID, filename stem
equal to `summary.runId`, parseable `startedAt` and terminal `finishedAt`,
matching immutable initial `origin/main`, compatible runner mode, and an
existing regular non-symlink Markdown pair contained in the same summaries
root. Rollup files, recent-summary files, unrelated historical summaries,
wrong supervisor IDs, and manual foreground runs are not used as fallbacks.
The supervisor never guesses by newest summary timestamp.

A supervised no-work run may launch the runner from a clean `main`
control-plane checkout. The runner captures exact `origin/main` in the summary
before later workspace-policy rejection can occur where the ref is resolvable,
then a no-work run can finish with `outcome=no_eligible_work` and
`stopReason=no-eligible-work` without creating a task branch or mutating
GitHub. Clean `main` remains launch-only: fresh implementation still requires
the generated task branch from exact `origin/main` and the task-mutation guard
before task prompt generation or Codex work.

The 2026-07-12 post-PR-#875 acceptance stopped because the pre-fix runner
treated launch `main` as a task-mutation violation, threw before the summary
captured the base SHA, and the strict resolver correctly rejected the summary
with `base_origin_main_sha_mismatch`. That acceptance must be rerun only after
the main-launch workspace fix is merged.

On first `SIGTERM` or `SIGINT`, the worker writes `stopping_after_current` and
invokes the existing safe `--stop-after-current` control path. It does not
kill mid-commit, mid-review, mid-check-wait, or mid-merge. A second emergency
hard stop remains a manual operator action outside the normal Windows wrapper.

If the child exits successfully but no unique trusted summary pair maps back
to the supervisor run, the supervisor fails closed with terminal `failed`,
records a bounded report-resolution reason such as
`report_mapping_missing` or `report_mapping_ambiguous`, exits nonzero, and
does not invent a report path. If the child exits nonzero but a trusted
summary pair exists, the mapped report is retained while the child-derived
terminal state remains authoritative.

## Bounded Outage Resubmission

The bounded outage resubmission controller is supervisor-side and outside the
runner mutation worker. It remains default-off in repository defaults and
example config. It does not restart itself forever, poll unrelated issues
first, call GitHub issue/PR/branch/merge mutations, bypass recovery state, or
execute shell commands from persisted/provider input.

Each controller iteration is recovery-first, where reconciling an already
submitted or uncertain outage child is part of recovering the same source run:

Before that reconciliation can authorize takeover, the supervisor uses the
same authoritative-evidence adapter as runner startup. It probes the persisted
owner PID and heartbeat lease and reconciles clean local Git, the remote branch,
and exact GitHub PR/effect identities. Live ownership or a valid lease blocks;
disagreement, incomplete reads, identity drift, and marker/live contradictions
stop fail closed. Callers provide correlation identities, never synthetic
liveness or completed-effect conclusions.

1. read operator pause/stop control;
2. verify locks and active state through existing lock policy;
3. load and strictly validate persisted outage state;
4. reconcile uncertain, submitted, confirmed-running, and planned-with-child
   outage markers against exact existing child supervisor runs;
5. preserve terminal outage markers;
6. validate that exactly one safe recoverable source state matches the outage
   target;
7. only then consider a new bounded child resubmission.

Source-run eligibility requires terminal or proven inactive source state,
exact task/run/supervisor/issue/branch/base/head/PR/profile/config/spec
correlation, a recognized prolonged transient outage, no stale head-bound
evidence, no manual/authority/destructive gate, no active child, available
attempt/wall-clock budget, closed or eligible half-open circuit, and explicit
capability enablement. A new child spec carries bounded parent/source/outage
metadata plus a recovery-only target derived from validated recovery/source
evidence. Missing, mismatched, completed, unsafe, ambiguous, stale, or
capability-disabled targets block before child spec write, supervisor-state
write, or systemd start. The outage child spec persists the immutable task key,
current head SHA, and paired PR number/head SHA when a PR exists, and creation
fails if the live profile config digest no longer matches the source run's
recorded digest. Later reconciliation uses the persisted child spec and state
only; incomplete historical child artifacts remain fail-closed operator-
reconciliation evidence and are not backfilled from mutable source state.
Recovery-only child launch uses fixed scalar runner arguments and never polls
unrelated eligible issues. Dry-run/fixture mode plans the child spec and
exposes mutation-call counters while making zero systemd, GitHub, or live
supervisor submission calls. Attempt or wall-clock exhaustion transitions the outage marker
to terminal `exhausted`, reports no active source run in status/health, and is
idempotent on later controller passes. Operator pause/stop remains higher
priority and defers terminalization until a later allowed pass.

Rollback is disabling `outageResubmission.allowBoundedOutageResubmission` in
the external profile. Existing sanitized state is preserved for operator
inspection; no branch/history rewrite, state deletion, systemd change, or
production deployment is required. #912 separately completed the initial
manual activation and live-configuration acceptance; future authority changes
remain manual.

## State And Heartbeat

Supervisor state lives under:

```text
/workspace/logs/settleora-auto-runner/supervisor/runs/<storage-key>/
```

Files include `state.json`, `heartbeat.json`, `stdout.log`, `stderr.log`, and
`monitoring-events.jsonl`. JSON writes are atomic and owner-only. Default
heartbeat interval is 60 seconds with a five-minute lease. Heartbeats contain
only bounded sanitized metadata: logical run IDs, state, unit name, timestamps,
lease expiry, max tasks/runtime, counts, public issue/PR identifiers when
already public, runner run ID, report-resolution status, report/status paths,
and local monitoring event status.

Heartbeats never include secrets, environment values, webhook URLs/tokens,
authorization headers, full issue bodies, raw Codex/Gemini output, provider
payloads, full diffs, config paths, or config contents.

`status --run <run-id>` and `report --run <run-id>` return the supervisor run
ID, terminal state, runner run ID when mapped, Markdown report path, JSON
summary path, and bounded report-resolution status. `health --run <run-id>`
returns deterministic JSON and exit codes for healthy active, healthy terminal
success with a mapped report, report-mapping failure, terminal
failure/blocked/partial, stale heartbeat, and missing run. Historical
pre-correlation runs remain readable as historical state, but they are not
backfilled or falsely upgraded by timestamp heuristics.

Supervisor control commands are bound to the selected supervisor run, not just
to the global runner control file. Before writing any runner control request,
`settleora-auto-runnerctl pause`, `stop-after-current`, and `extend` require a
currently active runner whose sanitized `supervisorRunId` exactly matches the
selected supervisor run ID. A foreground runner with no supervisor correlation
and a runner correlated to a different supervisor run are rejected without
writes. Terminal states (`completed`, `partial`, `blocked`, `failed`,
`cancelled`, `submission_failed`, and `stale`) reject controls without changing
state, heartbeat, report mapping, outbox evidence, or the global
`runner-control.json`. `submitted` rejects as pre-active, unknown states fail
closed, and repeated `stop-after-current` on `stopping_after_current` is an
idempotent non-mutating response.

Accepted controls preserve the primary lifecycle state. The supervisor never
stores `pause`, `extend`, or `stop-after-current` as `state`; it records only a
bounded `lastControl` object with the command, request timestamp, accepted or
failed status, extension deltas when present, and sanitized correlation IDs.
Raw config paths, command lines, environment values, provider payloads, and
secrets are not stored in this metadata. The control-state boundary was merged
and the live supervisor was accepted under #912.

## Monitoring Contract

The core supervisor has no outbound webhook, URL, socket, shell hook, plugin
hook, or operator-provided notification command. It records only a sanitized
local owner-only monitoring outbox:

```text
/workspace/logs/settleora-auto-runner/supervisor/runs/<storage-key>/monitoring-events.jsonl
```

Supported events are `submitted`, `started`, `heartbeat`, `completed`,
`partial`, `blocked`, `failed`, and `cancelled`. Event payloads are bounded and
sanitized and never include secrets, environment values, config contents,
config paths, webhook URLs, authorization headers, full issue bodies, raw
Codex/Gemini output, provider payloads, or full diffs. Event write failures
are recorded locally where possible and never change the runner outcome.

The monitoring design supports a future pull model through Uptime Kuma on
TrueNAS SCALE. The currently accepted DevBox health service remains
loopback-only; LAN binding and Uptime Kuma deployment/configuration were not
part of #912. The service reads persisted supervisor/runner state, heartbeat,
strict report-correlation results, lock state, and persisted deployment/runtime
identity. Operators inspect systemd state separately; the health endpoint does
not call systemd.
The design is defined in
[Autonomous Codex Runner Monitoring](AUTONOMOUS_CODEX_RUNNER_MONITORING.md).

The repository-side health service foundation now lives at
`tools/auto-runner/settleora-auto-runner-health-service.mjs` with a user-unit
template at
`tools/auto-runner/systemd/settleora-auto-runner-health.service`. It remains
read-only, loopback-bound by default, and independent of temporary supervisor
or runner jobs. The mutation supervisor remains `Restart=no`; only the
read-only health service uses `Restart=on-failure`. The project-bound
supervisor, loopback health service, notifier, and notifier timer were
installed and accepted under #912. LAN binding, Uptime Kuma deployment, and
new notification-destination setup remain separate manual gates.

The health service remains separate from the temporary supervisor/runner jobs,
so healthy idle after `completed` or `no-eligible-work` remains callable and
must not be treated as an outage merely because no runner process is active. A
dead DevBox is detected because Uptime Kuma cannot reach the endpoint. Failed,
stale, blocked, partial, report-mapping missing/ambiguous, orphaned-lock, and
other fail-closed inconsistent conditions produce unhealthy HTTP status for
incident notification.

SSH remains available for operator diagnostics and manual wrapper readback, but
it is not the primary monitoring architecture. Terminal healthy-run summary
notifications are handled by the separate one-shot ntfy notifier
with atomic confirmed-delivery deduplication, not by manufacturing false
Uptime Kuma DOWN/UP transitions. The project-bound notifier timer and existing
external provider configuration were accepted under #912; no new destination,
topic, token, or credential was selected.

## Windows Templates

Repository templates live under `tools/auto-runner/windows/`. They use
`ssh.exe`, default SSH target from `SETTLEORA_DEVBOX_SSH_TARGET`, optional
`-SshTarget`, fixed remote repo path, bounded parameter validation, and the
fixed remote `settleora-auto-runnerctl.mjs` entry point. They contain no
host/IP, username, password, token, key path, or arbitrary remote command
parameter. Closing Windows after successful submit is not required for DevBox
execution to continue.

## Installation And Recovery Gates

The Settleora user units, lingering, loopback health service, existing
notification prerequisites, and bounded live canaries were accepted under
#912. Remaining separate manual gates are Windows wrapper deployment,
SSH-disconnect/Windows-shutdown host canaries, Uptime Kuma
deployment/configuration on TrueNAS SCALE, any new notification destination or
credential, and any broader lane/run approval. Recovery from stale or orphaned
state remains explicit and evidence-bound.

Recovery continuation preserves supervisor correlation when an operator starts
a bounded recovery run. Recovery state stores only sanitized `supervisorRunId`,
runner run ID, task key, branch, phase, blocker, and next safe action; reports
and summaries must resolve through exact correlation rather than newest-file
guessing. Recovery must not steal active locks, run a second mutating Codex
process on the same branch, delete source branches, force-push, or push
directly to `main`.

The session-lifecycle checkpoint is the coordinated authority for proactive
Codex rotation and reportless process recovery. A planned rotation is a
continuation of the accepted logical task: it does not charge another task,
start a local source-changing round or GitHub fix epoch, or authorize a source
mutation. The supervisor must persist the checkpoint, retire the current
session's mutation authority, and validate the successor identity before
granting the next authority generation. A crash between retirement and grant
is recovered as an ownerless handoff, never as two active owners.

On startup, process/lease and live Git/GitHub readback outrank report prose.
A stale `IN_PROGRESS` report with no live owner is stopped/recoverable, while
a live valid owner prevents takeover. Recovery classifies the interruption,
validates exact repository/task/run/claim/session identity and checkpoint
digest, and resumes the earliest safe incomplete phase without replaying
already observed mutation, commit, push, review request, polling, merge,
comment, closure, or hygiene effects.
# Large-review continuation

Large-review continuation uses the existing recovery and fresh-session
authority. The continuation packet preserves only bounded candidate identity,
route, coverage/section/integration progress, split-plan identity, uncovered
scope, and idempotency markers. A restart skips already completed exact-
manifest review calls and split effects; a source identity change discards
them. Sectioning, provider retries, polling, recovery, and session rotation do
not create a new logical task or consume review source-round counters.

## Settleora User-unit Acceptance (20260724-0946)

The installed `settleora-auto-runner@.service` binds the stable external
launcher, runtime, repository, and project logs. Readback confirmed
`Restart=no`, `KillMode=process`, `TimeoutStopSec=30min`, `SendSIGKILL=no`,
`UMask=0077`, and no drop-ins. No worker instance is enabled.

The accepted production command remains unexecuted. It is **MUTATING** and
starts the normal product queue; run it only with explicit operator intent:

```bash
node /workspace/auto-runner/.runtime.launcher.mjs --runtime-root /workspace/auto-runner/runtime --entry settleora-auto-runnerctl.mjs -- submit --mode trusted --config /workspace/auto-runner/config/settleora.json --max-tasks 500 --max-runtime 14d --json
```

Its matching `--dry-run` form passed. Task and time values are upper bounds
and stop early on `no-eligible-work`.

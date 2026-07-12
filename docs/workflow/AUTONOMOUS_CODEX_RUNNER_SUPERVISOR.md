# Detached Auto-Runner Supervisor

This document defines the repository-side foundation for running the existing
Settleora auto-runner as a detached DevBox background job. It does not install
or enable a service, enable user lingering, deploy monitoring, or approve any
broader runner lane.

## Operator Surface

Default submission is intentionally bounded:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs submit --profile default
```

Defaults are `1` task and `3h`. Explicit bounded syntax is available:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs submit \
  --profile default \
  --max-tasks 8 \
  --max-runtime 8h
```

`MaxTasks` accepts `1..500`. `MaxRuntime` accepts `1m..14d`. These are syntax
bounds only. Runner config, issue contracts, lane manifests, manual gates,
danger gates, review routes, provider budgets, changed-file policy, CI,
security rules, and merge policy remain authoritative.

Dry-run submit is non-mutating:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs submit \
  --dry-run \
  --profile default \
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

It is intended for later manual installation under:

```text
~/.config/systemd/user/settleora-auto-runner@.service
```

The unit uses `Type=exec`, fixed `WorkingDirectory=/workspace/repos/Settleora`,
the Node worker entry point, validated `%i` run IDs, `UMask=0077`,
`Restart=no`, bounded graceful stop behavior, `SendSIGKILL=no`, journal output,
dedicated worker log files, and an optional environment file only under
`/workspace/logs/settleora-auto-runner/secrets/`.

No instance is enabled by the template. No reboot resume is configured. Failed,
killed, crashed, timed-out, or reboot-interrupted mutation runs require
operator review and explicit recovery.

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
secrets are not stored in this metadata. Live supervisor acceptance remains
deferred until this control-state boundary is merged and reviewed.

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

The future TrueNAS monitor uses a pull model. A scheduled TrueNAS check SSHes
to the DevBox, runs `settleora-auto-runnerctl health/status --json`, and
alerts on SSH failure, DevBox outage, stale heartbeat lease, blocked/failed/
partial state, cancellation, or terminal completion. A dead DevBox cannot push
its own failure event; failed SSH or a stale heartbeat naturally detects that
condition. Terminal state notifications are performed by the external monitor.
The future adapter remains read-only to this repo and GitHub and is reviewed in
a separate deployment task.

## Windows Templates

Repository templates live under `tools/auto-runner/windows/`. They use
`ssh.exe`, default SSH target from `SETTLEORA_DEVBOX_SSH_TARGET`, optional
`-SshTarget`, fixed remote repo path, bounded parameter validation, and the
fixed remote `settleora-auto-runnerctl.mjs` entry point. They contain no
host/IP, username, password, token, key path, or arbitrary remote command
parameter. Closing Windows after successful submit is not required for DevBox
execution to continue.

## Installation And Recovery Gates

Remaining manual gates include PR merge, user-unit installation,
`loginctl enable-linger`, Windows wrapper deployment, SSH-disconnect and
Windows-shutdown canary acceptance, TrueNAS monitoring deployment, and any
broader lane/run approval. Recovery from stale or orphaned state is explicit
and evidence-bound; this foundation does not implement automatic resume.
